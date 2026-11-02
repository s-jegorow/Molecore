import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import UserPreferences
from schemas import PreferencesUpdate

router = APIRouter()


@router.get("/api/preferences")
def get_preferences(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if not prefs:
        return {}
    try:
        return json.loads(prefs.preferences)
    except (json.JSONDecodeError, TypeError):
        return {}


@router.put("/api/preferences")
def update_preferences(
    data: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    update_dict = data.model_dump(exclude_none=True)
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if not prefs:
        prefs = UserPreferences(user_id=user_id, preferences=json.dumps(update_dict))
        db.add(prefs)
    else:
        existing = {}
        try:
            existing = json.loads(prefs.preferences)
        except (json.JSONDecodeError, TypeError):
            pass
        existing.update(update_dict)
        prefs.preferences = json.dumps(existing)
    db.commit()
    try:
        return json.loads(prefs.preferences)
    except (json.JSONDecodeError, TypeError):
        return {}
