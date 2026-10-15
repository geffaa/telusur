"""Structure-aware chunking.

Rules:
- A chunk never crosses a heading boundary, so every chunk belongs to exactly one section.
- Body text is packed up to `target_tokens`, with `overlap_tokens` of the previous chunk
  repeated at the start of the next one inside the same section.
- Tables are kept whole. A table larger than `max_tokens` is split by rows and every
  part repeats the header row, so each part is still readable on its own.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.ingestion.parsers import Block

TokenCounter = Callable[[str], int]
SENTENCE_SPLIT = re.compile(r"(?<=[.!?;:])\s+")


@dataclass
class ChunkDraft:
    ordinal: int
    kind: str
    content: str
    heading_path: str
    page_start: int
    page_end: int
    token_count: int

    def embedding_text(self, doc_title: str) -> str:
        """Contextual header: retrieval sees the document and section the text came from."""
        header = doc_title if not self.heading_path else f"{doc_title} — {self.heading_path}"
        return f"{header}\n\n{self.content}"


def chunk_blocks(
    blocks: list[Block],
    count_tokens: TokenCounter,
    target_tokens: int = 500,
    max_tokens: int = 700,
    overlap_tokens: int = 80,
) -> list[ChunkDraft]:
    chunks: list[ChunkDraft] = []
    headings: list[tuple[int, str]] = []
    # Pieces of the current section waiting to be packed: (text, page).
    pending: list[tuple[str, int]] = []

    def path() -> str:
        return " > ".join(text for _, text in headings)

    def emit(kind: str, content: str, page_start: int, page_end: int) -> None:
        chunks.append(
            ChunkDraft(
                ordinal=len(chunks),
                kind=kind,
                content=content.strip(),
                heading_path=path(),
                page_start=page_start,
                page_end=page_end,
                token_count=count_tokens(content),
            )
        )

    def flush_text() -> None:
        if not pending:
            return
        pieces = _split_long(pending, count_tokens, target_tokens)
        current: list[tuple[str, int]] = []
        size = 0
        for text, page in pieces:
            tokens = count_tokens(text)
            if current and size + tokens > target_tokens:
                emit("text", " ".join(t for t, _ in current), current[0][1], current[-1][1])
                current = _tail(current, count_tokens, overlap_tokens)
                size = sum(count_tokens(t) for t, _ in current)
            current.append((text, page))
            size += tokens
        if current:
            emit("text", " ".join(t for t, _ in current), current[0][1], current[-1][1])
        pending.clear()

    for block in blocks:
        if block.kind == "heading":
            flush_text()
            level = block.level or 1
            headings[:] = [(lvl, text) for lvl, text in headings if lvl < level]
            headings.append((level, block.text.strip()))
        elif block.kind == "table":
            flush_text()
            for part in _split_table(block.text, count_tokens, max_tokens):
                emit("table", part, block.page, block.page)
        else:
            pending.append((block.text, block.page))
    flush_text()
    return chunks


def _split_long(
    pieces: list[tuple[str, int]], count_tokens: TokenCounter, limit: int
) -> list[tuple[str, int]]:
    """Break paragraphs longer than `limit` into sentences (and sentences into words)."""
    out: list[tuple[str, int]] = []
    for text, page in pieces:
        if count_tokens(text) <= limit:
            out.append((text, page))
            continue
        for sentence in SENTENCE_SPLIT.split(text):
            if count_tokens(sentence) <= limit:
                out.append((sentence, page))
                continue
            words = sentence.split()
            step = max(1, len(words) * limit // max(count_tokens(sentence), 1))
            out.extend((" ".join(words[i : i + step]), page) for i in range(0, len(words), step))
    return out


def _tail(
    current: list[tuple[str, int]], count_tokens: TokenCounter, overlap: int
) -> list[tuple[str, int]]:
    """The last sentences of a chunk, up to `overlap` tokens, to start the next chunk."""
    if overlap <= 0:
        return []
    last_text, last_page = current[-1]
    sentences = SENTENCE_SPLIT.split(last_text)
    kept: list[str] = []
    size = 0
    for sentence in reversed(sentences):
        tokens = count_tokens(sentence)
        if size + tokens > overlap:
            break
        kept.insert(0, sentence)
        size += tokens
    return [(" ".join(kept), last_page)] if kept else []


def _split_table(table: str, count_tokens: TokenCounter, max_tokens: int) -> list[str]:
    if count_tokens(table) <= max_tokens:
        return [table]
    lines = table.splitlines()
    has_separator = len(lines) > 1 and set(lines[1].replace("|", "").strip()) <= {"-", ":", " "}
    header = lines[:2] if has_separator else lines[:1]
    rows = lines[len(header) :]
    parts: list[str] = []
    current: list[str] = []
    budget = max_tokens - count_tokens("\n".join(header))
    size = 0
    for row in rows:
        tokens = count_tokens(row)
        if current and size + tokens > budget:
            parts.append("\n".join(header + current))
            current, size = [], 0
        current.append(row)
        size += tokens
    if current:
        parts.append("\n".join(header + current))
    return parts
