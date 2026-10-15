from app.ingestion.chunker import chunk_blocks
from app.ingestion.parsers import Block, parse_markdown


def words(text: str) -> int:
    return len(text.split())


def sentence(n: int, word: str = "kata") -> str:
    return " ".join([word] * (n - 1)) + " akhir."


def test_chunks_never_cross_headings():
    blocks = [
        Block("heading", "Bab 1 Umum", 1, 1),
        Block("text", sentence(30), 1),
        Block("heading", "Bab 2 Cuti", 2, 1),
        Block("text", sentence(30), 2),
    ]
    chunks = chunk_blocks(blocks, words, target_tokens=100)
    assert [c.heading_path for c in chunks] == ["Bab 1 Umum", "Bab 2 Cuti"]
    assert [c.page_start for c in chunks] == [1, 2]


def test_heading_path_tracks_nesting():
    blocks = [
        Block("heading", "Bab 3 Perjalanan Dinas", 1, 1),
        Block("heading", "3.1 Transportasi", 1, 2),
        Block("text", "Isi transportasi.", 1),
        Block("heading", "3.2 Uang Harian", 1, 2),
        Block("text", "Isi uang harian.", 1),
        Block("heading", "Bab 4 Penutup", 2, 1),
        Block("text", "Isi penutup.", 2),
    ]
    paths = [c.heading_path for c in chunk_blocks(blocks, words)]
    assert paths == [
        "Bab 3 Perjalanan Dinas > 3.1 Transportasi",
        "Bab 3 Perjalanan Dinas > 3.2 Uang Harian",
        "Bab 4 Penutup",
    ]


def test_long_section_is_split_with_overlap():
    paragraphs = [Block("text", sentence(40, f"p{i}"), 1 + i // 3) for i in range(10)]
    chunks = chunk_blocks([Block("heading", "H", 1, 1), *paragraphs], words, 100, overlap_tokens=45)
    assert len(chunks) > 1
    assert all(c.token_count <= 100 + 45 for c in chunks)
    # The next chunk starts with the last sentence of the previous chunk.
    first_tail = chunks[0].content.split(". ")[-1]
    assert chunks[1].content.startswith(first_tail.rstrip("."))
    assert chunks[-1].page_end == 4


def test_oversized_paragraph_is_split():
    chunks = chunk_blocks([Block("text", " ".join(["x"] * 1000), 1)], words, 200, overlap_tokens=0)
    assert len(chunks) >= 5
    assert all(c.token_count <= 200 for c in chunks)


def test_small_table_kept_whole_and_large_table_repeats_header():
    small = "| Level | Harian |\n|---|---|\n| Staff | 300000 |"
    rows = "\n".join(f"| L{i} | {i} ribu rupiah per hari |" for i in range(200))
    large = "| Level | Harian |\n|---|---|\n" + rows
    chunks = chunk_blocks(
        [Block("table", small, 1), Block("table", large, 2)], words, max_tokens=150
    )
    assert chunks[0].content == small and chunks[0].kind == "table"
    assert len(chunks) > 2
    assert all(c.content.startswith("| Level | Harian |\n|---|---|") for c in chunks[1:])


def test_embedding_text_has_contextual_header():
    chunk = chunk_blocks(
        [Block("heading", "Cuti", 1, 1), Block("text", "Cuti tahunan 12 hari.", 1)], words
    )[0]
    assert chunk.embedding_text("Kebijakan HR") == "Kebijakan HR — Cuti\n\nCuti tahunan 12 hari."


def test_markdown_parser_headings_and_tables():
    parsed = parse_markdown(
        "# Judul\n\nParagraf satu\nlanjutan.\n\n## Sub\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"
    )
    assert [(b.kind, b.level) for b in parsed.blocks] == [
        ("heading", 1),
        ("text", 0),
        ("heading", 2),
        ("table", 0),
    ]
    assert parsed.blocks[1].text == "Paragraf satu lanjutan."
