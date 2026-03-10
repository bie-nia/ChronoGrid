from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, check_demo_quota
from app.db.base import get_db
from app.models.eisenhower_task import EisenhowerTask
from app.models.user import User
from app.schemas.eisenhower_task import (
    EisenhowerTaskCreate,
    EisenhowerTaskUpdate,
    EisenhowerTaskOut,
)

router = APIRouter(prefix="/eisenhower-tasks", tags=["eisenhower-tasks"])


@router.get("", response_model=List[EisenhowerTaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(EisenhowerTask)
        .filter(EisenhowerTask.user_id == current_user.id)
        .order_by(EisenhowerTask.created_at)
        .all()
    )


@router.post("", response_model=EisenhowerTaskOut, status_code=201)
def create_task(
    payload: EisenhowerTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_demo_quota(current_user, db, "task")
    task = EisenhowerTask(**payload.model_dump(), user_id=current_user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=EisenhowerTaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (
        db.query(EisenhowerTask)
        .filter(
            EisenhowerTask.id == task_id,
            EisenhowerTask.user_id == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=EisenhowerTaskOut)
def patch_task(
    task_id: int,
    payload: EisenhowerTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update task — used for drag & drop between quadrants."""
    task = (
        db.query(EisenhowerTask)
        .filter(
            EisenhowerTask.id == task_id,
            EisenhowerTask.user_id == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=EisenhowerTaskOut)
def update_task(
    task_id: int,
    payload: EisenhowerTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return patch_task(task_id, payload, db, current_user)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (
        db.query(EisenhowerTask)
        .filter(
            EisenhowerTask.id == task_id,
            EisenhowerTask.user_id == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
