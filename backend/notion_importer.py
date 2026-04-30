#!/usr/bin/env python3
"""
Notion -> Molecore Import Script

Converts a Notion Markdown export (zip or directory) to Molecore pages via API.

Usage:
  python notion_importer.py export.zip --user YOUR_USER --password YOUR_PASSWORD --keycloak-url https://your-keycloak-server.com/realms/YOUR_REALM
  python notion_importer.py export.zip --user YOUR_USER --password YOUR_PASSWORD --keycloak-url https://your-keycloak-server.com/realms/YOUR_REALM --parent-id 5
  python notion_importer.py export.zip --user YOUR_USER --password YOUR_PASSWORD --keycloak-url https://your-keycloak-server.com/realms/YOUR_REALM --api http://localhost:8000
"""

import os
import re
import sys
import json
import time
import uuid
import zipfile
import tempfile
import argparse
import requests
from pathlib import Path
from typing import Optional

# --- Keycloak Auth ---

class TokenManager:
    """Handles Keycloak login and automatic token refresh."""

    def __init__(self, username: str, password: str, keycloak_url: str, client_id: str):
        self.username = username
        self.password = password
        self.token_url = f"{keycloak_url.rstrip('/')}/protocol/openid-connect/token"
        self.client_id = client_id
        self.access_token = None
        self.refresh_token = None
        self.expires_at = 0
        self._login()

    def _login(self):
        resp = requests.post(self.token_url, data={
            "grant_type": "password",
            "client_id": self.client_id,
            "username": self.username,
            "password": self.password,
        }, timeout=10)
        if resp.status_code != 200:
            print(f"Login failed ({resp.status_code}): {resp.text}")
            sys.exit(1)
        self._store(resp.json())
        print(f"Logged in as: {self.username}")

    def _refresh(self):
        resp = requests.post(self.token_url, data={
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "refresh_token": self.refresh_token,
        }, timeout=10)
        if resp.status_code == 200:
            self._store(resp.json())
        else:
            # Refresh failed, re-login
            self._login()

    def _store(self, data: dict):
        self.access_token = data["access_token"]
        self.refresh_token = data.get("refresh_token")
        self.expires_at = time.time() + data.get("expires_in", 300) - 30  # 30s buffer

    @property
    def token(self) -> str:
        if time.time() >= self.expires_at:
            self._refresh()
        return self.access_token

# ─── Inline Markdown → HTML ───────────────────────────────────────────────────

def format_inline(text: str) -> str:
    """Convert Markdown inline formatting to EditorJS-compatible HTML."""
    # Bold + Italic
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<b><i>\1</i></b>', text)
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'__(.+?)__', r'<b>\1</b>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    # Strikethrough
    text = re.sub(r'~~(.+?)~~', r'<s>\1</s>', text)
    # Inline code
    text = re.sub(r'`([^`]+)`', r'<code class="inline-code">\1</code>', text)
    # External links (http/https) → keep as links
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', text)
    # mailto links → just the email address
    text = re.sub(r'\[([^\]]+)\]\(mailto:[^)]+\)', r'\1', text)
    # All remaining local links (internal .md, PDFs, etc.) → just the link text
    # Pattern handles one level of nested parentheses (e.g. filenames like "Title (subtitle).md")
    text = re.sub(r'\[([^\]]+)\]\((?:[^()]+|\([^()]*\))+\)', r'\1', text)
    return text


# ─── Image Upload ─────────────────────────────────────────────────────────────

def upload_image(file_path: str, api_base: str, tm: TokenManager) -> Optional[str]:
    """Upload an image to Molecore and return its URL."""
    ext = Path(file_path).suffix.lower()
    content_type_map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    }
    ct = content_type_map.get(ext, 'image/png')
    try:
        with open(file_path, 'rb') as f:
            resp = requests.post(
                f"{api_base}/api/upload",
                headers={"Authorization": f"Bearer {tm.token}"},
                files={"image": (Path(file_path).name, f, ct)},
                data={"upload_type": "auto"},
                timeout=30,
            )
        if resp.status_code == 200:
            return resp.json().get("url")
        print(f"  ⚠ Upload failed ({resp.status_code}): {resp.text[:100]}")
    except Exception as e:
        print(f"  ⚠ Upload error: {e}")
    return None


