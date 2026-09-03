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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Save, Play, FileText, CheckCircle2, Circle, ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
interface Scene {
    scene_id: string;
    time?: string;
    location?: string;
    characters?: string;
    content: string;
}

interface Episode {
    ep_id: number;
    scenes: Scene[];
}

interface S3Episode {
    ep_id: number;
    scenes: { scene_id: string; location: string; content: string }[];
    hook: string;
}

const BATCH_SIZE = 3;
const TOTAL_EPISODES = 80;
const TOTAL_BATCHES = Math.ceil(TOTAL_EPISODES / BATCH_SIZE);
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000; // LLM batch generation can take minutes

export default function Stage4Page() {
    const { activeProject, isLoading } = useProject();
    const loadGuard = useLatestRequest();

    // Data State
    const [s3Outlines, setS3Outlines] = useState<S3Episode[]>([]);
    const [s4Scripts, setS4Scripts] = useState<Episode[]>([]);

    // UI State
    const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(0);
    const [selectedEpId, setSelectedEpId] = useState<number | null>(null);
    const [isContextOpen, setIsContextOpen] = useState(false);

    // Loading State
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // Current batch editing state
    const [editingEpisodes, setEditingEpisodes] = useState<Episode[]>([]);

    // Custom episode range for generation (kept in sync with the selected batch;
    // the user can still override the numbers manually).
    const [customStartEp, setCustomStartEp] = useState<number>(1);
    const [customEndEp, setCustomEndEp] = useState<number>(BATCH_SIZE);

    // --- Load Data ---
    useEffect(() => {
        if (activeProject) {
            loadData();
        } else {
            resetState();
        }
    }, [activeProject]);

    const resetState = () => {
        setS3Outlines([]);
        setS4Scripts([]);
        setEditingEpisodes([]);
        setSelectedBatchIndex(0);
    };

    const loadData = async () => {
        if (!activeProject) return;
        const seq = loadGuard.next();
        try {
            // Load S3 outlines (input)
            const s3Res = await api.get(`/api/stage4/s3-outlines?project=${encodeURIComponent(activeProject.name)}`);
            if (loadGuard.isStale(seq)) return;
            setS3Outlines(s3Res.outlines || []);

            // Load S4 scripts
            const s4Res = await api.get(`/api/stage4/scripts?project=${encodeURIComponent(activeProject.name)}`);
            if (loadGuard.isStale(seq)) return;
            setS4Scripts(s4Res.scripts || []);

            // Initialize editing episodes for current batch
            updateEditingEpisodes(selectedBatchIndex, s4Res.scripts || []);
        } catch (e: any) {
            if (loadGuard.isStale(seq)) return;
            console.error("Failed to load stage4 data:", e);
            toast.error("加载数据失败: " + e.message);
        }
    };

    // Update editingEpisodes when batch selection changes
    useEffect(() => {
        updateEditingEpisodes(selectedBatchIndex, s4Scripts);
        // Keep the custom generation range aligned with the selected batch
        setCustomStartEp(selectedBatchIndex * BATCH_SIZE + 1);
        setCustomEndEp(Math.min((selectedBatchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES));
    }, [selectedBatchIndex, s4Scripts]);

    const updateEditingEpisodes = (batchIndex: number, allScripts: Episode[]) => {
        const startEp = batchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((batchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        const batchEpisodes = allScripts.filter(
            ep => ep.ep_id >= startEp && ep.ep_id <= endEp
        ).sort((a, b) => a.ep_id - b.ep_id);
        setEditingEpisodes(batchEpisodes);
        if (batchEpisodes.length > 0) {
            setSelectedEpId(batchEpisodes[0].ep_id);
        } else {
            setSelectedEpId(null);
        }
    };

    // --- Actions ---
    const handleGenerate = async () => {
        if (!activeProject) return;

        // The range inputs stay synced with the selected batch (see effect above),
        // so generate exactly what the user sees configured.
        const startEp = customStartEp;
        const endEp = customEndEp;

        if (endEp < startEp) {
            toast.error("结束集数不能小于起始集数");
            return;
        }

        setIsGenerating(true);
        toast.info(`正在生成第 ${startEp}-${endEp} 集剧本...（预计需要几分钟）`);

        try {
            const res = await api.post("/api/stage4/generate", {
                project: activeProject.name,
                start_ep: startEp,
                end_ep: endEp
            }, { timeoutMs: GENERATION_TIMEOUT_MS });

            if (res.success && res.episodes) {
                setEditingEpisodes(res.episodes);
                toast.success("生成并自动保存成功！");
                if (res.episodes.length > 0) {
                    setSelectedEpId(res.episodes[0].ep_id);
                }
                // 自动保存
                try {
                    await api.post("/api/stage4/save", {
                        project: activeProject.name,
                        scripts: res.episodes
                    });
                    await loadData();
                } catch (saveErr: any) {
                    toast.error("自动保存失败: " + saveErr.message);
                }
            }
        } catch (e: any) {
            toast.error("生成失败: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!activeProject || editingEpisodes.length === 0) return;

        setIsSaving(true);
        try {
            const res = await api.post("/api/stage4/save", {
                project: activeProject.name,
                scripts: editingEpisodes
            });

            if (res.success) {
                toast.success("保存成功！");
                await loadData();

                // Auto-advance to next batch if not at the last one
                if (selectedBatchIndex < TOTAL_BATCHES - 1) {
                    setSelectedBatchIndex(selectedBatchIndex + 1);
                }
            }
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearAll = async () => {
        if (!activeProject) return;

        setIsClearing(true);
        try {
            const res = await api.delete(`/api/stage4/${encodeURIComponent(activeProject.name)}/scripts`);
            if (res.success) {
                toast.success("已清空所有剧本");
                await loadData();
            }
        } catch (e: any) {
            toast.error("清空失败: " + e.message);
        } finally {
            setIsClearing(false);
        }
    };

    const updateScene = (epId: number, sceneIndex: number, field: keyof Scene, value: string) => {
        setEditingEpisodes(prev =>
            prev.map(ep => {
                if (ep.ep_id !== epId) return ep;
                const newScenes = [...ep.scenes];
                newScenes[sceneIndex] = { ...newScenes[sceneIndex], [field]: value };
                return { ...ep, scenes: newScenes };
            })
        );
    };

    // --- Helpers ---
    const getBatchStatus = (batchIndex: number): 'complete' | 'partial' | 'empty' => {
        const startEp = batchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((batchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        const expectedCount = endEp - startEp + 1;
        const count = s4Scripts.filter(ep => ep.ep_id >= startEp && ep.ep_id <= endEp).length;
        if (count >= expectedCount) return 'complete';
        if (count > 0) return 'partial';
        return 'empty';
    };

    const hasS3Input = (batchIndex: number): boolean => {
        const startEp = batchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((batchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        return s3Outlines.some(ep => ep.ep_id >= startEp && ep.ep_id <= endEp);
    };

    const getContextWindow = (): S3Episode[] => {
        const startEp = selectedBatchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((selectedBatchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        return s3Outlines.filter(ep => ep.ep_id >= startEp && ep.ep_id <= endEp);
    };

    const getProgress = () => {
        return {
            completed: s4Scripts.length,
            total: TOTAL_EPISODES
        };
    };

    useUnloadGuard(isGenerating);

    const selectedEpisode = editingEpisodes.find(ep => ep.ep_id === selectedEpId);
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
                    <FileText size={64} className="opacity-50" />
                </div>
                <h2 className="text-xl font-semibold mb-2">未选择项目</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    请在左侧侧边栏选择一个项目以开始剧本撰写。
                </p>
            </div>
        );
    }

    if (s3Outlines.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-6 rounded-full mb-6">
                    <FileText size={64} className="text-amber-600 opacity-70" />
                </div>
                <h2 className="text-xl font-semibold mb-2">请先完成 Stage 3</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    Stage 4 需要 Stage 3 的集纲作为输入。
                </p>
                <div className="mt-6">
                    <Link href={`/stage3?project=${encodeURIComponent(activeProject.name)}`}>
                        <Button className="gap-2">
                            去 Stage 3
                            <ArrowRight size={15} />
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <StageNav current={4} />
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all"
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
                {/* Left: Batch List */}
                <div className="w-48 border-r flex flex-col bg-slate-50/50 dark:bg-slate-900/50 shrink-0 overflow-hidden">
                    <div className="p-3 border-b">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">📋 批次进度</h3>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                                        disabled={isClearing || s4Scripts.length === 0}
                                        title="清空所有剧本"
                                    >
                                        {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认清空所有剧本？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            此操作将删除该项目所有已生成的剧本（共 {s4Scripts.length} 集）。此操作不可撤销。
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
                            {Array.from({ length: TOTAL_BATCHES }, (_, idx) => {
                                const status = getBatchStatus(idx);
                                const hasInput = hasS3Input(idx);
                                const isSelected = idx === selectedBatchIndex;
                                const startEp = idx * BATCH_SIZE + 1;
                                const endEp = Math.min((idx + 1) * BATCH_SIZE, TOTAL_EPISODES);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedBatchIndex(idx)}
                                        className={`w-full text-left p-2 rounded-lg transition-all ${isSelected
                                            ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 border'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {status === 'complete' ? (
                                                <CheckCircle2 size={14} className="text-blue-500" />
                                            ) : status === 'partial' ? (
                                                <Circle size={14} className="text-amber-500" />
                                            ) : hasInput ? (
                                                <Circle size={14} className="text-green-400" />
                                            ) : (
                                                <Circle size={14} className="text-slate-300" />
                                            )}
                                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                                                Ep {startEp}-{endEp}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Batch Header */}
                    <div className="p-4 border-b bg-white dark:bg-slate-950 shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    Batch {selectedBatchIndex + 1}:
                                    第 {selectedBatchIndex * BATCH_SIZE + 1} - {Math.min((selectedBatchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES)} 集
                                </h2>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <span>集数</span>
                                    <Input
                                        type="number"
                                        value={customStartEp}
                                        min={1}
                                        max={TOTAL_EPISODES}
                                        onChange={(e) => setCustomStartEp(parseInt(e.target.value) || 1)}
                                        className="w-16 h-8 text-xs"
                                    />
                                    <span>-</span>
                                    <Input
                                        type="number"
                                        value={customEndEp}
                                        min={1}
                                        max={TOTAL_EPISODES}
                                        onChange={(e) => setCustomEndEp(parseInt(e.target.value) || BATCH_SIZE)}
                                        className="w-16 h-8 text-xs"
                                    />
                                </div>
                                <Button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !hasS3Input(selectedBatchIndex)}
                                    variant={editingEpisodes.length > 0 ? "outline" : "default"}
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...</>
                                    ) : (
                                        <><Play className="mr-2 h-4 w-4" /> 生成本批次</>
                                    )}
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving || editingEpisodes.length === 0}
                                >
                                    {isSaving ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    保存
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Context (Collapsible) */}
                    <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
                        <CollapsibleTrigger className="w-full px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            {isContextOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            📖 输入集纲 (S3)
                            <Badge variant="secondary" className="ml-2">{getContextWindow().length} 集</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b max-h-48 overflow-y-auto">
                                <div className="space-y-2 text-xs">
                                    {getContextWindow().map(ep => (
                                        <div key={ep.ep_id} className="border rounded p-2 bg-white dark:bg-slate-800">
                                            <Badge variant="outline" className="mb-1">Ep {ep.ep_id}</Badge>
                                            <div className="text-slate-600 dark:text-slate-400">
                                                {ep.scenes?.map(sc => (
                                                    <div key={sc.scene_id} className="truncate">{sc.scene_id}: {sc.content?.substring(0, 50)}...</div>
                                                ))}
                                                {ep.hook && <div className="text-amber-600">卡点: {ep.hook.substring(0, 30)}...</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Episode Editor */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Episode Tabs */}
                        <div className="w-20 border-r bg-white dark:bg-slate-950 shrink-0 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto">
                                <div className="p-2 space-y-1">
                                    {editingEpisodes.length > 0 ? (
                                        editingEpisodes.map(ep => (
                                            <button
                                                key={ep.ep_id}
                                                onClick={() => setSelectedEpId(ep.ep_id)}
                                                className={`w-full p-2 text-center rounded transition-all ${selectedEpId === ep.ep_id
                                                    ? 'bg-blue-500 text-white'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                    }`}
                                            >
                                                <div className="text-sm font-medium">Ep {ep.ep_id}</div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-slate-400 text-xs">
                                            点击"生成"按钮开始
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Episode Form */}
                        <div className="flex-1 overflow-y-auto">
                            {selectedEpisode ? (
                                <div className="p-6 space-y-4">
                                    {/* Scenes */}
                                    <div className="space-y-4">
                                        <label className="text-sm font-medium">场景列表</label>
                                        {selectedEpisode.scenes?.map((scene, idx) => (
                                            <div key={scene.scene_id || idx} className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/30">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <Badge variant="outline">{scene.scene_id}</Badge>
                                                    <Input
                                                        value={scene.time || ""}
                                                        onChange={(e) => updateScene(selectedEpisode.ep_id, idx, 'time', e.target.value)}
                                                        placeholder="日/夜"
                                                        className="w-24"
                                                    />
                                                    <Input
                                                        value={scene.location || ""}
                                                        onChange={(e) => updateScene(selectedEpisode.ep_id, idx, 'location', e.target.value)}
                                                        placeholder="场景地点"
                                                        className="w-56"
                                                    />
                                                    <Input
                                                        value={scene.characters || ""}
                                                        onChange={(e) => updateScene(selectedEpisode.ep_id, idx, 'characters', e.target.value)}
                                                        placeholder="人物"
                                                        className="w-128"
                                                    />
                                                </div>
                                                <Textarea
                                                    value={scene.content}
                                                    onChange={(e) => updateScene(selectedEpisode.ep_id, idx, 'content', e.target.value)}
                                                    placeholder="剧本正文 (台词 + 动作)"
                                                    rows={10}
                                                    className="resize-none font-mono text-sm"
                                                />
                                                <div className="text-xs text-slate-400 text-right">
                                                    {scene.content?.length || 0} 字
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400">
                                    <div className="text-center">
                                        <Play size={48} className="mx-auto mb-4 opacity-30" />
                                        <p>点击左侧"生成本批次"按钮开始</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
