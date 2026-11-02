from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PageCreate(BaseModel):
    title: str = Field(..., max_length=500)
    content: dict
    parent_id: Optional[int] = None
    page_type: Optional[str] = "normal"
    icon: Optional[str] = Field(None, max_length=200)
    header: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = 0


class PageUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content: Optional[dict] = None
    parent_id: Optional[int] = None
    page_type: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=200)
    header: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = None


class PageMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    parent_id: Optional[int]
    page_type: str
    icon: Optional[str]
    header: Optional[str]
    order: int
    user_id: str
    created_at: Optional[str]
    updated_at: Optional[str]


class PageResponse(PageMeta):
    content: dict


class SearchResult(BaseModel):
    id: int
    title: str
    parent_id: Optional[int]
    icon: Optional[str]
    page_type: str
    snippet: Optional[str]


class CalendarEventCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    title: str = Field(..., min_length=1, max_length=500)
    time: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = "gray"


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    time: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = None


class CalendarEventResponse(BaseModel):
    id: int
    date: str
    title: str
    time: Optional[str]
    color: Optional[str]


class PreferencesUpdate(BaseModel):
    model_config = {"extra": "allow"}
