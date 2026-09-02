"""
Stage 4 Service: Script Writer
Refactored with clear cache logic separation.

Three operations:
1. build_cache() - Create cache, save to settings
2. generate_without_cache() - Full system + context + user
3. generate_with_cache() - User only, reuse cache
"""
import os
import json
import re
from typing import List, Dict, Optional, Any, Union
from services.base import BaseService


class Stage4Service(BaseService):
    """
    Service Controller for Stage 4: Script Writer.
    Converts Stage 3 episode outlines into full script drafts.
    """
    
    def __init__(self):
        super().__init__()
        
        # === Prompt Templates ===
        self.TMPL_SYS = "stage4/1_format_sys.j2"
        self.TMPL_EXAMPLES = "stage4/2_examples_dtg.j2"
        self.TMPL_USER = "stage4/3_refine_user.j2"
        
        # Schema
        self.SCHEMA_SCRIPT = "prompts/stage4/schema_refined_script.json"

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
        Build cache for Stage 4.
        
        Cache contains:
        - system_content: TMPL_SYS (rendered)
        - context_contents: TMPL_EXAMPLES with Story Bible (rendered)
        """
        # 1. Load Story Bible and User Input
        story_bible = self._load_story_bible(project_name)
        story_bible_str = self._get_bible_text(story_bible)
        user_input = self._load_user_input(project_name)
        
        # 2. Render prompts
        sys_content = self.prompts.render(self.TMPL_SYS)
        examples_content = self.prompts.render(self.TMPL_EXAMPLES, story_bible=story_bible_str, user_input=user_input)
        
        # 3. Create cache via BaseService
        cache_name = self.ensure_cache(
            model_key=model_key,
            display_name=f"stage4_cache_{project_name}",
            system_content=sys_content,
            context_contents=[examples_content],
            ttl_seconds=ttl_seconds
        )
        
        # 4. Save cache_name to project settings
        self._save_cache_to_settings(project_name, cache_name)
        
        return cache_name

    def _save_cache_to_settings(self, project_name: str, cache_name: str):
        """Save cache_name to project settings."""
        settings = self.projects.get_settings(project_name)
        if "stage4" not in settings:
            settings["stage4"] = {}
        settings["stage4"]["cacheName"] = cache_name
        self.projects.save_settings(project_name, settings)
        print(f"✅ Stage4 cache saved to settings: {cache_name}")

    # =========================================================================
    # GENERATION (dispatcher)
    # =========================================================================
    def generate_batch(
        self, 
        project_name: str,
        start_ep: int, 
        end_ep: int,
        model_key: Optional[str] = None,
        use_cache: bool = False,
        cache_name: Optional[str] = None,
        temperature: float = 0.3
    ) -> List[Dict]:
        """
        Generate full scripts for a batch.
        Dispatches to cached or raw path based on settings.
        """
        # 1. Load required data
        story_bible = self._load_story_bible(project_name)
        story_bible_str = self._get_bible_text(story_bible)
        s3_outlines = self._load_s3_outlines(project_name)
        
        # Filter to requested range
        batch_outlines = [ep for ep in s3_outlines if start_ep <= ep.get('ep_id', 0) <= end_ep]
        if not batch_outlines:
            raise ValueError(f"No Stage 3 outlines found for episodes {start_ep}-{end_ep}")
        
        # 2. Prepare user prompt (always needed)
        registry = self._load_registry(project_name)
        status_list = self._format_character_status(registry, story_bible_str)
        raw_text_block = self._format_raw_scripts(batch_outlines)
        
        # Get prev/next 3 outlines for context
        prev_3 = [ep for ep in s3_outlines if ep.get('ep_id', 0) < start_ep]
        prev_3 = sorted(prev_3, key=lambda x: x.get('ep_id', 0))[-3:]
        next_3 = [ep for ep in s3_outlines if ep.get('ep_id', 0) > end_ep]
        next_3 = sorted(next_3, key=lambda x: x.get('ep_id', 0))[:3]
        
        prev_3_str = self._format_raw_scripts(prev_3) if prev_3 else ""
        next_3_str = self._format_raw_scripts(next_3) if next_3 else ""
        
        user_content = self.prompts.render(
            self.TMPL_USER,
            raw_script=raw_text_block,
            character_status_list=status_list,
            prev_3_outlines=prev_3_str,
            next_3_outlines=next_3_str
        )
        
        # 3. Get model from settings if not provided
        if not model_key:
            settings = self.projects.get_settings(project_name)
            stage_cfg = settings.get("stage4", {})
            model_key, temperature = self.resolve_model_key(project_name, "stage4")
            use_cache = stage_cfg.get("useCache", False)
            cache_name = stage_cfg.get("cacheName") if use_cache else None
        
        # 4. Dispatch
        if use_cache and cache_name:
            result = self._generate_batch_cached(model_key, user_content, cache_name, temperature)
        else:
            result = self._generate_batch_raw(model_key, user_content, story_bible_str, project_name, temperature)
        
        # 5. Post-process (update registry)
        self._update_registry_from_response(project_name, result)
        
        return self._normalize_result(result, batch_outlines)
    
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
            source="stage4/generate/cached"
        )
    
    def _generate_batch_raw(
        self, 
        model_key: str, 
        user_content: str,
        story_bible_str: str,
        project_name: str,
        temperature: float
    ) -> Any:
        """Raw path: full system + context + user."""
        user_input = self._load_user_input(project_name)
        sys_content = self.prompts.render(self.TMPL_SYS)
        examples_content = self.prompts.render(self.TMPL_EXAMPLES, story_bible=story_bible_str, user_input=user_input)
        
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=examples_content,
            temperature=temperature,
            source="stage4/generate/raw"
        )

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def _load_story_bible(self, project_name: str) -> Dict:
        """Load story bible from Stage 1."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "1_ideas/story_bible.json")
        return self.files.load_json(path, default={})

    def _get_bible_text(self, story_bible: Dict) -> str:
        """Extract raw_content from story bible."""
        if isinstance(story_bible, dict):
            return story_bible.get("raw_content", json.dumps(story_bible, ensure_ascii=False))
        return ""

    def _load_user_input(self, project_name: str) -> str:
        """Load user input (concept) from Stage 1."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return ""
        path = os.path.join(project_dir, "1_ideas/user_input.json")
        data = self.files.load_json(path, default={})
        return data.get("concept", "")

    def _load_s3_outlines(self, project_name: str) -> List[Dict]:
        """Load Stage 3 outlines."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "3_scripts/episode_outlines.json")
        return self.files.load_json(path, default=[])

    def _load_registry(self, project_name: str) -> Dict:
        """Load character appearance registry."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "4_scripts/character_registry.json")
        return self.files.load_json(path, default={})

    def _save_registry(self, project_name: str, registry: Dict) -> bool:
        """Save character appearance registry."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "4_scripts/character_registry.json")
        return self.files.save_json(path, registry)

    # =========================================================================
    # HELPERS
    # =========================================================================
    def _format_character_status(self, registry: Dict, story_bible: str) -> str:
        """Generate the status list for the prompt."""
        all_chars = self._extract_chars_from_bible(story_bible)
        lines = []
        for name, first_ep in registry.items():
            lines.append(f"{name}：第{first_ep}集出场，无需介绍字幕")
        for name in all_chars:
            if name not in registry:
                lines.append(f"{name}：未出场，请只在他出现的第一集增加介绍字幕。")
        if not lines:
            return "（暂无角色记录，请对所有首次出场的重要角色添加字幕）"
        return "\n".join(lines)

    def _extract_chars_from_bible(self, story_bible: str) -> List[str]:
        """Extract character names from Story Bible text."""
        if not story_bible: return []
        names = set()
        matches = re.findall(r'(?:人物|角色)[:：]\s*([^\n]+)', story_bible)
        for m in matches:
            clean = re.split(r'[（(]', m)[0].strip()
            if clean: names.add(clean)
        return list(names)

    def _format_raw_scripts(self, raw_scripts: List[Dict]) -> str:
        """Serialize Stage 3 outlines for Prompt."""
        text_block = ""
        for ep in raw_scripts:
            eid = ep.get('ep_id', '?')
            text_block += f"\n--- 第 {eid} 集 ---\n"
            
            if 'scenes' in ep:
                for sc in ep['scenes']:
                    sid = sc.get('scene_id', '')
                    loc = sc.get('location', '')
                    content = sc.get('content', '')
                    text_block += f"\n{sid}"
                    if loc: text_block += f" {loc}"
                    text_block += f"\n{content}\n"
                    
                hook = ep.get('hook', '')
                if hook:
                    text_block += f"\n【卡点】{hook}\n"
            elif 'content' in ep:
                text_block += f"{ep['content']}\n"
                
        return text_block

    def _update_registry_from_response(self, project_name: str, response_data: Any):
        """Update the registry with new appearances from this batch."""
        if isinstance(response_data, dict):
            new_apps = response_data.get("new_appearances", [])
            if not new_apps: return
            
            registry = self._load_registry(project_name)
            updated = False
            for app in new_apps:
                name = app.get("name")
                ep_id = app.get("ep_id")
                if name and name not in registry:
                    registry[name] = ep_id
                    updated = True
            if updated:
                self._save_registry(project_name, registry)

    def _normalize_result(self, result: Any, original_batch: List[Dict]) -> List[Dict]:
        """Normalize LLM result to ensure it's a list of episodes."""
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            if "episodes" in result:
                return result["episodes"]
            for v in result.values():
                if isinstance(v, list):
                    return v
            return [result]
        return original_batch

    # =========================================================================
    # SAVING
    # =========================================================================
    def save_batch(self, project_name: str, new_batch: List[Dict]) -> bool:
        """Merge and save to 4_scripts/script_drafts.json."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "4_scripts/script_drafts.json")
        
        # 1. Load existing
        existing_data = self.files.load_json(path, default=[])
        
        # 2. Merge (Upsert by ep_id)
        data_map = {item['ep_id']: item for item in existing_data if 'ep_id' in item}
        for item in new_batch:
            if 'ep_id' in item:
                data_map[item['ep_id']] = item
                
        merged = list(data_map.values())
        merged.sort(key=lambda x: x.get('ep_id', 0))
        
        # 3. Save
        return self.files.save_json(path, merged)

    def clear_all_scripts(self, project_name: str) -> bool:
        """
        Clear all script drafts for a project.
        Writes an empty array to 4_scripts/script_drafts.json.
        Also clears character_registry.json.
        """
        project_dir = self.projects.get_project_path(project_name)
        scripts_path = os.path.join(project_dir, "4_scripts/script_drafts.json")
        registry_path = os.path.join(project_dir, "4_scripts/character_registry.json")
        
        # Clear both files
        self.files.save_json(scripts_path, [])
        self.files.save_json(registry_path, {})
        return True
