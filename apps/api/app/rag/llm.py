"""One client for every OpenAI-compatible chat API (Groq, Gemini, Ollama).

Providers are tried in order. A provider that is rate-limited, down, or misconfigured is
skipped *before* the first token is streamed; once tokens flow, an error is surfaced
instead of silently switching models mid-answer.

Free tiers have tight per-minute token limits (Groq: 8k tokens/min/model), so a 429 is
first waited out when the provider says the wait is short (`max_wait`), and only then
does the call fail over to the next provider.
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
RETRYABLE = {408, 409, 429, 500, 502, 503, 504}
INTERACTIVE_MAX_WAIT = 8.0  # seconds a person in the chat will tolerate


class LLMUnavailable(Exception):
    """No configured provider could serve the request."""


@dataclass
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    fast_model: str
    extra: dict = field(default_factory=dict)  # provider-specific request fields


@dataclass
class Usage:
    provider: str = ""
    model: str = ""
    input_tokens: int | None = None
    output_tokens: int | None = None


def providers() -> list[Provider]:
    s = get_settings()
    found: list[Provider] = []
    if s.groq_api_key:
        found.append(
            Provider(
                "groq",
                "https://api.groq.com/openai/v1",
                s.groq_api_key,
                s.groq_model,
                s.groq_fast_model,
                {"reasoning_effort": "low", "include_reasoning": False},
            )
        )
    if s.gemini_api_key:
        found.append(
            Provider(
                "gemini",
                "https://generativelanguage.googleapis.com/v1beta/openai",
                s.gemini_api_key,
                s.gemini_model,
                s.gemini_model,
            )
        )
    if s.ollama_url:
        found.append(
            Provider(
                "ollama", f"{s.ollama_url.rstrip('/')}/v1", "ollama", s.ollama_model, s.ollama_model
            )
        )
    return found


def _payload(p: Provider, messages: list[dict], fast: bool, stream: bool, max_tokens: int) -> dict:
    body = {
        "model": p.fast_model if fast else p.model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if stream:
        body["stream_options"] = {"include_usage": True}
    if "gpt-oss" in body["model"]:
        body.update(p.extra)
    return body


def retry_after(res: httpx.Response) -> float:
    """Seconds the provider asks us to wait. Groq sends "7.5" or durations like "1m2.5s"."""
    raw = res.headers.get("retry-after") or res.headers.get("x-ratelimit-reset-tokens") or "5"
    try:
        return float(raw)
    except ValueError:
        units = {"h": 3600, "m": 60, "s": 1, "ms": 0.001}
        total = sum(float(n) * units[u] for n, u in re.findall(r"([\d.]+)(ms|h|m|s)", raw))
        return total or 5.0


_client = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=5.0))


async def complete(
    messages: list[dict],
    fast: bool = False,
    max_tokens: int = 300,
    max_wait: float = INTERACTIVE_MAX_WAIT,
    json_mode: bool = False,
) -> tuple[str, Usage]:
    """Non-streaming call for helper tasks (query rewriting, evaluation, judging).

    Batch jobs pass a large `max_wait` to sit out rate limits instead of failing.
    """
    errors = []
    for p in providers():
        body = _payload(p, messages, fast, False, max_tokens)
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        waited = 0.0
        try:
            while True:
                res = await _client.post(
                    f"{p.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {p.api_key}"},
                    json=body,
                )
                delay = retry_after(res) if res.status_code == 429 else 0.0
                if not delay or waited + delay > max_wait:
                    break
                log.info("%s rate-limited, waiting %.1fs", p.name, delay)
                await asyncio.sleep(delay + 0.5)
                waited += delay
            if res.status_code != 200:
                errors.append(f"{p.name}: HTTP {res.status_code}")
                continue
            data = res.json()
            usage = data.get("usage") or {}
            return data["choices"][0]["message"]["content"] or "", Usage(
                p.name,
                data.get("model", ""),
                usage.get("prompt_tokens"),
                usage.get("completion_tokens"),
            )
        except httpx.HTTPError as exc:
            errors.append(f"{p.name}: {exc.__class__.__name__}")
    raise LLMUnavailable("; ".join(errors) or "Tidak ada provider LLM yang dikonfigurasi")


async def stream(
    messages: list[dict],
    usage: Usage,
    max_tokens: int = 1200,
    max_wait: float = INTERACTIVE_MAX_WAIT,
) -> AsyncIterator[str]:
    """Yield answer text deltas; fills `usage` when the stream ends."""
    errors = []
    for p in providers():
        waited = 0.0
        while True:
            try:
                async with _client.stream(
                    "POST",
                    f"{p.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {p.api_key}"},
                    json=_payload(p, messages, False, True, max_tokens),
                ) as res:
                    if res.status_code != 200:
                        body = (await res.aread())[:300]
                        delay = retry_after(res) if res.status_code == 429 else 0.0
                        if delay and waited + delay <= max_wait:
                            log.info("%s rate-limited, waiting %.1fs", p.name, delay)
                            await asyncio.sleep(delay + 0.5)
                            waited += delay
                            continue
                        log.warning("%s returned %s: %s", p.name, res.status_code, body)
                        errors.append(f"{p.name}: HTTP {res.status_code}")
                        break  # try the next provider
                    usage.provider = p.name
                    async for line in res.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        event = json.loads(data)
                        usage.model = event.get("model") or usage.model
                        u = event.get("usage") or (event.get("x_groq") or {}).get("usage")
                        if u:
                            usage.input_tokens = u.get("prompt_tokens")
                            usage.output_tokens = u.get("completion_tokens")
                        for choice in event.get("choices") or []:
                            delta = (choice.get("delta") or {}).get("content")
                            if delta:
                                yield delta
                    return
            except httpx.HTTPError as exc:
                if usage.provider:  # failed mid-answer: do not restart on another model
                    raise LLMUnavailable(f"{p.name} terputus saat menjawab") from exc
                errors.append(f"{p.name}: {exc.__class__.__name__}")
                break
    raise LLMUnavailable("; ".join(errors) or "Tidak ada provider LLM yang dikonfigurasi")
