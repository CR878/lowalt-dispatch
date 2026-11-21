"""Persistent local identities. Passwords and session tokens are never stored raw."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import struct
import time
from pathlib import Path
from threading import RLock

from fastapi import HTTPException

PERMISSIONS = {
    "admin": [
        "workspace.read",
        "task.read",
        "task.create",
        "task.execute",
        "map.read",
        "telemetry.read",
        "report.read",
        "identity.manage",
    ],
    "dispatcher": [
        "workspace.read",
        "task.read",
        "task.create",
        "task.execute",
        "map.read",
        "telemetry.read",
        "report.read",
    ],
    "observer": ["workspace.read", "task.read", "map.read", "telemetry.read", "report.read"],
}
ROLE_NAMES = {"admin": "管理员", "dispatcher": "调度员", "observer": "观察员"}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    if (
        len(password) < 10
        or len(password) > 128
        or not any(c.isalpha() for c in password)
        or not any(c.isdigit() for c in password)
    ):
        raise HTTPException(422, "密码需为10–128位，并包含字母和数字")
    salt = salt or secrets.token_hex(16)
    return salt + ":" + hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000).hex()


def password_matches(password: str, saved: str) -> bool:
    try:
        salt, expected = saved.split(":", 1)
        result = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000).hex()
        return hmac.compare_digest(result, expected)
    except ValueError:
        return False


def totp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    signature = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = signature[-1] & 15
    return str((struct.unpack(">I", signature[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


class IdentityStore:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        self.db = sqlite3.connect(root / "identity.sqlite3", check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            password TEXT NOT NULL, role TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1, mfa TEXT, pending_mfa TEXT,
            mfa_counter INTEGER NOT NULL DEFAULT -1, created REAL NOT NULL
          );
          CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, email TEXT, role TEXT, expires REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, started REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at REAL NOT NULL, actor TEXT, action TEXT NOT NULL, detail TEXT NOT NULL);
        """)

    def close(self):
        self.db.close()

    def audit(self, actor: str | None, action: str, detail: str):
        self.db.execute(
            "INSERT INTO events(at,actor,action,detail) VALUES(?,?,?,?)", (time.time(), actor, action, detail)
        )

    def policy(self):
        with self.lock:
            return {
                "setup_required": self.db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0,
                "registration": os.getenv("AERIS_REGISTRATION", "invite")
                if os.getenv("AERIS_REGISTRATION", "invite") in {"invite", "open", "closed"}
                else "invite",
                "email_delivery": "local_outbox",
                "workspace_name": "AERIS 团队工作区",
            }

    @staticmethod
    def public(row):
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "role_name": ROLE_NAMES[row["role"]],
            "email_verified": bool(row["verified"]),
            "active": bool(row["active"]),
            "mfa_enabled": bool(row["mfa"]),
            "permissions": PERMISSIONS[row["role"]],
        }

    def rate(self, key: str, limit=8, window=900):
        with self.lock:
            now = time.time()
            row = self.db.execute("SELECT * FROM attempts WHERE key=?", (key,)).fetchone()
            if row and now - row["started"] < window:
                if row["count"] >= limit:
                    raise HTTPException(429, "尝试次数过多，请15分钟后重试")
                self.db.execute("UPDATE attempts SET count=count+1 WHERE key=?", (key,))
            else:
                self.db.execute("INSERT OR REPLACE INTO attempts VALUES(?,1,?)", (key, now))

    def _token(self, kind, *, user_id=None, email=None, role=None, ttl=1800):
        value = secrets.token_urlsafe(32)
        self.db.execute(
            "INSERT INTO tokens VALUES(?,?,?,?,?,?)",
            (token_hash(value), kind, user_id, email, role, time.time() + ttl),
        )
        return value

    def _deliver(self, email, kind, token):
        # Local deployment has no mail relay. A real, expiring token is written
        # only to the operator's filesystem; never returned by the public API.
        outbox = self.root / "outbox"
        outbox.mkdir(exist_ok=True)
        path = outbox / (secrets.token_hex(8) + ".json")
        path.write_text(
            json.dumps(
                {"to": email, "kind": kind, "token": token, "created_at": time.time()}, ensure_ascii=False
            ),
            encoding="utf-8",
        )

    def create(self, email: str, name: str, password: str, *, setup=False, invite=""):
        hashed = password_hash(password)
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                policy = self.policy()
                role, verified = "observer", False
                if setup:
                    if not policy["setup_required"]:
                        raise HTTPException(409, "工作区已初始化，请登录或联系管理员邀请")
                    role = "admin"
                elif policy["setup_required"]:
                    raise HTTPException(409, "请先初始化工作区管理员")
                elif policy["registration"] == "closed":
                    raise HTTPException(403, "注册已关闭，请联系工作区管理员")
                elif invite:
                    row = self.db.execute(
                        "SELECT * FROM tokens WHERE token=? AND kind='invite'", (token_hash(invite),)
                    ).fetchone()
                    if not row or row["expires"] <= time.time() or row["email"] != email:
                        raise HTTPException(422, "邀请码无效、已使用、过期或与邮箱不一致")
                    role, verified = row["role"], True  # possession proves the invited mailbox/token
                    self.db.execute("DELETE FROM tokens WHERE token=?", (token_hash(invite),))
                elif policy["registration"] != "open":
                    raise HTTPException(403, "当前仅限邀请注册，请填写管理员发送的邀请码")
                user_id = secrets.token_hex(16)
                self.db.execute(
                    "INSERT INTO users(id,email,name,password,role,verified,created) VALUES(?,?,?,?,?,?,?)",
                    (user_id, email, name, hashed, role, int(verified), time.time()),
                )
                self.audit(user_id, "workspace_initialized" if setup else "user_registered", email)
                self.db.execute("COMMIT")
            except sqlite3.IntegrityError:
                self.db.execute("ROLLBACK")
                raise HTTPException(409, "此邮箱已注册，请直接登录") from None
            except Exception:
                self.db.execute("ROLLBACK")
                raise
            if not verified:
                self.send_verification(user_id)
            return self.new_session(user_id)

    def new_session(self, user_id):
        token = secrets.token_urlsafe(48)
        self.db.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
        self.db.execute(
            "INSERT INTO sessions VALUES(?,?,?)", (token_hash(token), user_id, time.time() + 8 * 3600)
        )
        return token, self.public(self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())

    def user(self, token: str):
        with self.lock:
            row = self.db.execute(
                "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1",
                (token_hash(token), time.time()),
            ).fetchone()
            return self.public(row) if row else None

    def logout(self, token):
        with self.lock:
            self.db.execute("DELETE FROM sessions WHERE token=?", (token_hash(token),))

    def login(self, email, password, key):
        with self.lock:
            self.rate("login:" + key + ":" + email)
            row = self.db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            check = row["password"] if row else "dummysalt:" + "0" * 64
            if not password_matches(password, check) or row is None or not row["active"]:
                raise HTTPException(401, "邮箱或密码不正确，或账号已停用")
            self.db.execute("DELETE FROM attempts WHERE key=?", ("login:" + key + ":" + email,))
            if row["mfa"]:
                return {"mfa_required": True, "challenge": self._token("mfa", user_id=row["id"], ttl=300)}
            self.audit(row["id"], "login", "password")
            return self.new_session(row["id"])

    def _check_totp(self, row, code, *, pending=False):
        secret = row["pending_mfa"] if pending else row["mfa"]
        if secret and len(code) == 6 and code.isdigit():
            for counter in range(int(time.time() / 30) - 1, int(time.time() / 30) + 2):
                if counter > row["mfa_counter"] and hmac.compare_digest(totp(secret, counter), code):
                    self.db.execute("UPDATE users SET mfa_counter=? WHERE id=?", (counter, row["id"]))
                    return True
        return False

    def mfa_login(self, challenge, code):
        with self.lock:
            self.rate("mfa:" + token_hash(challenge), limit=5)
            row = self.db.execute(
                "SELECT u.* FROM users u JOIN tokens t ON t.user_id=u.id WHERE t.token=? AND t.kind='mfa' AND t.expires>? AND u.active=1",
                (token_hash(challenge), time.time()),
            ).fetchone()
            if row is None or not self._check_totp(row, code):
                raise HTTPException(401, "动态验证码无效、已使用或登录验证已过期")
            self.db.execute("DELETE FROM tokens WHERE token=?", (token_hash(challenge),))
            self.audit(row["id"], "login", "password+totp")
            return self.new_session(row["id"])

    def send_verification(self, user_id):
        with self.lock:
            row = self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            self.rate("verify_send:" + user_id, limit=3)
            if row["verified"]:
                return
            self.db.execute("DELETE FROM tokens WHERE kind='verify' AND user_id=?", (user_id,))
            token = self._token("verify", user_id=user_id, email=row["email"])
            self._deliver(row["email"], "verify", token)

    def verify_email(self, user_id, token):
        with self.lock:
            self.rate("verify:" + user_id)
            row = self.db.execute(
                "SELECT * FROM tokens WHERE token=? AND kind='verify' AND user_id=? AND expires>?",
                (token_hash(token), user_id, time.time()),
            ).fetchone()
            if row is None:
                raise HTTPException(422, "邮箱验证令牌无效、已使用或已过期")
            self.db.execute("UPDATE users SET verified=1 WHERE id=?", (user_id,))
            self.db.execute("DELETE FROM tokens WHERE token=?", (token_hash(token),))
            self.audit(user_id, "email_verified", row["email"])

    def invite(self, actor, email, role):
        with self.lock:
            if not actor["email_verified"]:
                raise HTTPException(403, "邀请成员前，请先验证管理员邮箱")
            self.rate("invite:" + actor["id"], limit=30)
            token = self._token("invite", email=email, role=role, ttl=48 * 3600)
            self._deliver(email, "invite", token)
            self.audit(actor["id"], "member_invited", email + ":" + role)
            return {"delivery": "local_outbox", "expires_in_hours": 48}

    def users(self):
        with self.lock:
            return [self.public(row) for row in self.db.execute("SELECT * FROM users ORDER BY created")]

    def update_user(self, actor, user_id, role, active):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                row = self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
                if row is None:
                    raise HTTPException(404, "成员不存在")
                if row["role"] == "admin" and row["active"] and (role != "admin" or not active):
                    admins = self.db.execute(
                        "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1"
                    ).fetchone()[0]
                    if admins <= 1:
                        raise HTTPException(409, "至少保留一名启用的管理员")
                self.db.execute("UPDATE users SET role=?,active=? WHERE id=?", (role, int(active), user_id))
                self.db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
                self.audit(actor["id"], "member_updated", user_id + ":" + role + ":" + str(active))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def setup_mfa(self, user_id, password):
        with self.lock:
            self.rate("mfa_setup:" + user_id)
            row = self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not password_matches(password, row["password"]):
                raise HTTPException(401, "当前密码不正确")
            if row["mfa"]:
                raise HTTPException(409, "MFA已经启用")
            secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
            self.db.execute("UPDATE users SET pending_mfa=? WHERE id=?", (secret, user_id))
            return {
                "secret": secret,
                "uri": f"otpauth://totp/AERIS:{row['email']}?secret={secret}&issuer=AERIS",
            }

    def confirm_mfa(self, user_id, code):
        with self.lock:
            self.rate("mfa_confirm:" + user_id)
            row = self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not self._check_totp(row, code, pending=True):
                raise HTTPException(422, "动态验证码无效，请核对验证器时间")
            self.db.execute("UPDATE users SET mfa=pending_mfa,pending_mfa=NULL WHERE id=?", (user_id,))
            self.audit(user_id, "mfa_enabled", "totp")

    def disable_mfa(self, user_id, password, code):
        with self.lock:
            self.rate("mfa_disable:" + user_id)
            row = self.db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not password_matches(password, row["password"]) or not self._check_totp(row, code):
                raise HTTPException(401, "密码或动态验证码不正确")
            self.db.execute(
                "UPDATE users SET mfa=NULL,pending_mfa=NULL,mfa_counter=-1 WHERE id=?", (user_id,)
            )
            self.db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            self.audit(user_id, "mfa_disabled", "re-authenticated")

    def events(self):
        with self.lock:
            return [
                dict(row)
                for row in self.db.execute(
                    "SELECT e.id,e.at,e.action,e.detail,u.name AS actor FROM events e LEFT JOIN users u ON e.actor=u.id ORDER BY e.id DESC LIMIT 100"
                )
            ]
