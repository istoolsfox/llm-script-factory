"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProject } from "@/lib/contexts/project-context";
import { api } from "@/lib/api";
import { StageNav } from "@/components/stage-nav";
import { useLatestRequest, useUnloadGuard } from "@/lib/hooks/use-request-guard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Wand2, Stethoscope, CheckCircle2, Circle, ArrowRight, RotateCcw, Copy, FileDown, Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// --- Types ---
interface Episode {
    ep_id: number;
    scenes: any[];
}

interface Instruction {
    label: string;
    prompt: string;
}

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // single-episode refine/analyze

export default function Stage6Page() {
    const { activeProject, isLoading } = useProject();
    const loadGuard = useLatestRequest();

    // Data State
    const [scripts, setScripts] = useState<Episode[]>([]);
    const [instructions, setInstructions] = useState<Instruction[]>([]);

    // UI State
    const [selectedEpId, setSelectedEpId] = useState<number | null>(null);
    const [selectedInstruction, setSelectedInstruction] = useState<string>("");
    const [customInstruction, setCustomInstruction] = useState<string>("");

    // Editor State
    const [leftContent, setLeftContent] = useState<string>("");
    const [rightContent, setRightContent] = useState<string>("");

    // Loading State
    const [isRefining, setIsRefining] = useState(false);
    const [isSavingLeft, setIsSavingLeft] = useState(false);
    const [isSavingRight, setIsSavingRight] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // --- Load Data ---
    useEffect(() => {
        if (activeProject) {
            checkAndInitFromS5();
        } else {
            resetState();
        }
    }, [activeProject]);

    const checkAndInitFromS5 = async () => {
        if (!activeProject) return;
        try {
            const checkRes = await api.get(`/api/stage6/check-needs-init?project=${encodeURIComponent(activeProject.name)}`);
            if (checkRes.needs_init && checkRes.s5_count > 0) {
                toast.info("正在从 Stage 5 初始化数据...");
                await api.post(`/api/stage6/copy-from-s5?project=${encodeURIComponent(activeProject.name)}`, {});
                toast.success(`已从 Stage 5 拷贝 ${checkRes.s5_count} 集`);
            }
            await loadData();
        } catch (e: any) {
            console.error("Check/init failed:", e);
            await loadData();
        }
    };

    const handleCopyFromS5 = async () => {
        if (!activeProject) return;
        setIsCopying(true);
        try {
            const res = await api.post(`/api/stage6/copy-from-s5?project=${encodeURIComponent(activeProject.name)}`, {});
            if (res.success) {
                toast.success(res.message);
                await loadData();
            }
        } catch (e: any) {
            toast.error("拷贝失败: " + e.message);
        } finally {
            setIsCopying(false);
        }
    };

    const resetState = () => {
        setScripts([]);
        setLeftContent("");
        setRightContent("");
        setSelectedEpId(null);
    };

    const loadData = async (): Promise<Episode[]> => {
        if (!activeProject) return [];
        const seq = loadGuard.next();
        try {
            // Load scripts
            const scriptsRes = await api.get(`/api/stage6/scripts?project=${encodeURIComponent(activeProject.name)}`);
            if (loadGuard.isStale(seq)) return [];
            const loadedScripts: Episode[] = scriptsRes.scripts || [];
            setScripts(loadedScripts);

            // Load instructions
            const insRes = await api.get("/api/stage6/instructions");
            if (loadGuard.isStale(seq)) return loadedScripts;
            const loadedIns = insRes.instructions || [];
            setInstructions(loadedIns);
            if (loadedIns.length > 0) {
                setSelectedInstruction(loadedIns[0].prompt);
            }

            // Auto-select: when nothing is selected, or the current selection
            // does not exist in THIS project's scripts (e.g. right after a
            // project switch), fall back to the first episode so the editor
            // never shows another project's content.
            const currentValid = loadedScripts.some(ep => ep.ep_id === selectedEpId);
            if (loadedScripts.length > 0 && !currentValid) {
                selectEpisode(loadedScripts[0]);
            }
            return loadedScripts;
        } catch (e: any) {
            if (loadGuard.isStale(seq)) return [];
            console.error("Failed to load stage6 data:", e);
            toast.error("加载数据失败: " + e.message);
            return [];
        }
    };

    const selectEpisode = (ep: Episode) => {
        setSelectedEpId(ep.ep_id);
        // Convert to text format
        const text = formatScriptToText(ep);
        setLeftContent(text);
        setRightContent(""); // Clear right side when switching
    };

    const formatScriptToText = (ep: Episode): string => {
        if (!ep || !ep.scenes) return "";
        let text = "";
        for (const sc of ep.scenes) {
            const header = `${sc.scene_id || ""} ${sc.time || ""}`.trim();
            text += `${header}\n`;
            if (sc.location) text += `场景：${sc.location}\n`;
            if (sc.characters) text += `人物：${sc.characters}\n`;
            text += `\n${sc.content || ""}\n\n`;
        }
        return text;
    };

    // --- Actions ---
    const handleRefine = async () => {
        if (!activeProject || !selectedEpId) return;

        setIsRefining(true);
        toast.info("AI正在润色...（预计需要一两分钟）");

        try {
            const res = await api.post("/api/stage6/refine", {
                project: activeProject.name,
                ep_id: selectedEpId,
                instruction: selectedInstruction,
                custom_instruction: customInstruction,
                current_script: leftContent
            }, { timeoutMs: GENERATION_TIMEOUT_MS });

            if (res.success && res.refined_text) {
                setRightContent(res.refined_text);
                toast.success("润色完成！请检查右侧结果");
            }
        } catch (e: any) {
            toast.error("润色失败: " + e.message);
        } finally {
            setIsRefining(false);
        }
    };

    const handleSaveLeft = async () => {
        if (!activeProject || !selectedEpId) return;

        setIsSavingLeft(true);
        try {
            const res = await api.post("/api/stage6/save", {
                project: activeProject.name,
                ep_id: selectedEpId,
                content: leftContent
            });

            if (res.success) {
                toast.success("左侧内容已保存！");
                // loadData returns the refreshed list; using it avoids advancing
                // based on a stale closure of `scripts`.
                const refreshed = await loadData();

                // Auto-advance to next episode if not at the last one
                const currentIdx = refreshed.findIndex(s => s.ep_id === selectedEpId);
                if (currentIdx >= 0 && currentIdx < refreshed.length - 1) {
                    selectEpisode(refreshed[currentIdx + 1]);
                }
            }
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSavingLeft(false);
        }
    };

    const handleApplyRight = async () => {
        if (!activeProject || !selectedEpId || !rightContent) return;

        setIsSavingRight(true);
        try {
            // First apply to left
            setLeftContent(rightContent);

            // Then save
            const res = await api.post("/api/stage6/save", {
                project: activeProject.name,
                ep_id: selectedEpId,
                content: rightContent
            });

            if (res.success) {
                toast.success("已应用并保存AI润色结果！");
                setRightContent("");
                const refreshed = await loadData();

                // Auto-advance to next episode if not at the last one
                const currentIdx = refreshed.findIndex(s => s.ep_id === selectedEpId);
                if (currentIdx >= 0 && currentIdx < refreshed.length - 1) {
                    selectEpisode(refreshed[currentIdx + 1]);
                }
            }
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSavingRight(false);
        }
    };

    const handleExportDocx = async () => {
        if (!activeProject) return;

        setIsExporting(true);
        try {
            const res = await api.get(`/api/stage6/export-docx?project=${encodeURIComponent(activeProject.name)}`);
            if (res.success) {
                toast.success(res.message);
            }
        } catch (e: any) {
            toast.error("导出失败: " + e.message);
        } finally {
            setIsExporting(false);
        }
    };

    const handleClearAll = async () => {
        if (!activeProject) return;

        setIsClearing(true);
        try {
            const res = await api.delete(`/api/stage6/${encodeURIComponent(activeProject.name)}/scripts`);
            if (res.success) {
                toast.success("已清空所有最终剧本");
                await loadData();
            }
        } catch (e: any) {
            toast.error("清空失败: " + e.message);
        } finally {
            setIsClearing(false);
        }
    };

    // --- Helpers ---
    useUnloadGuard(isRefining);

    const getEpisodeStatus = (epId: number): 'saved' | 'current' | 'empty' => {
        if (epId === selectedEpId) return 'current';
        const ep = scripts.find(s => s.ep_id === epId);
        if (ep && ep.scenes && ep.scenes.length > 0) return 'saved';
        return 'empty';
    };

    const getProgress = () => {
        const withContent = scripts.filter(s => s.scenes && s.scenes.length > 0).length;
        return { completed: withContent, total: scripts.length };
    };

    const progress = getProgress();

    // --- Render ---
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="animate-spin mr-2" /> 加载项目信息...
            </div>
        );
    }

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
                    <Stethoscope size={64} className="opacity-50" />
                </div>
                <h2 className="text-xl font-semibold mb-2">未选择项目</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    请在左侧侧边栏选择一个项目以开始剧本精修。
                </p>
            </div>
        );
    }

    if (scripts.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-6 rounded-full mb-6">
                    <Stethoscope size={64} className="text-amber-600 opacity-70" />
                </div>
                <h2 className="text-xl font-semibold mb-2">请先完成 Stage 5</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    Stage 6 需要 Stage 5 的精修剧本作为输入。
                </p>
                <div className="mt-6">
                    <Link href={`/stage5?project=${encodeURIComponent(activeProject.name)}`}>
                        <Button className="gap-2">
                            去 Stage 5
                            <ArrowRight size={15} />
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <StageNav current={6} />
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">Stage 6: 剧本医生 Script Doctor</h1>
                        <p className="text-sm text-slate-500">单集深度诊断与定向润色</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyFromS5}
                            disabled={isCopying}
                            title="从 Stage 5 重新拷贝（重置当前阶段）"
                        >
                            {isCopying ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Copy className="mr-2 h-4 w-4" />
                            )}
                            从 S5 拷贝
                        </Button>
                        <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                                />
                            </div>
                            <span className="text-slate-500">
                                {progress.completed}/{progress.total} 集
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content: Master-Detail Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Episode List */}
                <div className="w-48 border-r flex flex-col bg-slate-50/50 dark:bg-slate-900/50 shrink-0 overflow-hidden">
                    <div className="p-3 border-b">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">📋 剧集列表</h3>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                                        disabled={isClearing || scripts.length === 0}
                                        title="清空所有最终剧本"
                                    >
                                        {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认清空所有最终剧本？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            此操作将删除该项目所有已整理的最终剧本（共 {scripts.length} 集）。此操作不可撤销。
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>取消</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleClearAll}
                                            className="bg-red-500 hover:bg-red-600"
                                        >
                                            确认清空
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-2 space-y-1">
                            {scripts.map(ep => {
                                const status = getEpisodeStatus(ep.ep_id);
                                const isSelected = ep.ep_id === selectedEpId;
                                return (
                                    <button
                                        key={ep.ep_id}
                                        onClick={() => selectEpisode(ep)}
                                        className={`w-full text-left p-2 rounded-lg transition-all ${isSelected
                                            ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 border'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {status === 'saved' ? (
                                                <CheckCircle2 size={14} className="text-emerald-500" />
                                            ) : (
                                                <Circle size={14} className="text-slate-300" />
                                            )}
                                            <span className={`text-sm font-medium ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                                                第 {ep.ep_id} 集
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Dual-Column Editor */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Control Bar */}
                    <div className="p-4 border-b bg-white dark:bg-slate-950 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Badge variant="outline" className="text-base px-3 py-1">
                                    第 {selectedEpId} 集
                                </Badge>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-500">润色方案：</span>
                                    <Select
                                        value={selectedInstruction}
                                        onValueChange={setSelectedInstruction}
                                    >
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="选择润色方案" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {instructions.map((ins, idx) => (
                                                <SelectItem key={idx} value={ins.prompt}>
                                                    {ins.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportDocx}
                                    disabled={isExporting || scripts.length === 0}
                                >
                                    {isExporting ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <FileDown className="mr-2 h-4 w-4" />
                                    )}
                                    导出 docx
                                </Button>
                            </div>
                        </div>
                        {/* Custom Instruction Input */}
                        <div className="mt-3">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-slate-500">用户详细指令（最高优先级，可选）：</span>
                            </div>
                            <Textarea
                                value={customInstruction}
                                onChange={(e) => setCustomInstruction(e.target.value)}
                                placeholder="输入更详细的修改指令，例如：把第3场的对白加长、减少动作描写..."
                                rows={2}
                                className="resize-none text-sm"
                            />
                        </div>
                    </div>

                    {/* Dual Editors */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Editor */}
                        <div className="flex-1 flex flex-col border-r overflow-hidden">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">当前剧本</span>
                                    <Badge variant="secondary" className="text-xs">
                                        {leftContent.length} 字
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex-1 p-4 overflow-hidden">
                                <Textarea
                                    value={leftContent}
                                    onChange={(e) => setLeftContent(e.target.value)}
                                    className="h-full resize-none font-mono text-sm"
                                    placeholder="剧本内容..."
                                />
                            </div>
                            <div className="pt-6 pb-8 px-3 flex gap-2">
                                <Button
                                    onClick={handleSaveLeft}
                                    disabled={isSavingLeft}
                                    variant="outline"
                                    className="flex-1 h-12"
                                >
                                    {isSavingLeft ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    保存修改
                                </Button>
                                <Button
                                    onClick={handleRefine}
                                    disabled={isRefining}
                                    className="flex-1 h-12"
                                >
                                    {isRefining ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 润色中...</>
                                    ) : (
                                        <><Wand2 className="mr-2 h-4 w-4" /> AI 润色</>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Right Editor */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">AI 润色结果</span>
                                    <Badge variant="secondary" className="text-xs">
                                        {rightContent.length} 字
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex-1 p-4 overflow-hidden">
                                <Textarea
                                    value={rightContent}
                                    onChange={(e) => setRightContent(e.target.value)}
                                    className="h-full resize-none font-mono text-sm"
                                    placeholder="点击「AI 润色」后，润色结果将显示在这里..."
                                />
                            </div>
                            <div className="pt-6 pb-8 px-3">
                                <Button
                                    onClick={handleApplyRight}
                                    disabled={isSavingRight || !rightContent}
                                    variant="default"
                                    className="w-full h-12"
                                >
                                    {isSavingRight ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <ArrowRight className="mr-2 h-4 w-4" />
                                    )}
                                    覆盖保存到左侧
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