# ─── Markdown Parser ──────────────────────────────────────────────────────────

def _collect_aside(lines: list, start: int):
    """
    Collect lines inside a (possibly nested) <aside>...</aside> block.
    Returns (aside_lines, next_i). Handles nested <aside> correctly.
    """
    aside_lines = []
    i = start
    depth = 1
    while i < len(lines) and depth > 0:
        stripped = lines[i].strip()
        if stripped == '<aside>':
            depth += 1
            aside_lines.append(lines[i])
        elif stripped == '</aside>':
            depth -= 1
            if depth > 0:
                aside_lines.append(lines[i])
        else:
            aside_lines.append(lines[i])
        i += 1
    return aside_lines, i


def _clean_title(text: str) -> str:
    """Strip HTML tags and Markdown formatting for robust title comparison."""
    text = re.sub(r'<[^>]+>', '', text)       # HTML tags
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', text)  # Bold+Italic
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)      # Bold
    text = re.sub(r'__(.+?)__', r'\1', text)           # Bold alt
    text = re.sub(r'\*(.+?)\*', r'\1', text)           # Italic
    text = re.sub(r'~~(.+?)~~', r'\1', text)           # Strikethrough
    text = re.sub(r'`([^`]+)`', r'\1', text)           # Inline code
    return text.strip()


def _apply_bg(block: dict, color: str) -> dict:
    """Apply a backgroundColor tune to an EditorJS block."""
    if color:
        block.setdefault("tunes", {})["backgroundColor"] = {"backgroundColor": color}
    return block


