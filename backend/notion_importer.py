import csv
import html
import json
import mimetypes
import re
import time
import uuid
from pathlib import Path
from typing import List, Optional
from urllib.parse import unquote

from sqlalchemy.orm import Session

from models import Page
from uploads import UploadError, save_upload


class ImportContext:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        self.pages_created = 0
        self.log_lines: List[str] = []

    def log(self, msg: str = "") -> None:
        self.log_lines.append(msg)

    def create_page(self, title: str, blocks: list, parent_id: Optional[int], order: int = 0) -> int:
        page = Page(
            title=title[:500],
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": blocks,
                "version": "2.28.2",
            }),
            parent_id=parent_id,
            page_type="normal",
            order=order,
            user_id=self.user_id,
        )
        self.db.add(page)
        self.db.flush()
        self.pages_created += 1
        return page.id

    def load_blocks(self, page_id: int) -> Optional[list]:
        page = self.db.query(Page).filter(Page.id == page_id, Page.user_id == self.user_id).first()
        if not page:
            return None
        try:
            return json.loads(page.content or "{}").get("blocks", [])
        except (json.JSONDecodeError, TypeError):
            return []

    def save_blocks(self, page_id: int, blocks: list) -> None:
        page = self.db.query(Page).filter(Page.id == page_id, Page.user_id == self.user_id).first()
        if not page:
            return
        try:
            content = json.loads(page.content or "{}")
        except (json.JSONDecodeError, TypeError):
            content = {}
        content["blocks"] = blocks
        content["time"] = int(time.time() * 1000)
        page.content = json.dumps(content)
        self.db.flush()

    def upload_file(self, file_path: Path, upload_type: str) -> Optional[str]:
        try:
            return save_upload(self.user_id, file_path.read_bytes(), file_path.name, upload_type)
        except UploadError as e:
            self.log(f"  ⚠ Upload failed: {e.detail}")
        except Exception as e:
            self.log(f"  ⚠ Upload error: {e}")
        return None


