from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, check_demo_quota
from app.db.base import get_db
from app.models.activity_template import ActivityTemplate
from app.models.event import Event
from app.models.user import User
from app.schemas.activity_template import (
    ActivityTemplateCreate,
    ActivityTemplateUpdate,
    ActivityTemplateOut,
)

router = APIRouter(prefix="/activity-templates", tags=["activity-templates"])


@router.get("", response_model=List[ActivityTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ActivityTemplate)
        .filter(ActivityTemplate.user_id == current_user.id)
        .order_by(ActivityTemplate.created_at)
        .all()
    )


@router.post("", response_model=ActivityTemplateOut, status_code=201)
def create_template(
    payload: ActivityTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_demo_quota(current_user, db, "template")
    template = ActivityTemplate(**payload.model_dump(), user_id=current_user.id)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=ActivityTemplateOut)
def update_template(
    template_id: int,
    payload: ActivityTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(ActivityTemplate)
        .filter(
            ActivityTemplate.id == template_id,
            ActivityTemplate.user_id == current_user.id,
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = payload.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(template, key, value)

    # Propaguj zmianę description do WSZYSTKICH powiązanych eventów
    if "description" in update_data:
        (
            db.query(Event)
            .filter(
                Event.activity_template_id == template_id,
                Event.user_id == current_user.id,
            )
            .update(
                {Event.description: update_data["description"]},
                synchronize_session="fetch",
            )
        )

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(ActivityTemplate)
        .filter(
            ActivityTemplate.id == template_id,
            ActivityTemplate.user_id == current_user.id,
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
