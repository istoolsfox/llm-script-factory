"""
Auth Service: single-user authentication.

- Credentials stored in backend/config/auth.json as PBKDF2-SHA256 hashes
  (never plaintext). The file is gitignored.
- Tokens are HMAC-SHA256 signed with the stored credential material as the
  secret, so they stay valid across server restarts without extra state.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Optional

AUTH_PATH = Path(__file__).parent.parent / "config" / "auth.json"

TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 days
PBKDF2_ITERATIONS = 240_000


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS).hex()


def load_credentials() -> Optional[dict]:
    """Return the stored credentials dict, or None if not initialized."""
    try:
        with open(AUTH_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def save_credentials(data: dict) -> None:
    AUTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AUTH_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.chmod(AUTH_PATH, 0o600)


def init_credentials(username: str, password: str) -> None:
    """Initialize the credentials file with one user (no-op if it exists)."""
    if load_credentials() is not None:
        return
    salt = secrets.token_bytes(16)
    save_credentials({
        "algo": "pbkdf2_sha256",
        "iterations": PBKDF2_ITERATIONS,
        "users": {
            username: {"salt": salt.hex(), "hash": _hash_password(password, salt)},
        },
    })


def verify_user(username: str, password: str) -> bool:
    data = load_credentials()
    if not data:
        return False
    user = data.get("users", {}).get(username)
    if not user:
        # burn comparable time to avoid trivially probing valid usernames
        hmac.compare_digest(_hash_password(password, bytes.fromhex("00" * 16)), "")
        return False
    salt = bytes.fromhex(user["salt"])
    expected = user["hash"]
    return hmac.compare_digest(_hash_password(password, salt), expected)


def set_password(username: str, password: str) -> None:
    data = load_credentials() or {"algo": "pbkdf2_sha256", "iterations": PBKDF2_ITERATIONS, "users": {}}
    data["algo"] = "pbkdf2_sha256"
    data["iterations"] = PBKDF2_ITERATIONS
    salt = secrets.token_bytes(16)
    data["users"][username] = {"salt": salt.hex(), "hash": _hash_password(password, salt)}
    save_credentials(data)


def _secret() -> bytes:
    """Token-signing secret, derived from stored credential material."""
    data = load_credentials()
    material = json.dumps(data, sort_keys=True) if data else secrets.token_hex(32)
    return hashlib.sha256(material.encode()).digest()


def issue_token(username: str) -> str:
    payload = json.dumps({"u": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS})
    body = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_token(token: str) -> Optional[str]:
    """Return the username for a valid, unexpired token; otherwise None."""
    if not token or "." not in token:
        return None
    body, _, sig = token.rpartition(".")
    expected = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except Exception:
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload.get("u")