def _parse_lines(lines: list, start: int, page_dir: str, api_base: str, tm: TokenManager, bg_color: str = "", inside_callout: bool = False) -> list:
    """Core line-by-line parser. Called recursively for <aside> content."""
    blocks = []
    i = start

    def is_block_start(l: str) -> bool:
        s = l.strip()
        return (
            not s
            or re.match(r'^#{1,6}\s', l)
            or l.startswith('```')
            or l.startswith('> ')
            or re.match(r'^\s*[-*+]\s+', l)
            or re.match(r'^\s*\d+[.)]\s+', l)
            or s == '<aside>'
            or re.match(r'^!\[', s)
            or re.match(r'^(-{3,}|\*{3,}|_{3,})\s*$', s)
            or re.match(r'^\|', s)
        )

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # ── Empty line ──
        if not stripped:
            i += 1
            continue

        # ── Fenced code block ──
        if line.startswith('```'):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code_lines.append(lines[i])
                i += 1
            i += 1
            code = '\n'.join(code_lines)
            if code.strip():
                blocks.append({"type": "code", "data": {"code": code}})
            continue

        # ── Horizontal rule → skip (no delimiter in Molecore) ──
        if re.match(r'^(-{3,}|\*{3,}|_{3,})\s*$', stripped):
            i += 1
            continue

        # ── Notion <aside> → Callout block + real child blocks (foreignKey) ──
        if stripped == '<aside>':
            aside_lines, i = _collect_aside(lines, i + 1)
            # Parse aside content as real blocks (recursive call)
            child_blocks = _parse_lines(aside_lines, 0, page_dir, api_base, tm, inside_callout=True)
            if child_blocks:
                callout_fk = str(uuid.uuid4())
                blocks.append({
                    "type": "callout",
                    "data": {"fk": callout_fk, "items": len(child_blocks), "color": "black"}
                })
                blocks.extend(child_blocks)
            continue

        # ── Blockquote ──
        if line.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].startswith('> '):
                quote_lines.append(lines[i][2:])
                i += 1
            text = format_inline(' '.join(quote_lines).strip())
            if text:
                blocks.append({"type": "paragraph", "data": {"text": f"<i>❝ {text}</i>"}})
            continue

        # ── Heading ──
        hm = re.match(r'^(#{1,6})\s+(.+)$', line)
        if hm:
            level = len(hm.group(1))
            text = format_inline(hm.group(2))
            blocks.append({"type": "header", "data": {"text": text, "level": level}})
            i += 1
            continue

        # ── Standalone Notion page link ──
        # Use greedy .+ so filenames containing ")" (e.g. "Title (subtitle).md") are captured correctly
        link_m = re.match(r'^\[([^\]]+)\]\((.+)\)\s*$', stripped)
        if link_m and re.search(r'\.(md|pdf|PDF)$', link_m.group(2)):
            if inside_callout:
                # Inside callout: render as visible paragraph with icon
                title = link_m.group(1)
                ext = link_m.group(2).rsplit('.', 1)[-1].lower()
                icon = '📎' if ext == 'pdf' else '📄'
                blocks.append({"type": "paragraph", "data": {"text": f"{icon} {format_inline(title)}"}})
            # Outside callout: skip (page blocks are added later by append_page_blocks)
            i += 1
            continue

        # ── Standalone image ──
        img_m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', stripped)
        if img_m:
            alt = img_m.group(1)
            img_rel = requests.utils.unquote(img_m.group(2))
            img_full = (Path(page_dir) / img_rel).resolve()
            try:
                img_full.relative_to(Path(page_dir).resolve())
            except ValueError:
                print(f"  ⚠ Skipping image outside export directory: {img_rel}")
                i += 1
                continue
            if img_full.exists():
                print(f"    ↑ Uploading {img_full.name}")
                url = upload_image(str(img_full), api_base, tm)
                if url:
                    blocks.append({"type": "image", "data": {"url": url, "width": 100}})
            else:
                print(f"  ⚠ Image not found: {img_full}")
            i += 1
            continue

        # ── GFM Table ──
        if re.match(r'^\|', stripped):
            table_lines = []
            while i < len(lines) and re.match(r'^\|', lines[i].strip()):
                table_lines.append(lines[i].strip())
                i += 1
            # Parse: first row = header, second row = separator (skip), rest = body
            rows = [
                [cell.strip() for cell in re.split(r'(?<!\\)\|', row.strip('|'))]
                for row in table_lines
                if not re.match(r'^\|?[\s\-:]+\|', row)  # skip separator row
            ]
            if rows:
                content = [[format_inline(cell) for cell in row] for row in rows]
                blocks.append({
                    "type": "table",
                    "data": {"withHeadings": True, "content": content}
                })
            continue

        # ── Checklist ──
        if re.match(r'^\s*[-*+]\s+\[[ xX]\]', line):
            items = []
            while i < len(lines) and re.match(r'^\s*[-*+]\s+\[[ xX]\]', lines[i]):
                checked = bool(re.match(r'^\s*[-*+]\s+\[[xX]\]', lines[i]))
                text = re.sub(r'^\s*[-*+]\s+\[[ xX]\]\s*', '', lines[i])
                items.append({"content": format_inline(text), "checked": checked})
                i += 1
            blocks.append({"type": "list", "data": {"style": "checklist", "items": items}})
            continue

        # ── Unordered list (with optional nesting) ──
        if re.match(r'^\s*[-*+]\s+', line):
            def _collect_list_items(lines, i, base_indent):
                """Collect list items, handling one level of indented sub-items."""
                items = []
                while i < len(lines):
                    m = re.match(r'^(\s*)[-*+]\s+(.*)', lines[i])
                    if not m:
                        break
                    indent = len(m.group(1))
                    if indent < base_indent:
                        break
                    text = format_inline(m.group(2))
                    i += 1
                    # Collect indented children
                    sub_items = []
                    while i < len(lines):
                        sm = re.match(r'^(\s*)[-*+]\s+(.*)', lines[i])
                        if not sm:
                            break
                        sub_indent = len(sm.group(1))
                        if sub_indent <= indent:
                            break
                        sub_items.append({"content": format_inline(sm.group(2)), "items": []})
                        i += 1
                    item = {"content": text, "items": sub_items}
                    items.append(item)
                return items, i

            base_m = re.match(r'^(\s*)', line)
            base_indent = len(base_m.group(1)) if base_m else 0
            items, i = _collect_list_items(lines, i, base_indent)
            blocks.append({"type": "list", "data": {"style": "unordered", "items": items}})
            continue

        # ── Ordered list ──
        if re.match(r'^\s*\d+[.)]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\s*\d+[.)]\s+', lines[i]):
                text = re.sub(r'^\s*\d+[.)]\s+', '', lines[i])
                items.append({"content": format_inline(text), "items": []})
                i += 1
            blocks.append({"type": "list", "data": {"style": "ordered", "items": items}})
            continue

        # ── Paragraph (multi-line) ──
        para_lines = [line]
        i += 1
        while i < len(lines) and not is_block_start(lines[i]):
            para_lines.append(lines[i])
            i += 1

        text = format_inline('<br>'.join(p.strip() for p in para_lines if p.strip()))
        if text:
            blocks.append({"type": "paragraph", "data": {"text": text}})

    return blocks


