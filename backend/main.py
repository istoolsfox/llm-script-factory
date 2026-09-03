import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from utils.logging_config import setup_chinese_logging
from api.routers.common import router as common_router
from api.routers.auth import router as auth_router
from api.routers.stage1 import router as stage1_router
from api.routers.stage2 import router as stage2_router
from api.routers.stage3 import router as stage3_router
from api.routers.stage4 import router as stage4_router
from api.routers.stage5 import router as stage5_router
from api.routers.stage6 import router as stage6_router
from api.routers.import_router import router as import_router
from api.routers.debug import router as debug_router
from api.routers.settings import router as settings_router
from api.routers.bible import router as bible_router
from api.routers.version import router as version_router
from api.routers.rewrite import router as rewrite_router
from api.routers.chat import router as chat_router

load_dotenv() 
setup_chinese_logging()

app = FastAPI(title="Script Factory AI Backend")

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

# Register Routers
app.include_router(common_router)
app.include_router(auth_router)
app.include_router(stage1_router)
app.include_router(stage2_router)
app.include_router(stage3_router)
app.include_router(stage4_router)
app.include_router(stage5_router)
app.include_router(stage6_router)
app.include_router(import_router)
app.include_router(debug_router)
app.include_router(settings_router)
app.include_router(bible_router)
app.include_router(version_router)
app.include_router(rewrite_router)
app.include_router(chat_router)


# =============================================================================
# Authentication: require a valid token for every /api endpoint except login.
# =============================================================================
PUBLIC_API_PATHS = {"/api/auth/login", "/api/auth/me"}


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api") and path not in PUBLIC_API_PATHS:
        from services.auth_service import verify_token

        auth_header = request.headers.get("authorization", "")
        token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else request.query_params.get("token", "")
        if not verify_token(token):
            return JSONResponse(status_code=401, content={"detail": "未登录或登录已过期"})
    return await call_next(request)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Script Factory AI Backend"}


def _bootstrap_auth():
    """Create the credentials file on first start (gitignored, per machine)."""
    import secrets as _secrets

    from services.auth_service import load_credentials, init_credentials

    if load_credentials() is None:
        username = os.getenv("AUTH_USERNAME", "sx")
        password = os.getenv("AUTH_PASSWORD") or _secrets.token_urlsafe(12)
        init_credentials(username, password)
        print(f"🔐 [Auth] 首次启动：已创建用户 '{username}'，密码：{password}（仅打印这一次，请妥善保存）")


# `uvicorn main:app` imports this module without running __main__.
_bootstrap_auth()

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
