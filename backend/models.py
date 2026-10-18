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
    preferences = Column(Text, default='{}')


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    parent_id = Column(Integer, ForeignKey("pages.id"), nullable=True)
    page_type = Column(String, default="normal")
    icon = Column(String, nullable=True)
    header = Column(String, nullable=True)
    order = Column(Integer, default=0)
    user_id = Column(String, index=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    parent = relationship("Page", remote_side=[id], backref="children")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    date = Column(String, index=True)
    title = Column(String)
    time = Column(String, nullable=True)
    color = Column(String, nullable=True, default="gray")
    created_at = Column(DateTime, default=_utcnow)