def parse_markdown(md_content: str, page_dir: str, api_base: str, tm: TokenManager) -> tuple:
    """Parse Notion-flavored Markdown and return (blocks, callout_titles).
    callout_titles is a set of page titles referenced inside callouts."""
    lines = md_content.split('\n')
    # Skip the H1 title — it becomes the page title, not a block
    start = 1 if (lines and re.match(r'^# ', lines[0])) else 0
    blocks = _parse_lines(lines, start, page_dir, api_base, tm)

    # Collect page titles that are inside callouts (have emoji prefix)
    # Use _clean_title to strip HTML/markdown for robust matching
    callout_titles = set()
    for b in blocks:
        if b.get("type") == "paragraph":
            text = b.get("data", {}).get("text", "")
            m = re.match(r'^[📄📎]\s+(.+)$', text)
            if m:
                callout_titles.add(_clean_title(m.group(1)))
    return blocks, callout_titles


# ─── Page Title Extraction ─────────────────────────────────────────────────────

def get_page_title(md_file: Path) -> str:
    """
    Try to read the H1 title from the file first.
    Fall back to the filename (stripped of Notion UUID suffix).
    """
    try:
        first_line = md_file.read_text(encoding='utf-8').split('\n')[0]
        m = re.match(r'^#\s+(.+)$', first_line)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    # Fallback: strip UUID from filename
    name = md_file.stem
    name = re.sub(r'\s+[0-9a-f]{32}$', '', name)
    return name


def find_subdir_for_md(md_file: Path) -> Optional[Path]:
    """Find the subdirectory in the same folder that corresponds to this .md file."""
    stem = md_file.stem
    base = re.sub(r'\s+[0-9a-f]{32}$', '', stem)
    sub = md_file.parent / base
    return sub if sub.is_dir() else None


# ─── API ──────────────────────────────────────────────────────────────────────

