"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { api } from "@/lib/api";
import { StageNav } from "@/components/stage-nav";
import { useLatestRequest } from "@/lib/hooks/use-request-guard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Play, FileText, CheckCircle2, Circle, ChevronRight, ChevronDown, Settings, Trash2 } from "lucide-react";
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
interface Episode {
    ep_id: number;
    title: string;
    outline: string;
    emotional_value: string;
    dtg_check: string;
}

interface StoryUnit {
    unit_id: number;
    episodes: string;
    pattern: string;
    summary: string;
}

interface DetailedCard {
    card_id: number;
    structure: string;
    story_units: StoryUnit[];
}

interface CardData {
    card_id: number;
    one_sentence_summary: string;
}

interface Progress {
    total_cards: number;
    completed_cards: number;
    total_episodes: number;
    completed_episodes: number;
}

/** Parse an absolute episode range like "11-15", "11~15", "11—15"; null when unparseable. */
function parseEpisodeRange(episodesStr: string): { start: number; end: number } | null {
    const parts = String(episodesStr || "").trim().split(/\s*[-~—–～]\s*/);
    const start = parseInt(parts[0], 10);
    if (Number.isNaN(start)) return null;
    const end = parts[1] ? parseInt(parts[1], 10) : start;
    if (Number.isNaN(end)) return null;
    return { start, end };
}

