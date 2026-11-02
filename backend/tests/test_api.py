import os
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import auth
from conftest import GIF, PNG, make_zip


def _create(client, title="Page", **kw):
    payload = {"title": title, "content": {"blocks": []}}
    payload.update(kw)
    r = client.post("/api/pages", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_pages_list_has_no_content_and_creates_home(client):
    pages = client.get("/api/pages").json()
    assert len(pages) == 1
    assert pages[0]["page_type"] == "home"
    assert "content" not in pages[0]
    assert "content" in client.get(f"/api/pages/{pages[0]['id']}").json()


def test_list_order_is_stable(client):
    client.get("/api/pages")
    ids = [_create(client, f"P{i}")["id"] for i in range(5)]
    listed = [p["id"] for p in client.get("/api/pages").json() if p["page_type"] != "home"]
    assert listed == ids


def test_create_keeps_header_and_rejects_home(client):
    p = _create(client, header="/uploads/x/header.png")
    assert p["header"] == "/uploads/x/header.png"
    r = client.post("/api/pages", json={"title": "x", "content": {"blocks": []}, "page_type": "home"})
    assert r.status_code == 400


def test_home_page_type_cannot_change(client):
    home = client.get("/api/pages").json()[0]
    r = client.put(f"/api/pages/{home['id']}", json={"page_type": "favorite"})
    assert r.status_code == 400
    r = client.put(f"/api/pages/{home['id']}", json={"page_type": "home", "title": "Dash"})
    assert r.status_code == 200


def test_parent_can_be_set_and_cleared(client):
    parent = _create(client, "Parent")
    child = _create(client, "Child", parent_id=parent["id"])
    assert child["parent_id"] == parent["id"]
    r = client.put(f"/api/pages/{child['id']}", json={"title": "Child2"})
    assert r.json()["parent_id"] == parent["id"]
    r = client.put(f"/api/pages/{child['id']}", json={"parent_id": None})
    assert r.json()["parent_id"] is None


def test_cycle_rejected(client):
    a = _create(client, "A")
    b = _create(client, "B", parent_id=a["id"])
    r = client.put(f"/api/pages/{a['id']}", json={"parent_id": b["id"]})
    assert r.status_code == 400


def test_delete_without_cascade_orphans_children(client):
    parent = _create(client, "Parent")
    child = _create(client, "Child", parent_id=parent["id"])
    assert client.delete(f"/api/pages/{parent['id']}").status_code == 200
    assert client.get(f"/api/pages/{child['id']}").json()["parent_id"] is None


def test_delete_cascade(client):
    parent = _create(client, "Parent")
    child = _create(client, "Child", parent_id=parent["id"])
    grandchild = _create(client, "Grandchild", parent_id=child["id"])
    assert client.delete(f"/api/pages/{parent['id']}?cascade=true").status_code == 200
    for p in (parent, child, grandchild):
        assert client.get(f"/api/pages/{p['id']}").status_code == 404


def test_user_isolation(client, as_user):
    p = _create(client, "Secret")
    as_user("user-b")
    assert client.get(f"/api/pages/{p['id']}").status_code == 404
    assert client.put(f"/api/pages/{p['id']}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/pages/{p['id']}").status_code == 404
    assert client.post("/api/pages", json={"title": "c", "content": {"blocks": []}, "parent_id": p["id"]}).status_code == 400
    assert client.get("/api/search", params={"q": "Secret"}).json() == []


def test_search_title_and_content(client):
    _create(client, "Groceries")
    _create(client, "Notes", content={"blocks": [
        {"type": "paragraph", "data": {"text": "buy <b>oat</b> milk &amp; bread"}},
        {"type": "list", "data": {"items": [{"content": "nested", "items": [{"content": "deepword", "items": []}]}]}},
        {"type": "table", "data": {"content": [["cellword"]]}},
        {"type": "delimiter"},
    ]})
    r = client.get("/api/search", params={"q": "groc"}).json()
    assert [x["title"] for x in r] == ["Groceries"]
    r = client.get("/api/search", params={"q": "oat milk"}).json()
    assert r[0]["title"] == "Notes" and "oat milk & bread" in r[0]["snippet"]
    assert client.get("/api/search", params={"q": "deepword"}).json()[0]["title"] == "Notes"
    assert client.get("/api/search", params={"q": "cellword"}).json()[0]["title"] == "Notes"
    assert client.get("/api/search", params={"q": ""}).json() == []


def _upload(client, data, filename, upload_type=None, field="file", content_type="application/octet-stream"):
    form = {} if upload_type is None else {"upload_type": upload_type}
    return client.post("/api/upload", files={field: (filename, data, content_type)}, data=form)


def test_upload_image_gets_detected_extension(client):
    r = _upload(client, PNG, "evil.html", field="image")
    assert r.status_code == 200
    url = r.json()["url"]
    assert url.endswith(".png")
    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in served.headers["content-security-policy"]
    assert "content-disposition" not in served.headers


def test_upload_rejects_unknown_type(client):
    assert _upload(client, b"<script>alert(1)</script>", "x.html", "bypass").status_code == 400


def test_upload_rejects_polyglot_and_non_image(client):
    assert _upload(client, b"<html>", "x.png", "header").status_code == 400
    r = _upload(client, GIF + b"<script>alert(1)</script>", "x.html", "icon")
    assert r.status_code == 200 and r.json()["url"].endswith(".gif")


def test_upload_audio_checks_bytes_not_content_type(client):
    r = _upload(client, b"<html><script>alert(1)</script>", "x.html", "audio", content_type="audio/mpeg")
    assert r.status_code == 400
    r = _upload(client, b"ID3" + b"\x00" * 32, "song.mp3", "audio", content_type="application/octet-stream")
    assert r.status_code == 200 and r.json()["url"].endswith(".mp3")
    r = _upload(client, b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 32, "memo.m4a", "audio", content_type="audio/x-m4a")
    assert r.status_code == 200 and r.json()["url"].endswith(".m4a")


def test_upload_file_blocklist_and_attachment(client):
    assert _upload(client, b"<svg/>", "x.svg", "file").status_code == 400
    assert _upload(client, b"x", "x.HTM", "file").status_code == 400
    r = _upload(client, b"%PDF-1.4", "my report.pdf", "file")
    assert r.status_code == 200
    url = r.json()["url"]
    assert url.endswith("_my_report.pdf")
    assert client.get(url).headers["content-disposition"] == "attachment"


def test_upload_size_limit(client, monkeypatch):
    import uploads
    monkeypatch.setattr(uploads, "MAX_FILE_SIZE", 10)
    from routers import files
    monkeypatch.setattr(files, "MAX_FILE_SIZE", 10)
    assert _upload(client, PNG, "a.png").status_code == 413


def test_storage_usage_and_cleanup(client):
    url = _upload(client, PNG, "a.png").json()["url"]
    orphan = _upload(client, PNG, "orphan.png").json()["url"]
    old = time.time() - 2 * 24 * 60 * 60
    os.utime(os.path.join(os.environ["UPLOAD_DIR"], orphan.removeprefix("/uploads/")), (old, old))
    _create(client, "Img", content={"blocks": [{"type": "image", "data": {"url": url}}]})
    usage = client.get("/api/storage-usage").json()
    assert usage["usage_bytes"] == 2 * len(PNG)
    assert usage["quota_formatted"] == "500 MB"
    r = client.post("/api/cleanup-uploads").json()
    assert r["deleted_count"] == 1
    assert client.get(url).status_code == 200


def test_notepad_and_todo(client):
    n1 = client.get("/api/notepad").json()
    n2 = client.get("/api/notepad").json()
    assert n1["id"] == n2["id"] and n1["page_type"] == "notepad"
    assert client.get("/api/todo").json()["page_type"] == "todo"
    assert all(p["page_type"] not in ("notepad", "todo") for p in client.get("/api/pages").json())


def test_demo_endpoints(client):
    pages = client.get("/api/demo/pages").json()
    assert len(pages) == 3 and "content" not in pages[0]
    assert client.get(f"/api/demo/pages/{pages[0]['id']}").json()["content"]["blocks"]
    assert client.get("/api/demo/search", params={"q": "Molecore"}).json()


def test_removed_endpoints(client):
    assert client.get("/api/auth/me").status_code == 404
    assert client.get("/api/health").json() == {"status": "healthy"}


NOTION_ZIP = {
    "Export/Root Page 0123456789abcdef0123456789abcdef.md": (
        "# Root Page\n\n"
        "Hello **bold** <img src=x onerror=alert(1)>\n"
        "second line\n\n"
        "<aside>\n[Child & Co](Root%20Page/Child.md)\n</aside>\n\n"
        "![pic](Root%20Page/pic.png)\n\n"
        "![bad](../../etc/passwd)\n\n"
        "- a\n  - b\n"
    ),
    "Export/Root Page/Child & Co abcdefabcdefabcdefabcdefabcdefab.md": "# Child & Co\n\ntext\n",
    "Export/Root Page/Other.md": "# Other\n\nmore\n",
    "Export/Root Page/pic.png": PNG,
}


def test_notion_import(client):
    r = client.post("/api/import/notion", files={"zip_file": ("export.zip", make_zip(NOTION_ZIP), "application/zip")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pages_created"] == 3
    assert all("\n" not in line for line in body["log"])

    pages = {p["title"]: p for p in client.get("/api/pages").json()}
    root = client.get(f"/api/pages/{pages['Root Page']['id']}").json()
    assert pages["Child & Co"]["parent_id"] == root["id"]
    assert pages["Other"]["parent_id"] == root["id"]

    blocks = root["content"]["blocks"]
    para = blocks[0]["data"]["text"]
    assert "<b>bold</b>" in para and "<img" not in para and "&lt;img" in para
    assert "<br>" in para
    types = [b["type"] for b in blocks]
    assert "callout" in types and "image" in types
    page_blocks = [b["data"]["pageTitle"] for b in blocks if b["type"] == "page"]
    assert sorted(page_blocks) == ["Child & Co", "Other"]
    image = next(b for b in blocks if b["type"] == "image")
    assert client.get(image["data"]["url"]).status_code == 200


NOTION_EXTRAS_ZIP = {
    "Export/Notes 0123456789abcdef0123456789abcdef.md": (
        "# Notes\n\n"
        "#### Small heading\n\n"
        "- a\n  - b\n    - c\n- d\n\n"
        "1. one\n   1. one.one\n2. two\n\n"
        "[report.pdf](Notes/report.pdf)\n\n"
        "[gone.pdf](Notes/gone.pdf)\n"
    ),
    "Export/Notes/report.pdf": b"%PDF-1.4 test",
    "Export/Tasks abcdefabcdefabcdefabcdefabcdefab/Task One.md": "# Task One\n",
    "Export/Tasks abcdefabcdefabcdefabcdefabcdefab.csv": "\ufeffName,Status\nTask One,Done\n",
    "Export/Tasks abcdefabcdefabcdefabcdefabcdefab_all.csv": "\ufeffName,Status,Extra\nTask One,Done,x\n",
}


def test_notion_import_extras(client):
    r = client.post("/api/import/notion", files={"zip_file": ("export.zip", make_zip(NOTION_EXTRAS_ZIP), "application/zip")})
    assert r.status_code == 200, r.text
    assert r.json()["pages_created"] == 3

    pages = {p["title"]: p for p in client.get("/api/pages").json()}
    notes = client.get(f"/api/pages/{pages['Notes']['id']}").json()["content"]["blocks"]

    assert notes[0] == {"type": "header", "data": {"text": "Small heading", "level": 3}}

    bullets = notes[1]["data"]
    assert bullets["style"] == "unordered"
    assert [item["content"] for item in bullets["items"]] == ["a", "d"]
    assert bullets["items"][0]["items"][0]["items"][0]["content"] == "c"

    numbers = notes[2]["data"]
    assert numbers["style"] == "ordered"
    assert [item["content"] for item in numbers["items"]] == ["one", "two"]
    assert numbers["items"][0]["items"][0]["content"] == "one.one"

    file_block = notes[3]
    assert file_block["type"] == "file"
    assert file_block["data"]["fileName"] == "report.pdf"
    assert file_block["data"]["fileType"] == "application/pdf"
    assert client.get(file_block["data"]["url"]).status_code == 200

    assert notes[4]["type"] == "paragraph" and "gone.pdf" in notes[4]["data"]["text"]

    tasks = client.get(f"/api/pages/{pages['Tasks']['id']}").json()["content"]["blocks"]
    assert tasks[0]["type"] == "table"
    assert tasks[0]["data"]["content"] == [["Name", "Status"], ["Task One", "Done"]]
    assert tasks[1]["type"] == "page" and tasks[1]["data"]["pageTitle"] == "Task One"


def test_notion_import_is_all_or_nothing(client, monkeypatch):
    import notion_importer

    def broken(_md_file):
        raise RuntimeError("boom")

    monkeypatch.setattr(notion_importer, "find_subdir_for_md", broken)
    r = client.post("/api/import/notion", files={"zip_file": ("export.zip", make_zip(NOTION_ZIP), "application/zip")})
    assert r.status_code == 500
    assert [p["page_type"] for p in client.get("/api/pages").json()] == ["home"]


def test_notion_import_parent_must_belong_to_user(client, as_user):
    p = _create(client, "Mine")
    as_user("user-b")
    r = client.post(
        "/api/import/notion",
        files={"zip_file": ("export.zip", make_zip(NOTION_ZIP), "application/zip")},
        data={"parent_id": str(p["id"])},
    )
    assert r.status_code == 400


def test_notion_import_rejects_bad_zip(client):
    r = client.post("/api/import/notion", files={"zip_file": ("export.zip", b"nope", "application/zip")})
    assert r.status_code == 400


@pytest.fixture()
def rsa_keys(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk["kid"] = "k1"
    monkeypatch.setattr(auth, "_jwks_cache", {"keys": [jwk]})
    monkeypatch.setattr(auth, "_jwks_cache_time", time.time())
    return private


def _token(private, **claims):
    payload = {"sub": "u1", "azp": auth.CLIENT_ID, "exp": int(time.time()) + 60}
    payload.update(claims)
    return jwt.encode(payload, private, algorithm="RS256", headers={"kid": "k1"})


def _verify(token):
    return auth.verify_token(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))


def test_auth_valid_token(rsa_keys):
    assert _verify(_token(rsa_keys))["sub"] == "u1"


@pytest.mark.parametrize("claims", [
    {"azp": "other-client"},
    {"exp": int(time.time()) - 10},
])
def test_auth_rejects_bad_claims(rsa_keys, claims):
    with pytest.raises(HTTPException) as e:
        _verify(_token(rsa_keys, **claims))
    assert e.value.status_code == 401


def test_auth_rejects_foreign_signature(rsa_keys):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as e:
        _verify(_token(other))
    assert e.value.status_code == 401


def test_auth_rejects_garbage(rsa_keys):
    with pytest.raises(HTTPException) as e:
        _verify("not-a-token")
    assert e.value.status_code == 401


def test_auth_unknown_kid_refresh_is_throttled(rsa_keys, monkeypatch):
    calls = []
    monkeypatch.setattr(auth.httpx, "get", lambda *a, **k: calls.append(1))
    token = jwt.encode({"sub": "u1", "azp": auth.CLIENT_ID, "exp": int(time.time()) + 60},
                       rsa_keys, algorithm="RS256", headers={"kid": "unknown"})
    for _ in range(3):
        with pytest.raises(HTTPException):
            _verify(token)
    assert calls == []
