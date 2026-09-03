"""
Rewrite Service (洗稿): extract the core of a reference script and
reskin it into a brand-new story concept.

Storage: projects/<name>/1_ideas/rewrite.json
{
    "analysis": {...},          # 提炼结果
    "generated": {...},         # 换皮结果 (title/logline/concept/mapping)
    "source_excerpt": "...",    # 参考剧本原文（截断保存）
    "instruction": "...",       # 用户的换皮要求
    "updated_at": "ISO8601"
}
"""
import os
from datetime import datetime
from typing import Dict
from services.base import BaseService


MAX_SOURCE_CHARS = 20000


class RewriteService(BaseService):
    TMPL_EXTRACT = "rewrite/1_extract_user.j2"
    TMPL_GENERATE = "rewrite/2_generate_user.j2"

    SCHEMA_EXTRACT = "prompts/rewrite/schema_extract.json"
    SCHEMA_GENERATE = "prompts/rewrite/schema_generate.json"

    def __init__(self):
        super().__init__()
        import json
        self.model_key = "qwen3.8-flash"
        self._schema_extract = self._load_schema(self.SCHEMA_EXTRACT, json)
        self._schema_generate = self._load_schema(self.SCHEMA_GENERATE, json)

    def _load_schema(self, rel_path: str, json) -> Dict:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(base_dir, rel_path), "r", encoding="utf-8") as f:
            return json.load(f)

    # === PATH / STORAGE ===
    def _get_rewrite_path(self, project_name: str) -> str:
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"Project '{project_name}' not found")
        return os.path.join(project_dir, "1_ideas", "rewrite.json")

    def _load(self, project_name: str) -> Dict:
        return self.files.load_json(self._get_rewrite_path(project_name), default={})

    def _save(self, project_name: str, data: Dict) -> bool:
        data["updated_at"] = datetime.now().isoformat(timespec="seconds")
        return self.files.save_json(self._get_rewrite_path(project_name), data)

    def load_rewrite(self, project_name: str) -> Dict:
        return self._load(project_name)

    def _resolve_model(self, project_name: str):
        settings = self.projects.get_settings(project_name)
        stage_cfg = settings.get("stage1", {})
        model = stage_cfg.get("model") or self.model_key
        temperature = float(stage_cfg.get("temperature", 0.7))
        return model, temperature

    def _request(self, project_name: str, template: str, source: str, response_schema: str, **kwargs) -> Dict:
        model, temperature = self._resolve_model(project_name)
        user_content = self.prompts.render(template, **kwargs)
        return self.process_request(
            model_key=model,
            user_content=user_content,
            system_content="你是一位专业的短剧策划团队，只输出符合要求的 JSON。",
            temperature=temperature,
            source=source,
            response_schema=response_schema
        )

    # === STEP 1: EXTRACT ===
    def extract(self, project_name: str, script_text: str) -> Dict:
        text = (script_text or "").strip()
        if len(text) < 100:
            raise ValueError("参考剧本内容太短（至少100字），请粘贴完整剧本或核心章节")

        analysis = self._request(
            project_name, self.TMPL_EXTRACT, "rewrite/extract",
            self._schema_extract, script_text=text[:MAX_SOURCE_CHARS]
        )

        data = self._load(project_name)
        data["analysis"] = analysis
        data["source_excerpt"] = text[:3000]
        self._save(project_name, data)
        return analysis

    # === STEP 2: GENERATE RESKINNED STORY ===
    def generate(self, project_name: str, instruction: str = None) -> Dict:
        data = self._load(project_name)
        analysis = data.get("analysis")
        if not analysis:
            raise ValueError("请先提炼参考剧本核心 (Step 1)")

        import json
        result = self._request(
            project_name, self.TMPL_GENERATE, "rewrite/generate",
            self._schema_generate,
            analysis=json.dumps(analysis, ensure_ascii=False, indent=1),
            instruction=(instruction or "").strip()
        )

        data["generated"] = result
        data["instruction"] = instruction or ""
        self._save(project_name, data)
        return result
