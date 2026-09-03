/**
 * 六阶段创作流程的元数据。
 * 侧边栏导航、首页流程条、Stage 页头导航共用，保证流程表述一致。
 */

export interface StageMeta {
    /** URL 段，如 "stage1" */
    id: string;
    /** 项目 stages 完成态的键，如 "1_idea" */
    key: string;
    /** 序号 1-6 */
    step: number;
    /** 中文名 */
    name: string;
    /** 英文名 */
    en: string;
    /** 一句话说明（引导文案用） */
    hint: string;
}

export const STAGES: StageMeta[] = [
    { id: "stage1", key: "1_idea", step: 1, name: "创意孵化", en: "Idea Lab", hint: "输入核心创意，生成梗概与 8 卡大纲" },
    { id: "stage2", key: "2_structure", step: 2, name: "结构构建", en: "Structure", hint: "把卡纲展开为分集大纲（集数在 Stage 1 自由设置）" },
    { id: "stage3", key: "3_scene", step: 3, name: "分场编写", en: "Scene Writer", hint: "为每一集划分场次与冲突点" },
    { id: "stage4", key: "4_script", step: 4, name: "剧本撰写", en: "Script Writer", hint: "按批次生成完整剧本正文" },
    { id: "stage5", key: "5_refine", step: 5, name: "润色优化", en: "Polisher", hint: "批量打磨台词、节奏与爽感" },
    { id: "stage6", key: "6_doctor", step: 6, name: "剧本医生", en: "Script Doctor", hint: "逐集诊断精修，终审交付" },
];

export function getStage(id: string): StageMeta | undefined {
    return STAGES.find(s => s.id === id);
}

/**
 * 推断项目的"下一步"：第一个未完成的阶段。
 * 全部完成时返回剧本医生（终审入口）；stages 为空时返回 Stage 1。
 */
export function getNextStage(stages: Record<string, boolean> | undefined): StageMeta {
    if (stages && typeof stages === "object") {
        const undone = STAGES.find(s => !stages[s.key]);
        if (undone) return undone;
        return STAGES[STAGES.length - 1];
    }
    return STAGES[0];
}

export function getStageHref(stage: StageMeta, projectName?: string | null): string {
    return `/${stage.id}?project=${encodeURIComponent(projectName || "")}`;
}

/** 完成/总阶段数 */
export function getStageProgress(stages: Record<string, boolean> | undefined): { done: number; total: number } {
    if (!stages || typeof stages !== "object") return { done: 0, total: STAGES.length };
    return { done: STAGES.filter(s => !!stages[s.key]).length, total: STAGES.length };
}
