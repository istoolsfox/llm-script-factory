from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class ProjectBase(BaseModel):
    name: str

class ProjectCreate(ProjectBase):
    description: Optional[str] = ""

class ProjectItem(ProjectBase):
    path: str
    updated_at: str
    stages: Dict[str, bool]

class ProjectListResponse(BaseModel):
    projects: List[ProjectItem]

class UsageStats(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_est_usd: float

class SystemUsageResponse(BaseModel):
    today: UsageStats
    last_request: Optional[UsageStats]

class SettingsUpdate(BaseModel):
    settings: Dict[str, Any]

# --- Stage 1 Schemas ---

class SynopsisGenerateRequest(BaseModel):
    project_name: str
    concept: str


class ConceptPolishRequest(BaseModel):
    """Stage 1: Polish concept using AI"""
    project_name: str
    concept: str

class OutlineGenerateRequest(BaseModel):
    project_name: str
    synopsis_data: Dict[str, Any]
    concept: Optional[str] = None  # User input: core concept

class Stage1SaveRequest(BaseModel):
    project_name: str
    data: Dict[str, Any]


class DetailedGenerateRequest(BaseModel):
    """Stage 1 Step 3: Generate detailed card outlines"""
    project_name: str
    card_indices: List[int]  # Card indices (0-7), e.g. [0, 1] for cards 1-2
    concept: Optional[str] = None  # User input: core concept
    detail_instruction: Optional[str] = None  # User's custom instruction (highest priority)


# --- Stage 2-6 Common Schemas ---

class GenerateBatchRequest(BaseModel):
    """Request for batch generation (Stage 3-6)"""
    project: str
    start_ep: int
    end_ep: int


class SaveOutlinesRequest(BaseModel):
    """Save outlines (Stage 2, 3)"""
    project: str
    outlines: List[Dict[str, Any]]


class SaveScriptsRequest(BaseModel):
    """Save scripts (Stage 4, 5, 6)"""
    project: str
    scripts: List[Dict[str, Any]]


# --- Stage 2 Specific Schemas ---

class Stage2BatchGenerateRequest(BaseModel):
    """Stage 2: Generate batch with card and unit index"""
    project_name: str
    card_index: int      # 0-7 (卡片索引)
    unit_index: int      # 0-1 (故事单元索引)


class Stage2RefineRequest(BaseModel):
    """Stage 2: Refine batch with adjustment instructions"""
    project_name: str
    card_index: int
    unit_index: int
    existing_outlines: List[Dict[str, Any]]  # 已生成的大纲
    adjustment_instruction: str               # 用户调整指令


class Stage2BatchSaveRequest(BaseModel):
    """Stage 2: Save batch of episodes"""
    project_name: str
    episodes: List[Dict[str, Any]]


class Stage2EpisodeSaveRequest(BaseModel):
    """Stage 2: Save single episode"""
    project_name: str
    episode: Dict[str, Any]


# --- Stage 6 Specific Schemas ---

class Stage6RefineRequest(BaseModel):
    """Stage 6: Refine single episode"""
    project: str
    ep_id: int
    instruction: str
    custom_instruction: Optional[str] = ""  # User's detailed instruction (highest priority)
    current_script: str  # Text format


class Stage6SaveRequest(BaseModel):
    """Stage 6: Save single episode"""
    project: str
    ep_id: int
    content: str  # Text format


# --- Import Schemas ---

class ImportParseRequest(BaseModel):
    """Import: Parse raw content"""
    content: str


class ImportSaveRequest(BaseModel):
    """Import: Save parsed episodes to project"""
    project_name: str
    episodes: List[Dict[str, Any]]


class ImportGenerateBibleRequest(BaseModel):
    """Import: Generate Story Bible from scripts"""
    project_name: str
