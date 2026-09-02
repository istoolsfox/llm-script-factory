"""
Stage 1 Service: Idea Incubation

Steps:
1. Synopsis Generation (concept → synopsis)
2. Rough Outline Generation (synopsis → 8-card outline)
3. Detailed Card Outlines (outline → detailed cards)
4. Concept Polish
"""
import os
from services.base import BaseService
from typing import Dict, Any, Optional


class Stage1Service(BaseService):
    """
    Service Controller for Stage 1: Idea Incubation.

    Step 1: Synopsis Generation (concept → synopsis)
    Step 2: Rough Outline Generation (synopsis → 8-card outline)
    """

    def __init__(self):
        super().__init__()

        # === Templates ===
        self.TMPL_SYS = "stage1/1_sys.j2"
        self.TMPL_DTG = "stage1/2_dtg.j2"

        # === Step-specific User Prompts ===
        self.TMPL_SYNOPSIS_USER = "stage1/3_synopsis_user.j2"
        self.TMPL_ROUGH_USER = "stage1/4_rough_user.j2"
        self.TMPL_DETAIL_USER = "stage1/5_detail_user.j2"
        self.TMPL_POLISH_USER = "stage1/6_polish_user.j2"

        # DTG Files
        self.DTG_FILES = [
            "dtgCore_2025_1222_0001.md",
            "dtgFramework_2025_1223_0001.md",
            "dtgModels_2025_1223_0001.md",
        ]

        # Schema for save validation (Step 3)
        self.SCHEMA_DETAILED_CARDS = "prompts/stage1/schema_step3.json"

        # API Response Schema for Step 3 (structured output enforcement)
        # Note: Simplified schema without 'description' fields for LLM compatibility
        self.RESPONSE_SCHEMA_DETAILED = {
            "type": "object",
            "properties": {
                "detailed_cards": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "card_id": {"type": "integer"},
                            "structure": {"type": "string"},
                            "story_units": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "unit_id": {"type": "integer"},
                                        "episodes": {"type": "string"},
                                        "pattern": {"type": "string"},
                                        "summary": {"type": "string"}
                                    },
                                    "required": ["unit_id", "episodes", "pattern", "summary"]
                                }
                            }
                        },
                        "required": ["card_id", "structure", "story_units"]
                    }
                }
            },
            "required": ["detailed_cards"]
        }

        # API Response Schema for Concept Polish (structured output enforcement)
        self.RESPONSE_SCHEMA_POLISH = {
            "type": "object",
            "properties": {
                "polished_concept": {"type": "string"}
            },
            "required": ["polished_concept"]
        }

    # =========================================================================
    # DTG Content Loader
    # =========================================================================
    def _prepare_dtg_content(self) -> str:
        """Load DTG content string."""
        return self.prompts.load_dtg_theory(branch="dtg/Distill-1", file_list=self.DTG_FILES)

    # =========================================================================
    # STEP 1: SYNOPSIS
    # =========================================================================

    def generate_synopsis(
        self,
        project_name: str,
        concept: str,
        temperature: float = 0.7
    ) -> Dict:
        """Generate synopsis (concept → synopsis)."""
        user_content = self.prompts.render(
            self.TMPL_SYNOPSIS_USER,
            concept=concept,
            full_context=""
        )

        # Save user input for later use (Step 2)
        self._save_user_input(project_name, concept)

        model_key, temperature = self.resolve_model_key(project_name, "stage1")

        dtg_raw = self._prepare_dtg_content()
        sys_content = self.prompts.render(self.TMPL_SYS)
        dtg_content = self.prompts.render(self.TMPL_DTG, full_context=dtg_raw)

        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=dtg_content,
            temperature=temperature,
            source="stage1/synopsis"
        )

    # =========================================================================
    # STEP 2: ROUGH OUTLINE
    # =========================================================================

    def generate_rough_outline(
        self,
        project_name: str,
        synopsis_data: Dict,
        concept: Optional[str] = None,
        temperature: float = 0.7
    ) -> Dict:
        """Generate rough outline (synopsis → 8-card outline)."""
        # Save user input if provided
        if concept is not None:
            self._save_user_input(project_name, concept)

        # Load user input for template
        user_input = self._load_user_input(project_name)
        concept_val = user_input.get("concept", "")

        user_content = self.prompts.render(
            self.TMPL_ROUGH_USER,
            prev_data=synopsis_data,
            concept=concept_val,
            full_context=""
        )

        model_key, temperature = self.resolve_model_key(project_name, "stage1")

        dtg_raw = self._prepare_dtg_content()
        sys_content = self.prompts.render(self.TMPL_SYS)
        dtg_content = self.prompts.render(self.TMPL_DTG, full_context=dtg_raw)

        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=dtg_content,
            temperature=temperature,
            source="stage1/rough"
        )

    # =========================================================================
    # STEP 3: DETAILED CARDS
    # =========================================================================

    def generate_detailed_cards(
        self,
        project_name: str,
        card_indices: list,
        concept: Optional[str] = None,
        detail_instruction: Optional[str] = None,
        temperature: float = 0.7
    ) -> Dict:
        """
        Generate detailed card outlines (Step 3).

        Args:
            card_indices: List of card indices (0-7) to generate, e.g. [0, 1] for cards 1-2
            concept: User input - core concept (optional, will save if provided)
            detail_instruction: User's custom instruction (highest priority)
        """
        # Save user input if provided
        if concept is not None:
            self._save_user_input(project_name, concept)

        # Load rough skeleton for context
        story_bible = self._load_story_bible(project_name)
        rough_skeleton = story_bible.get("rough_skeleton", [])
        if not rough_skeleton:
            raise ValueError("请先生成粗大纲 (Step 2)")

        # Load synopsis for context (Step 1 data)
        synopsis = story_bible.get("synopsis", {})

        # Load user input for template
        user_input = self._load_user_input(project_name)
        concept_val = user_input.get("concept", "")

        # Load existing detailed cards for incremental context
        existing_detailed = story_bible.get("detailed_cards", [])

        # Convert indices to card_ids (1-based)
        card_ids = [idx + 1 for idx in card_indices]

        user_content = self.prompts.render(
            self.TMPL_DETAIL_USER,
            card_ids=card_ids,
            concept=concept_val,
            detail_instruction=detail_instruction or "",
            synopsis=synopsis,
            rough_skeleton=rough_skeleton,
            existing_detailed_cards=existing_detailed if existing_detailed else None
        )

        model_key, temperature = self.resolve_model_key(project_name, "stage1")

        dtg_raw = self._prepare_dtg_content()
        sys_content = self.prompts.render(self.TMPL_SYS)
        dtg_content = self.prompts.render(self.TMPL_DTG, full_context=dtg_raw)

        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=dtg_content,
            temperature=temperature,
            source="stage1/detailed",
            response_schema=self.RESPONSE_SCHEMA_DETAILED
        )

    # =========================================================================
    # DATA PERSISTENCE
    # =========================================================================

    def _get_story_bible_path(self, project_name: str) -> str:
        """Get absolute path to story_bible.json for a project."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project {project_name} not found")
        return os.path.join(project_dir, "1_ideas/story_bible.json")

    def _load_story_bible(self, project_name: str) -> Dict:
        """Load existing story_bible.json or return empty dict."""
        try:
            path = self._get_story_bible_path(project_name)
            return self.files.load_json(path, default={})
        except ValueError:
            return {}

    def _save_story_bible(self, project_name: str, data: Dict) -> bool:
        """Save story_bible.json."""
        path = self._get_story_bible_path(project_name)
        return self.files.save_json(path, data)

    def save_synopsis(self, project_name: str, data: Dict) -> bool:
        """Save synopsis to story_bible.json (merged)."""
        story_bible = self._load_story_bible(project_name)
        story_bible["synopsis"] = data
        return self._save_story_bible(project_name, story_bible)

    def save_rough_outline(self, project_name: str, data: Dict) -> bool:
        """Save rough outline to story_bible.json (merged)."""
        story_bible = self._load_story_bible(project_name)
        story_bible["rough_skeleton"] = data.get("rough_skeleton", data)
        return self._save_story_bible(project_name, story_bible)

    def save_detailed_cards(self, project_name: str, data: Dict) -> bool:
        """
        Save detailed cards to story_bible.json (merged).
        Merges new cards with existing ones by card_id.
        If empty array is passed, clears all detailed_cards.
        """
        story_bible = self._load_story_bible(project_name)

        # Extract new cards from response
        new_cards = data.get("detailed_cards", data) if isinstance(data, dict) else data
        if not isinstance(new_cards, list):
            new_cards = [new_cards]

        # If empty array, clear all detailed cards
        if len(new_cards) == 0:
            story_bible["detailed_cards"] = []
            return self._save_story_bible(project_name, story_bible)

        # Validate new cards against schema before saving
        # Schema expects {"detailed_cards": [...]} structure
        valid, msg = self.files.validate_json({"detailed_cards": new_cards}, self.SCHEMA_DETAILED_CARDS)
        if not valid:
            raise ValueError(f"详细卡纲格式验证失败: {msg}")

        # Merge by card_id
        existing = story_bible.get("detailed_cards", [])
        existing_by_id = {c.get("card_id"): c for c in existing}
        for card in new_cards:
            card_id = card.get("card_id")
            if card_id:
                existing_by_id[card_id] = card

        # Sort by card_id and save
        merged = sorted(existing_by_id.values(), key=lambda c: int(c.get("card_id", 0)))
        story_bible["detailed_cards"] = merged
        return self._save_story_bible(project_name, story_bible)

    # =========================================================================
    # USER INPUT PERSISTENCE
    # =========================================================================

    def _get_user_input_path(self, project_name: str) -> str:
        """Get absolute path to user_input.json for a project."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project {project_name} not found")
        return os.path.join(project_dir, "1_ideas/user_input.json")

    def _save_user_input(self, project_name: str, concept: str) -> bool:
        """Save user input (concept only) to user_input.json."""
        path = self._get_user_input_path(project_name)
        data = {"concept": concept}
        return self.files.save_json(path, data)

    def _load_user_input(self, project_name: str) -> Dict:
        """Load user input from user_input.json."""
        try:
            path = self._get_user_input_path(project_name)
            return self.files.load_json(path, default={})
        except ValueError:
            return {}

    def load_stage1_data(self, project_name: str) -> Dict:
        """Load synopsis, outline, and user input from project files."""
        story_bible = self._load_story_bible(project_name)
        user_input = self._load_user_input(project_name)

        raw_skeleton = story_bible.get("rough_skeleton")
        if isinstance(raw_skeleton, dict) and "rough_skeleton" in raw_skeleton:
            skeleton_array = raw_skeleton.get("rough_skeleton")
        elif isinstance(raw_skeleton, list):
            skeleton_array = raw_skeleton
        else:
            skeleton_array = None

        return {
            "synopsis": story_bible.get("synopsis"),
            "outline": {"rough_skeleton": skeleton_array} if skeleton_array else None,
            "detailed_cards": story_bible.get("detailed_cards"),
            "user_input": user_input
        }

    # =========================================================================
    # CONCEPT POLISH
    # =========================================================================

    def polish_concept(
        self,
        project_name: str,
        concept: str,
        temperature: float = 0.7
    ) -> Dict:
        """Polish concept using AI. Returns JSON with polished_concept field."""
        # Load concept template as example
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "prompts", "stage1", "concept_template.md"
        )
        try:
            with open(template_path, "r", encoding="utf-8") as f:
                template_example = f.read()
        except FileNotFoundError:
            template_example = "(模板文件未找到)"

        user_content = self.prompts.render(
            self.TMPL_POLISH_USER,
            template_example=template_example,
            concept=concept
        )

        model_key, temperature = self.resolve_model_key(project_name, "stage1")

        dtg_raw = self._prepare_dtg_content()
        sys_content = self.prompts.render(self.TMPL_SYS)
        dtg_content = self.prompts.render(self.TMPL_DTG, full_context=dtg_raw)

        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=dtg_content,
            temperature=temperature,
            source="stage1/polish",
            response_schema=self.RESPONSE_SCHEMA_POLISH
        )
