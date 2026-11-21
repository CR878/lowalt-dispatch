"""RAG corpus: the regulatory handbook under knowledge/ must be retrievable."""

import pytest

from services.assistant import rag
from services.assistant.knowledge import search


def test_search_finds_regulatory_handbook():
    hits = search("真高 120 米 轻型 适飞空域")
    assert hits
    assert any("无人机合规知识QA手册" in hit["path"] for hit in hits)


def test_search_finds_uom_registration():
    hits = search("实名登记 UOM 激活")
    assert hits


def test_search_finds_delivery_approval():
    hits = search("配送 投放物品 申请")
    assert hits


def test_search_finds_network_supplement():
    hits = search("适飞空域 2026 新版")
    assert hits
    assert any("联网补充" in hit["path"] for hit in hits)


def test_keyword_mode_skips_vector_store(monkeypatch):
    monkeypatch.setenv("AERIS_RAG", "keyword")
    hits = search("真高 120 米 适飞空域")
    assert hits
    assert all(hit.get("retriever") != "chroma" for hit in hits)


def test_vector_failure_falls_back_to_keyword(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("chroma unavailable")

    monkeypatch.setattr(rag, "search", boom)
    monkeypatch.delenv("AERIS_RAG", raising=False)
    hits = search("真高 120 米 适飞空域")
    assert hits
    assert all(hit.get("retriever") != "chroma" for hit in hits)


def test_chroma_hits_carry_score_when_available():
    pytest.importorskip("chromadb")
    try:
        hits = rag.search("真高 120 米", limit=3)
    except Exception as exc:  # model download or index build unavailable
        pytest.skip(f"chroma unavailable: {exc}")
    for hit in hits:
        assert hit["path"]
        assert isinstance(hit["score"], float)
        assert hit["retriever"] == "chroma"


def test_hits_carry_provenance():
    hits = search("真高")
    assert hits
    for hit in hits:
        assert hit["path"]
        assert hit["heading"]
        assert hit["start_line"] >= 1
        assert hit["end_line"] >= hit["start_line"]
        assert len(hit["revision"]) == 12
        assert hit["text"].strip()


def test_agent_ui_reuse_guide_is_retrievable(monkeypatch):
    monkeypatch.setenv("AERIS_RAG", "keyword")
    hits = search("presentation 指标卡 时间线 CSV 复用")
    assert any(hit["path"] == "docs/Agent富界面输出与复用指南.md" for hit in hits)