export default function Stage2Page() {
    const { activeProject, isLoading } = useProject();
    const loadGuard = useLatestRequest();

    // Data State
    const [storyBible, setStoryBible] = useState<any>(null);
    const [outlines, setOutlines] = useState<Episode[]>([]);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [cards, setCards] = useState<CardData[]>([]);

    // UI State
    const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);
    const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(0);
    const [selectedEpId, setSelectedEpId] = useState<number | null>(null);
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [detailedCards, setDetailedCards] = useState<DetailedCard[]>([]);

    // Loading State
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // Current batch editing state
    const [editingEpisodes, setEditingEpisodes] = useState<Episode[]>([]);

    // Refine mode state
    const [refineMode, setRefineMode] = useState(false);
    const [adjustmentInstruction, setAdjustmentInstruction] = useState("");

    // --- Load Data ---
    useEffect(() => {
        if (activeProject) {
            loadData();
        } else {
            resetState();
        }
    }, [activeProject]);

    const resetState = () => {
        setStoryBible(null);
        setOutlines([]);
        setProgress(null);
        setCards([]);
        setEditingEpisodes([]);
    };

    const loadData = async () => {
        if (!activeProject) return;
        const seq = loadGuard.next();
        try {
            const res = await api.get(`/api/stage2/${encodeURIComponent(activeProject.name)}/data`);
            if (loadGuard.isStale(seq)) return;
            setStoryBible(res.story_bible);
            setOutlines(res.outlines || []);
            setProgress(res.progress);

            // Extract detailed cards from story bible (Step 3 data)
            const detailed = res.story_bible?.detailed_cards || [];
            setDetailedCards(detailed);

            // Extract cards from story bible (for fallback display)
            let roughSkeleton = res.story_bible?.rough_skeleton || [];
            if (typeof roughSkeleton === 'object' && roughSkeleton.rough_skeleton) {
                roughSkeleton = roughSkeleton.rough_skeleton;
            }
            setCards(Array.isArray(roughSkeleton) ? roughSkeleton : []);

            // Initialize editing episodes for current unit
            updateEditingEpisodes(selectedCardIndex, selectedUnitIndex, res.outlines || [], detailed);
        } catch (e: any) {
            if (loadGuard.isStale(seq)) return;
            console.error("Failed to load stage2 data:", e);
            toast.error("加载数据失败: " + e.message);
        }
    };

    // Update editingEpisodes when card/unit selection changes
    useEffect(() => {
        updateEditingEpisodes(selectedCardIndex, selectedUnitIndex, outlines, detailedCards);
    }, [selectedCardIndex, selectedUnitIndex, outlines, detailedCards]);

    const updateEditingEpisodes = (cardIndex: number, unitIndex: number, allOutlines: Episode[], detailed: DetailedCard[]) => {
        // Get episode range from detailed card's story unit
        const card = detailed[cardIndex];
        const unit = card?.story_units?.[unitIndex];
        if (!unit) {
            setEditingEpisodes([]);
            setSelectedEpId(null);
            return;
        }

        // Parse episodes range - episodes field contains absolute ep_ids (e.g., "11-15")
        // NOT relative to card (the data from Stage 1 Step 3 is already absolute)
        const range = parseEpisodeRange(unit.episodes);
        if (!range) {
            setEditingEpisodes([]);
            setSelectedEpId(null);
            return;
        }

        const batchEpisodes = allOutlines.filter(
            ep => ep.ep_id >= range.start && ep.ep_id <= range.end
        ).sort((a, b) => a.ep_id - b.ep_id);
        setEditingEpisodes(batchEpisodes);
        // Select first episode of batch
        if (batchEpisodes.length > 0) {
            setSelectedEpId(batchEpisodes[0].ep_id);
        } else {
            setSelectedEpId(null);
        }
    };

    // --- Actions ---
    const handleGenerate = async () => {
        if (!activeProject || detailedCards.length === 0) return;

        const card = detailedCards[selectedCardIndex];
        const unit = card?.story_units?.[selectedUnitIndex];
        if (!unit) {
            toast.error("请先完成 Stage 1 Step 3 (详细卡纲)");
            return;
        }

        // Parse episode range for display - episodes field contains absolute ep_ids
        const range = parseEpisodeRange(unit.episodes);
        if (!range) {
            toast.error(`无法解析分集范围 "${unit.episodes}"，请在 Stage 1 Step 3 中修正`);
            return;
        }
        const startEp = range.start;
        const endEp = range.end;

        setIsGenerating(true);

        try {
            let res;
            if (refineMode && editingEpisodes.length > 0 && adjustmentInstruction.trim()) {
                // Refine mode: use existing outlines + adjustment instruction
                toast.info(`正在调整第 ${startEp}-${endEp} 集...`);
                res = await api.post("/api/stage2/batch/refine", {
                    project_name: activeProject.name,
                    card_index: selectedCardIndex,
                    unit_index: selectedUnitIndex,
                    existing_outlines: editingEpisodes,
                    adjustment_instruction: adjustmentInstruction
                }, { timeoutMs: 15 * 60 * 1000 });
            } else {
                // Normal mode: generate from scratch
                toast.info(`正在生成第 ${startEp}-${endEp} 集...（预计需要几分钟）`);
                res = await api.post("/api/stage2/batch/generate", {
                    project_name: activeProject.name,
                    card_index: selectedCardIndex,
                    unit_index: selectedUnitIndex
                }, { timeoutMs: 15 * 60 * 1000 });
            }

            if (res.success && res.data?.episodes) {
                setEditingEpisodes(res.data.episodes);
                toast.success(refineMode ? "调整成功！请检查并保存" : "生成成功！请检查并保存");
                // Auto-select first episode
                if (res.data.episodes.length > 0) {
                    setSelectedEpId(res.data.episodes[0].ep_id);
                }
            }
        } catch (e: any) {
            toast.error((refineMode ? "调整" : "生成") + "失败: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveBatch = async () => {
        if (!activeProject || editingEpisodes.length === 0) return;

        setIsSaving(true);
        try {
            const res = await api.post("/api/stage2/batch/save", {
                project_name: activeProject.name,
                episodes: editingEpisodes
            });

            if (res.success) {
                toast.success("保存成功！");
                // Reload data to update progress
                await loadData();
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
            const res = await api.delete(`/api/stage2/${encodeURIComponent(activeProject.name)}/outlines`);
            if (res.success) {
                toast.success("已清空所有大纲内容");
                await loadData();
            }
        } catch (e: any) {
            toast.error("清空失败: " + e.message);
        } finally {
            setIsClearing(false);
        }
    };

    const updateEpisode = (epId: number, field: keyof Episode, value: string) => {
        setEditingEpisodes(prev =>
            prev.map(ep =>
                ep.ep_id === epId ? { ...ep, [field]: value } : ep
            )
        );
    };

    // --- Helpers ---
    const getCardStatus = (cardIndex: number): 'complete' | 'partial' | 'empty' => {
        // Use the card's actual episode ranges from the detailed cards rather
        // than assuming a fixed 10 episodes per card.
        const card = detailedCards[cardIndex];
        const units = card?.story_units || [];
        if (units.length === 0) return 'empty';
        let expected = 0;
        let count = 0;
        for (const unit of units) {
            const range = parseEpisodeRange(unit.episodes);
            if (!range) continue;
            expected += range.end - range.start + 1;
            count += outlines.filter(ep => ep.ep_id >= range.start && ep.ep_id <= range.end).length;
        }
        if (expected === 0) return 'empty';
        if (count >= expected) return 'complete';
        if (count > 0) return 'partial';
        return 'empty';
    };

    const getRearviewMirror = (): Episode[] => {
        // Anchor on the current unit's actual start episode when available
        const card = detailedCards[selectedCardIndex];
        const unit = card?.story_units?.[selectedUnitIndex];
        const range = unit ? parseEpisodeRange(unit.episodes) : null;
        const anchorEp = range ? range.start : 1;
        return outlines
            .filter(ep => ep.ep_id < anchorEp)
            .sort((a, b) => b.ep_id - a.ep_id)
            .slice(0, 10)
            .reverse();
    };

    // Get previous unit for context (unit-based, matching backend logic)
    const getPreviousUnit = (): StoryUnit | null => {
        // Flatten all units into a 1D list
        const flatUnits: { cardId: number; unitIdx: number; unit: StoryUnit }[] = [];
        detailedCards.forEach((card, cardIdx) => {
            card.story_units?.forEach((unit, unitIdx) => {
                flatUnits.push({ cardId: cardIdx, unitIdx, unit });
            });
        });

        // Find current position
        const currentIdx = flatUnits.findIndex(
            u => u.cardId === selectedCardIndex && u.unitIdx === selectedUnitIndex
        );

        if (currentIdx <= 0) return null; // First unit, no previous
        return flatUnits[currentIdx - 1].unit;
    };

    // Get previous unit's generated episodes (actual content, not summary)
    const getPreviousUnitEpisodes = (): Episode[] => {
        const prevUnit = getPreviousUnit();
        if (!prevUnit) return [];

        // Find which card the previous unit belongs to
        const flatUnits: { cardId: number; unit: StoryUnit }[] = [];
        detailedCards.forEach((card, cardIdx) => {
            card.story_units?.forEach((unit) => {
                flatUnits.push({ cardId: cardIdx, unit });
            });
        });

        const prevUnitInfo = flatUnits.find(u => u.unit === prevUnit);
        if (!prevUnitInfo) return [];

        // Parse episode range for previous unit - episodes field contains absolute ep_ids
        const epParts = prevUnit.episodes.replace(/ /g, '').split('-');
        const startEp = parseInt(epParts[0]);
        const endEp = epParts[1] ? parseInt(epParts[1]) : parseInt(epParts[0]);

        // Filter existing outlines by episode range
        return outlines
            .filter(ep => ep.ep_id >= startEp && ep.ep_id <= endEp)
            .sort((a, b) => a.ep_id - b.ep_id);
    };

    const selectedEpisode = editingEpisodes.find(ep => ep.ep_id === selectedEpId);

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
                    请在左侧侧边栏选择一个项目以开始结构构建。
                </p>
            </div>
        );
    }

    if (!storyBible || cards.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-6 rounded-full mb-6">
                    <FileText size={64} className="text-amber-600 opacity-70" />
                </div>
                <h2 className="text-xl font-semibold mb-2">请先完成 Stage 1</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    Stage 2 需要 Story Bible 中的粗大纲 (Rough Skeleton) 作为基础。
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <StageNav current={2} />
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">Stage 2: 结构构建 Structure Builder</h1>
                        <p className="text-sm text-slate-500">将粗大纲转化为 80 集详细大纲</p>
                    </div>
                    {progress && (
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all"
                                        style={{ width: `${(progress.completed_episodes / progress.total_episodes) * 100}%` }}
                                    />
                                </div>
                                <span className="text-slate-500">
                                    {progress.completed_episodes}/{progress.total_episodes} 集
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content: Master-Detail Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Card List */}
                <div className="w-56 border-r flex flex-col bg-slate-50/50 dark:bg-slate-900/50 shrink-0 overflow-hidden">
                    <div className="p-3 border-b">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">📋 卡片进度</h3>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                                        disabled={isClearing || outlines.length === 0}
                                        title="清空所有大纲"
                                    >
                                        {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认清空所有大纲？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            此操作将删除该项目所有已生成的详细大纲内容（共 {outlines.length} 集）。此操作不可撤销。
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
                            {cards.map((card, idx) => {
                                const status = getCardStatus(idx);
                                const isSelected = idx === selectedCardIndex;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedCardIndex(idx)}
                                        className={`w-full text-left p-3 rounded-lg transition-all ${isSelected
                                            ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 border'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {status === 'complete' ? (
                                                <CheckCircle2 size={16} className="text-green-500" />
                                            ) : status === 'partial' ? (
                                                <Circle size={16} className="text-amber-500" />
                                            ) : (
                                                <Circle size={16} className="text-slate-300" />
                                            )}
                                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                                                Card {card.card_id || idx + 1}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 line-clamp-2 pl-6">
                                            {card.one_sentence_summary?.substring(0, 40)}...
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Card Header */}
                    <div className="p-4 border-b bg-white dark:bg-slate-950 shrink-0">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h2 className="text-lg font-semibold">
                                        卡 {detailedCards[selectedCardIndex]?.card_id || selectedCardIndex + 1}
                                    </h2>
                                    {/* Unit Selection Buttons */}
                                    <div className="flex gap-1">
                                        {detailedCards[selectedCardIndex]?.story_units?.map((unit, idx) => (
                                            <Button
                                                key={idx}
                                                size="sm"
                                                variant={selectedUnitIndex === idx ? "default" : "outline"}
                                                onClick={() => setSelectedUnitIndex(idx)}
                                                className="text-xs h-7"
                                            >
                                                单元{unit.unit_id} ({unit.episodes})
                                            </Button>
                                        )) || (
                                                <Badge variant="destructive">缺少详细卡纲</Badge>
                                            )}
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {detailedCards[selectedCardIndex]?.story_units?.[selectedUnitIndex]?.summary}
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <Button
                                    variant={refineMode ? "default" : "outline"}
                                    onClick={() => setRefineMode(!refineMode)}
                                    className={refineMode ? "bg-amber-500 hover:bg-amber-600" : ""}
                                    disabled={editingEpisodes.length === 0}
                                    title={editingEpisodes.length === 0 ? "请先生成内容后再使用调整模式" : ""}
                                >
                                    <Settings className="mr-2 h-4 w-4" />
                                    {refineMode ? "调整中" : "调整"}
                                </Button>
                                <Button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || (refineMode && !adjustmentInstruction.trim())}
                                    variant={editingEpisodes.length > 0 ? "outline" : "default"}
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {refineMode ? "调整中..." : "生成中..."}</>
                                    ) : (
                                        <><Play className="mr-2 h-4 w-4" /> {refineMode ? "应用调整" : "生成本批次"}</>
                                    )}
                                </Button>
                                <Button
                                    onClick={handleSaveBatch}
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

                        {/* Adjustment Instruction (only visible when refineMode is on) */}
                        {refineMode && (
                            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <label className="text-sm font-medium text-amber-700 dark:text-amber-300 block mb-2">
                                    📝 调整指令
                                </label>
                                <Textarea
                                    value={adjustmentInstruction}
                                    onChange={(e) => setAdjustmentInstruction(e.target.value)}
                                    placeholder="请输入对当前10集的调整要求，例如：&#10;- 请把第15集的冲突改为...&#10;- 第11-12集节奏太慢，加快推进..."
                                    rows={3}
                                    className="resize-none bg-white dark:bg-slate-900"
                                />
                            </div>
                        )}
                    </div>

                    {/* Context (Collapsible) - Previous Unit Episodes */}
                    <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
                        <CollapsibleTrigger className="w-full px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            {isContextOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            📖 上下文 (上一单元)
                            {getPreviousUnitEpisodes().length > 0 ? (
                                <Badge variant="secondary" className="ml-2">
                                    {getPreviousUnitEpisodes().length} 集
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="ml-2">无</Badge>
                            )}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b max-h-48 overflow-y-auto">
                                {getPreviousUnitEpisodes().length > 0 ? (
                                    <div className="space-y-2 text-sm">
                                        {getPreviousUnitEpisodes().map(ep => (
                                            <div key={ep.ep_id} className="flex gap-2 items-start">
                                                <Badge variant="outline" className="shrink-0">Ep {ep.ep_id}</Badge>
                                                <span className="text-slate-600 dark:text-slate-400">
                                                    {ep.title}: {ep.outline?.substring(0, 100)}...
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-sm">这是第一个单元，将作为开篇生成</p>
                                )}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Episode Editor */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Episode Tabs */}
                        <div className="w-24 border-r bg-white dark:bg-slate-950 shrink-0 flex flex-col overflow-hidden">
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
                                                <div className="text-xs truncate opacity-70">{ep.title || '...'}</div>
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
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">标题</label>
                                            <Input
                                                value={selectedEpisode.title}
                                                onChange={(e) => updateEpisode(selectedEpisode.ep_id, 'title', e.target.value)}
                                                placeholder="两字或四字核心事件"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">爽点类型</label>
                                            <Input
                                                value={selectedEpisode.emotional_value}
                                                onChange={(e) => updateEpisode(selectedEpisode.ep_id, 'emotional_value', e.target.value)}
                                                placeholder="e.g. 打脸/复仇/温情"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">详细大纲</label>
                                        <Textarea
                                            value={selectedEpisode.outline}
                                            onChange={(e) => updateEpisode(selectedEpisode.ep_id, 'outline', e.target.value)}
                                            placeholder="详细剧情，约150-200字。包含：开场钩子 -> 核心冲突 -> 结尾反转(Hook)"
                                            rows={15}
                                            className="resize-none"
                                        />
                                        <div className="text-xs text-slate-400 text-right">
                                            {selectedEpisode.outline?.length || 0} 字
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">DTG 符合度</label>
                                        <Input
                                            value={selectedEpisode.dtg_check}
                                            onChange={(e) => updateEpisode(selectedEpisode.ep_id, 'dtg_check', e.target.value)}
                                            placeholder="e.g. 3分钟小高潮"
                                        />
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
