"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getAuthHeaders } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, ArrowLeft, CheckCircle2, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useProject } from "@/lib/contexts/project-context";

interface Episode {
    ep_id: number;
    raw_content?: string;
    scenes: any[];
}

interface EpisodePreview {
    ep_id: number;
    preview: string;
    scene_count: number;
}

export default function ImportPage() {
    const router = useRouter();
    const { refreshProjects } = useProject();

    // Phase State
    const [phase, setPhase] = useState<'input' | 'preview' | 'saved' | 'bible'>('input');

    // Input State
    const [rawContent, setRawContent] = useState("");
    const [projectName, setProjectName] = useState("");

    // Parsed Data
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [episodesPreview, setEpisodesPreview] = useState<EpisodePreview[]>([]);
    const [episodeCount, setEpisodeCount] = useState(0);
    const [headerContent, setHeaderContent] = useState("");

    // UI State
    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedEps, setExpandedEps] = useState<Set<number>>(new Set());

    // --- Actions ---
    const handleParse = async () => {
        if (!rawContent.trim()) {
            toast.error("请输入剧本内容");
            return;
        }

        setIsParsing(true);
        try {
            const res = await api.post("/api/import/parse", { content: rawContent });

            if (res.success) {
                setEpisodes(res.episodes || []);
                setEpisodesPreview(res.episodes_preview || []);
                setEpisodeCount(res.episode_count || 0);
                setHeaderContent(res.header_content || "");
                setPhase('preview');
                toast.success(`成功解析 ${res.episode_count} 集`);
            }
        } catch (e: any) {
            toast.error("解析失败: " + e.message);
        } finally {
            setIsParsing(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // For .txt and .md, read directly
        if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            const text = await file.text();
            setRawContent(text);
            toast.success(`已加载 ${file.name}`);
        }
        // For .docx, send to backend
        else if (file.name.endsWith('.docx')) {
            setIsParsing(true);
            try {
                const formData = new FormData();
                formData.append('file', file);

                // Use same-origin URL (proxied by Next.js rewrites / nginx)
                const backendUrl = process.env.NEXT_PUBLIC_API_URL || '';
                const res = await fetch(`${backendUrl}/api/import/parse-file`, {
                    method: 'POST',
                    body: formData,
                    headers: getAuthHeaders(),
                });

                if (!res.ok) {
                    let detail = `解析失败 (HTTP ${res.status})`;
                    try {
                        const errData = await res.json();
                        if (errData?.detail) detail = errData.detail;
                    } catch { /* not json */ }
                    throw new Error(detail);
                }

                const data = await res.json();
                if (data.success) {
                    setEpisodes(data.episodes || []);
                    setEpisodesPreview(data.episodes_preview || []);
                    setEpisodeCount(data.episode_count || 0);
                    setHeaderContent(data.header_content || "");
                    setPhase('preview');
                    toast.success(`成功解析 ${data.episode_count} 集`);
                } else {
                    toast.error(data.detail || "解析失败");
                }
            } catch (e: any) {
                toast.error("解析失败: " + e.message);
            } finally {
                setIsParsing(false);
            }
        } else {
            toast.error("不支持的文件格式");
        }
    };

    const handleSave = async () => {
        if (!projectName.trim()) {
            toast.error("请输入项目名称");
            return;
        }

        setIsSaving(true);
        try {
            const res = await api.post("/api/import/save", {
                project_name: projectName,
                episodes: episodes
            });

            if (res.success) {
                toast.success(res.message);
                await refreshProjects();
                setPhase('saved');
            }
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateBible = async () => {
        setIsGenerating(true);
        try {
            const res = await api.post("/api/import/generate-bible", {
                project_name: projectName
            });

            if (res.success) {
                toast.success("Story Bible 生成成功！");
                setPhase('bible');

                // Redirect to Stage 1 after delay
                setTimeout(() => {
                    router.push(`/stage1?project=${encodeURIComponent(projectName)}`);
                }, 1500);
            }
        } catch (e: any) {
            toast.error("生成失败: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleEpisode = (epId: number) => {
        const newSet = new Set(expandedEps);
        if (newSet.has(epId)) {
            newSet.delete(epId);
        } else {
            newSet.add(epId);
        }
        setExpandedEps(newSet);
    };

    // --- Render ---
    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            返回
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold">导入项目</h1>
                        <p className="text-sm text-slate-500">导入已有剧本，自动解析分集结构</p>
                    </div>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="px-6 py-3 border-b bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-4 text-sm">
                    <div className={`flex items-center gap-2 ${phase === 'input' ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'input' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>1</div>
                        输入内容
                    </div>
                    <div className="w-8 h-px bg-slate-300" />
                    <div className={`flex items-center gap-2 ${phase === 'preview' ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'preview' ? 'bg-blue-600 text-white' : phase !== 'input' ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>2</div>
                        预览确认
                    </div>
                    <div className="w-8 h-px bg-slate-300" />
                    <div className={`flex items-center gap-2 ${phase === 'saved' ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'saved' || phase === 'bible' ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>3</div>
                        保存项目
                    </div>
                    <div className="w-8 h-px bg-slate-300" />
                    <div className={`flex items-center gap-2 ${phase === 'bible' ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${phase === 'bible' ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>4</div>
                        AI 反推
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">

                    {/* Phase 1: Input */}
                    {phase === 'input' && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">上传或粘贴剧本</CardTitle>
                                    <CardDescription>支持 .docx / .txt / .md 文件，或直接粘贴文本</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* File Upload */}
                                    <div className="flex items-center gap-4">
                                        <label className="cursor-pointer">
                                            <input
                                                type="file"
                                                accept=".docx,.txt,.md"
                                                onChange={handleFileUpload}
                                                className="hidden"
                                            />
                                            <Button variant="outline" asChild>
                                                <span>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    选择文件
                                                </span>
                                            </Button>
                                        </label>
                                        <span className="text-sm text-slate-400">或直接粘贴内容 ↓</span>
                                    </div>

                                    {/* Text Input */}
                                    <Textarea
                                        value={rawContent}
                                        onChange={(e) => setRawContent(e.target.value)}
                                        placeholder={`粘贴剧本内容...

格式示例：

第一集

1-1 日/内
场景：办公室
人物：张三 李四

张三走进办公室。
张三：你好。

第二集
...`}
                                        rows={20}
                                        className="resize-none font-mono text-sm"
                                    />
                                    <div className="text-xs text-slate-400">
                                        已输入 {rawContent.length} 字
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="flex justify-end">
                                <Button onClick={handleParse} disabled={isParsing || !rawContent.trim()}>
                                    {isParsing ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 解析中...</>
                                    ) : (
                                        <><FileText className="mr-2 h-4 w-4" /> 解析内容</>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Phase 2: Preview */}
                    {phase === 'preview' && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        解析结果
                                        <Badge variant="secondary">{episodeCount} 集</Badge>
                                    </CardTitle>
                                    <CardDescription>确认解析结果无误后，输入项目名称并保存</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Project Name */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">项目名称</label>
                                        <Input
                                            value={projectName}
                                            onChange={(e) => setProjectName(e.target.value)}
                                            placeholder="例如：霸道总裁爱上我"
                                            className="max-w-md"
                                        />
                                    </div>

                                    {/* Episodes Preview */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">剧集预览 (点击展开)</label>
                                        <div className="border rounded-lg max-h-80 overflow-y-auto">
                                            {episodesPreview.map((ep) => (
                                                <div key={ep.ep_id} className="border-b last:border-b-0">
                                                    <button
                                                        onClick={() => toggleEpisode(ep.ep_id)}
                                                        className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Badge variant="outline">第 {ep.ep_id} 集</Badge>
                                                            <span className="text-xs text-slate-400">{ep.scene_count} 场</span>
                                                        </div>
                                                        {expandedEps.has(ep.ep_id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </button>
                                                    {expandedEps.has(ep.ep_id) && (
                                                        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                                                            {ep.preview}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="flex justify-between">
                                <Button variant="outline" onClick={() => setPhase('input')}>
                                    返回修改
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving || !projectName.trim()}>
                                    {isSaving ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>
                                    ) : (
                                        <><CheckCircle2 className="mr-2 h-4 w-4" /> 保存到 Stage 4/5/6</>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Phase 3: Saved */}
                    {phase === 'saved' && (
                        <>
                            <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10">
                                <CardContent className="py-8 text-center">
                                    <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">Phase 1 完成！</h3>
                                    <p className="text-slate-500 mb-6">
                                        已将 {episodeCount} 集剧本保存到 Stage 4/5/6
                                    </p>

                                    <div className="space-y-4">
                                        <p className="text-sm text-slate-600">
                                            接下来可以让 AI 根据剧本反推 Story Bible (Stage 1)
                                        </p>
                                        <Button onClick={handleGenerateBible} disabled={isGenerating}>
                                            {isGenerating ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI 生成中...</>
                                            ) : (
                                                <><Wand2 className="mr-2 h-4 w-4" /> AI 生成 Story Bible</>
                                            )}
                                        </Button>
                                        <div className="text-sm text-slate-400">
                                            或者 <Link href={`/stage6?project=${encodeURIComponent(projectName)}`} className="text-blue-500 hover:underline">直接进入 Stage 6</Link> 开始润色
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* Phase 4: Bible Generated */}
                    {phase === 'bible' && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-6 rounded-full mb-6">
                                <CheckCircle2 size={64} className="text-emerald-500" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">导入完成！</h2>
                            <p className="text-slate-500 mb-6">Story Bible 已生成，正在跳转到 Stage 1...</p>
                            <Loader2 className="animate-spin text-slate-400" />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
