from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.activity_template import ActivityTemplateOut


class EventBase(BaseModel):
    title: str = Field(..., max_length=200)
    start_datetime: datetime
    end_datetime: datetime
    description: Optional[str] = Field(None, max_length=10_000)
    location: Optional[str] = Field(None, max_length=200)
    recurrence_rule: Optional[str] = Field(None, max_length=100)
    activity_template_id: Optional[int] = None
    is_background: bool = False
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=100)
    eisenhower_quadrant: Optional[str] = Field(None, max_length=20)

    @field_validator("end_datetime")
    @classmethod
    def end_after_start(cls, v, info):
        if "start_datetime" in info.data and v <= info.data["start_datetime"]:
            raise ValueError("end_datetime must be after start_datetime")
        return v


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    description: Optional[str] = Field(None, max_length=10_000)
    location: Optional[str] = Field(None, max_length=200)
    recurrence_rule: Optional[str] = Field(None, max_length=100)
    activity_template_id: Optional[int] = None
    is_background: Optional[bool] = None
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=100)
    eisenhower_quadrant: Optional[str] = Field(None, max_length=20)


class EventOut(EventBase):
    id: int
    user_id: int
    created_at: datetime
    activity_template: Optional[ActivityTemplateOut] = None

    model_config = {"from_attributes": True}
