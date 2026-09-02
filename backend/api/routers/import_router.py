"""
Import API Router
项目导入 - 解析原始剧本并创建项目
FastAPI routes for this stage.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Dict, Any, Optional
from services.import_service import ImportService
from services.project_service import ProjectService
from api.schemas import ImportParseRequest, ImportSaveRequest, ImportGenerateBibleRequest

router = APIRouter(prefix="/api/import", tags=["Import"])

# Service instances
import_service = ImportService()
project_service = ProjectService()


# =============================================================================
# PARSING
# =============================================================================

@router.post("/parse")
def parse_content(request: ImportParseRequest) -> dict:
    """解析原始剧本文本"""
    try:
        result = import_service.parse_content(request.content)
        preview = import_service.get_episodes_preview(result.get("episodes", []))
        
        return {
            "success": True,
            "episode_count": result.get("episode_count", 0),
            "header_content": result.get("header_content", ""),
            "episodes_preview": preview,
            "episodes": result.get("episodes", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse-file")
def parse_file(file: UploadFile = File(...)) -> dict:
    """解析上传的文件 (.docx, .txt, .md)"""
    try:
        MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB
        content = file.file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="文件过大（最大 20MB）")
        filename = file.filename or ""

        if filename.endswith(".docx"):
            result = import_service.parse_docx(content)
        else:
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="文件不是有效的 UTF-8 文本，请另存为 UTF-8 编码后重试")
            result = import_service.parse_content(text)
        
        preview = import_service.get_episodes_preview(result.get("episodes", []))
        
        return {
            "success": True,
            "filename": filename,
            "episode_count": result.get("episode_count", 0),
            "header_content": result.get("header_content", ""),
            "episodes_preview": preview,
            "episodes": result.get("episodes", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVING
# =============================================================================

@router.post("/save")
def save_episodes(request: ImportSaveRequest) -> dict:
    """保存解析结果到项目 (Stage 4/5/6)"""
    try:
        existing = project_service.list_projects()
        project_exists = any(p.get("name") == request.project_name for p in existing)
        
        # create_project returns the sanitized name, or use existing name if project exists
        if not project_exists:
            safe_name = project_service.create_project(request.project_name, "导入项目")
        else:
            safe_name = request.project_name
        
        # Use the sanitized name for saving
        success = import_service.save_to_stages(safe_name, request.episodes)
        
        if success:
            return {
                "success": True,
                "message": f"已保存 {len(request.episodes)} 集到 Stage 4/5/6",
                "project_name": safe_name  # Return the actual name used
            }
        else:
            raise HTTPException(status_code=500, detail="保存失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STORY BIBLE GENERATION
# =============================================================================

@router.post("/generate-bible")
def generate_story_bible(request: ImportGenerateBibleRequest) -> dict:
    """AI 生成 Story Bible ."""
    try:
        result = import_service.generate_story_bible(
            project_name=request.project_name
        )
        return {"success": True, "story_bible": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
