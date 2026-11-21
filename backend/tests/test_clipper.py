import pytest
from lxml import etree

import routers.clip
from clipper import Article, ClipError, check_url, to_blocks


@pytest.mark.parametrize("url", [
    "ftp://example.com/file",
    "http://127.0.0.1/",
    "http://localhost/",
    "http://192.168.178.66/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://example.com:8080/",
])
def test_check_url_rejects_internal_and_odd_addresses(url):
    with pytest.raises(ClipError):
        check_url(url)


def test_to_blocks_maps_article_elements():
    xml = """<doc><main>
      <head rend="h2">Step <hi rend="#i">one</hi></head>
      <p>Read <hi rend="#b">this</hi> and <ref target="/docs">the docs</ref>.<lb/>Next line</p>
      <code>npm install foo
  indented line</code>
      <list rend="ol"><item>first<list rend="ul"><item>nested</item></list></item><item>second</item></list>
      <table><row><cell role="head">A</cell><cell role="head">B</cell></row><row><cell>1</cell></row></table>
      <graphic src="/img/a.png" alt="diagram"/>
      <quote>Wise words</quote>
      <p><ref target="javascript:alert(1)">bad link</ref> &lt;script&gt;</p>
    </main></doc>"""
    main = etree.fromstring(xml).find("main")
    blocks = to_blocks(main, "https://example.com/post")

    assert blocks[0] == {"type": "header", "data": {"text": "Step <i>one</i>", "level": 2}}
    assert blocks[1]["data"]["text"] == (
        'Read <b>this</b> and <a href="https://example.com/docs">the docs</a>.<br>Next line'
    )
    assert blocks[2] == {"type": "code", "data": {"code": "npm install foo\n  indented line"}}
    assert blocks[3]["data"]["style"] == "ordered"
    assert blocks[3]["data"]["items"][0] == {
        "content": "first",
        "items": [{"content": "nested", "items": []}],
    }
    assert blocks[4]["data"] == {"withHeadings": True, "content": [["A", "B"], ["1", ""]]}
    assert blocks[5]["data"]["url"] == "https://example.com/img/a.png"
    assert blocks[6]["data"]["text"] == "<i>Wise words</i>"
    assert blocks[7]["data"]["text"] == "bad link &lt;script&gt;"


def test_clip_creates_subpage(client, monkeypatch):
    parent = client.post("/api/pages", json={"title": "Svelte", "content": {"blocks": []}}).json()
    article = Article(
        title="Svelte tutorial",
        blocks=[{"type": "paragraph", "data": {"text": "Hello"}}],
        header="/uploads/user-a/header.png",
    )
    monkeypatch.setattr(routers.clip, "clip_url", lambda url, user_id: article)

    response = client.post("/api/clip", json={"url": "https://svelte.dev/tutorial", "parent_id": parent["id"]})

    assert response.status_code == 200
    page = response.json()
    assert page["title"] == "Svelte tutorial"
    assert page["parent_id"] == parent["id"]
    assert page["icon"] == "🔗"
    assert page["header"] == "/uploads/user-a/header.png"
    assert page["content"]["blocks"] == article.blocks


def test_clip_rejects_foreign_parent(client, as_user):
    parent = client.post("/api/pages", json={"title": "Mine", "content": {"blocks": []}}).json()
    as_user("user-b")
    response = client.post("/api/clip", json={"url": "https://example.com", "parent_id": parent["id"]})
    assert response.status_code == 400


def test_clip_passes_errors_through(client, monkeypatch):
    def fail(url, user_id):
        raise ClipError(422, "No readable article found on this page.")

    monkeypatch.setattr(routers.clip, "clip_url", fail)
    response = client.post("/api/clip", json={"url": "https://example.com"})
    assert response.status_code == 422
    assert response.json()["detail"] == "No readable article found on this page."
