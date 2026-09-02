"""
Stage 2 API Router: Structure & Outline
FastAPI routes for this stage.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from services.stage2_structure import Stage2Service
from api.schemas import (
    Stage2BatchGenerateRequest,
    Stage2BatchSaveRequest,
    Stage2EpisodeSaveRequest,
    Stage2RefineRequest
)

router = APIRouter(prefix="/api/stage2", tags=["stage2"])
service = Stage2Service()


# =============================================================================
# DATA LOADING
# =============================================================================

@router.get("/{project_name}/data")
def load_stage2_data(project_name: str):
    """Load all data needed for Stage 2 UI."""
    try:
        return service.load_stage2_data(project_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GENERATION
# =============================================================================

@router.post("/batch/generate")
def generate_batch(payload: Stage2BatchGenerateRequest):
    """Generate detailed outlines for a story unit ."""
    try:
        result = service.generate_batch(
            project_name=payload.project_name,
            card_index=payload.card_index,
            unit_index=payload.unit_index
        )
        return {"success": True, "data": {"episodes": result}}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/refine")
def refine_batch(payload: Stage2RefineRequest):
    """Refine existing outlines based on user adjustment instructions."""
    try:
        result = service.refine_batch(
            project_name=payload.project_name,
            card_index=payload.card_index,
            unit_index=payload.unit_index,
            existing_outlines=payload.existing_outlines,
            adjustment_instruction=payload.adjustment_instruction
        )
        return {"success": True, "data": {"episodes": result}}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVING
# =============================================================================

@router.post("/batch/save")
def save_batch(payload: Stage2BatchSaveRequest):
    """Save/update a batch of episodes (Upsert by ep_id)."""
    try:
        success = service.save_batch(
            project_name=payload.project_name,
            episodes=payload.episodes
        )
        return {
            "success": success, 
            "message": f"Batch saved ({len(payload.episodes)} episodes)"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/episode/save")
def save_episode(payload: Stage2EpisodeSaveRequest):
    """Save a single episode (Upsert by ep_id)."""
    try:
        success = service.save_episode(
            project_name=payload.project_name,
            episode=payload.episode
        )
        ep_id = payload.episode.get("ep_id", "?")
        return {"success": success, "message": f"Episode {ep_id} saved"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_name}/outlines")
def clear_all_outlines(project_name: str):
    """Clear all detailed outlines for a project."""
    try:
        success = service.clear_all_outlines(project_name)
        return {"success": success, "message": "All outlines cleared"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

