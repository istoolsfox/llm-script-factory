"""
Stage 6 Service: Script Doctor

Prompt Structure:
- 1_sys_doctor.j2: System Prompt
- 2_context_static.j2: DTG + Story Bible
- 3_analyze_user.j2: Analysis User Prompt (dynamic)
- 4_refine_user.j2: Refine User Prompt (dynamic)

Operations:
1. analyze_episode() - uses 1 + 2 + 3
2. refine_episode() - uses 1 + 2 + 4
"""
import os
import json
import re
from typing import List, Dict, Optional, Any
from services.base import BaseService


class Stage6Service(BaseService):
    """
    Service Controller for Stage 6: Script Doctor.
    Single-episode diagnosis and targeted refinement.
    """
    
    def __init__(self):
        super().__init__()
        
        # === Prompt Templates ===
        self.TMPL_SYS = "stage6/1_sys_doctor.j2"
        self.TMPL_CTX = "stage6/2_context_static.j2"
        self.TMPL_ANALYZE = "stage6/3_analyze_user.j2"
        self.TMPL_REFINE = "stage6/4_refine_user.j2"
        
        # Data Paths
        self.PATH_REFINED_SOURCE = "5_scripts/refined_scripts.json"
        self.PATH_FINAL_OUTPUT = "6_scripts/final_scripts.json"
        self.SCHEMA_REFINED_SCRIPT = "prompts/stage6/schema_doctor_script.json"
        
        # DTG Files
        self.DTG_FILES = [
            "dtgCore_2025_1222_0001.md",
            "dtgFramework_2025_1223_0001.md",
            "dtgModels_2025_1223_0001.md",
        ]

    # =========================================================================
    # DTG CONTENT
    # =========================================================================
    def _prepare_dtg_content(self) -> str:
        """Load and concat DTG theory files."""
        return self.prompts.load_dtg_theory(branch="dtg/Distill-1", file_list=self.DTG_FILES)

    # =========================================================================
    # ANALYZE EPISODE
    # =========================================================================
    def analyze_episode(
        self,
        project_name: str,
        current_script: str,
        temperature: float = 0.7
    ) -> Dict[str, str]:
        """
        Run 6-Dimension Analysis on a single episode.
        """
        if not (current_script or "").strip():
            raise ValueError("当前剧集没有剧本内容，请先完成 Stage 4/5 再运行剧本医生")
        # 1. Render user prompt (3_analyze_user.j2)
        user_content = self.prompts.render(
            self.TMPL_ANALYZE,
            current_script=current_script
        )

        # 2. Resolve model from project settings
        model_key, temperature = self.resolve_model_key(project_name, "stage6")

        # 3. Generate
        story_bible = self.load_story_bible(project_name)
        return self._analyze_raw(model_key, user_content, story_bible, project_name, temperature)

    def _analyze_raw(
        self, 
        model_key: str, 
        user_content: str,
        story_bible: str,
        project_name: str,
        temperature: float
    ) -> Dict[str, str]:
        """Raw path: full 1 + 2 + 3."""
        user_input = self._load_user_input(project_name)
        sys_content = self.prompts.render(self.TMPL_SYS)
        full_dtg = self._prepare_dtg_content()
        ctx_content = self.prompts.render(
            self.TMPL_CTX,
            dtg_context=full_dtg,
            story_bible=story_bible,
            user_input=user_input
        )
        
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=ctx_content,
            temperature=temperature,
            source="stage6/analyze/raw"
        )

    # =========================================================================
    # REFINE EPISODE
    # =========================================================================
    def refine_episode(
        self,
        project_name: str,
        current_script: str,
        instruction: str,
        custom_instruction: str = "",
        prev_summary: str = "",
        next_summary: str = "",
        temperature: float = 0.7
    ) -> Dict:
        """
        Refine the episode based on instructions.
        """
        if not (current_script or "").strip():
            raise ValueError("当前剧集没有剧本内容，请先完成 Stage 4/5 再使用剧本医生")
        # 1. Render user prompt (4_refine_user.j2)
        user_content = self.prompts.render(
            self.TMPL_REFINE,
            instruction=instruction,
            custom_instruction=custom_instruction,
            prev_script_summary=prev_summary,
            next_script_summary=next_summary,
            current_script=current_script
        )

        # 2. Resolve model from project settings
        model_key, temperature = self.resolve_model_key(project_name, "stage6")

        # 3. Generate
        story_bible = self.load_story_bible(project_name)
        result = self._refine_raw(model_key, user_content, story_bible, project_name, temperature)

        # 4. Unwrap result
        return self._unwrap_result(result)

    def _refine_raw(
        self, 
        model_key: str, 
        user_content: str,
        story_bible: str,
        project_name: str,
        temperature: float
    ) -> Any:
        """Raw path: full 1 + 2 + 4."""
        user_input = self._load_user_input(project_name)
        sys_content = self.prompts.render(self.TMPL_SYS)
        full_dtg = self._prepare_dtg_content()
        ctx_content = self.prompts.render(
            self.TMPL_CTX,
            dtg_context=full_dtg,
            story_bible=story_bible,
            user_input=user_input
        )
        
        return self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=sys_content,
            context_content=ctx_content,
            temperature=temperature,
            source="stage6/refine/raw"
        )

    def _unwrap_result(self, result: Any) -> Dict:
        """Unwrap LLM result to single episode dict."""
        if isinstance(result, dict) and "episodes" in result:
            episodes = result["episodes"]
            if isinstance(episodes, list) and episodes:
                return episodes[0]
            return {}
        elif isinstance(result, list):
            if result:
                return result[0]
            return {}
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def load_story_bible(self, project_name: str) -> str:
        """Load story bible as string."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, "1_ideas/story_bible.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return json.dumps(data, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Error loading bible: {e}")
        return ""

    def _load_user_input(self, project_name: str) -> str:
        """Load user input (concept) from Stage 1."""
        project_dir = self.projects.get_project_path(project_name)
        if not project_dir:
            return ""
        path = os.path.join(project_dir, "1_ideas/user_input.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("concept", "")
            except Exception:
                pass
        return ""

    def load_scripts(self, project_name: str) -> List[Dict]:
        """Load Stage 6 scripts (with fallback from Stage 5)."""
        project_dir = self.projects.get_project_path(project_name)
        path_final = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        path_source = os.path.join(project_dir, self.PATH_REFINED_SOURCE)

        # 1. Try loading Final
        if os.path.exists(path_final):
            try:
                with open(path_final, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data and isinstance(data, list) and len(data) > 0:
                        first_ep = data[0]
                        if self.format_script_to_text(first_ep).strip():
                            return data
            except Exception as e:
                print(f"WARN: Failed to load final scripts: {e}")

        # 2. Fallback: Load from Source and initialize
        if os.path.exists(path_source):
            try:
                with open(path_source, "r", encoding="utf-8") as f:
                    data_list = json.load(f)
                if data_list:
                    self._save_json_direct(path_final, data_list)
                    print(f"INFO: Initialized Stage 6 scripts from {path_source}")
                    return data_list
            except Exception as e:
                print(f"Error initializing Stage 6 from source: {e}")
        
        return []

    # =========================================================================
    # SAVING
    # =========================================================================
    def save_final_script(self, project_name: str, ep_data: Dict) -> bool:
        """Upsert a single episode to the final scripts list."""
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        
        # 1. Load existing
        current_list = []
        if os.path.exists(path):
            try:
                with open(path, "r", encoding='utf-8') as f:
                    current_list = json.load(f)
            except Exception:
                current_list = []

        # 2. Upsert
        found = False
        for i, item in enumerate(current_list):
            if str(item.get('ep_id')) == str(ep_data.get('ep_id')):
                current_list[i] = ep_data
                found = True
                break
        if not found:
            current_list.append(ep_data)
        current_list.sort(key=lambda x: int(x.get('ep_id', 0)))
        
        # 3. Save
        return self.files.save_json(path, current_list)

    def reset_from_source(self, project_name: str) -> bool:
        """Reset Stage 6 scripts from Stage 5."""
        project_dir = self.projects.get_project_path(project_name)
        path_final = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        path_source = os.path.join(project_dir, self.PATH_REFINED_SOURCE)
        
        if os.path.exists(path_source):
            try:
                with open(path_source, "r", encoding="utf-8") as f:
                    data_list = json.load(f)
                self._save_json_direct(path_final, data_list)
                return True
            except Exception as e:
                print(f"Error resetting Stage 6: {e}")
                return False
        return False

    def clear_all_scripts(self, project_name: str) -> bool:
        """
        Clear all final scripts for a project.
        Writes an empty array to 6_scripts/final_scripts.json.
        """
        project_dir = self.projects.get_project_path(project_name)
        path = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        return self.files.save_json(path, [])

    def _save_json_direct(self, path: str, data: Any):
        """Helper to save JSON directly."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # TEXT FORMATTING HELPERS
    # =========================================================================
    def format_script_to_text(self, ep_data: Dict) -> str:
        """Convert structured episode to plain text."""
        scenes = ep_data.get('scenes', [])
        
        if not scenes:
            return ep_data.get('content') or ep_data.get('raw_content') or ""
            
        text_block = ""
        for sc in scenes:
            sid = sc.get('scene_id', '')
            time = sc.get('time', '')
            loc = sc.get('location', '')
            chars = sc.get('characters', '')
            body = sc.get('content', '')
            header_line = f"{sid} {time}".strip()
            text_block += f"{header_line}\n"
            if loc: text_block += f"场景：{loc}\n"
            if chars: text_block += f"人物：{chars}\n"
            text_block += f"\n{body}\n\n"
        return text_block

    def parse_text_to_script(self, text: str, ep_id: int) -> Dict[str, Any]:
        """Parse plain text back to structured episode."""
        scenes = []
        scene_iter = list(re.finditer(r'(?:^|\n)\s*(\d+-\d+)(.*)(?:\n|$)', text))
        if not scene_iter:
            return {"ep_id": ep_id, "scenes": []}
            
        for i, match in enumerate(scene_iter):
            start = match.end()
            end = scene_iter[i+1].start() if i+1 < len(scene_iter) else len(text)
            sid = match.group(1)
            header_extra = match.group(2).strip()
            scene_block = text[start:end].strip()
            lines = scene_block.split('\n')
            header = {"time": "", "location": "", "characters": ""}
            if header_extra:
                header["time"] = header_extra
            body_lines = []
            for line in lines:
                s_line = line.strip()
                if not s_line:
                    continue
                if re.match(r'^[早晚日月夜午]/.+', s_line) or ('/' in s_line and any(k in s_line for k in "日月夜早晚内外")):
                    if not header["time"]:
                        header["time"] = s_line
                elif s_line.startswith("场景") or s_line.startswith("地点"):
                    header["location"] = s_line.replace("场景", "").replace("地点", "").replace("：", "").replace(":", "").strip()
                elif s_line.startswith("人物") or s_line.startswith("角色"):
                    header["characters"] = s_line.replace("人物", "").replace("角色", "").replace("：", "").replace(":", "").strip()
                else:
                    body_lines.append(line)
            scenes.append({
                "scene_id": sid,
                "time": header["time"],
                "location": header["location"],
                "characters": header["characters"],
                "content": "\n".join(body_lines).strip()
            })
        return {"ep_id": ep_id, "scenes": scenes}

    # =========================================================================
    # COPY FROM PREVIOUS STAGE
    # =========================================================================
    def copy_from_s5(self, project_name: str) -> Dict[str, Any]:
        """Copy Stage 5 scripts to Stage 6 (reset/initialize)."""
        project_dir = self.projects.get_project_path(project_name)
        s5_path = os.path.join(project_dir, self.PATH_REFINED_SOURCE)
        s6_path = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        
        s5_data = []
        if os.path.exists(s5_path):
            with open(s5_path, 'r', encoding='utf-8') as f:
                s5_data = json.load(f)
        
        if not s5_data:
            raise ValueError("Stage 5 无数据可拷贝")
        
        os.makedirs(os.path.dirname(s6_path), exist_ok=True)
        with open(s6_path, 'w', encoding='utf-8') as f:
            json.dump(s5_data, f, indent=2, ensure_ascii=False)
        
        return {"success": True, "count": len(s5_data)}

    def check_needs_init(self, project_name: str) -> Dict[str, Any]:
        """Check if Stage 6 needs initialization from Stage 5."""
        project_dir = self.projects.get_project_path(project_name)
        s5_path = os.path.join(project_dir, self.PATH_REFINED_SOURCE)
        s6_path = os.path.join(project_dir, self.PATH_FINAL_OUTPUT)
        
        s5_data = []
        s6_data = []
        
        if os.path.exists(s5_path):
            with open(s5_path, 'r', encoding='utf-8') as f:
                s5_data = json.load(f)
        
        if os.path.exists(s6_path):
            with open(s6_path, 'r', encoding='utf-8') as f:
                s6_data = json.load(f)
        
        return {
            "needs_init": not os.path.exists(s6_path) or len(s6_data) == 0,
            "s5_count": len(s5_data),
            "s6_count": len(s6_data)
        }

