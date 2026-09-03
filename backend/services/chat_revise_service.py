"""
Chat Revise Service: AI 对话修改。

用户在某个数据块（梗概/粗大纲/详细卡纲/人物/世界设定）的对话框里提意见，
AI 直接修改当前选中的数据并自动保存。每次修订前自动做版本快照，可追溯。

目标数据映射:
  synopsis        -> story_bible.synopsis          (剧情梗概)
  rough_outline   -> story_bible.rough_skeleton    (粗大纲)
  detailed_cards  -> story_bible.detailed_cards    (详细卡纲)
  characters_rel  -> bible.characters + relationships (人物+人物关系)
  world_bible     -> bible.worldview + main_plot   (世界观/时代背景/势力 + 主线)
"""
import json
from typing import Dict, Optional
from services.base import BaseService

REVISE_SYS = (
    "你是一位资深短剧主编。用户会给你一份当前的创作数据（JSON）和一条修改意见。"
    "请严格按意见修改数据：保持与原数据完全相同的 JSON 结构（相同的键、相同的层级、"
    "数组元素结构一致），只修改与意见相关的内容，其余内容原样保留，不要缩水删减无关字段。"
    "若意见要求增删结构（如新增人物），允许数组增删元素但保持元素结构一致。"
    '只输出一个 JSON 对象：{"reply": "用一两句话说明你改了什么", "data": <修改后的完整JSON>}'
)


class ChatReviseService(BaseService):
    def __init__(self):
        super().__init__()
        self.model_key = "qwen3.8-max"

    # === Stage1 helpers (reuse its persistence) ===
    def _stage1(self):
        from services.stage1_idea import Stage1Service
        return Stage1Service()

    def _bible(self):
        from services.bible_service import BibleService
        return BibleService()

    def _load_bible_json(self, project_name: str) -> Dict:
        s1 = self._stage1()
        return s1._load_story_bible(project_name)

    def _save_bible_json(self, project_name: str, data: Dict):
        s1 = self._stage1()
        s1._save_story_bible(project_name, data)

    # === Target data extraction ===
    def _extract(self, target: str, project_name: str):
        s1 = self._stage1()
        bible = self._load_bible_json(project_name)
        if target == "synopsis":
            return bible.get("synopsis"), "剧情梗概"
        if target == "rough_outline":
            rough = bible.get("rough_skeleton", [])
            if isinstance(rough, dict):
                rough = rough.get("rough_skeleton", rough)
            return rough, "粗大纲"
        if target == "detailed_cards":
            return bible.get("detailed_cards", []), "详细卡纲"
        if target == "characters_rel":
            b = self._bible().load_bible(project_name)
            return {"characters": b.get("characters"), "relationships": b.get("relationships")}, "人物设定与人物关系"
        if target == "world_bible":
            b = self._bible().load_bible(project_name)
            return {"worldview": b.get("worldview"), "main_plot": b.get("main_plot")}, "世界设定（世界观/时代背景/势力/主线）"
        raise ValueError(f"未知的修订目标: {target}")

    def _apply(self, target: str, project_name: str, data) -> None:
        s1 = self._stage1()
        if target == "synopsis":
            s1.save_synopsis(project_name, data)
        elif target == "rough_outline":
            s1.save_rough_outline(project_name, {"rough_skeleton": data})
        elif target == "detailed_cards":
            s1.save_detailed_cards(project_name, {"detailed_cards": data})
        elif target in ("characters_rel", "world_bible"):
            if not isinstance(data, dict):
                raise ValueError("AI 返回格式异常：应为对象")
            bible = self._bible().load_bible(project_name)
            if target == "characters_rel":
                if "characters" in data:
                    bible["characters"] = data["characters"]
                if "relationships" in data:
                    bible["relationships"] = data["relationships"]
            else:
                if "worldview" in data:
                    bible["worldview"] = data["worldview"]
                if "main_plot" in data:
                    bible["main_plot"] = data["main_plot"]
            self._bible()._save_bible(project_name, bible)
        else:
            raise ValueError(f"未知的修订目标: {target}")

    # === MAIN ===
    def revise(self, project_name: str, target: str, instruction: str,
               card_index: Optional[int] = None, unit_index: Optional[int] = None) -> Dict:
        instruction = (instruction or "").strip()
        if not instruction:
            raise ValueError("请输入修改意见")

        if target == "stage2_unit":
            return self._revise_stage2_unit(project_name, instruction, card_index, unit_index)

        current, label = self._extract(target, project_name)
        if current is None or current == {} or current == []:
            raise ValueError(f"当前还没有「{label}」数据，请先生成")

        model_key, temperature = self.resolve_model_key(project_name, "stage1")

        user_content = (
            f"**当前数据（{label}）**:\n"
            + json.dumps(current, ensure_ascii=False, indent=1)
            + "\n\n**用户的修改意见（必须遵守）**:\n"
            + instruction
        )

        result = self.process_request(
            model_key=model_key,
            user_content=user_content,
            system_content=REVISE_SYS,
            temperature=temperature,
            source=f"chat_revise/{target}"
        )

        reply = result.get("reply", "") if isinstance(result, dict) else ""
        data = result.get("data") if isinstance(result, dict) else None
        if data is None:
            raise ValueError("AI 返回数据为空，请重试")

        # 修订前快照（可追溯）
        try:
            from services.version_service import VersionService
            VersionService().snapshot(project_name, tag="ai_revise")
        except Exception:
            pass

        self._apply(target, project_name, data)
        return {"reply": reply or "已完成修改", "data": data, "target": target}

    def _revise_stage2_unit(self, project_name: str, instruction: str,
                            card_index: Optional[int], unit_index: Optional[int]) -> Dict:
        """按意见调整当前选中故事单元的分集大纲（复用 Stage2 refine）。"""
        if card_index is None or unit_index is None:
            raise ValueError("缺少卡/单元参数，请先在左侧选择故事单元")
        from services.stage2_structure import Stage2Service
        s2 = Stage2Service()
        detailed = s2.load_story_bible(project_name).get("detailed_cards", [])
        if not detailed or card_index >= len(detailed):
            raise ValueError("请先完成 Stage 1 详细卡纲")
        unit = detailed[card_index].get("story_units", [])
        if unit_index >= len(unit):
            raise ValueError("单元索引越界，请重新选择")
        start_ep, end_ep = s2._parse_episode_range(unit[unit_index].get("episodes", ""))
        existing = [ep for ep in s2.load_outlines(project_name)
                    if start_ep <= ep.get("ep_id", 0) <= end_ep]
        if not existing:
            raise ValueError(f"第 {start_ep}-{end_ep} 集还没有大纲，请先生成再调整")

        try:
            from services.version_service import VersionService
            VersionService().snapshot(project_name, tag="ai_revise")
        except Exception:
            pass

        episodes = s2.refine_batch(
            project_name, card_index, unit_index, existing, instruction
        )
        s2.save_batch(project_name, episodes)
        return {
            "reply": f"已调整第 {start_ep}-{end_ep} 集大纲（修订前已存版本快照）",
            "data": episodes,
            "target": "stage2_unit"
        }
