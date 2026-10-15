"""Concurrent chat load test.

Start a second API with the fake LLM so the numbers describe this system, not a provider's
rate limit:

    FAKE_LLM=true uv run uvicorn app.main:app --port 8001
    uv run python -m scripts.loadtest --base http://localhost:8001 --users 1 5 10 20 --duration 45

Each virtual user logs in with a demo account and keeps asking questions from the evaluation
set in new conversations, reading the Server-Sent Events stream to the end. Every ~5th
request is a lightweight page load (conversation list) to mix in non-RAG traffic.
"""

import argparse
import asyncio
import json
import random
import statistics
import time
from dataclasses import dataclass, field

import httpx

ACCOUNTS = ["staff", "manager", "direksi", "hr", "finance"]
FALLBACK_QUESTIONS = [
    "Berapa uang harian manager untuk dinas ke Surabaya?",
    "Berapa lama cuti melahirkan dan bagaimana upahnya?",
    "Siapa yang menyetujui reimbursement di atas Rp 10 juta?",
    "Can I use my personal laptop for VPN?",
]


@dataclass
class Stats:
    ttft: list[float] = field(default_factory=list)  # seconds to first answer token
    total: list[float] = field(default_factory=list)  # seconds to the `done` event
    light: list[float] = field(default_factory=list)  # non-RAG requests
    refused: int = 0
    errors: list[str] = field(default_factory=list)


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


async def login(client: httpx.AsyncClient, user: str) -> None:
    res = await client.post(
        "/auth/login",
        json={"workspace": "nusantara", "email": f"{user}@nusantara.test", "password": "telusur123"},
    )
    res.raise_for_status()


async def ask(client: httpx.AsyncClient, question: str, stats: Stats) -> None:
    started = time.perf_counter()
    first = None
    event = None
    async with client.stream("POST", "/chat", json={"message": question}) as res:
        if res.status_code != 200:
            stats.errors.append(f"HTTP {res.status_code}")
            return
        async for line in res.aiter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                if event == "delta" and first is None:
                    first = time.perf_counter() - started
                elif event == "error":
                    stats.errors.append(json.loads(line[5:]).get("message", "error"))
                    return
                elif event == "done":
                    data = json.loads(line[5:])
                    stats.total.append(time.perf_counter() - started)
                    if data.get("refused"):
                        stats.refused += 1
                    elif first is not None:
                        stats.ttft.append(first)
                    return
    stats.errors.append("stream ended without done")


async def virtual_user(base: str, user: str, questions: list[str], deadline: float, stats: Stats) -> None:
    async with httpx.AsyncClient(base_url=base, timeout=httpx.Timeout(120.0)) as client:
        await login(client, user)
        n = 0
        while time.perf_counter() < deadline:
            n += 1
            try:
                if n % 5 == 0:
                    t = time.perf_counter()
                    (await client.get("/conversations")).raise_for_status()
                    stats.light.append(time.perf_counter() - t)
                else:
                    await ask(client, random.choice(questions), stats)
            except httpx.HTTPError as exc:
                stats.errors.append(exc.__class__.__name__)


async def questions_from_eval(base: str) -> list[str]:
    async with httpx.AsyncClient(base_url=base, timeout=30) as client:
        await login(client, "hr")
        cases = (await client.get("/eval/cases")).json()
    found = [c["question"] for c in cases if c["kind"] == "answerable"]
    return found or FALLBACK_QUESTIONS


async def run_level(base: str, users: int, duration: int, questions: list[str]) -> dict:
    stats = Stats()
    started = time.perf_counter()
    deadline = started + duration
    await asyncio.gather(
        *(virtual_user(base, ACCOUNTS[i % len(ACCOUNTS)], questions, deadline, stats) for i in range(users))
    )
    elapsed = time.perf_counter() - started
    chats = len(stats.total)
    attempts = chats + len(stats.errors)
    return {
        "users": users,
        "chats": chats,
        "chats_per_min": round(chats / elapsed * 60, 1),
        "ttft_p50": pct(stats.ttft, 0.5),
        "ttft_p95": pct(stats.ttft, 0.95),
        "total_p50": pct(stats.total, 0.5),
        "total_p95": pct(stats.total, 0.95),
        "light_p95": pct(stats.light, 0.95),
        "refused": stats.refused,
        "error_rate": round(len(stats.errors) / attempts, 3) if attempts else 0.0,
        "errors": sorted(set(stats.errors))[:5],
    }


def fmt(v: float | None) -> str:
    return "—" if v is None else f"{v:.2f}s"


async def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m scripts.loadtest")
    parser.add_argument("--base", default="http://localhost:8001")
    parser.add_argument("--users", type=int, nargs="+", default=[1, 5, 10, 20])
    parser.add_argument("--duration", type=int, default=45, help="seconds per level")
    parser.add_argument("--out", default="loadtest-results.json")
    args = parser.parse_args()

    questions = await questions_from_eval(args.base)
    print(f"{len(questions)} questions, {args.duration}s per level\n")
    print("| Pengguna bersamaan | Chat/menit | TTFT p50 | TTFT p95 | Total p50 | Total p95 | Halaman ringan p95 | Error |")
    print("|---|---|---|---|---|---|---|---|")
    results = []
    for users in args.users:
        r = await run_level(args.base, users, args.duration, questions)
        results.append(r)
        print(
            f"| {users} | {r['chats_per_min']} | {fmt(r['ttft_p50'])} | {fmt(r['ttft_p95'])} | "
            f"{fmt(r['total_p50'])} | {fmt(r['total_p95'])} | {fmt(r['light_p95'])} | "
            f"{r['error_rate']:.1%} |"
        )
        if r["errors"]:
            print(f"   errors: {r['errors']}")
    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
