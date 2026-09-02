"""
Settings API Router
管理 API Keys 和 Models 配置的路由
只负责路由转发，业务逻辑在 Service 层
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.api_key_service import ApiKeyService
from services.model_config_service import ModelConfigService


router = APIRouter(prefix="/api/settings", tags=["Settings"])


# ============================================================================
# Request Models
# ============================================================================

class SetKeyRequest(BaseModel):
    key_value: str


class ValidateKeyRequest(BaseModel):
    key_name: str
    key_value: str


class ModelConfigRequest(BaseModel):
    provider: str
    model_name: str
    api_key_env: str
    base_url: Optional[str] = None
    enable_thinking: Optional[bool] = None
    supports_json_schema: Optional[bool] = None
    description: Optional[str] = None
    pricing: Optional[dict] = None


# ============================================================================
# API Key Endpoints
# ============================================================================

@router.get("/keys")
def list_keys() -> dict:
    """获取所有 Key 配置状态"""
    keys = ApiKeyService.list_keys()
    return {"keys": keys}


@router.put("/keys/{key_name}")
def set_key(key_name: str, body: SetKeyRequest) -> dict:
    """设置/更新 Key"""
    result = ApiKeyService.set_key(key_name, body.key_value)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.delete("/keys/{key_name}")
def delete_key(key_name: str) -> dict:
    """删除 Key"""
    result = ApiKeyService.delete_key(key_name)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.post("/keys/reset")
def reset_keys() -> dict:
    """恢复默认 Key 配置"""
    result = ApiKeyService.reset_to_default()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result


@router.post("/keys/validate")
def validate_key(body: ValidateKeyRequest) -> dict:
    """验证 Key 有效性"""
    return ApiKeyService.validate_key(body.key_name, body.key_value)


# ============================================================================
# Model Endpoints
# ============================================================================

@router.get("/models")
def list_models() -> dict:
    """获取所有模型配置"""
    models = ModelConfigService.list_models()
    return {"models": models}


@router.get("/models/{model_id}")
def get_model(model_id: str) -> dict:
    """获取单个模型配置"""
    model = ModelConfigService.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    return model


@router.post("/models/{model_id}")
def create_model(model_id: str, body: ModelConfigRequest) -> dict:
    """新增模型"""
    config = body.model_dump(exclude_none=True)
    result = ModelConfigService.create_model(model_id, config)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.put("/models/{model_id}")
def update_model(model_id: str, body: ModelConfigRequest) -> dict:
    """更新模型"""
    config = body.model_dump(exclude_none=True)
    result = ModelConfigService.update_model(model_id, config)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.delete("/models/{model_id}")
def delete_model(model_id: str) -> dict:
    """删除模型"""
    result = ModelConfigService.delete_model(model_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@router.post("/models/reset")
def reset_models() -> dict:
    """恢复默认模型配置"""
    result = ModelConfigService.reset_to_default()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    return result
