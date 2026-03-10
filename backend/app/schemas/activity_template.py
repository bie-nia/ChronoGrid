from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ActivityTemplateBase(BaseModel):
    name: str = Field(..., max_length=200)
    color: str = Field("#6366f1", max_length=20)
    icon: str = Field("📚", max_length=100)
    default_duration: int = 60
    description: Optional[str] = Field(None, max_length=10_000)
    is_background: bool = False


class ActivityTemplateCreate(ActivityTemplateBase):
    pass


class ActivityTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=100)
    default_duration: Optional[int] = None
    description: Optional[str] = Field(None, max_length=10_000)
    is_background: Optional[bool] = None


class ActivityTemplateOut(ActivityTemplateBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
