from datetime import datetime
from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class EisenhowerTaskBase(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=10_000)
    urgent: bool = False
    important: bool = False
    status: TaskStatus = TaskStatus.TODO
    linked_event_id: Optional[int] = None
    due_date: Optional[datetime] = None
    target_quadrant: Optional[str] = Field(None, max_length=20)
    recurrence_days: Optional[int] = None


class EisenhowerTaskCreate(EisenhowerTaskBase):
    pass


class EisenhowerTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=10_000)
    urgent: Optional[bool] = None
    important: Optional[bool] = None
    status: Optional[TaskStatus] = None
    linked_event_id: Optional[int] = None
    due_date: Optional[datetime] = None
    target_quadrant: Optional[str] = Field(None, max_length=20)
    recurrence_days: Optional[int] = None


class EisenhowerTaskOut(EisenhowerTaskBase):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
