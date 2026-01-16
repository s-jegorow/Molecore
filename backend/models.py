from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    pages = relationship("Page", back_populates="owner")


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
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="pages")
    parent = relationship("Page", remote_side=[id], backref="children")
