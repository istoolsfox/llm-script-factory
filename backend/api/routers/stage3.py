"""
Stage 3 API Router: Scene Writer
FastAPI routes for this stage.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from services.stage3_script import Stage3Service
from services.project_service import ProjectService
from utils.file_manager import FileManager
from api.schemas import GenerateBatchRequest, SaveOutlinesRequest

router = APIRouter(prefix="/api/stage3", tags=["Stage3"])

# Service instances
stage3_service = Stage3Service()
project_service = ProjectService()


# --- Helper ---
def get_project_path(project_name: str, relative_path: str) -> str:
    """Get absolute path for a file in a project."""
    project_root = project_service.get_project_path(project_name)
    return f"{project_root}/{relative_path}"


# =============================================================================
# DATA LOADING
# =============================================================================

@router.get("/outlines")
def get_outlines(project: str) -> dict:
    """获取项目的集纲列表"""
    path = get_project_path(project, "3_scripts/episode_outlines.json")
    outlines = FileManager.load_json(path, default=[])
    return {"outlines": outlines, "count": len(outlines)}


@router.get("/s2-outlines")
def get_s2_outlines(project: str) -> dict:
    """获取 Stage 2 大纲（作为上下文参考）"""
    path = get_project_path(project, "2_structure/detailed_outlines.json")
    outlines = FileManager.load_json(path, default=[])
    return {"outlines": outlines, "count": len(outlines)}


# =============================================================================
# GENERATION
# =============================================================================

@router.post("/generate")
def generate_batch(request: GenerateBatchRequest) -> dict:
    """Generate batch of episode outlines ."""
    try:
        result = stage3_service.generate_batch(
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
def save_outlines(request: SaveOutlinesRequest) -> dict:
    """Save/update episode outlines (Upsert by ep_id)."""
    try:
        success = stage3_service.save_batch(
            project_name=request.project,
            new_batch=request.outlines
        )
        if success:
            return {"success": True, "message": f"已保存 {len(request.outlines)} 条集纲"}
        else:
            raise HTTPException(status_code=500, detail="保存失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_name}/scripts")
def clear_all_scripts(project_name: str):
    """Clear all episode outlines for a project."""
    try:
        success = stage3_service.clear_all_scripts(project_name)
        return {"success": success, "message": "All scripts cleared"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# EXPORT
# =============================================================================

@router.get("/export")
def export_docx(project: str) -> dict:
    """Export episode outlines to DOCX file."""
    try:
        file_path = stage3_service.export_docx(project_name=project)
        return {"success": True, "file_path": file_path}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
