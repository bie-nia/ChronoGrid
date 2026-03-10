from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    invite_token: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    is_admin: bool = False
    is_demo: bool = False

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPair(BaseModel):
    """Zwracany przy logowaniu — access + refresh token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class InviteTokenOut(BaseModel):
    token: str
    used: bool
    created_at: datetime
    used_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InviteTokenBatchCreate(BaseModel):
    count: int = 1  # ile tokenów wygenerować (1–100)


class ChangePassword(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class AdminUpdateUser(BaseModel):
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=8, max_length=128)


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    action: str
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserOutAdmin(BaseModel):
    id: int
    email: str
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}
