from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field


class ContactBase(BaseModel):
    name: str = Field(..., max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=50_000)
    interests: Optional[str] = Field(None, max_length=50_000)
    birthday: Optional[date] = None
    photo_url: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=50_000)
    interests: Optional[str] = Field(None, max_length=50_000)
    birthday: Optional[date] = None
    photo_url: Optional[str] = None


class ContactOut(ContactBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
