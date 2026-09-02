"""
Stage 6 API Router: Script Doctor
FastAPI routes for this stage.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from services.stage6_doctor import Stage6Service
from services.stage5_polisher import Stage5Service
from services.project_service import ProjectService
from utils.file_manager import FileManager
from api.schemas import Stage6RefineRequest, Stage6SaveRequest
import json
import os

router = APIRouter(prefix="/api/stage6", tags=["Stage6"])

# Service instances
stage6_service = Stage6Service()
stage5_service = Stage5Service()
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
    """获取 Stage 6 剧本列表"""
    scripts = stage6_service.load_scripts(project)
    return {"scripts": scripts, "count": len(scripts)}


@router.get("/s5-scripts")
def get_s5_scripts(project: str) -> dict:
    """获取 Stage 5 剧本 (源)"""
    path = get_project_path(project, "5_scripts/refined_scripts.json")
    scripts = FileManager.load_json(path, default=[])
    return {"scripts": scripts, "count": len(scripts)}


@router.get("/instructions")
def get_instructions() -> dict:
    """获取预设润色指令列表"""
    try:
        instructions_path = os.path.join(
            os.path.dirname(__file__), 
            "../../prompts/stage6/refine_instructions.json"
        )
        with open(instructions_path, "r", encoding="utf-8") as f:
            instructions = json.load(f)
        return {"instructions": instructions}
    except Exception as e:
        return {"instructions": [
            {"label": "默认润色", "prompt": "优化台词和镜头，保持原意"},
            {"label": "增强爽感", "prompt": "加强冲突和情绪爆发点"},
            {"label": "精简台词", "prompt": "删除水词，让台词更口语化"}
        ]}


# =============================================================================
# ANALYZE & REFINE
# =============================================================================

@router.post("/analyze")
def analyze_episode(project: str, ep_id: int, current_script: str) -> dict:
    """单集六维分析 ."""
    try:
        result = stage6_service.analyze_episode(
            project_name=project,
            current_script=current_script
        )
        return {"success": True, "analysis": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refine")
def refine_episode(request: Stage6RefineRequest) -> dict:
    """单集定向润色 ."""
    # Load prev/next episode summaries for context
    all_scripts = stage6_service.load_scripts(request.project)
    current_idx = next((i for i, ep in enumerate(all_scripts) if ep.get('ep_id') == request.ep_id), -1)
    
    prev_summary = ""
    next_summary = ""
    if current_idx > 0:
        prev_summary = stage6_service.format_script_to_text(all_scripts[current_idx - 1])
    if current_idx < len(all_scripts) - 1:
        next_summary = stage6_service.format_script_to_text(all_scripts[current_idx + 1])
    
    try:
        result = stage6_service.refine_episode(
            project_name=request.project,
            current_script=request.current_script,
            instruction=request.instruction,
            custom_instruction=request.custom_instruction or "",
            prev_summary=prev_summary,
            next_summary=next_summary
        )
        
        # Convert to text for frontend
        result_text = stage6_service.format_script_to_text(result)
        
        return {"success": True, "refined_text": result_text, "refined_json": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVING
# =============================================================================

@router.post("/save")
def save_script(request: Stage6SaveRequest) -> dict:
    """保存单集剧本"""
    try:
        ep_data = stage6_service.parse_text_to_script(request.content, request.ep_id)
        success = stage6_service.save_final_script(request.project, ep_data)
        if success:
            return {"success": True, "message": f"第 {request.ep_id} 集已保存"}
        else:
            raise HTTPException(status_code=500, detail="保存失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_name}/scripts")
def clear_all_scripts(project_name: str):
    """Clear all final scripts for a project."""
    try:
        success = stage6_service.clear_all_scripts(project_name)
        return {"success": success, "message": "All scripts cleared"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/copy-from-s5")
def copy_from_s5(project: str) -> dict:
    """Copy Stage 5 scripts to Stage 6 (reset/initialize)."""
    try:
        result = stage6_service.copy_from_s5(project)
        return {"success": True, "message": f"已从 Stage 5 拷贝 {result['count']} 集到 Stage 6"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-needs-init")
def check_needs_init(project: str) -> dict:
    """Check if Stage 6 needs initialization from Stage 5."""
    try:
        return stage6_service.check_needs_init(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Keep /reset as alias for backwards compatibility
@router.post("/reset")
def reset_from_s5(project: str) -> dict:
    """从 Stage 5 重置所有剧本 (alias for copy-from-s5)"""
    result = stage6_service.copy_from_s5(project)
    return {"success": True, "message": f"已从 Stage 5 拷贝 {result['count']} 集到 Stage 6"}


# =============================================================================
# EXPORT
# =============================================================================

@router.get("/export-docx")
def export_docx(project: str):
    """导出 Stage 6 剧本为 DOCX 文件（保存到项目目录）"""
    try:
        scripts = stage6_service.load_scripts(project)
        if not scripts:
            raise HTTPException(status_code=400, detail="没有可导出的剧本")
        
        # 复用 Stage5Service 的 export_docx 方法，输出到 Stage 6 目录
        out_path = stage5_service.export_docx(project, scripts, output_subfolder="6_doctor")
        
        return {"success": True, "path": out_path, "message": f"已导出到: {out_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
