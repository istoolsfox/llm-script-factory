"""
Rewrite API Router (洗稿): extract reference-script core, generate reskinned story.
"""
from fastapi import APIRouter, HTTPException
from services.rewrite_service import RewriteService
from api.schemas import RewriteExtractRequest, RewriteGenerateRequest

router = APIRouter(prefix="/api/rewrite", tags=["rewrite"])
service = RewriteService()


@router.post("/extract")
def extract(payload: RewriteExtractRequest):
    """从参考剧本提炼核心故事/卖点/看点/人物原型/节奏结构。"""
    try:
        analysis = service.extract(payload.project_name, payload.script_text)
        return {"success": True, "data": analysis}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
def generate(payload: RewriteGenerateRequest):
    """基于提炼结果换皮生成全新故事概念。"""
    try:
        result = service.generate(payload.project_name, payload.instruction)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_name}/data")
def load_rewrite(project_name: str):
    """加载洗稿历史数据（提炼结果 + 上次生成结果）。"""
    return service.load_rewrite(project_name)
