import importlib.util
import json
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parent / "dingteam_okr_direct_source.py"


def load_module():
    spec = importlib.util.spec_from_file_location(
        "dingteam_okr_direct_source", SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_text_from_rich_text_collects_nested_text():
    module = load_module()
    raw = json.dumps(
        [{"children": [{"text": "hello"}, {"children": [{"text": "world"}]}]}]
    )
    assert module.text_from_rich_text(raw) == "hello\nworld"
    assert module.text_from_rich_text("") == ""
    assert module.text_from_rich_text("not-json") == ""


def test_normalized_period_canonicalizes_quarter_labels():
    module = load_module()
    assert module.normalized_period("2026年2季度") == "2026q2"
    assert module.normalized_period("2026 Q2") == "2026q2"
    assert module.normalized_period("2026年二季度") == "2026q2"


def test_progress_percent_and_timestamp():
    module = load_module()
    assert module.progress_percent(4000) == 40.0
    assert module.progress_percent(2778) == 27.78
    assert module.progress_percent(None) == ""
    assert module.progress_percent("x") == "x"
    assert module.format_timestamp(0) == "1970-01-01T00:00:00.000Z"


def test_aggregate_history_handles_empty_and_populated():
    module = load_module()
    assert module.aggregate_history([]) == "[未撰写进度]"
    histories = [
        {
            "createAt": 0,
            "colorContents": [{"content": "由 0% 更新为 40%"}],
            "singleContent": json.dumps([{"children": [{"text": "做了一些事"}]}]),
        }
    ]
    aggregated = module.aggregate_history(histories)
    assert "由 0% 更新为 40%" in aggregated
    assert "做了一些事" in aggregated


def test_unwrap_and_as_list():
    module = load_module()
    assert module._unwrap({"data": {"list": [1]}}) == {"list": [1]}
    assert module._as_list({"data": {"list": [1, 2]}}) == [1, 2]
    assert module._as_list({"data": [3]}) == [3]
    assert module._as_list({"histories": [9]}, key="histories") == [9]
    assert module._as_list({"nope": 1}) == []


def test_fetch_builds_processed_structure(monkeypatch):
    module = load_module()

    monkeypatch.setattr(module, "capture_auth_headers", lambda *a, **k: {"Authorization": "x"})

    def fake_post(path, body, headers):
        if path.endswith("/person/period/list"):
            return {"data": {"list": [{"name": "2026年2季度", "okrId": "okr-1"}]}}
        if path.endswith("/objective/showListView/v2"):
            return {
                "data": {
                    "list": [
                        {
                            "id": "O1",
                            "name": "Objective One",
                            "weight": 25,
                            "progress": 2778,
                            "ownerName": "ET",
                            "krCells": [{"id": "KR1", "content": "kr cell", "weight": 10}],
                        }
                    ]
                }
            }
        if path.endswith("/objective/findKrDetail"):
            return {"data": {"content": "KR detail title", "weight": 10, "progress": 4000}}
        if path.endswith("/objective/log/progressHistory"):
            return {
                "data": {
                    "histories": [
                        {
                            "createAt": 0,
                            "colorContents": [{"content": "由 0% 更新为 40%"}],
                            "singleContent": json.dumps(
                                [{"children": [{"text": "进展说明"}]}]
                            ),
                        }
                    ]
                }
            }
        if path.endswith("/objective/findCommentList/v2"):
            return {
                "data": {
                    "list": [
                        {  # KR-level comment (mapped by krInfo.name)
                            "type": 5,
                            "createAt": 0,
                            "creator": {"name": "Roy Han"},
                            "krInfo": {"krId": "", "name": "KR detail title"},
                            "richTextContent": json.dumps(
                                [{"children": [{"text": "完成度60%，样例还不够"}]}]
                            ),
                        },
                        {  # objective-level comment (no krInfo)
                            "type": 5,
                            "createAt": 0,
                            "creator": {"name": "Derek Zen"},
                            "krInfo": {},
                            "richTextContent": json.dumps(
                                [{"type": "at", "atName": "Roy Han",
                                  "children": [{"text": ""}]},
                                 {"text": "对齐排期"}]
                            ),
                        },
                        {  # non-comment record, must be ignored
                            "type": 1,
                            "richTextContent": json.dumps([{"children": [{"text": "新建目标"}]}]),
                        },
                    ]
                }
            }
        raise AssertionError(f"unexpected path {path}")

    monkeypatch.setattr(module, "_post", fake_post)

    result = module.fetch("user-1", "2026 Q2")

    processed = result["processed"]
    assert len(processed["objectives"]) == 1
    rows = processed["okrRows"]
    assert [r["level"] for r in rows] == ["O", "KR"]

    o_row, kr_row = rows
    assert o_row["objectiveTitle"] == "Objective One"
    assert o_row["objectiveProgress"] == 27.78
    # objective-level comment (with @mention) lands on the O row
    assert "@Roy Han" in o_row["krDetailsUpdatesAggregated"]
    assert "对齐排期" in o_row["krDetailsUpdatesAggregated"]
    assert "新建目标" not in o_row["krDetailsUpdatesAggregated"]  # type!=5 ignored
    assert kr_row["krTitle"] == "KR detail title"
    assert kr_row["krProgress"] == 40.0
    assert kr_row["objectiveTitle"] == "Objective One"
    # both the numeric progress history AND the KR comment are present
    assert "由 0% 更新为 40%" in kr_row["krDetailsUpdatesAggregated"]
    assert "进展说明" in kr_row["krDetailsUpdatesAggregated"]
    assert "完成度60%，样例还不够" in kr_row["krDetailsUpdatesAggregated"]


def test_comment_text_parses_mentions():
    module = load_module()
    raw = json.dumps(
        [{"type": "at", "atName": "Roy Han", "children": [{"text": ""}]},
         {"text": "1、完成度60%"}]
    )
    assert module.comment_text(raw) == "@Roy Han1、完成度60%"
    assert module.comment_text("") == ""


def test_fetch_objective_comments_filters_and_maps(monkeypatch):
    module = load_module()
    monkeypatch.setattr(
        module, "_post",
        lambda path, body, headers: {
            "data": {"list": [
                {"type": 5, "createAt": 0, "creator": {"name": "A"},
                 "krInfo": {"krId": "k1", "name": "KR one"},
                 "richTextContent": json.dumps([{"children": [{"text": "hello"}]}])},
                {"type": 1, "richTextContent": json.dumps([{"children": [{"text": "新建"}]}])},
            ]}
        },
    )
    out = module.fetch_objective_comments("O1", {})
    assert len(out) == 1
    assert out[0]["krId"] == "k1"
    assert out[0]["author"] == "A"
    assert out[0]["text"] == "hello"


def test_fetch_raises_when_period_missing(monkeypatch):
    module = load_module()
    monkeypatch.setattr(module, "capture_auth_headers", lambda *a, **k: {})
    monkeypatch.setattr(
        module,
        "_post",
        lambda path, body, headers: {"data": {"list": [{"name": "2026年1季度", "okrId": "x"}]}},
    )
    try:
        module.fetch("user-1", "2026 Q2")
        raise AssertionError("expected RuntimeError")
    except RuntimeError as exc:
        assert "period not found" in str(exc)
