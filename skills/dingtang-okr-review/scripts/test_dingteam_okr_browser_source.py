import base64
import importlib.util
import json
import time
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent / "dingteam_okr_browser_source.py"


def load_module():
    spec = importlib.util.spec_from_file_location("dingteam_okr_browser_source", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _make_jwt(exp: int) -> str:
    def seg(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return "hdr." + seg({"exp": exp, "uid": "u", "cid": "c"}) + ".sig"


def test_jwt_exp_parsing():
    module = load_module()
    exp = int(time.time()) + 3600
    assert module._jwt_exp({"Authorization": _make_jwt(exp)}) == exp
    assert module._jwt_exp({"Authorization": "not-a-jwt"}) is None
    assert module._jwt_exp({}) is None


def test_cache_roundtrip_and_validity(tmp_path, monkeypatch):
    module = load_module()
    monkeypatch.setattr(module, "PROFILE_DIR", tmp_path)
    monkeypatch.setattr(module, "CACHE_PATH", tmp_path / "token_cache.json")

    fresh = {"Authorization": _make_jwt(int(time.time()) + 3600), "X-Space-Id": "1"}
    module._write_cache(fresh)
    # file is 0600
    assert (tmp_path / "token_cache.json").stat().st_mode & 0o777 == 0o600
    assert module._read_cache() == fresh


def test_cache_rejects_expired(tmp_path, monkeypatch):
    module = load_module()
    monkeypatch.setattr(module, "PROFILE_DIR", tmp_path)
    monkeypatch.setattr(module, "CACHE_PATH", tmp_path / "token_cache.json")

    expired = {"Authorization": _make_jwt(int(time.time()) + 60)}  # within skew window
    module._write_cache(expired)
    assert module._read_cache() is None


def test_get_headers_uses_cache_without_browser(tmp_path, monkeypatch):
    module = load_module()
    monkeypatch.setattr(module, "PROFILE_DIR", tmp_path)
    monkeypatch.setattr(module, "CACHE_PATH", tmp_path / "token_cache.json")
    # if it tried to launch a browser, this would explode — assert it does not
    monkeypatch.setattr(
        module, "_capture_headers", lambda *a, **k: (_ for _ in ()).throw(AssertionError("launched"))
    )
    valid = {"Authorization": _make_jwt(int(time.time()) + 3600)}
    module._write_cache(valid)
    assert module.get_headers(allow_browser=True) == valid


def test_get_headers_raises_when_no_cache_and_browser_disabled(tmp_path, monkeypatch):
    module = load_module()
    monkeypatch.setattr(module, "PROFILE_DIR", tmp_path)
    monkeypatch.setattr(module, "CACHE_PATH", tmp_path / "token_cache.json")
    with pytest.raises(RuntimeError):
        module.get_headers(allow_browser=False)
