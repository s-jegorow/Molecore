import ipaddress
import re
import socket
import time
from dataclasses import dataclass, field
from datetime import date
from html import escape
from typing import List, Optional
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from lxml import etree

from uploads import UploadError, save_upload

MAX_HTML_SIZE = 5 * 1024 * 1024
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_IMAGES = 30
MAX_REDIRECTS = 5
PAGE_TIMEOUT = 15
IMAGE_TIMEOUT = 8
IMAGE_BUDGET_SECONDS = 30
USER_AGENT = "Mozilla/5.0 (compatible; molecore-clipper/1.0)"

INLINE_TAGS = {"#b": "b", "#i": "i", "#u": "u", "#t": "s"}


class ClipError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class Article:
    title: str
    blocks: List[dict] = field(default_factory=list)
    header: Optional[str] = None


def check_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ClipError(400, "Only http and https links can be clipped.")

    try:
        port = parsed.port
    except ValueError:
        raise ClipError(400, "This link is not valid.")
    if port not in (None, 80, 443):
        raise ClipError(400, "This address is not allowed.")

    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise ClipError(400, "This website could not be found.")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global:
            raise ClipError(400, "This address is not allowed.")


def _read_limited(response: httpx.Response, limit: int) -> bytes:
    chunks = []
    total = 0
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > limit:
            raise ClipError(413, "The page is too large to clip.")
        chunks.append(chunk)
    return b"".join(chunks)


