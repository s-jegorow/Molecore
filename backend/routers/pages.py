import html
import json
import re
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Page
from schemas import PageCreate, PageMeta, PageResponse, PageUpdate, SearchResult

router = APIRouter()

VALID_PAGE_TYPES = {"home", "favorite", "normal", "template", "notepad", "todo"}
ASSIGNABLE_PAGE_TYPES = VALID_PAGE_TYPES - {"home"}


def load_content(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        content = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        content = {}
    if not isinstance(content, dict):
        content = {}
    content.setdefault("blocks", [])
    return content


def page_to_dict(page: Page, include_content: bool = True) -> dict:
    data = {
        "id": page.id,
        "title": page.title,
        "parent_id": page.parent_id,
        "page_type": page.page_type,
        "icon": page.icon,
        "header": page.header,
        "order": page.order,
        "user_id": page.user_id,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
    }
    if include_content:
        data["content"] = load_content(page.content)
    return data


def find_user_page(db: Session, page_id: int, user_id: str) -> Optional[Page]:
    return db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()


def would_create_cycle(db: Session, page_id: int, new_parent_id: int, user_id: str) -> bool:
    visited: set = set()
    current_id: Optional[int] = new_parent_id
    while current_id is not None:
        if current_id == page_id:
            return True
        if current_id in visited:
            break
        visited.add(current_id)
        row = db.query(Page.parent_id).filter(
            Page.id == current_id,
            Page.user_id == user_id
        ).first()
        current_id = row[0] if row else None
    return False


_TAG_RE = re.compile(r"<[^>]*>")


def _strip_html(text: str) -> str:
    return html.unescape(_TAG_RE.sub("", text or ""))


def _list_item_texts(items) -> List[str]:
    texts: List[str] = []
    for item in items or []:
        if isinstance(item, str):
            texts.append(item)
        elif isinstance(item, dict):
            texts.append(str(item.get("content") or item.get("text") or ""))
            texts.extend(_list_item_texts(item.get("items")))
    return texts


def _block_text(block: dict) -> str:
    data = block.get("data") if isinstance(block, dict) else None
    if not isinstance(data, dict):
        return ""
    if isinstance(data.get("text"), str):
        return data["text"]
    if isinstance(data.get("items"), list):
        return " ".join(_list_item_texts(data["items"]))
    if isinstance(data.get("code"), str):
        return data["code"]
    if isinstance(data.get("content"), list):
        return " ".join(str(cell) for row in data["content"] if isinstance(row, list) for cell in row)
    if isinstance(data.get("pageTitle"), str):
        return data["pageTitle"]
    return ""


def search_pages(pages: List[Page], query: str, limit: int = 50) -> List[dict]:
    q = query.strip().lower()
    if not q:
        return []
    title_hits: List[dict] = []
    content_hits: List[dict] = []
    for page in pages:
        base = {
            "id": page.id,
            "title": page.title,
            "parent_id": page.parent_id,
            "icon": page.icon,
            "page_type": page.page_type,
            "snippet": None,
        }
        if q in (page.title or "").lower():
            title_hits.append(base)
            continue
        for block in load_content(page.content).get("blocks", []):
            text = _strip_html(_block_text(block))
            idx = text.lower().find(q)
            if idx >= 0:
                start = max(0, idx - 30)
                end = min(len(text), idx + len(q) + 50)
                base["snippet"] = ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else "")
                content_hits.append(base)
                break
    return (title_hits + content_hits)[:limit]


@router.get("/api/pages", response_model=List[PageMeta])
def get_pages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()

    if not pages:
        home_page = Page(
            title="Dashboard",
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [
                    {
                        "type": "paragraph",
                        "data": {
                            "text": "This is your home page. You can customize it however you like."
                        }
                    }
                ],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type="home",
            icon=None,
            header=None,
            order=0,
            user_id=user_id
        )
        db.add(home_page)
        db.commit()
        db.refresh(home_page)
        pages = [home_page]

    return [page_to_dict(p, include_content=False) for p in pages]


