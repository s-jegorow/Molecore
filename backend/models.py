from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base

def _utcnow():
    return datetime.now(timezone.utc)

class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    preferences = Column(Text, default='{}')  # JSON string


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)  # JSON als String gespeichert
    parent_id = Column(Integer, ForeignKey("pages.id"), nullable=True)
    page_type = Column(String, default="normal")  # "home", "favorite", "normal", "template", etc.
    icon = Column(String, nullable=True)  # Emoji oder Upload-Pfad (z.B. "📄" oder "/uploads/icon_1_image.png")
    header = Column(String, nullable=True)  # Header-Bild Upload-Pfad (z.B. "/uploads/header_1_image.jpg")
    order = Column(Integer, default=0)
    user_id = Column(String, index=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    parent = relationship("Page", remote_side=[id], backref="children")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    date = Column(String, index=True)  # YYYY-MM-DD
    title = Column(String)
    time = Column(String, nullable=True)
    color = Column(String, nullable=True, default="gray")
    created_at = Column(DateTime, default=_utcnow)
