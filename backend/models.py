from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, false, text
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


_SINGLE_PAGE_FILTER = text("page_type IN ('home', 'notepad', 'todo')")


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        Index(
            "uq_pages_user_single_type",
            "user_id",
            "page_type",
            unique=True,
            postgresql_where=_SINGLE_PAGE_FILTER,
            sqlite_where=_SINGLE_PAGE_FILTER,
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    parent_id = Column(Integer, ForeignKey("pages.id"), nullable=True)
    page_type = Column(String, default="normal")
    is_favorite = Column(Boolean, nullable=False, default=False, server_default=false())
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