@router.get("/api/search", response_model=List[SearchResult])
def search(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()
    return search_pages(pages, q[:200])


@router.get("/api/pages/{page_id}", response_model=PageResponse)
def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    page = find_user_page(db, page_id, current_user.get("user_id"))
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return page_to_dict(page)


@router.post("/api/pages", response_model=PageResponse)
def create_page(
    page_data: PageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    if page_data.page_type and page_data.page_type not in ASSIGNABLE_PAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page_type. Must be one of: {', '.join(sorted(ASSIGNABLE_PAGE_TYPES))}"
        )

    if page_data.parent_id is not None:
        if not find_user_page(db, page_data.parent_id, user_id):
            raise HTTPException(status_code=400, detail="Parent page not found")

    new_page = Page(
        title=page_data.title,
        content=json.dumps(page_data.content),
        parent_id=page_data.parent_id,
        page_type=page_data.page_type or "normal",
        icon=page_data.icon,
        header=page_data.header,
        order=page_data.order or 0,
        user_id=user_id
    )

    db.add(new_page)
    db.commit()
    db.refresh(new_page)

    return page_to_dict(new_page)


@router.put("/api/pages/{page_id}", response_model=PageResponse)
def update_page(
    page_id: int,
    page_data: PageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    page = find_user_page(db, page_id, user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if page_data.page_type is not None and page_data.page_type != page.page_type:
        if page.page_type == "home" or page_data.page_type not in ASSIGNABLE_PAGE_TYPES:
            raise HTTPException(status_code=400, detail="Invalid page_type change")

    if page_data.parent_id is not None:
        if not find_user_page(db, page_data.parent_id, user_id):
            raise HTTPException(status_code=400, detail="Parent page not found")
        if page_data.parent_id == page_id or would_create_cycle(db, page_id, page_data.parent_id, user_id):
            raise HTTPException(status_code=400, detail="Setting this parent would create a circular reference")

    if page_data.title is not None:
        page.title = page_data.title
    if page_data.content is not None:
        page.content = json.dumps(page_data.content)
    if "parent_id" in page_data.model_fields_set:
        page.parent_id = page_data.parent_id
    if page_data.page_type is not None:
        page.page_type = page_data.page_type
    if page_data.icon is not None:
        page.icon = page_data.icon
    if page_data.header is not None:
        page.header = page_data.header
    if page_data.order is not None:
        page.order = page_data.order

    db.commit()
    db.refresh(page)

    return page_to_dict(page)


@router.delete("/api/pages/{page_id}")
def delete_page(
    page_id: int,
    cascade: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    page = find_user_page(db, page_id, user_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if page.page_type == "home":
        raise HTTPException(status_code=400, detail="Cannot delete home page")

    if cascade:
        to_delete = [page_id]
        queue = [page_id]
        while queue:
            current = queue.pop(0)
            children = db.query(Page.id).filter(
                Page.parent_id == current,
                Page.user_id == user_id
            ).all()
            for (child_id,) in children:
                to_delete.append(child_id)
                queue.append(child_id)
        db.query(Page).filter(
            Page.id.in_(to_delete),
            Page.user_id == user_id
        ).delete(synchronize_session=False)
    else:
        # keep subpages, move them to the top level
        db.query(Page).filter(
            Page.parent_id == page_id,
            Page.user_id == user_id
        ).update({"parent_id": None})
        db.delete(page)

    db.commit()
    return {"message": "Page deleted successfully"}


def _get_or_create_special_page(db: Session, user_id: str, page_type: str, title: str, icon: str) -> Page:
    page = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type == page_type
    ).first()

    if not page:
        page = Page(
            title=title,
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type=page_type,
            icon=icon,
            order=-1,
            user_id=user_id
        )
        db.add(page)
        db.commit()
        db.refresh(page)
    return page


@router.get("/api/notepad", response_model=PageResponse)
def get_notepad(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    page = _get_or_create_special_page(db, current_user.get("user_id"), "notepad", "Notepad", "📝")
    return page_to_dict(page)


@router.get("/api/todo", response_model=PageResponse)
def get_todo(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    page = _get_or_create_special_page(db, current_user.get("user_id"), "todo", "Todos", "☑️")
    return page_to_dict(page)
