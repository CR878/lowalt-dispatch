from __future__ import annotations

import os
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.identity.store import PERMISSIONS, ROLE_NAMES

router = APIRouter(prefix="/api/auth", tags=["Identity & access"])
COOKIE = "aeris_session"


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Email(Input):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("请输入有效的邮箱")
        return value


class Login(Email):
    password: str = Field(min_length=1, max_length=128)


class Registration(Login):
    name: str = Field(min_length=1, max_length=60)
    invite: str = Field(default="", max_length=200)

    @field_validator("name")
    @classmethod
    def name_valid(cls, value):
        if not value.strip():
            raise ValueError("请填写姓名")
        return value.strip()


class Token(Input):
    token: str = Field(min_length=1, max_length=200)


class MfaLogin(Input):
    challenge: str = Field(min_length=1, max_length=200)
    code: str = Field(pattern=r"^\d{6}$")


class Code(Input):
    code: str = Field(pattern=r"^\d{6}$")


class Password(Input):
    password: str = Field(min_length=1, max_length=128)


class DisableMfa(Password, Code):
    pass


class Invite(Email):
    role: Literal["admin", "dispatcher", "observer"] = "observer"


class UserUpdate(Input):
    role: Literal["admin", "dispatcher", "observer"]
    active: bool


def store(request):
    return request.app.state.identity


def current(request: Request, permission: str | None = None):
    user = store(request).user(request.cookies.get(COOKIE, ""))
    if not user:
        raise HTTPException(401, "请登录后继续")
    if permission and permission not in user["permissions"]:
        raise HTTPException(403, "当前角色没有此操作权限")
    return user


def session_response(response: Response, result):
    if isinstance(result, dict):
        return result
    token, user = result
    response.set_cookie(
        COOKIE,
        token,
        max_age=8 * 3600,
        httponly=True,
        samesite="strict",
        secure=os.getenv("AERIS_COOKIE_SECURE") == "1",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"user": user, "mfa_required": False}


@router.get("/policy")
def policy(request: Request):
    return store(request).policy()


@router.post("/setup")
def setup(body: Registration, request: Request, response: Response):
    store(request).rate("setup:" + request.client.host)
    return session_response(response, store(request).create(body.email, body.name, body.password, setup=True))


@router.post("/register")
def register(body: Registration, request: Request, response: Response):
    store(request).rate("register:" + request.client.host)
    return session_response(
        response, store(request).create(body.email, body.name, body.password, invite=body.invite)
    )


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    return session_response(response, store(request).login(body.email, body.password, request.client.host))


@router.post("/mfa/login")
def mfa_login(body: MfaLogin, request: Request, response: Response):
    return session_response(response, store(request).mfa_login(body.challenge, body.code))


@router.get("/me")
def me(request: Request):
    return {"user": current(request)}


@router.post("/logout")
def logout(request: Request, response: Response):
    store(request).logout(request.cookies.get(COOKIE, ""))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.post("/email/send")
def email_send(request: Request):
    store(request).send_verification(current(request)["id"])
    return {"delivery": "local_outbox", "message": "验证令牌已写入本机身份服务发件箱，请联系工作区管理员获取"}


@router.post("/email/verify")
def email_verify(body: Token, request: Request):
    store(request).verify_email(current(request)["id"], body.token)
    return {"ok": True}


@router.post("/mfa/setup")
def mfa_setup(body: Password, request: Request):
    return store(request).setup_mfa(current(request)["id"], body.password)


@router.post("/mfa/confirm")
def mfa_confirm(body: Code, request: Request):
    store(request).confirm_mfa(current(request)["id"], body.code)
    return {"ok": True}


@router.post("/mfa/disable")
def mfa_disable(body: DisableMfa, request: Request, response: Response):
    store(request).disable_mfa(current(request)["id"], body.password, body.code)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/users")
def users(request: Request):
    current(request, "identity.manage")
    return store(request).users()


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, request: Request):
    actor = current(request, "identity.manage")
    store(request).update_user(actor, user_id, body.role, body.active)
    return {"ok": True}


@router.post("/invitations")
def invite(body: Invite, request: Request):
    return store(request).invite(current(request, "identity.manage"), body.email, body.role)


@router.get("/roles")
def roles(request: Request):
    current(request, "identity.manage")
    return [
        {"id": role, "name": ROLE_NAMES[role], "permissions": permissions}
        for role, permissions in PERMISSIONS.items()
    ]


@router.get("/events")
def events(request: Request):
    current(request, "identity.manage")
    return store(request).events()
