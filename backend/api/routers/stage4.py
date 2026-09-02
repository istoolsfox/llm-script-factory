"""
Stage 4 API Router: Script Writer
FastAPI routes for this stage.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from services.stage4_writer import Stage4Service
from services.project_service import ProjectService
from utils.file_manager import FileManager
from api.schemas import GenerateBatchRequest, SaveScriptsRequest

router = APIRouter(prefix="/api/stage4", tags=["Stage4"])

# Service instances
stage4_service = Stage4Service()
project_service = ProjectService()


# --- Helper ---
def get_project_path(project_name: str, relative_path: str) -> str:
    """Get absolute path for a file in a project."""
    project_root = project_service.get_project_path(project_name)
    return f"{project_root}/{relative_path}"


# =============================================================================
# DATA LOADING
# =============================================================================

@router.get("/scripts")
def get_scripts(project: str) -> dict:
    """获取已生成的剧本列表"""
    path = get_project_path(project, "4_scripts/script_drafts.json")
    scripts = FileManager.load_json(path, default=[])
    return {"scripts": scripts, "count": len(scripts)}


@router.get("/s3-outlines")
def get_s3_outlines(project: str) -> dict:
    """获取 Stage 3 集纲 (作为生成输入)"""
    path = get_project_path(project, "3_scripts/episode_outlines.json")
    outlines = FileManager.load_json(path, default=[])
    return {"outlines": outlines, "count": len(outlines)}


# =============================================================================
# GENERATION
# =============================================================================

@router.post("/generate")
def generate_batch(request: GenerateBatchRequest) -> dict:
    """Generate batch of scripts ."""
    try:
        result = stage4_service.generate_batch(
            project_name=request.project,
            start_ep=request.start_ep,
            end_ep=request.end_ep
        )
        return {"success": True, "episodes": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVING
# =============================================================================

@router.post("/save")
def save_scripts(request: SaveScriptsRequest) -> dict:
    """Save/update scripts (Upsert by ep_id)."""
    try:
        success = stage4_service.save_batch(
            project_name=request.project,
            new_batch=request.scripts
        )
        if success:
            return {"success": True, "message": f"已保存 {len(request.scripts)} 集剧本"}
        else:
            raise HTTPException(status_code=500, detail="保存失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_name}/scripts")
def clear_all_scripts(project_name: str):
    """Clear all script drafts for a project."""
    try:
        success = stage4_service.clear_all_scripts(project_name)
        return {"success": success, "message": "All scripts cleared"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
