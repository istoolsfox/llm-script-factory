"""
Version API Router: snapshot, list, view, restore, delete project versions.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.version_service import VersionService

router = APIRouter(prefix="/api/version", tags=["version"])

service = VersionService()


class SnapshotRequest(BaseModel):
    project_name: str
    tag: Optional[str] = "manual"


@router.post("/snapshot")
def create_snapshot(payload: SnapshotRequest):
    try:
        meta = service.snapshot(payload.project_name, tag=payload.tag)
        if not meta:
            raise HTTPException(status_code=404, detail="项目不存在")
        return {"success": True, "version": meta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_name}/list")
def list_versions(project_name: str):
    try:
        return {"versions": service.list_versions(project_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_name}/view")
def view_version(project_name: str, version_id: str, component: str):
    try:
        data = service.get_version_data(project_name, version_id, component)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_name}/restore")
def restore_version(project_name: str, version_id: str):
    try:
        service.restore_version(project_name, version_id)
        return {"success": True, "message": f"已恢复到版本 {version_id}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_name}/{version_id}")
def delete_version(project_name: str, version_id: str):
    try:
        service.delete_version(project_name, version_id)
        return {"success": True, "message": "版本已删除"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