def format_inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<b><i>\1</i></b>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'__(.+?)__', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    text = re.sub(r'~~(.+?)~~', r'<s>\1</s>', text)
    text = re.sub(r'`([^`]+)`', r'<code class="inline-code">\1</code>', text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'\[([^\]]+)\]\(mailto:[^)]+\)', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\((?:[^()]+|\([^()]*\))+\)', r'\1', text)
    return text


def _collect_aside(lines: list, start: int):
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
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'~~(.+?)~~', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return html.unescape(text).strip()


def _resolve_export_file(rel_path: str, page_dir: str, ctx: "ImportContext") -> Optional[Path]:
    file_rel = unquote(rel_path)
    file_full = (Path(page_dir) / file_rel).resolve()
    try:
        file_full.relative_to(Path(page_dir).resolve())
    except ValueError:
        ctx.log(f"  ⚠ Skipping file outside export directory: {file_rel}")
        return None
    return file_full


def _attachment_block(rel_path: str, page_dir: str, ctx: "ImportContext") -> Optional[dict]:
    file_full = _resolve_export_file(rel_path, page_dir, ctx)
    if file_full is None or not file_full.is_file():
        return None
    ctx.log(f"    ↑ Uploading {file_full.name}")
    url = ctx.upload_file(file_full, "file")
    if not url:
        return None
    return {
        "type": "file",
        "data": {
            "url": url,
            "fileName": file_full.name,
            "fileSize": file_full.stat().st_size,
            "fileType": mimetypes.guess_type(file_full.name)[0] or "",
        },
    }


_BULLET_RE = re.compile(r'^(\s*)[-*+]\s+(.*)')
_NUMBER_RE = re.compile(r'^(\s*)\d+[.)]\s+(.*)')


def _parse_list(lines: list, i: int, indent: int, ordered: bool):
    item_re = _NUMBER_RE if ordered else _BULLET_RE
    items = []
    while i < len(lines):
        m = item_re.match(lines[i])
        if not m or len(m.group(1)) != indent:
            break
        item = {"content": format_inline(m.group(2)), "items": []}
        i += 1
        if i < len(lines):
            next_bullet = _BULLET_RE.match(lines[i])
            next_number = _NUMBER_RE.match(lines[i])
            sub_m = next_bullet or next_number
            if sub_m and len(sub_m.group(1)) > indent:
                item["items"], i = _parse_list(lines, i, len(sub_m.group(1)), ordered=next_bullet is None)
        items.append(item)
    return items, i


def _parse_lines(lines: list, start: int, page_dir: str, ctx: "ImportContext", inside_callout: bool = False) -> list:
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

        if not stripped:
            i += 1
            continue

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

        if re.match(r'^(-{3,}|\*{3,}|_{3,})\s*$', stripped):
            i += 1
            continue

        if stripped == '<aside>':
            aside_lines, i = _collect_aside(lines, i + 1)
            child_blocks = _parse_lines(aside_lines, 0, page_dir, ctx, inside_callout=True)
            if child_blocks:
                callout_fk = str(uuid.uuid4())
                blocks.append({
                    "type": "callout",
                    "data": {"fk": callout_fk, "items": len(child_blocks), "color": "black"}
                })
                blocks.extend(child_blocks)
            continue

        if line.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].startswith('> '):
                quote_lines.append(lines[i][2:])
                i += 1
            text = format_inline(' '.join(quote_lines).strip())
            if text:
                blocks.append({"type": "paragraph", "data": {"text": f"<i>❝ {text}</i>"}})
            continue

        hm = re.match(r'^(#{1,6})\s+(.+)$', line)
        if hm:
            # editor only knows h1-h3
            level = min(len(hm.group(1)), 3)
            text = format_inline(hm.group(2))
            blocks.append({"type": "header", "data": {"text": text, "level": level}})
            i += 1
            continue

        # greedy so filenames like "title (subtitle).md" still match
        link_m = re.match(r'^\[([^\]]+)\]\((.+)\)\s*$', stripped)
        if link_m and link_m.group(2).lower().endswith('.md'):
            if inside_callout:
                title = link_m.group(1)
                blocks.append({"type": "paragraph", "data": {"text": f"📄 {format_inline(title)}"}})
            i += 1
            continue

        if link_m and not re.match(r'^[a-z]+:', link_m.group(2)):
            file_block = _attachment_block(link_m.group(2), page_dir, ctx)
            if file_block:
                blocks.append(file_block)
                i += 1
                continue

        img_m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', stripped)
        if img_m:
            img_full = _resolve_export_file(img_m.group(2), page_dir, ctx)
            if img_full is None:
                i += 1
                continue
            if img_full.exists():
                ctx.log(f"    ↑ Uploading {img_full.name}")
                url = ctx.upload_file(img_full, "auto")
                if url:
                    blocks.append({"type": "image", "data": {"url": url, "width": 100}})
            else:
                ctx.log(f"  ⚠ Image not found: {img_full}")
            i += 1
            continue

        if re.match(r'^\|', stripped):
            table_lines = []
            while i < len(lines) and re.match(r'^\|', lines[i].strip()):
                table_lines.append(lines[i].strip())
                i += 1
            rows = [
                [cell.strip() for cell in re.split(r'(?<!\\)\|', row.strip('|'))]
                for row in table_lines
                if not re.match(r'^\|?[\s\-:]+\|', row)
            ]
            if rows:
                content = [[format_inline(cell) for cell in row] for row in rows]
                blocks.append({
                    "type": "table",
                    "data": {"withHeadings": True, "content": content}
                })
            continue

        if re.match(r'^\s*[-*+]\s+\[[ xX]\]', line):
            items = []
            while i < len(lines) and re.match(r'^\s*[-*+]\s+\[[ xX]\]', lines[i]):
                checked = bool(re.match(r'^\s*[-*+]\s+\[[xX]\]', lines[i]))
                text = re.sub(r'^\s*[-*+]\s+\[[ xX]\]\s*', '', lines[i])
                items.append({"content": format_inline(text), "checked": checked})
                i += 1
            blocks.append({"type": "list", "data": {"style": "checklist", "items": items}})
            continue

        bullet_m = _BULLET_RE.match(line)
        number_m = _NUMBER_RE.match(line)
        if bullet_m or number_m:
            ordered = bullet_m is None
            list_m = bullet_m or number_m
            items, i = _parse_list(lines, i, len(list_m.group(1)), ordered)
            blocks.append({"type": "list", "data": {"style": "ordered" if ordered else "unordered", "items": items}})
            continue

        para_lines = [line]
        i += 1
        while i < len(lines) and not is_block_start(lines[i]):
            para_lines.append(lines[i])
            i += 1

        text = '<br>'.join(format_inline(p.strip()) for p in para_lines if p.strip())
        if text:
            blocks.append({"type": "paragraph", "data": {"text": text}})

    return blocks


def parse_markdown(md_content: str, page_dir: str, ctx: "ImportContext") -> tuple:
    lines = md_content.split('\n')
    start = 1 if (lines and re.match(r'^# ', lines[0])) else 0
    blocks = _parse_lines(lines, start, page_dir, ctx)

    callout_titles = set()
    for b in blocks:
        if b.get("type") == "paragraph":
            text = b.get("data", {}).get("text", "")
            m = re.match(r'^📄\s+(.+)$', text)
            if m:
                callout_titles.add(_clean_title(m.group(1)))
    return blocks, callout_titles


def get_page_title(md_file: Path) -> str:
    try:
        first_line = md_file.read_text(encoding='utf-8').split('\n')[0]
        m = re.match(r'^#\s+(.+)$', first_line)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    name = md_file.stem
    name = re.sub(r'\s+[0-9a-f]{32}$', '', name)
    return name


