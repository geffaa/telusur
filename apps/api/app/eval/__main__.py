"""Evaluation CLI.

uv run python -m app.eval generate                    # build the test set (uses the LLM)
uv run python -m app.eval run --mode vector           # retrieval-only run
uv run python -m app.eval run --mode hybrid_rerank --answers
uv run python -m app.eval compare                     # table of the latest run per config
"""

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal, tenant_session
from app.eval import generate, runner
from app.models import EvalRun, Tenant

METRICS = [
    ("recall_at_1", "Recall@1"),
    ("recall_at_5", "Recall@5"),
    ("mrr", "MRR"),
    ("refusal_accuracy", "Tolak benar"),
    ("false_refusal_rate", "Tolak keliru"),
    ("faithfulness", "Faithfulness"),
    ("correctness", "Correctness"),
    ("retrieval_ms_p50", "p50 ms"),
]


async def tenant_id(slug: str):
    async with SessionLocal() as s:
        return await s.scalar(select(Tenant.id).where(Tenant.slug == slug))


async def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.eval")
    parser.add_argument("command", choices=["generate", "run", "compare"])
    parser.add_argument("--tenant", default="nusantara")
    parser.add_argument(
        "--mode", default="hybrid_rerank", choices=["vector", "lexical", "hybrid", "hybrid_rerank"]
    )
    parser.add_argument("--answers", action="store_true", help="generate and judge answers")
    parser.add_argument("--verified-only", action="store_true")
    parser.add_argument("--threshold", type=float)
    parser.add_argument("--no-translate", action="store_true", help="search with the raw question")
    parser.add_argument("--per-doc", type=int, default=3)
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    tid = await tenant_id(args.tenant)

    if args.command == "generate":
        print(await generate.generate(tid, answerable_per_doc=args.per_doc))
    elif args.command == "run":
        config = {
            "mode": args.mode,
            "answers": args.answers,
            "verified_only": args.verified_only,
            "translate": not args.no_translate,
            "rerank_candidates": get_settings().rerank_candidates,
        }
        if args.threshold is not None:
            config["threshold"] = args.threshold
        name = (
            args.mode
            + (" + jawaban" if args.answers else "")
            + (" (tanpa terjemahan)" if args.no_translate else "")
            + (
                f" (rerank {config['rerank_candidates']})"
                if config["rerank_candidates"] != 20 and args.mode == "hybrid_rerank"
                else ""
            )
        )
        async with tenant_session(tid) as s:
            row = EvalRun(tenant_id=tid, name=name, config=config)
            s.add(row)
            await s.flush()
            run_id = row.id
        metrics = await runner.run(tid, run_id)
        for key, value in metrics.items():
            print(f"{key:22} {value}")
    else:
        async with tenant_session(tid) as s:
            runs = list(
                await s.scalars(
                    select(EvalRun).where(EvalRun.status == "done").order_by(EvalRun.created_at)
                )
            )
        latest = {r.name: r for r in runs}
        print("| Konfigurasi | " + " | ".join(label for _, label in METRICS) + " |")
        print("|---|" + "---|" * len(METRICS))
        for name, r in latest.items():
            cells = []
            for key, _ in METRICS:
                v = r.metrics.get(key)
                cells.append(
                    "—" if v is None else f"{v:.0f}" if key.endswith("ms_p50") else f"{v:.2f}"
                )
            print(f"| {name} | " + " | ".join(cells) + " |")


asyncio.run(main())
