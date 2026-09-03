"""
Chat API Router: AI 对话修改（按目标修订当前数据，自动保存 + 版本快照）
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.chat_revise_service import ChatReviseService

router = APIRouter(prefix="/api/chat", tags=["chat"])
service = ChatReviseService()


class ChatReviseRequest(BaseModel):
    project_name: str
    target: str  # synopsis | rough_outline | detailed_cards | characters_rel | world_bible | stage2_unit
    instruction: str
    card_index: int | None = None   # target=stage2_unit 时必填
    unit_index: int | None = None


@router.post("/revise")
def revise(payload: ChatReviseRequest):
    """根据用户意见直接修改目标数据块，修订前自动快照。"""
    try:
        result = service.revise(payload.project_name, payload.target, payload.instruction,
                                payload.card_index, payload.unit_index)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
