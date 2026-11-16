import html
import json
import posixpath
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import quote

from models import Page
from uploads import UPLOAD_DIR

FILES_DIR = "files"

_UNSAFE_NAME_RE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_LINK_RE = re.compile(r'<a\s[^>]*href="([^"]*)"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")

_INLINE_TAGS = [
    (re.compile(r"</?(b|strong)>", re.IGNORECASE), "**"),
    (re.compile(r"</?(i|em)>", re.IGNORECASE), "*"),
    (re.compile(r"</?(s|strike|del)>", re.IGNORECASE), "~~"),
    (re.compile(r"</?code[^>]*>", re.IGNORECASE), "`"),
]


def safe_name(title: str) -> str:
    name = _UNSAFE_NAME_RE.sub("-", title or "").strip().strip(".")
    return name[:100] or "Untitled"


class MarkdownExporter:
    def __init__(self, user_id: str, pages: List[Page]):
        self.user_id = user_id
        self.pages = pages
        self.user_dir = UPLOAD_DIR / user_id
        self.page_paths: Dict[int, str] = {}
        self._build_paths()

    def _build_paths(self) -> None:
        ids = {p.id for p in self.pages}
        children: Dict[Optional[int], List[Page]] = {}
        for page in self.pages:
            parent = page.parent_id if page.parent_id in ids else None
            children.setdefault(parent, []).append(page)

        def walk(parent_id: Optional[int], folder: str) -> None:
            used = set()
            for page in children.get(parent_id, []):
                if page.id in self.page_paths:
                    continue
                name = safe_name(page.title)
                candidate, n = name, 2
                while candidate.lower() in used:
                    candidate = f"{name} ({n})"
                    n += 1
                used.add(candidate.lower())
                self.page_paths[page.id] = posixpath.join(folder, candidate + ".md")
                walk(page.id, posixpath.join(folder, candidate))

        walk(None, "")

    def write_zip(self, target: Path) -> None:
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
            for page in self.pages:
                path = self.page_paths.get(page.id)
                if path:
                    zf.writestr(path, self.page_to_markdown(page, path))
            if self.user_dir.exists():
                for file in sorted(self.user_dir.iterdir()):
                    if file.is_file():
                        zf.write(file, posixpath.join(FILES_DIR, file.name))

    def page_to_markdown(self, page: Page, path: str) -> str:
        title = page.title or "Untitled"
        if page.icon and "/" not in page.icon:
            title = f"{page.icon} {title}"
        parts = [f"# {title}"]

        if page.header:
            parts.append(f"![]({self.link_target(page.header, path)})")

        try:
            content = json.loads(page.content or "{}")
        except (json.JSONDecodeError, TypeError):
            content = {}
        blocks = content.get("blocks", []) if isinstance(content, dict) else []

        body = self.render_blocks(blocks, path).strip()
        if body:
            parts.append(body)
        return "\n\n".join(parts) + "\n"

    def render_blocks(self, blocks: list, path: str) -> str:
        parts = []
        i = 0
        while i < len(blocks):
            text, i = self.render_unit(blocks, i, path)
            if text:
                parts.append(text)
        return "\n\n".join(parts)

    def render_unit(self, blocks: list, i: int, path: str):
        block = blocks[i] if isinstance(blocks[i], dict) else {}
        block_type = block.get("type")
        data = block.get("data") if isinstance(block.get("data"), dict) else {}
        count = data.get("items") if isinstance(data.get("items"), int) else 0

        if block_type == "callout":
            members = blocks[i + 1:i + 1 + count]
            inner = self.render_blocks(members, path)
            quoted = "\n".join(("> " + line).rstrip() for line in inner.split("\n"))
            return quoted, i + 1 + len(members)

        if block_type == "toggle":
            parts = []
            j = i + 1
            for _ in range(count):
                if j >= len(blocks):
                    break
                text, j = self.render_unit(blocks, j, path)
                if text:
                    parts.append(text)
            summary = self.inline(data.get("text", ""), path)
            body = "\n\n".join(parts)
            return f"<details>\n<summary>{summary}</summary>\n\n{body}\n\n</details>", j

        return self.render_block(block_type, data, path), i + 1

    def render_block(self, block_type: Optional[str], data: dict, path: str) -> str:
        if block_type == "paragraph":
            return self.inline(data.get("text", ""), path)

        if block_type == "header":
            level = data.get("level") if data.get("level") in (1, 2, 3, 4, 5, 6) else 2
            return "#" * level + " " + self.inline(data.get("text", ""), path)

        if block_type == "list":
            return self.render_list(data.get("items") or [], data.get("style"), path, 0)

        if block_type == "checklist":
            return "\n".join(
                f"- [{'x' if item.get('checked') else ' '}] {self.inline(item.get('text', ''), path)}"
                for item in data.get("items") or []
                if isinstance(item, dict)
            )

        if block_type == "code":
            return f"```\n{data.get('code', '')}\n```"

        if block_type == "table":
            return self.render_table(data.get("content") or [], path)

        if block_type == "image":
            url = data.get("url") or (data.get("file") or {}).get("url", "")
            return f"![]({self.link_target(url, path)})" if url else ""

        if block_type in ("audio", "file"):
            url = data.get("url", "")
            if not url:
                return ""
            label = data.get("fileName") or url.split("/")[-1]
            return f"[{label}]({self.link_target(url, path)})"

        if block_type == "embed":
            url = data.get("url", "")
            return f"[{url}]({url})" if url else ""

        if block_type == "page":
            title = data.get("pageTitle") or "Untitled"
            target = self.page_paths.get(data.get("pageId"))
            if not target:
                return title
            link = posixpath.relpath(target, posixpath.dirname(path) or ".")
            return f"[{title}]({quote(link)})"

        if block_type == "reveal":
            text = self.inline(data.get("text", ""), path)
            return f"<details>\n<summary>Reveal</summary>\n\n{text}\n\n</details>"

        return ""

    def render_list(self, items: list, style: Optional[str], path: str, depth: int) -> str:
        lines = []
        indent = "    " * depth
        for n, item in enumerate(items, start=1):
            if isinstance(item, str):
                item = {"content": item}
            if not isinstance(item, dict):
                continue
            text = self.inline(item.get("content") or item.get("text") or "", path)
            if style == "checklist":
                meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
                checked = meta.get("checked", item.get("checked", False))
                marker = f"- [{'x' if checked else ' '}]"
            elif style == "ordered":
                marker = f"{n}."
            else:
                marker = "-"
            lines.append(f"{indent}{marker} {text}")
            if item.get("items"):
                lines.append(self.render_list(item["items"], style, path, depth + 1))
        return "\n".join(lines)

    def render_table(self, rows: list, path: str) -> str:
        rows = [row for row in rows if isinstance(row, list)]
        if not rows:
            return ""
        width = max(len(row) for row in rows)

        def cells(row: list) -> str:
            texts = [self.inline(str(cell), path).replace("|", "\\|").replace("\n", " ") for cell in row]
            texts += [""] * (width - len(texts))
            return "| " + " | ".join(texts) + " |"

        lines = [cells(rows[0]), "| " + " | ".join(["---"] * width) + " |"]
        lines += [cells(row) for row in rows[1:]]
        return "\n".join(lines)

    def inline(self, text: str, path: str) -> str:
        text = text or ""
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = _LINK_RE.sub(lambda m: f"[{m.group(2)}]({self.link_target(html.unescape(m.group(1)), path)})", text)
        for pattern, mark in _INLINE_TAGS:
            text = pattern.sub(mark, text)
        text = _TAG_RE.sub("", text)
        return html.unescape(text).strip()

    def link_target(self, url: str, path: str) -> str:
        filename = self.upload_filename(url)
        if not filename:
            return url
        link = posixpath.relpath(posixpath.join(FILES_DIR, filename), posixpath.dirname(path) or ".")
        return quote(link)

    def upload_filename(self, url: str) -> Optional[str]:
        marker = f"/uploads/{self.user_id}/"
        if not url or marker not in url:
            return None
        filename = url.split(marker, 1)[1]
        if "/" in filename or not (self.user_dir / filename).is_file():
            return None
        return filename
