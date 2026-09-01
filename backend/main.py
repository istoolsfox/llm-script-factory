import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from utils.logging_config import setup_chinese_logging
from api.routers.common import router as common_router
from api.routers.stage1 import router as stage1_router
from api.routers.stage2 import router as stage2_router
from api.routers.stage3 import router as stage3_router
from api.routers.stage4 import router as stage4_router
from api.routers.stage5 import router as stage5_router
from api.routers.stage6 import router as stage6_router
from api.routers.import_router import router as import_router
from api.routers.debug import router as debug_router
from api.routers.cache import router as cache_router
from api.routers.settings import router as settings_router

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
app.include_router(stage1_router)
app.include_router(stage2_router)
app.include_router(stage3_router)
app.include_router(stage4_router)
app.include_router(stage5_router)
app.include_router(stage6_router)
app.include_router(import_router)
app.include_router(debug_router)
app.include_router(cache_router)
app.include_router(settings_router)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Script Factory AI Backend"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
