"""
Stage 2 Service: Structure & Outline
Refactored with clear cache logic separation.

Three operations:
1. build_cache() - Create cache, save to settings
2. generate_without_cache() - Full system + context + user
3. generate_with_cache() - User only, reuse cache
"""
import os
import json
from typing import List, Dict, Optional, Any
from services.base import BaseService


class Stage2Service(BaseService):
    """
    Service Controller for Stage 2: Structure & Outline.
    Converts rough 8-card skeleton into detailed 80-episode outlines.
    """
    
    def __init__(self):
        super().__init__()
        
        # === Prompt Templates ===
        self.TMPL_CONTEXT_SYS = "stage2/1_context_sys.j2"
        self.TMPL_OUTLINES_DTG = "stage2/2_outlines_dtg.j2"
        self.TMPL_INSTRUCTION_USER = "stage2/3_instruction_user.j2"
        self.TMPL_REFINE_USER = "stage2/4_refine_user.j2"  # Refine mode
        
        # Schema (for validation)
        self.SCHEMA_OUTLINE_BATCH = "prompts/stage2/schema_outline.json"
        
        # DTG Files
        self.DTG_FILES = [
            "dtgCore_2025_1222_0001.md",
            "dtgFramework_2025_1223_0001.md",
            "dtgModels_2025_1223_0001.md",
        ]
        
        # API Response Schema (for structured output enforcement)
        self.RESPONSE_SCHEMA = {
            "type": "object",
            "properties": {
                "episodes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ep_id": {"type": "integer"},
                            "title": {"type": "string"},
                            "outline": {"type": "string"},
                            "emotional_value": {"type": "string"},
                            "dtg_check": {"type": "string"}
                        },
                        "required": ["ep_id", "title", "outline"]
                    }
                }
            },
            "required": ["episodes"]
        }

    # =========================================================================
    # PATH HELPERS
    # =========================================================================
    def _get_outlines_path(self, project_name: str) -> str:
        """Get absolute path to detailed_outlines.json."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project '{project_name}' not found")
        return os.path.join(project_dir, "2_structure/detailed_outlines.json")

    def _get_story_bible_path(self, project_name: str) -> str:
        """Get absolute path to story_bible.json."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project '{project_name}' not found")
        return os.path.join(project_dir, "1_ideas/story_bible.json")

    def _load_user_input(self, project_name: str) -> str:
        """Load user input (concept) from Stage 1."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return ""
        path = os.path.join(project_dir, "1_ideas/user_input.json")
        data = self.files.load_json(path, default={})
        return data.get("concept", "")

    # =========================================================================
    # DTG CONTENT
    # =========================================================================
    def _prepare_dtg_content(self) -> str:
        """Load DTG theory content."""
        return self.prompts.load_dtg_theory(branch="dtg/Distill-1", file_list=self.DTG_FILES)

    # =========================================================================
    # CACHE BUILD
    # =========================================================================
    def build_cache(
        self, 
        model_key: str, 
        project_name: str, 
        ttl_seconds: int = 600
    ) -> str:
        """
        Build cache for Stage 2.
        
        Cache contains:
        - system_content: TMPL_CONTEXT_SYS (rendered)
        - context_contents: TMPL_OUTLINES_DTG with DTG + Story Bible (rendered)
        """
        # 1. Load Story Bible and User Input
        story_bible = self.load_story_bible(project_name)
        story_bible_str = json.dumps(story_bible, indent=2, ensure_ascii=False)
        user_input = self._load_user_input(project_name)
        
        # 2. Render prompts
        dtg_raw = self._prepare_dtg_content()
        sys_content = self.prompts.render(self.TMPL_CONTEXT_SYS, full_context="", story_bible="")
        dtg_content = self.prompts.render(
            self.TMPL_OUTLINES_DTG, 
            full_context=dtg_raw,
            story_bible=story_bible_str,
            user_input=user_input
        )
        
        # 3. Create cache via BaseService
        cache_name = self.ensure_cache(
            model_key=model_key,
            display_name=f"stage2_cache_{project_name}",
            system_content=sys_content,
            context_contents=[dtg_content],
            ttl_seconds=ttl_seconds
        )
        
        # 4. Save cache_name to project settings
        self._save_cache_to_settings(project_name, cache_name)
        
        return cache_name

    def _save_cache_to_settings(self, project_name: str, cache_name: str):
        """Save cache_name to project settings."""
        settings = self.projects.get_settings(project_name)
        if "stage2" not in settings:
            settings["stage2"] = {}
        settings["stage2"]["cacheName"] = cache_name
        self.projects.save_settings(project_name, settings)
        print(f"✅ Stage2 cache saved to settings: {cache_name}")

    # =========================================================================
    # GENERATION (dispatcher)
    # =========================================================================
    def generate_batch(
        self, 
        project_name: str,
        card_index: int,
        unit_index: int,
        model_key: Optional[str] = None,
        use_cache: bool = False,
        cache_name: Optional[str] = None,
        temperature: float = 0.7
    ) -> List[Dict]:
        """
        Generate detailed outlines for a story unit.
        Dispatches to cached or raw path based on settings.
        
        Args:
            card_index: Card index (0-7)
            unit_index: Story unit index (0-1 typically)
        """
        # 1. Load required data
        story_bible = self.load_story_bible(project_name)
        previous_outlines = self.load_outlines(project_name)
        
        # Get detailed cards (Step 3 data)
        detailed_cards = story_bible.get("detailed_cards", [])
        if not detailed_cards:
            raise ValueError("请先完成 Stage 1 Step 3 (详细卡纲)")
        
        if card_index >= len(detailed_cards):
            raise ValueError(f"Card index {card_index} out of range (total: {len(detailed_cards)})")
        
        card_data = detailed_cards[card_index]
        story_units = card_data.get("story_units", [])
        
        if unit_index >= len(story_units):
            raise ValueError(f"Unit index {unit_index} out of range (total: {len(story_units)})")
        
        unit_data = story_units[unit_index]
        
        # Parse episodes range - episodes field contains absolute ep_ids (e.g., "11-15")
        # NOT relative to card (the data from Stage 1 Step 3 is already absolute)
        episodes_str = unit_data.get("episodes", "1-5")
        ep_parts = episodes_str.replace(" ", "").split("-")
        start_ep = int(ep_parts[0])
        end_ep = int(ep_parts[1]) if len(ep_parts) > 1 else start_ep
        
        # 2. Prepare user prompt (always needed)
        # Get previous unit's generated episodes for context
        previous_unit = self._get_previous_unit_context(detailed_cards, card_index, unit_index)
        previous_episodes = self._get_previous_unit_episodes(project_name, detailed_cards, card_index, unit_index)
        
        user_content = self.prompts.render(
            self.TMPL_INSTRUCTION_USER,
            current_card=card_data,
            current_unit=unit_data,
            start_ep=start_ep,
            end_ep=end_ep,
            previous_unit=previous_unit,
            previous_episodes=previous_episodes
        )
        
        # 3. Get model from settings if not provided
        if not model_key:
            settings = self.projects.get_settings(project_name)
            stage_cfg = settings.get("stage2", {})
            model_key, temperature = self.resolve_model_key(project_name, "stage2")

            use_cache = stage_cfg.get("useCache", False)
            cache_name = stage_cfg.get("cacheName") if use_cache else None
        
        # 4. Dispatch
        if use_cache and cache_name:
            result = self._generate_batch_cached(model_key, user_content, cache_name, temperature)
        else:
            result = self._generate_batch_raw(model_key, user_content, story_bible, project_name, temperature)
        
        return self._normalize_result(result)
    
    def _generate_batch_cached(
        self, 
        model_key: str, 
        user_content: str, 
        cache_name: str,
        temperature: float
    ) -> Any:
        """Cached path: only user prompt, cache handles system + context."""
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            cache_name=cache_name,
            temperature=temperature,
            source="stage2/generate/cached",
            response_schema=self.RESPONSE_SCHEMA
        )
    
    def _generate_batch_raw(
        self, 
        model_key: str, 
        user_content: str,
        story_bible: Dict,
        project_name: str,
        temperature: float
    ) -> Any:
        """Raw path: full system + context + user."""
        story_bible_str = json.dumps(story_bible, indent=2, ensure_ascii=False)
        user_input = self._load_user_input(project_name)
        dtg_raw = self._prepare_dtg_content()
        
        sys_content = self.prompts.render(self.TMPL_CONTEXT_SYS, full_context="", story_bible="")
        dtg_content = self.prompts.render(
            self.TMPL_OUTLINES_DTG,
            full_context=dtg_raw,
            story_bible=story_bible_str,
            user_input=user_input
        )
        
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=dtg_content,
            temperature=temperature,
            source="stage2/generate/raw",
            response_schema=self.RESPONSE_SCHEMA
        )

    # =========================================================================
    # REFINE MODE (Adjustment)
    # =========================================================================
    def refine_batch(
        self,
        project_name: str,
        card_index: int,
        unit_index: int,
        existing_outlines: List[Dict],
        adjustment_instruction: str,
        model_key: Optional[str] = None,
        use_cache: bool = False,
        cache_name: Optional[str] = None,
        temperature: float = 0.7
    ) -> List[Dict]:
        """
        Refine existing outlines based on user adjustment instructions.
        Uses same cache as normal generation.
        
        Args:
            card_index: Card index (0-7)
            unit_index: Story unit index (0-1 typically)
        """
        # 1. Load required data
        story_bible = self.load_story_bible(project_name)
        previous_outlines = self.load_outlines(project_name)
        
        # Get detailed cards (Step 3 data)
        detailed_cards = story_bible.get("detailed_cards", [])
        if not detailed_cards:
            raise ValueError("请先完成 Stage 1 Step 3 (详细卡纲)")
        
        if card_index >= len(detailed_cards):
            raise ValueError(f"Card index {card_index} out of range (total: {len(detailed_cards)})")
        
        card_data = detailed_cards[card_index]
        story_units = card_data.get("story_units", [])
        
        if unit_index >= len(story_units):
            raise ValueError(f"Unit index {unit_index} out of range (total: {len(story_units)})")
        
        unit_data = story_units[unit_index]
        
        # Parse episodes range - episodes field contains absolute ep_ids
        episodes_str = unit_data.get("episodes", "1-5")
        ep_parts = episodes_str.replace(" ", "").split("-")
        start_ep = int(ep_parts[0])
        end_ep = int(ep_parts[1]) if len(ep_parts) > 1 else start_ep
        
        # 2. Get previous unit's generated episodes for context
        previous_unit = self._get_previous_unit_context(detailed_cards, card_index, unit_index)
        previous_episodes = self._get_previous_unit_episodes(project_name, detailed_cards, card_index, unit_index)
        
        # 3. Render user prompt with existing outlines and adjustment instruction
        user_content = self.prompts.render(
            self.TMPL_REFINE_USER,
            current_card=card_data,
            current_unit=unit_data,
            start_ep=start_ep,
            end_ep=end_ep,
            previous_unit=previous_unit,
            previous_episodes=previous_episodes,
            existing_outlines=existing_outlines,
            adjustment_instruction=adjustment_instruction
        )
        
        # 4. Get model from settings if not provided
        if not model_key:
            settings = self.projects.get_settings(project_name)
            stage_cfg = settings.get("stage2", {})
            model_key, temperature = self.resolve_model_key(project_name, "stage2")

            use_cache = stage_cfg.get("useCache", False)
            cache_name = stage_cfg.get("cacheName") if use_cache else None
        
        # 5. Dispatch (same paths as normal generation)
        if use_cache and cache_name:
            result = self._generate_batch_cached(model_key, user_content, cache_name, temperature)
        else:
            result = self._generate_batch_raw(model_key, user_content, story_bible, project_name, temperature)
        
        return self._normalize_result(result)

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def load_story_bible(self, project_name: str) -> Dict:
        """Load story bible from Stage 1."""
        path = self._get_story_bible_path(project_name)
        return self.files.load_json(path, default={})

    def load_outlines(self, project_name: str) -> List[Dict]:
        """Load existing detailed outlines."""
        path = self._get_outlines_path(project_name)
        return self.files.load_json(path, default=[])

    def load_stage2_data(self, project_name: str) -> Dict:
        """Load all data needed for Stage 2 UI."""
        story_bible = self.load_story_bible(project_name)
        outlines = self.load_outlines(project_name)
        
        rough_skeleton = story_bible.get("rough_skeleton", [])
        if isinstance(rough_skeleton, dict) and "rough_skeleton" in rough_skeleton:
            rough_skeleton = rough_skeleton["rough_skeleton"]
        
        total_cards = len(rough_skeleton) if isinstance(rough_skeleton, list) else 0
        total_episodes = total_cards * 10
        completed_episodes = len(outlines)
        
        completed_cards = 0
        for i in range(total_cards):
            start_ep = i * 10 + 1
            end_ep = (i + 1) * 10
            batch_count = len([ep for ep in outlines if start_ep <= ep.get("ep_id", 0) <= end_ep])
            if batch_count == 10:
                completed_cards += 1
        
        return {
            "story_bible": story_bible,
            "outlines": outlines,
            "progress": {
                "total_cards": total_cards,
                "completed_cards": completed_cards,
                "total_episodes": total_episodes,
                "completed_episodes": completed_episodes
            }
        }

    # =========================================================================
    # HELPERS
    # =========================================================================
    def _get_rearview_mirror(self, previous_outlines: List[Dict], current_start_ep: int) -> List[Dict]:
        """Get last 10 episodes before current batch for context continuity."""
        relevant = [ep for ep in previous_outlines if ep.get("ep_id", 0) < current_start_ep]
        sorted_prev = sorted(relevant, key=lambda x: x.get('ep_id', 0))
        return sorted_prev[-10:] if sorted_prev else []
    
    def _get_flat_unit_list(self, detailed_cards: List[Dict]) -> List[Dict]:
        """
        Flatten detailed_cards into a 1D list of units.
        Returns: [{"card_id", "unit_id", "summary", "pattern", "episodes"}, ...]
        """
        units = []
        for card in detailed_cards:
            card_id = card.get("card_id", 0)
            for unit in card.get("story_units", []):
                units.append({
                    "card_id": card_id,
                    "unit_id": unit.get("unit_id", 1),
                    "summary": unit.get("summary", ""),
                    "pattern": unit.get("pattern", ""),
                    "episodes": unit.get("episodes", "")
                })
        return units
    
    def _get_previous_unit_context(self, detailed_cards: List[Dict], card_index: int, unit_index: int) -> Optional[Dict]:
        """
        Get the previous unit's info for context continuity.
        - Card 1 Unit 1 → None (first unit)
        - Card 1 Unit 2 → Card 1 Unit 1
        - Card 2 Unit 1 → Card 1 Unit 2 (last unit of previous card)
        """
        flat_units = self._get_flat_unit_list(detailed_cards)
        
        # Find current unit's position in flat list
        current_card_id = card_index + 1  # 1-based
        current_unit_id = unit_index + 1  # 1-based
        
        current_idx = None
        for i, unit in enumerate(flat_units):
            if unit["card_id"] == current_card_id and unit["unit_id"] == current_unit_id:
                current_idx = i
                break
        
        if current_idx is None or current_idx == 0:
            return None  # First unit, no previous context
        
        return flat_units[current_idx - 1]
    
    def _get_previous_unit_episodes(self, project_name: str, detailed_cards: List[Dict], card_index: int, unit_index: int) -> List[Dict]:
        """
        Get the generated episode outlines for the previous unit.
        Returns actual generated content, not the summary from detailed_cards.
        """
        previous_unit = self._get_previous_unit_context(detailed_cards, card_index, unit_index)
        if not previous_unit:
            return []
        
        # Calculate episode range for previous unit
        # episodes field contains absolute ep_ids
        prev_episodes_str = previous_unit["episodes"]
        
        # Parse episode range (e.g., "11-15")
        ep_parts = prev_episodes_str.replace(" ", "").split("-")
        start_ep = int(ep_parts[0])
        end_ep = int(ep_parts[1]) if len(ep_parts) > 1 else start_ep
        
        # Load existing outlines and filter by episode range
        existing_outlines = self.load_outlines(project_name)
        previous_episodes = [
            ep for ep in existing_outlines 
            if start_ep <= ep.get("ep_id", 0) <= end_ep
        ]
        
        return sorted(previous_episodes, key=lambda x: x.get("ep_id", 0))

    def _normalize_result(self, result: Any) -> List[Dict]:
        """Normalize LLM result to ensure it's a list of episodes."""
        if isinstance(result, dict):
            if "episodes" in result:
                return result["episodes"]
            for v in result.values():
                if isinstance(v, list):
                    return v
            return [result]
        elif isinstance(result, list):
            return result
        return []

    # =========================================================================
    # SAVING
    # =========================================================================
    def save_batch(self, project_name: str, episodes: List[Dict]) -> bool:
        """Merge new batch into existing detailed_outlines.json (Upsert by ep_id)."""
        existing_data = self.load_outlines(project_name)
            
        data_map = {item['ep_id']: item for item in existing_data if 'ep_id' in item}
        for item in episodes:
            ep_id = item.get('ep_id')
            if ep_id:
                data_map[ep_id] = item
                
        merged_data = list(data_map.values())
        merged_data.sort(key=lambda x: x.get('ep_id', 0))
        
        valid, msg = self.files.validate_json(merged_data, self.SCHEMA_OUTLINE_BATCH)
        if not valid:
            raise ValueError(f"Schema validation failed: {msg}")
        
        path = self._get_outlines_path(project_name)
        return self.files.save_json(path, merged_data)

    def save_episode(self, project_name: str, episode: Dict) -> bool:
        """Save a single episode (Upsert by ep_id)."""
        return self.save_batch(project_name, [episode])

    def clear_all_outlines(self, project_name: str) -> bool:
        """
        Clear all detailed outlines for a project.
        Writes an empty array to detailed_outlines.json.
        """
        path = self._get_outlines_path(project_name)
        return self.files.save_json(path, [])
