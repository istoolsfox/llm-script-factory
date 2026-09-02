"""
ImportService - Handle project import workflow

Operations:
1. parse_content() / parse_docx() - Parse raw script text
2. save_to_stages() - Save parsed episodes to Stages 4/5/6
3. generate_story_bible() - Reverse-engineer a Story Bible from imported scripts
"""
import os
import json
from typing import List, Dict, Any
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
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"项目 '{project_name}' 不存在")

        formatted = ScriptParser.format_episodes_for_save(episodes)

        paths = [
            os.path.join(project_dir, "4_scripts", "script_drafts.json"),
            os.path.join(project_dir, "5_scripts", "refined_scripts.json"),
            os.path.join(project_dir, "6_scripts", "final_scripts.json")
        ]

        for path in paths:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(formatted, f, indent=2, ensure_ascii=False)

        print(f"✅ Saved {len(formatted)} episodes to Stage 4/5/6")
        return True

    # =========================================================================
    # Phase 2: Generate Story Bible
    # =========================================================================
    def generate_story_bible(
        self,
        project_name: str,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """用 AI 从剧本反推 Story Bible."""
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

        # 3. Resolve model from project settings
        model_key, temperature = self.resolve_model_key(project_name, "import")

        # 4. Generate
        sys_content = self.prompts.render(self.TMPL_SYS)
        scripts_summary = self._prepare_scripts_summary(episodes)

        result = self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=scripts_summary,
            temperature=temperature,
            source="import/generate_bible"
        )

        # 5. Save to Stage 1
        result = self._normalize_result(result)
        self._save_story_bible(project_name, result)

        return result

    def _prepare_scripts_summary(self, episodes: List[Dict]) -> str:
        """Prepare scripts content for prompt context."""
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
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            raise ValueError(f"项目 '{project_name}' 不存在")

        stage1_path = os.path.join(project_dir, "1_ideas", "story_bible.json")
        os.makedirs(os.path.dirname(stage1_path), exist_ok=True)

        with open(stage1_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        print(f"✅ Story Bible saved to {stage1_path}")

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def _load_stage4_scripts(self, project_name: str) -> List[Dict]:
        """Load Stage 4 scripts."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return []

        stage4_path = os.path.join(project_dir, "4_scripts", "script_drafts.json")
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
