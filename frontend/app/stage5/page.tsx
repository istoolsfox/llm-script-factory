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
import { Loader2, ArrowRight, Save, Play, FileText, CheckCircle2, Circle, ChevronRight, ChevronDown, Wand2, Copy, Trash2 } from "lucide-react";
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

const BATCH_SIZE = 3;
const TOTAL_EPISODES = 80;
const TOTAL_BATCHES = Math.ceil(TOTAL_EPISODES / BATCH_SIZE);
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000; // LLM batch generation can take minutes

export default function Stage5Page() {
    const { activeProject, isLoading } = useProject();
    const loadGuard = useLatestRequest();

    // Data State
    const [s4Scripts, setS4Scripts] = useState<Episode[]>([]);
    const [s5Scripts, setS5Scripts] = useState<Episode[]>([]);

    // UI State
    const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(0);
    const [selectedEpId, setSelectedEpId] = useState<number | null>(null);
    const [isContextOpen, setIsContextOpen] = useState(false);

    // Loading State
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
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
            checkAndInitFromS4();
        } else {
            resetState();
        }
    }, [activeProject]);

    const checkAndInitFromS4 = async () => {
        if (!activeProject) return;
        try {
            const checkRes = await api.get(`/api/stage5/check-needs-init?project=${encodeURIComponent(activeProject.name)}`);
            if (checkRes.needs_init && checkRes.s4_count > 0) {
                // Auto-copy from S4
                toast.info("正在从 Stage 4 初始化数据...");
                await api.post(`/api/stage5/copy-from-s4?project=${encodeURIComponent(activeProject.name)}`, {});
                toast.success(`已从 Stage 4 拷贝 ${checkRes.s4_count} 集`);
            }
            await loadData();
        } catch (e: any) {
            console.error("Check/init failed:", e);
            await loadData();  // Still try to load
        }
    };

    const handleCopyFromS4 = async () => {
        if (!activeProject) return;
        setIsCopying(true);
        try {
            const res = await api.post(`/api/stage5/copy-from-s4?project=${encodeURIComponent(activeProject.name)}`, {});
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
        setS4Scripts([]);
        setS5Scripts([]);
        setEditingEpisodes([]);
        setSelectedBatchIndex(0);
    };

    const loadData = async () => {
        if (!activeProject) return;
        const seq = loadGuard.next();
        try {
            // Load S4 scripts (input)
            const s4Res = await api.get(`/api/stage5/s4-scripts?project=${encodeURIComponent(activeProject.name)}`);
            if (loadGuard.isStale(seq)) return;
            setS4Scripts(s4Res.scripts || []);

            // Load S5 scripts
            const s5Res = await api.get(`/api/stage5/scripts?project=${encodeURIComponent(activeProject.name)}`);
            if (loadGuard.isStale(seq)) return;
            setS5Scripts(s5Res.scripts || []);

            // Initialize editing episodes for current batch
            updateEditingEpisodes(selectedBatchIndex, s5Res.scripts || []);
        } catch (e: any) {
            if (loadGuard.isStale(seq)) return;
            console.error("Failed to load stage5 data:", e);
            toast.error("加载数据失败: " + e.message);
        }
    };

    // Update editingEpisodes when batch selection changes
    useEffect(() => {
        updateEditingEpisodes(selectedBatchIndex, s5Scripts);
        // Keep the custom generation range aligned with the selected batch
        setCustomStartEp(selectedBatchIndex * BATCH_SIZE + 1);
        setCustomEndEp(Math.min((selectedBatchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES));
    }, [selectedBatchIndex, s5Scripts]);

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
        toast.info(`正在精修第 ${startEp}-${endEp} 集...（预计需要几分钟）`);

        try {
            const res = await api.post("/api/stage5/generate", {
                project: activeProject.name,
                start_ep: startEp,
                end_ep: endEp
            }, { timeoutMs: GENERATION_TIMEOUT_MS });

            if (res.success && res.episodes) {
                setEditingEpisodes(res.episodes);
                toast.success("精修并自动保存成功！");
                if (res.episodes.length > 0) {
                    setSelectedEpId(res.episodes[0].ep_id);
                }
                // 自动保存
                try {
                    await api.post("/api/stage5/save", {
                        project: activeProject.name,
                        scripts: res.episodes
                    });
                    await loadData();
                } catch (saveErr: any) {
                    toast.error("自动保存失败: " + saveErr.message);
                }
            }
        } catch (e: any) {
            toast.error("精修失败: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!activeProject || editingEpisodes.length === 0) return;

        setIsSaving(true);
        try {
            const res = await api.post("/api/stage5/save", {
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
            const res = await api.delete(`/api/stage5/${encodeURIComponent(activeProject.name)}/scripts`);
            if (res.success) {
                toast.success("已清空所有精修剧本");
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
        const count = s5Scripts.filter(ep => ep.ep_id >= startEp && ep.ep_id <= endEp).length;
        if (count >= expectedCount) return 'complete';
        if (count > 0) return 'partial';
        return 'empty';
    };

    const hasS4Input = (batchIndex: number): boolean => {
        const startEp = batchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((batchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        return s4Scripts.some(ep => ep.ep_id >= startEp && ep.ep_id <= endEp);
    };

    const getContextWindow = (): Episode[] => {
        const startEp = selectedBatchIndex * BATCH_SIZE + 1;
        const endEp = Math.min((selectedBatchIndex + 1) * BATCH_SIZE, TOTAL_EPISODES);
        return s4Scripts.filter(ep => ep.ep_id >= startEp && ep.ep_id <= endEp);
    };

    const getProgress = () => {
        return {
            completed: s5Scripts.length,
            total: TOTAL_EPISODES
        };
    };

    useUnloadGuard(isGenerating);

    // Get saved S5 scene content for comparison (left side shows saved state)
    const getSavedSceneContent = (epId: number, sceneId: string): string => {
        const savedEpisode = s5Scripts.find(ep => ep.ep_id === epId);
        if (!savedEpisode) return '';
        const savedScene = savedEpisode.scenes?.find(sc => sc.scene_id === sceneId);
        return savedScene?.content || '';
    };

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
                    <Wand2 size={64} className="opacity-50" />
                </div>
                <h2 className="text-xl font-semibold mb-2">未选择项目</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    请在左侧侧边栏选择一个项目以开始正文精修。
                </p>
            </div>
        );
    }

    if (s4Scripts.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-6 rounded-full mb-6">
                    <FileText size={64} className="text-amber-600 opacity-70" />
                </div>
                <h2 className="text-xl font-semibold mb-2">请先完成 Stage 4</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    Stage 5 需要 Stage 4 的剧本草稿作为输入。
                </p>
                <div className="mt-6">
                    <Link href={`/stage4?project=${encodeURIComponent(activeProject.name)}`}>
                        <Button className="gap-2">
                            去 Stage 4
                            <ArrowRight size={15} />
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <StageNav current={5} />
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">Stage 5: 正文精修 Script Polisher</h1>
                        <p className="text-sm text-slate-500">将粗糙剧本转化为标准拍摄脚本 (格式化、去形容词、动作切片)</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyFromS4}
                            disabled={isCopying || s4Scripts.length === 0}
                            title="从 Stage 4 重新拷贝（重置当前阶段）"
                        >
                            {isCopying ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Copy className="mr-2 h-4 w-4" />
                            )}
                            从 S4 拷贝
                        </Button>
                        <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-purple-500 transition-all"
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
                                        disabled={isClearing || s5Scripts.length === 0}
                                        title="清空所有精修剧本"
                                    >
                                        {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认清空所有精修剧本？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            此操作将删除该项目所有已精修的剧本（共 {s5Scripts.length} 集）。此操作不可撤销。
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
                                const hasInput = hasS4Input(idx);
                                const isSelected = idx === selectedBatchIndex;
                                const startEp = idx * BATCH_SIZE + 1;
                                const endEp = Math.min((idx + 1) * BATCH_SIZE, TOTAL_EPISODES);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedBatchIndex(idx)}
                                        className={`w-full text-left p-2 rounded-lg transition-all ${isSelected
                                            ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-300 dark:border-purple-700 border'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {status === 'complete' ? (
                                                <CheckCircle2 size={14} className="text-purple-500" />
                                            ) : status === 'partial' ? (
                                                <Circle size={14} className="text-amber-500" />
                                            ) : hasInput ? (
                                                <Circle size={14} className="text-blue-400" />
                                            ) : (
                                                <Circle size={14} className="text-slate-300" />
                                            )}
                                            <span className={`text-sm font-medium ${isSelected ? 'text-purple-700 dark:text-purple-300' : ''}`}>
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
                                    disabled={isGenerating || !hasS4Input(selectedBatchIndex)}
                                    variant={editingEpisodes.length > 0 ? "outline" : "default"}
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 精修中...</>
                                    ) : (
                                        <><Wand2 className="mr-2 h-4 w-4" /> 精修本批次</>
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
                            📄 输入剧本 (S4)
                            <Badge variant="secondary" className="ml-2">{getContextWindow().length} 集</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b max-h-48 overflow-y-auto">
                                <div className="space-y-2 text-xs">
                                    {getContextWindow().map(ep => (
                                        <div key={ep.ep_id} className="border rounded p-2 bg-white dark:bg-slate-800">
                                            <Badge variant="outline" className="mb-1">Ep {ep.ep_id}</Badge>
                                            <div className="text-slate-600 dark:text-slate-400">
                                                {ep.scenes?.slice(0, 2).map(sc => (
                                                    <div key={sc.scene_id} className="truncate">{sc.scene_id}: {sc.content?.substring(0, 60)}...</div>
                                                ))}
                                                {(ep.scenes?.length || 0) > 2 && <div className="text-slate-400">...还有 {ep.scenes.length - 2} 个场景</div>}
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
                                                    ? 'bg-purple-500 text-white'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                    }`}
                                            >
                                                <div className="text-sm font-medium">Ep {ep.ep_id}</div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-slate-400 text-xs">
                                            点击"精修"按钮开始
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
                                        <label className="text-sm font-medium">场景列表 (精修后)</label>
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
                                                {/* Side-by-side comparison */}
                                                <div className="flex gap-4">
                                                    {/* Left: Saved S5 content (read-only) */}
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs font-medium text-slate-500">📄 已保存内容</label>
                                                        <Textarea
                                                            value={getSavedSceneContent(selectedEpisode.ep_id, scene.scene_id)}
                                                            readOnly
                                                            placeholder="无已保存内容"
                                                            rows={12}
                                                            className="resize-none font-mono text-sm bg-slate-100 dark:bg-slate-800 cursor-default"
                                                        />
                                                        <div className="text-xs text-slate-400 text-right">
                                                            {getSavedSceneContent(selectedEpisode.ep_id, scene.scene_id).length} 字
                                                        </div>
                                                    </div>
                                                    {/* Right: S5 Refined (editable) */}
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs font-medium text-purple-600">✨ 精修内容 (S5)</label>
                                                        <Textarea
                                                            value={scene.content}
                                                            onChange={(e) => updateScene(selectedEpisode.ep_id, idx, 'content', e.target.value)}
                                                            placeholder="精修正文 (标准拍摄格式)"
                                                            rows={12}
                                                            className="resize-none font-mono text-sm"
                                                        />
                                                        <div className="text-xs text-slate-400 text-right">
                                                            {scene.content?.length || 0} 字
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400">
                                    <div className="text-center">
                                        <Wand2 size={48} className="mx-auto mb-4 opacity-30" />
                                        <p>点击左侧"精修本批次"按钮开始</p>
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
