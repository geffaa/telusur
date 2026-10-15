"""The metric math is what the README numbers rest on, so it is tested directly."""

import uuid
from types import SimpleNamespace

from app.eval.runner import _hit_rank, suggest_threshold, summarize
from app.models import EvalCase, EvalResult

DOC, OTHER = uuid.uuid4(), uuid.uuid4()


def case(kind="answerable", heading="Bab 1 > 1.2 Tarif") -> EvalCase:
    return EvalCase(id=uuid.uuid4(), kind=kind, question="q", expected_document_id=DOC,
                    expected_heading=heading)


def cand(doc, heading):
    return SimpleNamespace(document_id=doc, heading_path=heading)


def result(c: EvalCase, hit=None, doc_hit=None, top=0.9, refused=False, **kw) -> EvalResult:
    return EvalResult(case_id=c.id, hit_rank=hit, doc_hit_rank=doc_hit, top_score=top,
                      refused=refused, retrieval_ms=10, **kw)


def test_hit_rank_distinguishes_section_from_document():
    c = case()
    ranked = [cand(OTHER, "x"), cand(DOC, "Bab 1 > 1.1 Lain"), cand(DOC, "Bab 1 > 1.2 Tarif")]
    assert _hit_rank(ranked, c) == (3, 2)
    assert _hit_rank([cand(OTHER, "x")], c) == (None, None)


def test_hit_rank_without_section_counts_document():
    c = case(heading=None)
    assert _hit_rank([cand(OTHER, "x"), cand(DOC, "apa saja")], c) == (2, 2)


def test_summary_metrics():
    a1, a2, a3, a4 = case(), case(), case(), case()
    n1, r1 = case("unanswerable"), case("restricted")
    results = [
        result(a1, hit=1, doc_hit=1),
        result(a2, hit=2, doc_hit=1),
        result(a3, hit=None, doc_hit=4),
        result(a4, hit=1, doc_hit=1, top=0.1, refused=True),
        result(n1, top=0.05, refused=True),
        result(r1, top=0.6, refused=False),  # leaked a restricted document
    ]
    m = summarize(results, {c.id: c for c in (a1, a2, a3, a4, n1, r1)}, threshold=0.35)
    assert m["recall_at_1"] == 0.5
    assert m["recall_at_5"] == 0.75
    assert m["doc_recall_at_5"] == 1.0
    assert m["mrr"] == round((1 + 0.5 + 0 + 1) / 4, 4)
    assert m["refusal_accuracy"] == 0.5
    assert m["restricted_leaks"] == 1
    assert m["false_refusal_rate"] == 0.25


def test_suggested_threshold_separates_scores():
    pos = [EvalResult(top_score=s) for s in (0.9, 0.8, 0.5, 0.42)]
    neg = [EvalResult(top_score=s) for s in (0.05, 0.2, 0.33)]
    t = suggest_threshold(pos, neg)
    assert 0.33 < t <= 0.42
    assert suggest_threshold(pos, []) is None
