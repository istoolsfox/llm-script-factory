"""
Story Bible API Router: World Settings (worldview / main_plot / characters / relationships)
Supports AI generation and manual save for each component independently.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.bible_service import BibleService

router = APIRouter(prefix="/api/bible", tags=["bible"])

service = BibleService()


# =============================================================================
# Request Models
# =============================================================================

class BibleGenerateRequest(BaseModel):
    project_name: str


class BibleSaveRequest(BaseModel):
    project_name: str
    component: str  # worldview / main_plot / characters / relationships
    data: Dict[str, Any]


# =============================================================================
# GENERATION ENDPOINTS (each component independently)
# =============================================================================

@router.post("/worldview/generate")
def generate_worldview(payload: BibleGenerateRequest):
    try:
        result = service.generate_worldview(payload.project_name)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/main-plot/generate")
def generate_main_plot(payload: BibleGenerateRequest):
    try:
        result = service.generate_main_plot(payload.project_name)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/characters/generate")
def generate_characters(payload: BibleGenerateRequest):
    try:
        result = service.generate_characters(payload.project_name)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/relationships/generate")
def generate_relationships(payload: BibleGenerateRequest):
    try:
        result = service.generate_relationships(payload.project_name)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVE ENDPOINT (manual edit)
# =============================================================================

@router.post("/save")
def save_component(payload: BibleSaveRequest):
    try:
        success = service.save_component(payload.project_name, payload.component, payload.data)
        return {"success": success, "message": f"{payload.component} 已保存"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# LOAD ENDPOINT
# =============================================================================

@router.get("/{project_name}/data")
def load_bible(project_name: str):
    """Load all world settings for a project."""
    try:
        return service.load_bible(project_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