def find_subdir_for_md(md_file: Path) -> Optional[Path]:
    stem = md_file.stem
    base = re.sub(r'\s+[0-9a-f]{32}$', '', stem)
    sub = md_file.parent / base
    return sub if sub.is_dir() else None


def replace_callout_page_refs(page_id: int, children: list, ctx: "ImportContext"):
    try:
        blocks = ctx.load_blocks(page_id)
        if blocks is None:
            return

        child_map = {}
        for child_id, child_title in children:
            clean = _clean_title(child_title)
            child_map[clean] = (child_id, child_title)

        changed = False
        new_blocks = []
        for b in blocks:
            if b.get("type") == "paragraph":
                text = b.get("data", {}).get("text", "")
                m = re.match(r'^📄\s+(.+)$', text)
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
            ctx.save_blocks(page_id, new_blocks)
    except Exception as e:
        ctx.log(f"  ⚠ Could not replace callout page refs: {e}")


def append_page_blocks(page_id: int, child_pages: list, ctx: "ImportContext"):
    try:
        blocks = ctx.load_blocks(page_id)
        if blocks is None:
            return

        for child_id, child_title in child_pages:
            blocks.append({
                "type": "page",
                "data": {"pageId": child_id, "pageTitle": child_title}
            })

        ctx.save_blocks(page_id, blocks)
    except Exception as e:
        ctx.log(f"  ⚠ Could not append page blocks: {e}")


def _database_table_blocks(db_dir: Path, ctx: "ImportContext") -> list:
    # notion puts the database rows into a csv next to the folder, _all.csv is a duplicate
    csv_file = db_dir.parent / f"{db_dir.name}.csv"
    if not csv_file.is_file():
        return []
    try:
        with csv_file.open(encoding="utf-8-sig", newline="") as f:
            rows = [row for row in csv.reader(f) if row]
    except Exception as e:
        ctx.log(f"  ⚠ Could not read {csv_file.name}: {e}")
        return []
    if not rows:
        return []

    width = max(len(row) for row in rows)
    content = [[html.escape(cell) for cell in row] + [""] * (width - len(row)) for row in rows]
    return [{"type": "table", "data": {"withHeadings": True, "content": content}}]


def process_directory(
    dir_path: Path,
    parent_id: Optional[int],
    ctx: "ImportContext",
    depth: int = 0,
) -> list:
    indent = "  " * depth
    created = []

    md_files = sorted([
        f for f in dir_path.iterdir()
        if f.is_file() and f.suffix == '.md' and not f.name.startswith('.')
    ])

    matched_subdirs: set = set()

    for order, md_file in enumerate(md_files):
        title = get_page_title(md_file)
        ctx.log(f"\n{indent}📄 {title}")

        try:
            content_text = md_file.read_text(encoding='utf-8')
        except Exception as e:
            ctx.log(f"{indent}  ⚠ Could not read file: {e}")
            continue

        blocks, callout_titles = parse_markdown(content_text, str(md_file.parent), ctx)
        page_id = ctx.create_page(title, blocks, parent_id, order)

        if page_id:
            ctx.log(f"{indent}  ✓ id={page_id}, blocks={len(blocks)}")
            created.append((page_id, title))

            sub_dir = find_subdir_for_md(md_file)
            if sub_dir is not None:
                matched_subdirs.add(sub_dir)
                children = process_directory(sub_dir, page_id, ctx, depth + 1)
                if children:
                    callout_children = [(cid, ctitle) for cid, ctitle in children
                                        if _clean_title(ctitle) in callout_titles]
                    if callout_children:
                        replace_callout_page_refs(page_id, callout_children, ctx)
                        ctx.log(f"{indent}  ↳ Replaced {len(callout_children)} callout page ref(s) with PageBlocks")

                    filtered = [(cid, ctitle) for cid, ctitle in children
                                if _clean_title(ctitle) not in callout_titles]
                    if filtered:
                        append_page_blocks(page_id, filtered, ctx)
                        ctx.log(f"{indent}  ↳ Added {len(filtered)} subpage link(s)")

    # notion databases come as folder + csv without a matching .md
    orphan_dirs = sorted([
        d for d in dir_path.iterdir()
        if d.is_dir()
        and not d.name.startswith('.')
        and not d.name.startswith('_')
        and d not in matched_subdirs
    ])

    for order, sub_dir in enumerate(orphan_dirs, start=len(created)):
        title = re.sub(r'\s+[0-9a-f]{32}$', '', sub_dir.name).strip()
        if not title:
            continue
        ctx.log(f"\n{indent}📁 {title}")
        page_id = ctx.create_page(title, _database_table_blocks(sub_dir, ctx), parent_id, order)
        if page_id:
            ctx.log(f"{indent}  ✓ id={page_id} (database)")
            created.append((page_id, title))
            children = process_directory(sub_dir, page_id, ctx, depth + 1)
            if children:
                append_page_blocks(page_id, children, ctx)
                ctx.log(f"{indent}  ↳ Added {len(children)} subpage link(s)")

    return created
