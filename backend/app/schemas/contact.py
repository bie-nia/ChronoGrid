from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel


class ContactBase(BaseModel):
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    interests: Optional[str] = None
    birthday: Optional[date] = None
    photo_url: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    interests: Optional[str] = None
    birthday: Optional[date] = None
    photo_url: Optional[str] = None


class ContactOut(ContactBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
