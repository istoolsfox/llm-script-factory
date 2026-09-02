"""
Stage 1 API Router: Idea Incubation
FastAPI routes for this stage.
"""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from services.stage1_idea import Stage1Service
from api.schemas import (
    SynopsisGenerateRequest,
    OutlineGenerateRequest,
    Stage1SaveRequest,
    DetailedGenerateRequest,
    ConceptPolishRequest
)

router = APIRouter(prefix="/api/stage1", tags=["stage1"])
service = Stage1Service()

# Path to prompts directory
PROMPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "prompts", "stage1")


# =============================================================================
# TEMPLATE ENDPOINT
# =============================================================================

@router.get("/concept-template")
def get_concept_template():
    """Load the default concept template markdown file."""
    template_path = os.path.join(PROMPTS_DIR, "concept_template.md")
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            content = f.read()
        return PlainTextResponse(content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Template not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GENERATION ENDPOINTS
# =============================================================================

@router.post("/synopsis/generate")
def generate_synopsis(payload: SynopsisGenerateRequest):
    """Generate synopsis ."""
    try:
        result = service.generate_synopsis(
            project_name=payload.project_name,
            concept=payload.concept
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outline/generate")
def generate_outline(payload: OutlineGenerateRequest):
    """Generate rough outline ."""
    try:
        result = service.generate_rough_outline(
            project_name=payload.project_name,
            synopsis_data=payload.synopsis_data,
            concept=payload.concept
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/concept/polish")
def polish_concept(payload: ConceptPolishRequest):
    """Polish concept using AI ."""
    try:
        result = service.polish_concept(
            project_name=payload.project_name,
            concept=payload.concept
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SAVE ENDPOINTS
# =============================================================================

@router.post("/user-input/save")
def save_user_input(payload: SynopsisGenerateRequest):
    """Save user input (concept) to user_input.json."""
    try:
        service._save_user_input(payload.project_name, payload.concept)
        return {"success": True, "message": "User input saved"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/synopsis/save")
def save_synopsis(payload: Stage1SaveRequest):
    """Save synopsis to story_bible.json."""
    try:
        service.save_synopsis(payload.project_name, payload.data)
        return {"success": True, "message": "Synopsis saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outline/save")
def save_outline(payload: Stage1SaveRequest):
    """Save rough outline to story_bible.json."""
    try:
        service.save_rough_outline(payload.project_name, payload.data)
        return {"success": True, "message": "Outline saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# STEP 3: DETAILED CARDS ENDPOINTS
# =============================================================================

@router.post("/detailed/generate")
def generate_detailed(payload: DetailedGenerateRequest):
    """Generate detailed card outlines (Step 3)."""
    try:
        result = service.generate_detailed_cards(
            project_name=payload.project_name,
            card_indices=payload.card_indices,
            concept=payload.concept,
            detail_instruction=payload.detail_instruction
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detailed/save")
def save_detailed(payload: Stage1SaveRequest):
    """Save detailed cards to story_bible.json."""
    try:
        service.save_detailed_cards(payload.project_name, payload.data)
        return {"success": True, "message": "Detailed cards saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# LOAD ENDPOINT
# =============================================================================

@router.get("/{project_name}/data")
def load_stage1_data(project_name: str):
    """Load synopsis and outline from story_bible.json."""
    return service.load_stage1_data(project_name)
