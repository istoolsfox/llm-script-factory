"""
ImportService - Handle project import workflow
Refactored with clear cache logic separation.

Cache Structure:
- system_content: 1_sys_reverse.j2 (system prompt)
- context_contents: Imported scripts summary

Operations:
1. build_cache() - Create cache with sys + scripts, save to settings
2. generate_without_cache() - Full sys + scripts + user
3. generate_with_cache() - User only, reuse cache
"""
import os
import json
from typing import List, Dict, Any, Optional
from services.base import BaseService
from utils.script_parser import ScriptParser
from utils.docx_parser import DocxParser


class ImportService(BaseService):
    """项目导入服务"""
    
    def __init__(self):
        super().__init__()
        
        # === Prompt Templates ===
        self.TMPL_SYS = "import/1_sys_reverse.j2"
        self.TMPL_USER = "import/2_generate_bible.j2"
    
    # =========================================================================
    # Phase 1: Parse Raw Content
    # =========================================================================
    def parse_content(self, content: str) -> Dict[str, Any]:
        """
        解析原始剧本内容
        
        Returns:
            {
                "header_content": "第1集之前的内容",
                "episodes": [...],
                "episode_count": 80
            }
        """
        result = ScriptParser.parse_raw_text(content)
        result["episode_count"] = len(result.get("episodes", []))
        return result
    
    def parse_docx(self, file_content: bytes) -> Dict[str, Any]:
        """解析 .docx 文件"""
        text = DocxParser.extract_text_from_bytes(file_content)
        return self.parse_content(text)
    
    # =========================================================================
    # Phase 1: Save to Stages 4/5/6
    # =========================================================================
    def save_to_stages(
        self, 
        project_name: str, 
        episodes: List[Dict[str, Any]]
    ) -> bool:
        """将解析后的剧集保存到 Stage 4/5/6"""
        formatted = ScriptParser.format_episodes_for_save(episodes)
        project_root = os.path.join(self.projects.root_dir, project_name)
        
        paths = [
            os.path.join(project_root, "4_scripts", "script_drafts.json"),
            os.path.join(project_root, "5_scripts", "refined_scripts.json"),
            os.path.join(project_root, "6_scripts", "final_scripts.json")
        ]
        
        for path in paths:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(formatted, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Saved {len(formatted)} episodes to Stage 4/5/6")
        return True
    
    # =========================================================================
    # CACHE BUILD
    # =========================================================================
    def build_cache(
        self, 
        model_key: str, 
        project_name: str, 
        ttl_seconds: int = 3600  # 1 hour default for import (large context)
    ) -> str:
        """
        Build cache for Import Bible Generation.
        
        Cache contains:
        - system_content: TMPL_SYS (reverse engineering prompt)
        - context_contents: All imported scripts (can be 20k+ tokens)
        """
        # 1. Load Stage 4 scripts
        episodes = self._load_stage4_scripts(project_name)
        if not episodes:
            raise ValueError("Stage 4 scripts not found. Please import scripts first.")
        
        # 2. Prepare scripts summary for caching
        scripts_summary = self._prepare_scripts_summary(episodes)
        
        # 3. Render prompts
        sys_content = self.prompts.render(self.TMPL_SYS)
        
        # 4. Create cache via BaseService
        cache_name = self.ensure_cache(
            model_key=model_key,
            display_name=f"import_cache_{project_name}",
            system_content=sys_content,
            context_contents=[scripts_summary],
            ttl_seconds=ttl_seconds
        )
        
        # 5. Save cache_name to project settings
        self._save_cache_to_settings(project_name, cache_name)
        
        return cache_name

    def _prepare_scripts_summary(self, episodes: List[Dict]) -> str:
        """Prepare scripts content for caching (as context)."""
        summary_parts = []
        for ep in episodes:
            ep_id = ep.get("ep_id", "?")
            content = ""
            if ep.get("scenes"):
                for scene in ep["scenes"]:
                    scene_id = scene.get("scene_id", "")
                    scene_content = scene.get("content", "")
                    content += f"\n{scene_id}\n{scene_content}\n"
            elif ep.get("raw_content"):
                content = ep["raw_content"]
            summary_parts.append(f"=== 第 {ep_id} 集 ===\n{content}")
        return "\n\n".join(summary_parts)

    def _save_cache_to_settings(self, project_name: str, cache_name: str):
        """Save cache_name to project settings."""
        settings = self.projects.get_settings(project_name)
        if "import" not in settings:
            settings["import"] = {}
        settings["import"]["cacheName"] = cache_name
        self.projects.save_settings(project_name, settings)
        print(f"✅ Import cache saved to settings: {cache_name}")

    # =========================================================================
    # Phase 2: Generate Story Bible (dispatcher)
    # =========================================================================
    def generate_story_bible(
        self,
        project_name: str,
        model_key: Optional[str] = None,
        use_cache: bool = False,
        cache_name: Optional[str] = None,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        用 AI 从剧本反推 Story Bible.
        Dispatches to cached or raw path based on settings.
        """
        # 1. Load Stage 4 scripts
        episodes = self._load_stage4_scripts(project_name)
        if not episodes:
            raise ValueError("Stage 4 剧本不存在，请先导入剧本")
        
        # 2. Render user prompt (always needed)
        user_content = self.prompts.render(
            self.TMPL_USER,
            episodes=episodes,
            episode_count=len(episodes)
        )
        
        # 3. Get model from settings if not provided
        if not model_key:
            settings = self.projects.get_settings(project_name)
            import_cfg = settings.get("import", {})
            model_key, temperature = self.resolve_model_key(project_name, "import")
            use_cache = import_cfg.get("useCache", False)
            cache_name = import_cfg.get("cacheName") if use_cache else None
        
        # 4. Dispatch
        if use_cache and cache_name:
            result = self._generate_bible_cached(model_key, user_content, cache_name, temperature)
        else:
            result = self._generate_bible_raw(model_key, user_content, episodes, temperature)
        
        # 5. Save to Stage 1
        self._save_story_bible(project_name, result)
        
        return result
    
    def _generate_bible_cached(
        self, 
        model_key: str, 
        user_content: str, 
        cache_name: str,
        temperature: float
    ) -> Dict:
        """Cached path: only user prompt, cache handles sys + scripts."""
        result = self.process_request(
            model_key=model_key,
            user_content=user_content,
            cache_name=cache_name,
            temperature=temperature,
            source="import/generate_bible/cached"
        )
        return self._normalize_result(result)
    
    def _generate_bible_raw(
        self, 
        model_key: str, 
        user_content: str,
        episodes: List[Dict],
        temperature: float
    ) -> Dict:
        """Raw path: full sys + scripts + user."""
        sys_content = self.prompts.render(self.TMPL_SYS)
        scripts_summary = self._prepare_scripts_summary(episodes)
        
        result = self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=scripts_summary,
            temperature=temperature,
            source="import/generate_bible/raw"
        )
        return self._normalize_result(result)

    def _normalize_result(self, result: Any) -> Dict:
        """Normalize LLM result to dict."""
        if isinstance(result, str):
            try:
                return json.loads(result)
            except Exception:
                return {"raw_content": result}
        return result if isinstance(result, dict) else {"raw_content": str(result)}

    def _save_story_bible(self, project_name: str, result: Dict):
        """Save Story Bible to Stage 1."""
        stage1_path = os.path.join(
            self.projects.root_dir,
            project_name,
            "1_ideas",
            "story_bible.json"
        )
        os.makedirs(os.path.dirname(stage1_path), exist_ok=True)
        
        with open(stage1_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Story Bible saved to {stage1_path}")

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def _load_stage4_scripts(self, project_name: str) -> List[Dict]:
        """Load Stage 4 scripts."""
        stage4_path = os.path.join(
            self.projects.root_dir,
            project_name,
            "4_scripts",
            "script_drafts.json"
        )
        if not os.path.exists(stage4_path):
            return []
        
        with open(stage4_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    # =========================================================================
    # Helper: Get Episodes for Preview
    # =========================================================================
    def get_episodes_preview(
        self, 
        episodes: List[Dict], 
        preview_length: int = 100
    ) -> List[Dict]:
        """获取剧集预览 (用于 UI 显示)"""
        preview = []
        for ep in episodes:
            content = ""
            if ep.get("scenes"):
                content = ep["scenes"][0].get("content", "")[:preview_length]
            elif ep.get("raw_content"):
                content = ep["raw_content"][:preview_length]
            
            preview.append({
                "ep_id": ep.get("ep_id"),
                "preview": content + "..." if len(content) == preview_length else content,
                "scene_count": len(ep.get("scenes", []))
            })
        return preview
