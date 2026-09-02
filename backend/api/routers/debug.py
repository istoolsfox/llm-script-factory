"""
Debug Console API Router
只负责转发，业务逻辑在 DebugManager
"""
from fastapi import APIRouter
from utils.debug_manager import DebugManager

router = APIRouter(prefix="/api/debug", tags=["Debug"])


@router.get("/dates")
def get_available_dates() -> dict:
    """获取可用的日志日期列表"""
    return {"dates": DebugManager.get_available_dates()}


@router.get("/logs/{date}")
def get_logs_by_date(date: str, errors_only: bool = False) -> dict:
    """获取指定日期的日志"""
    return DebugManager.get_logs_with_stats(date, errors_only)
