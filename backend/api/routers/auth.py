"""
Auth API Router: login and session check.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.auth_service import verify_user, issue_token, verify_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    """Validate credentials and return a signed session token."""
    if not verify_user(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return {"success": True, "username": payload.username, "token": issue_token(payload.username)}


@router.get("/me")
def me(token: str = "") -> dict:
    """Check whether a token is still valid."""
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return {"username": username}