def fetch(url: str, limit: int, timeout: int) -> tuple:
    headers = {"User-Agent": USER_AGENT}
    try:
        with httpx.Client(timeout=timeout, follow_redirects=False, headers=headers) as client:
            for _ in range(MAX_REDIRECTS + 1):
                check_url(url)
                with client.stream("GET", url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise ClipError(422, "The website sent a broken redirect.")
                        url = urljoin(url, location)
                        continue

                    if response.status_code in (401, 402, 403, 451):
                        raise ClipError(422, "The website refused the request (login, paywall or bot protection).")
                    if response.status_code >= 400:
                        raise ClipError(422, f"The website answered with an error ({response.status_code}).")

                    body = _read_limited(response, limit)
                    return body, url, response.headers.get("content-type", "")
    except httpx.TimeoutException:
        raise ClipError(504, "The website took too long to answer.")
    except httpx.HTTPError:
        raise ClipError(502, "The website could not be reached.")

    raise ClipError(422, "The website redirects too often.")


def _inline(el, base_url: str) -> str:
    parts = [escape(el.text or "")]
    for child in el:
        parts.append(_inline_element(child, base_url))
        parts.append(escape(child.tail or ""))
    return "".join(parts)


def _inline_element(el, base_url: str) -> str:
    if not isinstance(el.tag, str):
        return ""
    if el.tag == "lb":
        return "<br>"
    if el.tag in ("graphic", "list", "table"):
        return ""

    content = _inline(el, base_url)
    if el.tag == "hi":
        tag = INLINE_TAGS.get(el.get("rend", ""))
        return f"<{tag}>{content}</{tag}>" if tag else content
    if el.tag == "ref":
        href = urljoin(base_url, el.get("target", ""))
        if urlparse(href).scheme in ("http", "https"):
            return f'<a href="{escape(href)}">{content}</a>'
        return content
    if el.tag == "code":
        return f"<code>{content}</code>"
    return content


def _list_items(list_el, base_url: str) -> list:
    items = []
    for item in list_el.findall("item"):
        text = escape(item.text or "")
        sub_items = []
        for child in item:
            if child.tag == "list":
                sub_items.extend(_list_items(child, base_url))
            else:
                text += _inline_element(child, base_url)
            text += escape(child.tail or "")
        items.append({"content": text.strip(), "items": sub_items})
    return items


def _table_block(table_el, base_url: str) -> Optional[dict]:
    rows = []
    with_headings = False
    for index, row in enumerate(table_el.findall("row")):
        cells = row.findall("cell")
        if index == 0 and cells and all(c.get("role") == "head" for c in cells):
            with_headings = True
        rows.append([_inline(c, base_url).strip() for c in cells])

    rows = [r for r in rows if r]
    if not rows:
        return None
    width = max(len(r) for r in rows)
    content = [r + [""] * (width - len(r)) for r in rows]
    return {"type": "table", "data": {"withHeadings": with_headings, "content": content}}


def _image_block(graphic, base_url: str) -> Optional[dict]:
    src = graphic.get("src")
    if not src:
        return None
    return {
        "type": "image",
        "data": {"url": urljoin(base_url, src), "width": 100},
        "alt": graphic.get("alt") or "Image",
    }


def _code_text(el) -> str:
    return "".join(el.itertext()).strip("\n")


def _is_code_paragraph(el) -> bool:
    return (
        len(el) == 1
        and el[0].tag == "code"
        and not (el.text or "").strip()
        and not (el[0].tail or "").strip()
        and "\n" in _code_text(el[0])
    )


def to_blocks(main, base_url: str) -> list:
    blocks = []
    for el in main:
        if not isinstance(el.tag, str):
            continue

        if el.tag == "head":
            text = _inline(el, base_url).strip()
            if text:
                level = 2 if el.get("rend") in ("h1", "h2") else 3
                blocks.append({"type": "header", "data": {"text": text, "level": level}})

        elif el.tag == "code" or (el.tag == "p" and _is_code_paragraph(el)):
            code = _code_text(el)
            if code.strip():
                blocks.append({"type": "code", "data": {"code": code}})

        elif el.tag == "list":
            items = _list_items(el, base_url)
            if items:
                style = "ordered" if el.get("rend") == "ol" else "unordered"
                blocks.append({"type": "list", "data": {"style": style, "items": items}})

        elif el.tag == "table":
            table = _table_block(el, base_url)
            if table:
                blocks.append(table)

        elif el.tag == "graphic":
            image = _image_block(el, base_url)
            if image:
                blocks.append(image)

        else:
            text = _inline(el, base_url).strip()
            if text:
                if el.tag == "quote":
                    text = f"<i>{text}</i>"
                blocks.append({"type": "paragraph", "data": {"text": text}})
            for graphic in el.iter("graphic"):
                image = _image_block(graphic, base_url)
                if image:
                    blocks.append(image)

    return blocks


def _download_image(url: str, user_id: str, upload_type: str) -> Optional[str]:
    try:
        body, _, _ = fetch(url, MAX_IMAGE_SIZE, IMAGE_TIMEOUT)
        filename = urlparse(url).path.rsplit("/", 1)[-1] or "image"
        return save_upload(user_id, body, filename, upload_type)
    except (ClipError, UploadError):
        return None


def _save_images(blocks: list, user_id: str, deadline: float) -> list:
    result = []
    downloaded = 0
    for block in blocks:
        if block["type"] != "image":
            result.append(block)
            continue

        source = block["data"]["url"]
        alt = block.pop("alt")
        path = None
        if downloaded < MAX_IMAGES and time.monotonic() < deadline:
            path = _download_image(source, user_id, "auto")
            downloaded += 1

        if path:
            block["data"]["url"] = path
            result.append(block)
        elif urlparse(source).scheme in ("http", "https"):
            link = f'<a href="{escape(source)}">{escape(alt)}</a>'
            result.append({"type": "paragraph", "data": {"text": link}})
    return result


def _source_block(url: str, hostname: str, author: Optional[str]) -> dict:
    parts = [f'Source: <a href="{escape(url)}">{escape(hostname)}</a>']
    if author:
        parts.append(escape(author))
    parts.append(f"clipped {date.today().strftime('%b %d, %Y')}")
    return {"type": "paragraph", "data": {"text": f"<i>{' · '.join(parts)}</i>"}}


def clip_url(url: str, user_id: str) -> Article:
    url = url.strip()
    body, final_url, content_type = fetch(url, MAX_HTML_SIZE, PAGE_TIMEOUT)
    if "html" not in content_type.lower():
        raise ClipError(422, "This link is not a web page.")

    xml = trafilatura.extract(
        body,
        url=final_url,
        output_format="xml",
        include_images=True,
        include_links=True,
        include_formatting=True,
        include_tables=True,
        include_comments=False,
        with_metadata=True,
    )
    if not xml:
        raise ClipError(422, "No readable article found on this page.")

    doc = etree.fromstring(xml.encode("utf-8"))
    main = doc.find("main")
    blocks = to_blocks(main, final_url) if main is not None else []
    if not blocks:
        raise ClipError(422, "No readable article found on this page.")

    hostname = doc.get("hostname") or urlparse(final_url).hostname or final_url
    title = (doc.get("title") or hostname).strip()[:500]

    first = blocks[0]
    if first["type"] == "header" and re.sub(r"<[^>]+>", "", first["data"]["text"]).strip() == title:
        blocks.pop(0)

    deadline = time.monotonic() + IMAGE_BUDGET_SECONDS
    header = None
    if doc.get("image"):
        header = _download_image(urljoin(final_url, doc.get("image")), user_id, "header")

    blocks = _save_images(blocks, user_id, deadline)
    blocks.insert(0, _source_block(final_url, hostname, doc.get("author")))
    return Article(title=title, blocks=blocks, header=header)
