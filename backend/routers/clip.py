import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from clipper import ClipError, clip_url
from database import get_db
from models import Page
from routers.pages import find_user_page, page_to_dict
from schemas import ClipRequest, PageResponse

router = APIRouter()


@router.post("/api/clip", response_model=PageResponse)
def clip(
    data: ClipRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    if data.parent_id is not None and not find_user_page(db, data.parent_id, user_id):
        raise HTTPException(status_code=400, detail="Parent page not found")

    try:
        article = clip_url(data.url, user_id)
    except ClipError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail)

    page = Page(
        title=article.title,
        content=json.dumps({"blocks": article.blocks}),
        parent_id=data.parent_id,
        page_type="normal",
        icon="🔗",
        header=article.header,
        user_id=user_id
    )
    db.add(page)
    db.commit()
    db.refresh(page)

    return page_to_dict(page)
