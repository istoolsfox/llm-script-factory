"""
Story Bible Service for Stage 1.
Manages the project-level World Settings: worldview, main plot, characters, relationships.
Each item can be AI-generated or manually set. Data is stored in a dedicated
`bible.json` file (independent from the synopsis/outline flow).
"""
import os
from typing import Dict, Optional
from services.base import BaseService


class BibleService(BaseService):
    """
    Service Controller for the project Story Bible.

    Four independent components:
    1. worldview      - 世界观设定
    2. main_plot      - 主线剧情
    3. characters     - 人物设定 (detailed structured)
    4. relationships  - 人物关系 (relationship list)

    Storage: projects/<name>/1_ideas/bible.json
    """

    # === Prompt Templates ===
    TMPL_WORLDVIEW = "bible/1_worldview_user.j2"
    TMPL_MAIN_PLOT = "bible/2_main_plot_user.j2"
    TMPL_CHARACTERS = "bible/3_characters_user.j2"
    TMPL_RELATIONSHIPS = "bible/4_relationships_user.j2"

    # === Schema files (for manual save validation) ===
    SCHEMA_WORLDVIEW = "prompts/bible/schema_worldview.json"
    SCHEMA_MAIN_PLOT = "prompts/bible/schema_main_plot.json"
    SCHEMA_CHARACTERS = "prompts/bible/schema_characters.json"
    SCHEMA_RELATIONSHIPS = "prompts/bible/schema_relationships.json"

    def __init__(self):
        super().__init__()
        # For generation we intentionally do NOT use cache (world-setting
        # content is small and project-specific; no context cache benefit).
        self.model_key = "qwen3.8-flash"

    # =========================================================================
    # PATH HELPERS
    # =========================================================================
    def _get_bible_path(self, project_name: str) -> str:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project '{project_name}' not found")
        return os.path.join(project_dir, "1_ideas", "bible.json")

    def _load_bible(self, project_name: str) -> Dict:
        return self.files.load_json(self._get_bible_path(project_name), default={})

    def _save_bible(self, project_name: str, data: Dict) -> bool:
        return self.files.save_json(self._get_bible_path(project_name), data)

    def _get_model_key(self, project_name: str) -> str:
        """Resolve model from project settings (fallback to default)."""
        settings = self.projects.get_settings(project_name)
        stage_cfg = settings.get("stage1", {})
        model = stage_cfg.get("model") or self.model_key
        temperature = float(stage_cfg.get("temperature", 0.7))
        return model, temperature

    # =========================================================================
    # HELPERS: fetch synopsis/characters for generation context
    # =========================================================================
    def _get_story_bible_path(self, project_name: str) -> str:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project '{project_name}' not found")
        return os.path.join(project_dir, "1_ideas", "story_bible.json")

    def _load_synopsis(self, project_name: str) -> Dict:
        return self.files.load_json(self._get_story_bible_path(project_name), default={}).get("synopsis", {})

    def _get_user_input(self, project_name: str) -> str:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return ""
        data = self.files.load_json(os.path.join(project_dir, "1_ideas", "user_input.json"), default={})
        return data.get("concept", "")

    def _render(self, template: str, project_name: str, extra: Optional[Dict] = None) -> str:
        """Render a bible prompt template with concept + synopsis context."""
        concept = self._get_user_input(project_name)
        synopsis = self._load_synopsis(project_name)
        kwargs = {"concept": concept, "synopsis": synopsis}
        if extra:
            kwargs.update(extra)
        return self.prompts.render(template, **kwargs)

    def _generate(self, project_name: str, template: str, component: str) -> Dict:
        """Generic generation dispatch."""
        model, temperature = self._get_model_key(project_name)
        user_content = self._render(template, project_name)
        return self.process_request(
            model_key=model,
            user_content=user_content,
            system_content="你是一位专业的短剧创作团队，只输出符合要求的 JSON。",
            temperature=temperature,
            source=f"bible/{component}/generate"
        )

    # =========================================================================
    # GENERATION
    # =========================================================================
    def generate_worldview(self, project_name: str) -> Dict:
        return self._generate(project_name, self.TMPL_WORLDVIEW, "worldview")

    def generate_main_plot(self, project_name: str) -> Dict:
        return self._generate(project_name, self.TMPL_MAIN_PLOT, "main_plot")

    def generate_characters(self, project_name: str) -> Dict:
        return self._generate(project_name, self.TMPL_CHARACTERS, "characters")

    def generate_relationships(self, project_name: str) -> Dict:
        # Pass current characters as context for relation building
        bible = self._load_bible(project_name)
        chars = bible.get("characters", "")
        model, temperature = self._get_model_key(project_name)
        user_content = self._render(self.TMPL_RELATIONSHIPS, project_name, extra={"characters": chars})
        return self.process_request(
            model_key=model,
            user_content=user_content,
            system_content="你是一位专业的短剧创作团队，只输出符合要求的 JSON。",
            temperature=temperature,
            source="bible/relationships/generate"
        )

    # =========================================================================
    # SAVE (with schema validation)
    # =========================================================================
    def save_component(self, project_name: str, component: str, data: Dict) -> bool:
        """Validate and save a single component to bible.json (merged)."""
        schema_map = {
            "worldview": self.SCHEMA_WORLDVIEW,
            "main_plot": self.SCHEMA_MAIN_PLOT,
            "characters": self.SCHEMA_CHARACTERS,
            "relationships": self.SCHEMA_RELATIONSHIPS,
        }
        if component not in schema_map:
            raise ValueError(f"未知的设定组件: {component}")

        valid, msg = self.files.validate_json(data, schema_map[component])
        if not valid:
            raise ValueError(f"设定格式校验失败: {msg}")

        bible = self._load_bible(project_name)
        bible[component] = data
        return self._save_bible(project_name, bible)

    # =========================================================================
    # LOAD
    # =========================================================================
    def load_bible(self, project_name: str) -> Dict:
        return self._load_bible(project_name)
