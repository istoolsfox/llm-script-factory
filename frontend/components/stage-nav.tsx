"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES, getStageHref, type StageMeta } from "@/lib/stages";
import { useProject } from "@/lib/contexts/project-context";

/**
 * Stage 页头部的流程导航：上一步 / 六步流程位 / 下一步。
 * 让创作者在任何阶段都能感知"我在流程的哪一步、前后是什么"。
 */
export function StageNav({ current }: { current: number }) {
    const { activeProject } = useProject();
    const projectName = activeProject?.name || "";
    const stagesDone = activeProject?.stages;

    const currentStage = STAGES.find(s => s.step === current) ?? STAGES[0];
    const prevStage: StageMeta | undefined = STAGES.find(s => s.step === current - 1);
    const nextStage: StageMeta | undefined = STAGES.find(s => s.step === current + 1);

    return (
        <div className="flex items-center justify-between gap-4 border-b bg-slate-50/60 dark:bg-slate-900/40 px-4 py-1.5 text-xs">
            {/* 上一步 */}
            <div className="w-44 shrink-0">
                {prevStage ? (
                    <Link
                        href={getStageHref(prevStage, projectName)}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                        <ArrowLeft size={13} />
                        <span className="truncate">{prevStage.name}</span>
                    </Link>
                ) : (
                    <span className="text-slate-300 dark:text-slate-600 select-none">流程开始</span>
                )}
            </div>

            {/* 六步流程位 */}
            <nav className="flex items-center gap-1" aria-label="创作流程">
                {STAGES.map(s => {
                    const done = !!stagesDone?.[s.key];
                    const isCurrent = s.step === current;
                    return (
                        <Link
                            key={s.id}
                            href={getStageHref(s, projectName)}
                            title={`${s.step}. ${s.name}${done ? "（已完成）" : ""}`}
                            className={cn(
                                "group flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors",
                                isCurrent
                                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-medium leading-none",
                                    isCurrent
                                        ? "border-current"
                                        : done
                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                            : "border-slate-300 dark:border-slate-600"
                                )}
                            >
                                {done && !isCurrent ? <Check size={10} strokeWidth={3} /> : s.step}
                            </span>
                            <span className={cn("hidden md:inline", !isCurrent && "group-hover:text-inherit")}>
                                {s.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* 下一步 */}
            <div className="w-44 shrink-0 text-right">
                {nextStage ? (
                    <Link
                        href={getStageHref(nextStage, projectName)}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                        <span className="truncate">{nextStage.name}</span>
                        <ArrowRight size={13} />
                    </Link>
                ) : (
                    <span className="text-slate-300 dark:text-slate-600 select-none">流程终点</span>
                )}
            </div>
        </div>
    );
}
