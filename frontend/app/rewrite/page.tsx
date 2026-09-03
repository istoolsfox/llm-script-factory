"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, Copy, FileText, ArrowRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type Analysis = {
    core_story?: string;
    selling_points?: string[];
    highlights?: string[];
    emotional_hooks?: string[];
    character_archetypes?: string[];
    structure_summary?: string;
};

type Generated = {
    title?: string;
    logline?: string;
    concept?: string;
    selling_points_mapping?: { original: string; new: string }[];
};

export default function RewritePage() {
    const { activeProject } = useProject();
    const router = useRouter();

    const [scriptText, setScriptText] = useState("");
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [instruction, setInstruction] = useState("");
    const [generated, setGenerated] = useState<Generated | null>(null);

    const [isExtracting, setIsExtracting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Load history
    useEffect(() => {
        if (!activeProject) return;
        (async () => {
            try {
                const res = await api.get(`/api/rewrite/${encodeURIComponent(activeProject.name)}/data`);
                if (res.analysis) setAnalysis(res.analysis);
                if (res.generated) setGenerated(res.generated);
                if (res.instruction) setInstruction(res.instruction);
            } catch {
                // no history yet
            }
        })();
    }, [activeProject]);

    const handleExtract = async () => {
        if (!activeProject) return;
        if (scriptText.trim().length < 100) {
            toast.error("请粘贴参考剧本内容（至少100字）");
            return;
        }
        setIsExtracting(true);
        toast.info("正在提炼参考剧本核心...（预计一两分钟）");
        try {
            const res = await api.post("/api/rewrite/extract", {
                project_name: activeProject.name,
                script_text: scriptText
            }, { timeoutMs: 10 * 60 * 1000 });
            if (res.success && res.data) {
                setAnalysis(res.data);
                toast.success("提炼完成！");
            } else {
                toast.warning("返回格式异常");
            }
        } catch (e: any) {
            toast.error("提炼失败: " + e.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleGenerate = async () => {
        if (!activeProject || !analysis) return;
        setIsGenerating(true);
        toast.info("正在换皮生成新故事...");
        try {
            const res = await api.post("/api/rewrite/generate", {
                project_name: activeProject.name,
                instruction: instruction || null
            }, { timeoutMs: 10 * 60 * 1000 });
            if (res.success && res.data) {
                setGenerated(res.data);
                toast.success("换皮完成！");
            } else {
                toast.warning("返回格式异常");
            }
        } catch (e: any) {
            toast.error("生成失败: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!activeProject) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center text-slate-500">
                    <Wand2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>请先在左侧选择或新建一个剧本项目，再使用洗稿功能。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto">
            <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Wand2 className="h-6 w-6 text-amber-500" /> 洗稿换皮
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        粘贴一部参考剧本，AI 自动提炼最核心的故事骨架、卖点与看点，再换皮生成一个全新题材的故事概念，可直接进入 Stage 1 开始创作。
                    </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Step 1: Extract */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">① 参考剧本 → 提炼核心</CardTitle>
                            <CardDescription>粘贴参考剧本全文或核心章节（只提炼骨架与卖点，不会照抄台词）</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Textarea
                                value={scriptText}
                                onChange={(e) => setScriptText(e.target.value)}
                                placeholder="在此粘贴参考剧本..."
                                className="min-h-[220px] font-mono text-xs"
                                disabled={isExtracting}
                            />
                            <Button onClick={handleExtract} disabled={isExtracting || scriptText.trim().length < 100} className="w-full">
                                {isExtracting ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 提炼中...</>
                                ) : (
                                    <><RefreshCw className="mr-2 h-4 w-4" /> 提炼核心与卖点</>
                                )}
                            </Button>

                            {analysis && (
                                <div className="mt-4 space-y-3 text-sm">
                                    <div>
                                        <div className="font-medium mb-1">核心故事线</div>
                                        <p className="text-slate-600 dark:text-slate-300 leading-6">{analysis.core_story}</p>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1">核心卖点</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {analysis.selling_points?.map((sp, i) => (
                                                <Badge key={i} variant="secondary" className="font-normal">{sp}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1">关键看点</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {analysis.highlights?.map((h, i) => (
                                                <Badge key={i} variant="outline" className="font-normal">{h}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1">情绪钩子</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {analysis.emotional_hooks?.map((h, i) => (
                                                <Badge key={i} variant="outline" className="font-normal text-amber-700 dark:text-amber-400">{h}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1">人物原型</div>
                                        <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300 space-y-0.5">
                                            {analysis.character_archetypes?.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1">节奏结构</div>
                                        <p className="text-slate-600 dark:text-slate-300 leading-6">{analysis.structure_summary}</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Step 2: Reskin */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">② 换皮方向 → 生成新故事</CardTitle>
                            <CardDescription>告诉 AI 新故事的题材/背景/风格，保留原骨架与爽点逻辑</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <Label className="text-xs text-slate-500 mb-1 block">换皮要求（可选）</Label>
                                <Input
                                    value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                    placeholder="例：换成海外都市豪门背景，女主视角，背景放跨国财阀"
                                    disabled={isGenerating || !analysis}
                                />
                            </div>
                            <Button onClick={handleGenerate} disabled={isGenerating || !analysis} className="w-full">
                                {isGenerating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...</>
                                ) : (
                                    <><Wand2 className="mr-2 h-4 w-4" /> 生成换皮新故事</>
                                )}
                            </Button>

                            {generated && (
                                <div className="mt-4 space-y-3 text-sm">
                                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                        <div className="font-semibold text-base">{generated.title}</div>
                                        <div className="text-slate-600 dark:text-slate-300 mt-1">{generated.logline}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium mb-1 flex items-center justify-between">
                                            <span>故事概念</span>
                                            <Button size="sm" variant="ghost"
                                                onClick={() => { navigator.clipboard.writeText(generated.concept || ""); toast.success("已复制"); }}>
                                                <Copy className="h-3.5 w-3.5 mr-1" /> 复制
                                            </Button>
                                        </div>
                                        <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200 leading-7 p-3 rounded-md border bg-slate-50 dark:bg-slate-900 max-h-[320px] overflow-auto">
                                            {generated.concept}
                                        </div>
                                    </div>
                                    {generated.selling_points_mapping && generated.selling_points_mapping.length > 0 && (
                                        <div>
                                            <div className="font-medium mb-1">卖点对应表</div>
                                            <div className="space-y-1.5">
                                                {generated.selling_points_mapping.map((m, i) => (
                                                    <div key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2">
                                                        <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-50" />
                                                        <span><span className="opacity-70">{m.original}</span> → <span className="font-medium">{m.new}</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <Button
                                        variant="secondary"
                                        className="w-full"
                                        onClick={() => {
                                            navigator.clipboard.writeText(generated.concept || "");
                                            toast.success("概念已复制，去 Stage 1 粘贴到核心创意即可");
                                            router.push("/stage1");
                                        }}
                                    >
                                        <ArrowRight className="mr-2 h-4 w-4" /> 复制概念并前往 Stage 1 开工
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