def create_page(
    title: str,
    blocks: list,
    parent_id: Optional[int],
    api_base: str,
    tm: TokenManager,
    order: int = 0,
) -> Optional[int]:
    """POST /api/pages and return the new page id."""
    payload = {
        "title": title,
        "content": {
            "time": int(time.time() * 1000),
            "blocks": blocks,
            "version": "2.28.2",
        },
        "parent_id": parent_id,
        "page_type": "normal",
        "order": order,
    }
    try:
        resp = requests.post(
            f"{api_base}/api/pages",
            headers={"Authorization": f"Bearer {tm.token}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        if resp.status_code == 200:
            page_id = resp.json()["id"]
            return page_id
        print(f"  ✗ Failed to create '{title}' ({resp.status_code}): {resp.text[:200]}")
    except Exception as e:
        print(f"  ✗ Error creating '{title}': {e}")
    return None


def replace_callout_page_refs(page_id: int, children: list, api_base: str, tm: TokenManager):
    """Replace emoji paragraph placeholders inside callouts with real PageBlocks.

    After child pages are created, we know their IDs and can swap
    '📄 Title' paragraphs with proper {"type": "page"} blocks.
    """
    try:
        resp = requests.get(
            f"{api_base}/api/pages/{page_id}",
            headers={"Authorization": f"Bearer {tm.token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return
        page_data = resp.json()
        content = page_data.get("content", {})
        if isinstance(content, str):
            content = json.loads(content)

        blocks = content.get("blocks", [])

        # Build clean_title → (child_id, child_title) map
        child_map = {}
        for child_id, child_title in children:
            clean = _clean_title(child_title)
            child_map[clean] = (child_id, child_title)

        # Replace emoji paragraphs with PageBlocks
        changed = False
        new_blocks = []
        for b in blocks:
            if b.get("type") == "paragraph":
                text = b.get("data", {}).get("text", "")
                m = re.match(r'^[📄📎]\s+(.+)$', text)
                if m:
                    ref_title = _clean_title(m.group(1))
                    match = child_map.get(ref_title)
                    if match:
                        child_id, child_title = match
                        new_blocks.append({
                            "type": "page",
                            "data": {"pageId": child_id, "pageTitle": child_title}
                        })
                        changed = True
                        continue
            new_blocks.append(b)

        if changed:
            content["blocks"] = new_blocks
            content["time"] = int(time.time() * 1000)
            requests.put(
                f"{api_base}/api/pages/{page_id}",
                headers={"Authorization": f"Bearer {tm.token}", "Content-Type": "application/json"},
                json={"content": content},
                timeout=10,
            )
    except Exception as e:
        print(f"  ⚠ Could not replace callout page refs: {e}")


def append_page_blocks(page_id: int, child_pages: list, api_base: str, tm: TokenManager):
    """Add page blocks for each child to the parent page's content."""
    # Fetch current content
    try:
        resp = requests.get(
            f"{api_base}/api/pages/{page_id}",
            headers={"Authorization": f"Bearer {tm.token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return
        current = resp.json()
        content = current.get("content", {})
        if isinstance(content, str):
            content = json.loads(content)

        blocks = content.get("blocks", [])

        # Add a page block for each child
        for child_id, child_title in child_pages:
            blocks.append({
                "type": "page",
                "data": {"pageId": child_id, "pageTitle": child_title}
            })

        content["blocks"] = blocks
        content["time"] = int(time.time() * 1000)

        requests.put(
            f"{api_base}/api/pages/{page_id}",
            headers={"Authorization": f"Bearer {tm.token}", "Content-Type": "application/json"},
            json={"content": content},
            timeout=10,
        )
    except Exception as e:
        print(f"  ⚠ Could not append page blocks: {e}")


def delete_pages(page_ids: list, api_base: str, tm: TokenManager):
    """Delete a list of pages by ID."""
    for pid in page_ids:
        try:
            resp = requests.delete(
                f"{api_base}/api/pages/{pid}",
                headers={"Authorization": f"Bearer {tm.token}"},
                timeout=10,
            )
            if resp.status_code == 200:
                print(f"  ✓ Deleted page {pid}")
            else:
                print(f"  ⚠ Could not delete {pid}: {resp.text[:80]}")
        except Exception as e:
            print(f"  ⚠ Error deleting {pid}: {e}")


# ─── Directory Walker ──────────────────────────────────────────────────────────

def process_directory(
    dir_path: Path,
    parent_id: Optional[int],
    api_base: str,
    tm: TokenManager,
    depth: int = 0,
) -> list:
    """
    Recursively walk a Notion export directory.
    Each .md file becomes a page; its matching subdirectory holds child pages.
    Returns list of (id, title) for pages created at this level.
    """
    indent = "  " * depth
    created = []

    # Collect .md files, skip macOS artifacts
    md_files = sorted([
        f for f in dir_path.iterdir()
        if f.is_file() and f.suffix == '.md' and not f.name.startswith('.')
    ])

    # Track which subdirectories are matched to a .md file
    matched_subdirs: set = set()

    for order, md_file in enumerate(md_files):
        title = get_page_title(md_file)
        print(f"\n{indent}📄 {title}")

        try:
            content_text = md_file.read_text(encoding='utf-8')
        except Exception as e:
            print(f"{indent}  ⚠ Could not read file: {e}")
            continue

        blocks, callout_titles = parse_markdown(content_text, str(md_file.parent), api_base, tm)
        page_id = create_page(title, blocks, parent_id, api_base, tm, order)

        if page_id:
            print(f"{indent}  ✓ id={page_id}, blocks={len(blocks)}")
            created.append((page_id, title))

            # Recurse into matching subdirectory if it exists
            sub_dir = find_subdir_for_md(md_file)
            if sub_dir is not None:
                matched_subdirs.add(sub_dir)
                children = process_directory(sub_dir, page_id, api_base, tm, depth + 1)
                if children:
                    # Replace emoji placeholders in callouts with real PageBlocks
                    callout_children = [(cid, ctitle) for cid, ctitle in children
                                        if _clean_title(ctitle) in callout_titles]
                    if callout_children:
                        replace_callout_page_refs(page_id, callout_children, api_base, tm)
                        print(f"{indent}  ↳ Replaced {len(callout_children)} callout page ref(s) with PageBlocks")

                    # Append page blocks for children NOT in callouts
                    filtered = [(cid, ctitle) for cid, ctitle in children
                                if _clean_title(ctitle) not in callout_titles]
                    if filtered:
                        append_page_blocks(page_id, filtered, api_base, tm)
                        print(f"{indent}  ↳ Added {len(filtered)} subpage link(s)")

    # Handle orphan directories — Notion databases that have no matching .md stub
    # (exported only as .csv + a folder of entries)
    orphan_dirs = sorted([
        d for d in dir_path.iterdir()
        if d.is_dir()
        and not d.name.startswith('.')
        and not d.name.startswith('_')
        and d not in matched_subdirs
    ])

    for order, sub_dir in enumerate(orphan_dirs, start=len(created)):
        # Strip UUID suffix from directory name to get the page title
        title = re.sub(r'\s+[0-9a-f]{32}$', '', sub_dir.name).strip()
        if not title:
            continue
        print(f"\n{indent}📁 {title}")
        page_id = create_page(title, [], parent_id, api_base, tm, order)
        if page_id:
            print(f"{indent}  ✓ id={page_id} (database stub)")
            created.append((page_id, title))
            children = process_directory(sub_dir, page_id, api_base, tm, depth + 1)
            if children:
                append_page_blocks(page_id, children, api_base, tm)
                print(f"{indent}  ↳ Added {len(children)} subpage link(s)")

    return created


# ─── Entry Point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Import a Notion Markdown export into Molecore.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('source', nargs='?', help='Notion export .zip file or extracted directory')
    parser.add_argument('--user', required=True, help='Molecore username')
    parser.add_argument('--password', required=True, help='Molecore password')
    parser.add_argument('--keycloak-url', required=True,
                        help='Keycloak realm URL (e.g. https://your-keycloak-server.com/realms/your-realm)')
    parser.add_argument('--keycloak-client', default='molecore',
                        help='Keycloak client ID (default: molecore)')
    parser.add_argument('--api', default='http://localhost:8000',
                        help='Molecore API base URL (default: http://localhost:8000)')
    parser.add_argument('--parent-id', type=int, default=None,
                        help='Import as children of this Molecore page ID (optional)')
    parser.add_argument('--delete', nargs='+', type=int, metavar='ID',
                        help='Delete pages by ID before importing (e.g. --delete 14 15 16)')
    parser.add_argument('--delete-range', nargs=2, type=int, metavar=('FROM', 'TO'),
                        help='Delete pages in ID range (e.g. --delete-range 14 36)')
    args = parser.parse_args()

    tm = TokenManager(args.user, args.password, args.keycloak_url, args.keycloak_client)

    # Handle cleanup
    if args.delete_range:
        ids = list(range(args.delete_range[0], args.delete_range[1] + 1))
        print(f"Deleting pages {args.delete_range[0]}–{args.delete_range[1]}…")
        delete_pages(ids, args.api, tm)
        if not args.source:
            print("Done.")
            return

    if args.delete:
        print(f"Deleting {len(args.delete)} page(s)…")
        delete_pages(args.delete, args.api, tm)
        if not args.source:
            print("Done.")
            return

    if not args.source:
        parser.error("source is required unless using --delete / --delete-range only")

    source = Path(args.source)
    if not source.exists():
        print(f"Error: {source} not found")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmpdir:
        if source.suffix == '.zip':
            print(f"Extracting {source.name}…")
            with zipfile.ZipFile(source, 'r') as zf:
                zf.extractall(tmpdir)
            # Find content root (skip __MACOSX)
            candidates = [d for d in Path(tmpdir).iterdir()
                          if d.is_dir() and not d.name.startswith('_') and not d.name.startswith('.')]
            if not candidates:
                print("Error: zip appears to be empty")
                sys.exit(1)
            root_dir = candidates[0]
        else:
            root_dir = source

        print(f"Import root: {root_dir.name}")
        if args.parent_id:
            print(f"Parent page ID: {args.parent_id}")
        print()

        process_directory(root_dir, args.parent_id, args.api, tm)

    print("\n✓ Import complete!")


if __name__ == '__main__':
    main()
