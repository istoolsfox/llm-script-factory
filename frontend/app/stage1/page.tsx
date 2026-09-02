"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { api, getAuthHeaders } from "@/lib/api";
import { useLatestRequest, useUnloadGuard } from "@/lib/hooks/use-request-guard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MDEditor from "@uiw/react-md-editor";
import { Input } from "@/components/ui/input"; // Added import
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Play, RefreshCw, FileText, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WorldBible } from "@/components/world-bible";
import { StageNav } from "@/components/stage-nav";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Stage1Page() {
    const { activeProject, isLoading } = useProject();
    const loadGuard = useLatestRequest();

    // Inputs
    const [concept, setConcept] = useState("");

    // Outputs
    const [synopsisData, setSynopsisData] = useState<any>(null);
    const [outlineData, setOutlineData] = useState<any>(null);
    const [detailedCards, setDetailedCards] = useState<any[]>([]);

    // Loading States
    const [isGeneratingSyn, setIsGeneratingSyn] = useState(false);
    const [isGeneratingOut, setIsGeneratingOut] = useState(false);
    const [isGeneratingDetail, setIsGeneratingDetail] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [detailInstruction, setDetailInstruction] = useState("");

    // Edit Mode
    const [isEditMode, setIsEditMode] = useState(false);

    // Active Tab (for syncing header tabs with content)
    const [activeTab, setActiveTab] = useState("synopsis");

    // Load default template from backend
    const loadDefaultTemplate = async () => {
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
            const res = await fetch(`${baseUrl}/api/stage1/concept-template`, { headers: getAuthHeaders() });
            if (res.ok) {
                const template = await res.text();
                setConcept(template);
            }
        } catch (e) {
            console.error("Failed to load concept template");
        }
    };

    // Save concept to project
    const [isSavingConcept, setIsSavingConcept] = useState(false);
    const saveConcept = async () => {
        if (!activeProject || !concept.trim()) return;
        setIsSavingConcept(true);
        try {
            await api.post("/api/stage1/user-input/save", {
                project_name: activeProject.name,
                concept: concept
            });
            toast.success("概念已保存");
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSavingConcept(false);
        }
    };

    // AI Polish concept
    const [isPolishing, setIsPolishing] = useState(false);

    useUnloadGuard(isGeneratingSyn || isGeneratingOut || isGeneratingDetail || isPolishing);
    const handlePolishConcept = async () => {
        if (!activeProject || !concept.trim()) return;
        setIsPolishing(true);
        toast.info("正在调用 AI 润色...");
        try {
            const res = await api.post("/api/stage1/concept/polish", {
                project_name: activeProject.name,
                concept: concept
            }, { timeoutMs: 5 * 60 * 1000 });
            if (res.success && res.data?.polished_concept) {
                setConcept(res.data.polished_concept);
                toast.success("润色完成！");
            } else {
                toast.warning("润色返回格式异常");
            }
        } catch (e: any) {
            toast.error("润色失败: " + e.message);
        } finally {
            setIsPolishing(false);
        }
    };

    // Ctrl+S keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveConcept();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeProject, concept]);

    // Initial Load
    useEffect(() => {
        if (activeProject) {
            loadData();
        } else {
            setSynopsisData(null);
            setOutlineData(null);
            setDetailedCards([]);
            setConcept("");  // Clear concept when no project
        }
    }, [activeProject]);

    const loadData = async () => {
        if (!activeProject) return;
        const seq = loadGuard.next();
        try {
            const res = await api.get(`/api/stage1/${activeProject.name}/data`);
            if (loadGuard.isStale(seq)) return;
            if (res.synopsis) setSynopsisData(res.synopsis);
            if (res.outline) setOutlineData(res.outline);
            if (res.detailed_cards) setDetailedCards(res.detailed_cards);

            // Load saved user input (no auto-load template)
            if (res.user_input && res.user_input.concept) {
                setConcept(res.user_input.concept);
            } else {
                setConcept("");  // No saved concept, start empty
            }
        } catch (e) {
            if (loadGuard.isStale(seq)) return;
            console.error("Failed to load stage1 data");
            setConcept("");  // On error, start empty
        }
    };

    const handleGenerateSynopsis = async () => {
        if (!activeProject) return;
        if (!concept.trim()) {
            toast.error("请输入核心创意");
            return;
        }

        setIsGeneratingSyn(true);
        toast.info("请求已发送，正在调用 AI 模型...（预计需要一两分钟）");

        try {
            console.log("Sending generate request...");
            const res = await api.post("/api/stage1/synopsis/generate", {
                project_name: activeProject.name,
                concept
            }, { timeoutMs: 10 * 60 * 1000 });
            console.log("Generate response:", res);

            if (res.success && res.data) {
                setSynopsisData(res.data);
                toast.success("梗概生成成功！");
                // Auto save?
                await handleSaveSynopsis(res.data, false);
            } else {
                console.error("Unexpected response format:", res);
                toast.warning("请求成功但返回格式异常，请查看控制台");
            }
        } catch (e: any) {
            console.error("Generate error:", e);
            toast.error(e.message || "生成失败");
        } finally {
            setIsGeneratingSyn(false);
        }
    };

    const handleGenerateOutline = async () => {
        if (!activeProject || !synopsisData) return;

        setIsGeneratingOut(true);
        try {
            const res = await api.post("/api/stage1/outline/generate", {
                project_name: activeProject.name,
                synopsis_data: synopsisData,
                concept    // Pass user input to save before generation
            }, { timeoutMs: 10 * 60 * 1000 });

            if (res.success && res.data) {
                setOutlineData(res.data);
                toast.success("大纲生成成功");
                await handleSaveOutline(res.data, false);
            }
        } catch (e: any) {
            toast.error(e.message || "生成失败");
        } finally {
            setIsGeneratingOut(false);
        }
    };

    const handleSaveSynopsis = async (data = synopsisData, showToast = true) => {
        if (!activeProject || !data) return;
        try {
            setIsSaving(true);
            await api.post("/api/stage1/synopsis/save", {
                project_name: activeProject.name,
                data
            });
            if (showToast) toast.success("梗概已保存");
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveOutline = async (data = outlineData, showToast = true) => {
        if (!activeProject || !data) return;
        try {
            setIsSaving(true);
            await api.post("/api/stage1/outline/save", {
                project_name: activeProject.name,
                data
            });
            if (showToast) toast.success("大纲已保存");
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Save All (Edit Mode)
    const handleSaveAll = async () => {
        if (!activeProject) return;
        setIsSaving(true);
        try {
            if (synopsisData) {
                await api.post("/api/stage1/synopsis/save", {
                    project_name: activeProject.name,
                    data: synopsisData
                });
            }
            if (outlineData) {
                await api.post("/api/stage1/outline/save", {
                    project_name: activeProject.name,
                    data: outlineData
                });
            }
            if (detailedCards.length > 0) {
                await api.post("/api/stage1/detailed/save", {
                    project_name: activeProject.name,
                    data: { detailed_cards: detailedCards }
                });
            }
            toast.success("已保存所有内容");
            setIsEditMode(false);
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Step 3: Generate Detailed Cards
    const handleGenerateDetailedCards = async (cardIndices: number[]) => {
        if (!activeProject || !outlineData) return;

        setIsGeneratingDetail(true);
        try {
            const res = await api.post("/api/stage1/detailed/generate", {
                project_name: activeProject.name,
                card_indices: cardIndices,
                concept,    // Pass user input to save before generation
                detail_instruction: detailInstruction  // User's custom instruction
            }, { timeoutMs: 10 * 60 * 1000 });

            console.log("Step 3 API response:", res);

            if (res.success && res.data) {
                // Handle various response formats from LLM
                let newCards = [];
                if (Array.isArray(res.data)) {
                    newCards = res.data;
                } else if (res.data.detailed_cards) {
                    newCards = res.data.detailed_cards;
                } else if (typeof res.data === 'object') {
                    // Maybe the response is the card object itself
                    newCards = [res.data];
                }

                console.log("Parsed new cards:", newCards);

                if (newCards.length === 0) {
                    toast.error("生成结果为空，请重试");
                    return;
                }

                // Merge with existing detailed cards
                const existingById = new Map(detailedCards.map((c: any) => [c.card_id, c]));
                newCards.forEach((c: any) => existingById.set(c.card_id, c));
                const merged = Array.from(existingById.values()).sort((a: any, b: any) => a.card_id - b.card_id);

                setDetailedCards(merged);
                toast.success(`卡 ${cardIndices.map(i => i + 1).join(', ')} 详细卡纲生成成功`);

                // Auto save
                await handleSaveDetailedCards(merged, false);
            } else {
                toast.error("API 返回失败");
            }
        } catch (e: any) {
            console.error("Step 3 generation error:", e);
            toast.error(e.message || "生成失败");
        } finally {
            setIsGeneratingDetail(false);
        }
    };

    const handleSaveDetailedCards = async (data = detailedCards, showToast = true) => {
        if (!activeProject || !data || data.length === 0) return;
        try {
            await api.post("/api/stage1/detailed/save", {
                project_name: activeProject.name,
                data: { detailed_cards: data }
            });
            if (showToast) toast.success("详细卡纲已保存");
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        }
    };

    const handleClearDetailedCards = async () => {
        if (!activeProject) return;

        try {
            // Save empty array to clear file
            await api.post("/api/stage1/detailed/save", {
                project_name: activeProject.name,
                data: { detailed_cards: [] }
            });
            setDetailedCards([]);
            toast.success("详细卡纲已清空");
        } catch (e: any) {
            toast.error("清空失败: " + e.message);
        }
    };

    // const { activeProject, isLoading } = useProject(); // Duplicate removed

    // ... (keep state) ...

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="animate-spin mr-2" /> 加载项目信息...
            </div>
        )
    }

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
                    <FileText size={64} className="opacity-50" />
                </div>
                <h2 className="text-xl font-semibold mb-2">未选择项目</h2>
                <p className="text-slate-400 mb-6 max-w-sm text-center">
                    请在左侧侧边栏 <span className="font-bold text-slate-600 dark:text-slate-300">选择一个现有项目</span> 或 <span className="font-bold text-slate-600 dark:text-slate-300">创建新项目</span> 以开始工作。
                </p>
                {/* Optional: Add a button to trigger project creation directly from here? 
                    For now, directing to sidebar is safe. 
                */}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <StageNav current={1} />
            <div className="flex-1 flex flex-col space-y-4 p-6 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Stage 1: 创意孵化 Idea Lab</h1>
                    <p className="text-slate-500 text-sm">输入核心创意，生成短剧梗概与粗大纲。</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Global Save or Actions */}
                </div>
            </div>

            <Group orientation="horizontal" className="flex-1 border rounded-lg overflow-hidden bg-white dark:bg-slate-950 shadow-sm">

                <Panel id="left-panel" defaultSize="50%" minSize="30%" maxSize="70%" className="flex flex-col">
                    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">

                        {/* 1. Concept Section */}
                        <div className="flex-1 flex flex-col min-h-0 p-4 pb-2">
                            <div className="flex items-center justify-between mb-2 shrink-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-medium">1. 核心创意 (Concept)</h3>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                                加载模板
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>加载模板？</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    这将覆盖编辑器中的当前内容，替换为预设模板。此操作不可撤销。
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>取消</AlertDialogCancel>
                                                <AlertDialogAction onClick={loadDefaultTemplate}>
                                                    确认加载
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        className="h-6 px-3 text-xs"
                                        onClick={saveConcept}
                                        disabled={isSavingConcept || !activeProject || !concept.trim()}
                                    >
                                        {isSavingConcept ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <>保存 <span className="ml-1 opacity-60 text-[10px]">Ctrl+S</span></>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-3 text-xs text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                        onClick={handlePolishConcept}
                                        disabled={isPolishing || !activeProject || !concept.trim()}
                                    >
                                        {isPolishing ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <>AI润色</>
                                        )}
                                    </Button>
                                </div>
                                <span className="text-xs text-slate-500">
                                    {isGeneratingSyn ? "正在锁定创意..." : "Markdown 格式输入"}
                                </span>
                            </div>
                            <div className="flex-1 overflow-hidden rounded-md border" data-color-mode="light">
                                <MDEditor
                                    value={concept}
                                    onChange={(val) => setConcept(val || "")}
                                    height="100%"
                                    preview="edit"
                                    hideToolbar={false}
                                    enableScroll={true}
                                    visibleDragbar={false}
                                />
                            </div>
                        </div>

                        {/* Action Section */}
                        <div className="p-4 pt-4 shrink-0 flex gap-2">
                            <Button
                                onClick={handleGenerateSynopsis}
                                disabled={isGeneratingSyn || !concept.trim()}
                                className="flex-1 transition-all"
                                size="lg"
                            >
                                {isGeneratingSyn ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...</>
                                ) : (
                                    <><Play className="mr-2 h-4 w-4" /> 生成梗概</>
                                )}
                            </Button>
                            <Button
                                onClick={handleGenerateOutline}
                                disabled={isGeneratingOut || !synopsisData}
                                className="flex-1 transition-all"
                                variant={synopsisData ? "default" : "outline"}
                                size="lg"
                            >
                                {isGeneratingOut ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...</>
                                ) : (
                                    <><RefreshCw className="mr-2 h-4 w-4" /> 生成大纲</>
                                )}
                            </Button>
                        </div>

                    </div>
                </Panel>

                <Separator className="w-px bg-border" />

                {/* Right Panel: Data Display */}
                <Panel id="right-panel" defaultSize="50%" minSize="30%" className="flex flex-col">
                    {/* Header with Toggle - Fixed Height */}
                    <div className="px-4 h-12 border-b flex items-center justify-between bg-white dark:bg-slate-950 shrink-0">
                        {!isEditMode ? (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
                                <TabsList>
                                    <TabsTrigger value="synopsis">剧情梗概</TabsTrigger>
                                    <TabsTrigger value="outline" disabled={!synopsisData}>粗大纲 (8 Beats)</TabsTrigger>
                                    <TabsTrigger value="detailed" disabled={!outlineData}>详细卡纲</TabsTrigger>
                                    <TabsTrigger value="bible">世界设定</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        ) : (
                            <span className="font-semibold text-sm flex items-center gap-2">
                                <Pencil size={14} /> 编辑模式
                            </span>
                        )}

                        <div className="flex items-center gap-3">
                            {isEditMode && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleSaveAll}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                    ) : (
                                        <Save className="mr-1 h-3 w-3" />
                                    )}
                                    保存
                                </Button>
                            )}
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="edit-mode"
                                    checked={isEditMode}
                                    onCheckedChange={setIsEditMode}
                                    disabled={!synopsisData}
                                />
                                <Label htmlFor="edit-mode" className="text-xs cursor-pointer">编辑</Label>
                            </div>
                        </div>
                    </div>

                    {/* Edit Mode View */}
                    {isEditMode ? (
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-6 space-y-8 max-w-4xl mx-auto">
                                {/* Synopsis Section */}
                                <section className="space-y-4">
                                    <h2 className="text-xl font-bold">剧情梗概</h2>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>标题</Label>
                                            <Input
                                                value={synopsisData?.title || ""}
                                                onChange={(e) => setSynopsisData({ ...synopsisData, title: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>主题</Label>
                                            <Input
                                                value={synopsisData?.theme || ""}
                                                onChange={(e) => setSynopsisData({ ...synopsisData, theme: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Logline (一句话描述)</Label>
                                        <Textarea
                                            value={synopsisData?.logline || ""}
                                            onChange={(e) => setSynopsisData({ ...synopsisData, logline: e.target.value })}
                                            rows={2}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>世界观与背景</Label>
                                        <Textarea
                                            value={synopsisData?.background || ""}
                                            onChange={(e) => setSynopsisData({ ...synopsisData, background: e.target.value })}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>核心价值与看点</Label>
                                        <Textarea
                                            value={synopsisData?.value_analysis || ""}
                                            onChange={(e) => setSynopsisData({ ...synopsisData, value_analysis: e.target.value })}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>故事主线</Label>
                                        <Textarea
                                            value={synopsisData?.synopsis || ""}
                                            onChange={(e) => setSynopsisData({ ...synopsisData, synopsis: e.target.value })}
                                            rows={6}
                                        />
                                    </div>

                                    {/* Characters */}
                                    <div className="space-y-3">
                                        <Label>主要人物</Label>
                                        {synopsisData?.characters?.map((char: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-4 gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                                                <Input
                                                    placeholder="姓名"
                                                    value={char.name || ""}
                                                    onChange={(e) => {
                                                        const newChars = [...synopsisData.characters];
                                                        newChars[idx] = { ...newChars[idx], name: e.target.value };
                                                        setSynopsisData({ ...synopsisData, characters: newChars });
                                                    }}
                                                />
                                                <Input
                                                    placeholder="角色"
                                                    value={char.role || ""}
                                                    onChange={(e) => {
                                                        const newChars = [...synopsisData.characters];
                                                        newChars[idx] = { ...newChars[idx], role: e.target.value };
                                                        setSynopsisData({ ...synopsisData, characters: newChars });
                                                    }}
                                                />
                                                <Input
                                                    placeholder="描述"
                                                    value={char.desc || ""}
                                                    className="col-span-2"
                                                    onChange={(e) => {
                                                        const newChars = [...synopsisData.characters];
                                                        newChars[idx] = { ...newChars[idx], desc: e.target.value };
                                                        setSynopsisData({ ...synopsisData, characters: newChars });
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Outline Section */}
                                {outlineData && (
                                    <section className="space-y-4">
                                        <h2 className="text-xl font-bold">粗大纲 (8 Cards)</h2>

                                        <div className="space-y-4">
                                            {(outlineData.rough_skeleton || []).map((card: any, idx: number) => (
                                                <div key={idx} className="space-y-2">
                                                    <Label className="text-blue-600">卡 {card.card_id || idx + 1}</Label>
                                                    <Textarea
                                                        value={card.one_sentence_summary || ""}
                                                        onChange={(e) => {
                                                            const newCards = [...outlineData.rough_skeleton];
                                                            newCards[idx] = { ...newCards[idx], one_sentence_summary: e.target.value };
                                                            setOutlineData({ ...outlineData, rough_skeleton: newCards });
                                                        }}
                                                        rows={3}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Detailed Cards Section (Step 3) */}
                                {detailedCards.length > 0 && (
                                    <section className="space-y-4">
                                        <h2 className="text-xl font-bold">详细卡纲 (Step 3)</h2>

                                        <div className="space-y-6">
                                            {detailedCards.map((card: any, cardIdx: number) => (
                                                <div key={card.card_id} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <Label className="text-green-600 font-semibold">卡 {card.card_id}</Label>
                                                        <Input
                                                            className="w-32"
                                                            placeholder="结构"
                                                            value={card.structure || ""}
                                                            onChange={(e) => {
                                                                const newCards = [...detailedCards];
                                                                newCards[cardIdx] = { ...newCards[cardIdx], structure: e.target.value };
                                                                setDetailedCards(newCards);
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Story Units */}
                                                    {card.story_units?.map((unit: any, unitIdx: number) => (
                                                        <div key={unit.unit_id} className="pl-4 border-l-2 border-green-400 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Label className="text-sm text-green-600">单元 {unit.unit_id}</Label>
                                                                <Input
                                                                    className="w-24"
                                                                    placeholder="集数"
                                                                    value={unit.episodes || ""}
                                                                    onChange={(e) => {
                                                                        const newCards = [...detailedCards];
                                                                        const newUnits = [...newCards[cardIdx].story_units];
                                                                        newUnits[unitIdx] = { ...newUnits[unitIdx], episodes: e.target.value };
                                                                        newCards[cardIdx] = { ...newCards[cardIdx], story_units: newUnits };
                                                                        setDetailedCards(newCards);
                                                                    }}
                                                                />
                                                                <Input
                                                                    className="w-20"
                                                                    placeholder="模式"
                                                                    value={unit.pattern || ""}
                                                                    onChange={(e) => {
                                                                        const newCards = [...detailedCards];
                                                                        const newUnits = [...newCards[cardIdx].story_units];
                                                                        newUnits[unitIdx] = { ...newUnits[unitIdx], pattern: e.target.value };
                                                                        newCards[cardIdx] = { ...newCards[cardIdx], story_units: newUnits };
                                                                        setDetailedCards(newCards);
                                                                    }}
                                                                />
                                                            </div>
                                                            <Textarea
                                                                value={unit.summary || ""}
                                                                placeholder="故事单元梗概..."
                                                                rows={4}
                                                                onChange={(e) => {
                                                                    const newCards = [...detailedCards];
                                                                    const newUnits = [...newCards[cardIdx].story_units];
                                                                    newUnits[unitIdx] = { ...newUnits[unitIdx], summary: e.target.value };
                                                                    newCards[cardIdx] = { ...newCards[cardIdx], story_units: newUnits };
                                                                    setDetailedCards(newCards);
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                            </div>
                        </ScrollArea>
                    ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                            {/* Hidden TabsList - actual tabs are in the header above */}
                            <TabsList className="hidden">
                                <TabsTrigger value="synopsis">剧情梗概</TabsTrigger>
                                <TabsTrigger value="outline">粗大纲</TabsTrigger>
                                <TabsTrigger value="detailed">详细卡纲</TabsTrigger>
                                <TabsTrigger value="bible">世界设定</TabsTrigger>
                            </TabsList>

                            <TabsContent value="synopsis" className="flex-1 flex flex-col min-h-0 p-0 m-0 data-[state=inactive]:hidden">
                                <ScrollArea className="flex-1 min-h-0">
                                    <div className="p-6">
                                        {synopsisData ? (
                                            <div className="space-y-6 max-w-4xl mx-auto">
                                                {/* Title & Metadata */}
                                                <div className="space-y-4 text-center">
                                                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{synopsisData.title}</h2>
                                                    <p className="text-lg text-slate-600 dark:text-slate-400 italic font-serif">"{synopsisData.logline}"</p>

                                                    <div className="flex flex-wrap gap-2 justify-center">
                                                        {synopsisData.theme && <Badge variant="outline" className="text-sm py-1">{synopsisData.theme}</Badge>}
                                                        {synopsisData.value_analysis && <Badge variant="secondary" className="text-sm py-1">价值: {synopsisData.value_analysis.substring(0, 20)}...</Badge>}
                                                    </div>
                                                </div>

                                                {/* Background & Setting */}
                                                {synopsisData.background && (
                                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border">
                                                        <h3 className="font-semibold text-slate-900 dark:text-slate-200 mb-2 flex items-center gap-2">
                                                            🌍 世界观与背景
                                                        </h3>
                                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                            {synopsisData.background}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Value Analysis (Full) */}
                                                {synopsisData.value_analysis && (
                                                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
                                                        <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">💡 核心价值与看点</h3>
                                                        <p className="text-sm text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                                                            {synopsisData.value_analysis}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Main Synopsis */}
                                                <div className="prose dark:prose-invert max-w-none">
                                                    <h3 className="font-semibold text-xl mb-3">故事主线</h3>
                                                    <div className="whitespace-pre-wrap text-base leading-7 text-slate-800 dark:text-slate-200">
                                                        {synopsisData.synopsis || synopsisData.synopsis_main}
                                                    </div>
                                                </div>

                                                {/* Characters */}
                                                {synopsisData.characters && synopsisData.characters.length > 0 && (
                                                    <div className="space-y-4 pt-4 border-t">
                                                        <h3 className="font-semibold text-xl mb-3">主要人物</h3>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {synopsisData.characters.map((char: any, i: number) => (
                                                                <Card key={i} className="shadow-sm">
                                                                    <CardHeader className="py-2 px-4 bg-slate-50 dark:bg-slate-900/50 border-b">
                                                                        <CardTitle className="text-base flex justify-between items-center">
                                                                            <span>{char.name}</span>
                                                                            <Badge variant="secondary" className="text-xs font-normal">{char.role}</Badge>
                                                                        </CardTitle>
                                                                    </CardHeader>
                                                                    <CardContent className="p-4 pt-3 text-sm text-slate-600 dark:text-slate-300">
                                                                        {char.desc}
                                                                        {char.tags && (
                                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                                {char.tags.map((t: string) => (
                                                                                    <span key={t} className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">{t}</span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </CardContent>
                                                                </Card>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}


                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                                                <p>👈 请在左侧输入创意并点击生成</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="outline" className="flex-1 p-0 m-0 overflow-hidden">
                                <ScrollArea className="h-full p-6">
                                    {outlineData ? (
                                        <div className="space-y-6 max-w-3xl mx-auto">
                                            <div className="mb-4">
                                                <h3 className="text-lg font-bold">8节拍粗大纲</h3>
                                            </div>

                                            <div className="space-y-6">
                                                {(outlineData.rough_skeleton || outlineData.beats)?.map((card: any, idx: number) => (
                                                    <div key={idx} className="prose dark:prose-invert max-w-none">
                                                        <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                                                            <span className="text-blue-600 dark:text-blue-400">卡 {card.card_id || idx + 1}</span>
                                                            {card.name && <span className="text-slate-600 dark:text-slate-300">• {card.name}</span>}
                                                        </h4>
                                                        <p className="text-sm leading-7 text-slate-700 dark:text-slate-300 pl-4">
                                                            {card.one_sentence_summary || card.description}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                                            <p>暂无大纲。请先生成梗概，再点击“生成粗大纲”。</p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="detailed" className="flex-1 p-0 m-0 overflow-hidden">
                                <ScrollArea className="h-full p-6">
                                    <div className="space-y-6 max-w-4xl mx-auto">
                                        {/* Generation Buttons */}
                                        <div className="flex flex-wrap gap-2 mb-6">
                                            <span className="text-sm text-slate-500 mr-2 self-center">生成详细卡纲:</span>
                                            {[0, 2, 4, 6].map((startIdx) => {
                                                const hasCards = detailedCards.some((c: any) => c.card_id === startIdx + 1 || c.card_id === startIdx + 2);
                                                return (
                                                    <Button
                                                        key={startIdx}
                                                        size="sm"
                                                        variant={hasCards ? "secondary" : "outline"}
                                                        onClick={() => handleGenerateDetailedCards([startIdx, startIdx + 1])}
                                                        disabled={isGeneratingDetail || !outlineData || hasCards}
                                                        title={hasCards ? "已生成，如需重新生成请先清空" : ""}
                                                    >
                                                        {isGeneratingDetail ? (
                                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                        ) : null}
                                                        卡 {startIdx + 1}-{startIdx + 2}
                                                    </Button>
                                                )
                                            })}
                                            {/* Clear Button with AlertDialog */}
                                            {detailedCards.length > 0 && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            disabled={isGeneratingDetail}
                                                            className="ml-2"
                                                        >
                                                            清空详细卡纲
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>确认清空详细卡纲？</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                此操作将清空所有已生成的详细卡纲数据，且不可撤销。
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>取消</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleClearDetailedCards}>
                                                                确认清空
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>

                                        {/* User Custom Instruction */}
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-sm text-slate-500">用户详细指令（最高优先级，可选）：</span>
                                            </div>
                                            <Textarea
                                                value={detailInstruction}
                                                onChange={(e) => setDetailInstruction(e.target.value)}
                                                placeholder="输入更详细的指令，例如：第5卡需要加入复仇线、注意XXX等..."
                                                rows={2}
                                                className="resize-none text-sm"
                                                disabled={isGeneratingDetail}
                                            />
                                        </div>

                                        {/* Detailed Cards Display */}
                                        {detailedCards.length > 0 ? (
                                            <div className="space-y-8">
                                                {detailedCards.map((card: any) => (
                                                    <div key={card.card_id} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <h4 className="font-semibold text-lg text-blue-600 dark:text-blue-400">
                                                                卡 {card.card_id}
                                                            </h4>
                                                            <Badge variant="outline">{card.structure}</Badge>
                                                        </div>

                                                        <div className="space-y-4">
                                                            {card.story_units?.map((unit: any) => (
                                                                <div key={unit.unit_id} className="pl-4 border-l-2 border-green-500">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                                                            单元 {unit.unit_id}
                                                                        </span>
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            第 {unit.episodes} 集
                                                                        </Badge>
                                                                        <Badge variant="outline" className="text-xs">
                                                                            {unit.pattern}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                                                        {unit.summary}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="h-64 flex flex-col items-center justify-center text-slate-400 opacity-50">
                                                <p>暂无详细卡纲。请点击上方按钮生成。</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="bible" className="flex-1 p-0 m-0 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <div className="h-full">
                                        <WorldBible synopsis={synopsisData} concept={concept} />
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    )}
                </Panel>
            </Group>
            </div>
        </div>
    );
}
