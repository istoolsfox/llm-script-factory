"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLatestRequest } from "@/lib/hooks/use-request-guard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Globe, Film, Users, Share2, Plus, X, Save } from "lucide-react";
import { useProject } from "@/lib/contexts/project-context";

// --- Component Keys ---
type Component = "worldview" | "main_plot" | "characters" | "relationships";

const COMPONENT_META: { key: Component; label: string; icon: any; color: string }[] = [
    { key: "worldview", label: "世界观", icon: Globe, color: "text-blue-500" },
    { key: "main_plot", label: "主线剧情", icon: Film, color: "text-purple-500" },
    { key: "characters", label: "人物设定", icon: Users, color: "text-green-500" },
    { key: "relationships", label: "人物关系", icon: Share2, color: "text-amber-500" },
];

interface WorldBibleProps {
    synopsis: any;
    concept: string;
}

export function WorldBible({ synopsis, concept }: WorldBibleProps) {
    const { activeProject } = useProject();
    const loadGuard = useLatestRequest();
    const [data, setData] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState<Record<string, boolean>>({});

    const loadData = async () => {
        if (!activeProject) return;
        const seq = loadGuard.next();
        try {
            const res = await api.get(`/api/bible/${activeProject.name}/data`);
            if (loadGuard.isStale(seq)) return;
            setData(res || {});
        } catch (e: any) {
            if (loadGuard.isStale(seq)) return;
            toast.error("加载世界设定失败: " + e.message);
        }
    };

    useEffect(() => {
        if (activeProject) {
            loadData();
        } else {
            setData({});
        }
    }, [activeProject]);

    const generateComponent = async (comp: Component) => {
        if (!activeProject) {
            toast.error("请先选择项目");
            return;
        }
        setGenerating((prev: any) => ({ ...prev, [comp]: true }));
        const endpointMap: Record<Component, string> = {
            worldview: "/api/bible/worldview/generate",
            main_plot: "/api/bible/main-plot/generate",
            characters: "/api/bible/characters/generate",
            relationships: "/api/bible/relationships/generate",
        };
        try {
            toast.info(`正在生成${COMPONENT_META.find(c => c.key === comp)?.label}...`);
            const res: any = await api.post(endpointMap[comp], { project_name: activeProject.name }, { timeoutMs: 10 * 60 * 1000 });
            if (res.success && res.data) {
                setData((prev: any) => ({ ...prev, [comp]: res.data }));
                toast.success(`${COMPONENT_META.find(c => c.key === comp)?.label}生成成功`);
                // 自动保存生成结果
                try {
                    await api.post("/api/bible/save", {
                        project_name: activeProject.name,
                        component: comp,
                        data: res.data,
                    });
                } catch (saveErr: any) {
                    console.error("Auto-save failed:", saveErr);
                }
            } else {
                toast.error("生成返回异常");
            }
        } catch (e: any) {
            toast.error("生成失败: " + e.message);
        } finally {
            setGenerating((prev: any) => ({ ...prev, [comp]: false }));
        }
    };

    const saveComponent = async (comp: Component) => {
        if (!activeProject) return;
        if (!data[comp]) {
            toast.error("内容为空，无法保存");
            return;
        }
        try {
            await api.post("/api/bible/save", {
                project_name: activeProject.name,
                component: comp,
                data: data[comp],
            });
            toast.success(`${COMPONENT_META.find(c => c.key === comp)?.label}已保存`);
        } catch (e: any) {
            toast.error("保存失败: " + e.message);
        }
    };

    const updateData = (comp: Component, updater: (prev: any) => any) => {
        setData((prev: any) => ({ ...prev, [comp]: updater(prev[comp]) }));
    };

    // --- Render helpers per component ---
    const renderWorldview = (w: any) => (
        <div className="space-y-3">
            <Field label="时代背景">
                <Input value={w.era || ""} onChange={(e) => updateData("worldview", p => ({ ...p, era: e.target.value }))} />
            </Field>
            <Field label="地点 (逗号分隔)">
                <Input
                    value={(w.locations || []).join(", ")}
                    onChange={(e) => updateData("worldview", p => ({ ...p, locations: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                />
            </Field>
            <Field label="社会规则 (每行一条)">
                <Textarea
                    rows={3}
                    value={(w.rules || []).join("\n")}
                    onChange={(e) => updateData("worldview", p => ({ ...p, rules: e.target.value.split("\n").filter(s => s.trim()) }))}
                />
            </Field>
            <Field label="独特设定 (每行一条)">
                <Textarea
                    rows={3}
                    value={(w.unique_features || []).join("\n")}
                    onChange={(e) => updateData("worldview", p => ({ ...p, unique_features: e.target.value.split("\n").filter(s => s.trim()) }))}
                />
            </Field>
            <Field label="势力格局">
                <div className="space-y-2">
                    {(w.factions || []).map((f: any, i: number) => (
                        <div key={i} className="flex gap-2">
                            <Input value={f.name || ""} placeholder="势力名" onChange={(e) => {
                                const arr = [...w.factions]; arr[i] = { ...arr[i], name: e.target.value };
                                updateData("worldview", p => ({ ...p, factions: arr }));
                            }} className="w-1/3" />
                            <Input value={f.desc || ""} placeholder="势力描述" onChange={(e) => {
                                const arr = [...w.factions]; arr[i] = { ...arr[i], desc: e.target.value };
                                updateData("worldview", p => ({ ...p, factions: arr }));
                            }} className="flex-1" />
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => updateData("worldview", p => ({ ...p, factions: [...(p.factions || []), { name: "", desc: "" }] }))}>
                        <Plus className="mr-1 h-3 w-3" /> 添加势力
                    </Button>
                </div>
            </Field>
            <Field label="深层冲突根源">
                <Textarea rows={2} value={w.conflict_root || ""} onChange={(e) => updateData("worldview", p => ({ ...p, conflict_root: e.target.value }))} />
            </Field>
        </div>
    );

    const renderMainPlot = (m: any) => (
        <div className="space-y-3">
            <Field label="核心矛盾">
                <Textarea rows={2} value={m.core_conflict || ""} onChange={(e) => updateData("main_plot", p => ({ ...p, core_conflict: e.target.value }))} />
            </Field>
            <Field label="主线脉络 (阶段/描述, 每行一对)">
                <div className="space-y-2">
                    {(m.main_thread || []).map((t: any, i: number) => (
                        <div key={i} className="flex gap-2">
                            <Input value={t.stage || ""} placeholder="阶段名" className="w-1/3" onChange={(e) => {
                                const arr = [...m.main_thread]; arr[i] = { ...arr[i], stage: e.target.value };
                                updateData("main_plot", p => ({ ...p, main_thread: arr }));
                            }} />
                            <Input value={t.desc || ""} placeholder="阶段描述" className="flex-1" onChange={(e) => {
                                const arr = [...m.main_thread]; arr[i] = { ...arr[i], desc: e.target.value };
                                updateData("main_plot", p => ({ ...p, main_thread: arr }));
                            }} />
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => updateData("main_plot", p => ({ ...p, main_thread: [...(p.main_thread || []), { stage: "", desc: "" }] }))}>
                        <Plus className="mr-1 h-3 w-3" /> 添加阶段
                    </Button>
                </div>
            </Field>
            <Field label="关键事件 (事件/集数/描述, 每行一组)">
                <div className="space-y-2">
                    {(m.key_events || []).map((ev: any, i: number) => (
                        <div key={i} className="space-y-1 border-l-2 border-purple-300 pl-2">
                            <div className="flex gap-2">
                                <Input value={ev.name || ""} placeholder="事件名" className="w-1/2" onChange={(e) => {
                                    const arr = [...m.key_events]; arr[i] = { ...arr[i], name: e.target.value };
                                    updateData("main_plot", p => ({ ...p, key_events: arr }));
                                }} />
                                <Input value={ev.episode_hint || ""} placeholder="集数提示" className="w-1/4" onChange={(e) => {
                                    const arr = [...m.key_events]; arr[i] = { ...arr[i], episode_hint: e.target.value };
                                    updateData("main_plot", p => ({ ...p, key_events: arr }));
                                }} />
                            </div>
                            <Textarea rows={1} value={ev.desc || ""} placeholder="事件描述" onChange={(e) => {
                                const arr = [...m.key_events]; arr[i] = { ...arr[i], desc: e.target.value };
                                updateData("main_plot", p => ({ ...p, key_events: arr }));
                            }} />
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => updateData("main_plot", p => ({ ...p, key_events: [...(p.key_events || []), { name: "", episode_hint: "", desc: "" }] }))}>
                        <Plus className="mr-1 h-3 w-3" /> 添加事件
                    </Button>
                </div>
            </Field>
            <Field label="人物核心动机">
                <Textarea rows={2} value={m.character_motivation || ""} onChange={(e) => updateData("main_plot", p => ({ ...p, character_motivation: e.target.value }))} />
            </Field>
            <Field label="终极悬念">
                <Input value={m.ultimate_suspense || ""} onChange={(e) => updateData("main_plot", p => ({ ...p, ultimate_suspense: e.target.value }))} />
            </Field>
            <Field label="结局走向">
                <Textarea rows={2} value={m.ending_direction || ""} onChange={(e) => updateData("main_plot", p => ({ ...p, ending_direction: e.target.value }))} />
            </Field>
        </div>
    );

    const renderCharacters = (c: any) => (
        <div className="space-y-4">
            {(c.characters || []).map((ch: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <Input
                            value={ch.name || ""}
                            placeholder="姓名"
                            className="w-1/4 font-medium"
                            onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], name: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }}
                        />
                        <Input
                            value={ch.role || ""}
                            placeholder="角色定位"
                            className="w-1/4"
                            onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], role: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }}
                        />
                        <Input
                            value={ch.age || ""}
                            placeholder="年龄"
                            className="w-1/6"
                            onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], age: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 ml-auto h-7 w-7"
                            onClick={() => updateData("characters", p => ({ ...p, characters: p.characters.filter((x: any, idx: number) => idx !== i) }))}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="外貌" compact>
                            <Input value={ch.appearance || ""} onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], appearance: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }} />
                        </Field>
                        <Field label="性格 (逗号分隔)" compact>
                            <Input value={(ch.personality || []).join(", ")} onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], personality: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="目标" compact>
                            <Textarea rows={1} value={ch.goals || ""} onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], goals: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }} />
                        </Field>
                        <Field label="恐惧" compact>
                            <Textarea rows={1} value={ch.fears || ""} onChange={(e) => {
                                const arr = [...c.characters]; arr[i] = { ...arr[i], fears: e.target.value };
                                updateData("characters", p => ({ ...p, characters: arr }));
                            }} />
                        </Field>
                    </div>
                    <Field label="秘密">
                        <Textarea rows={1} value={ch.secrets || ""} onChange={(e) => {
                            const arr = [...c.characters]; arr[i] = { ...arr[i], secrets: e.target.value };
                            updateData("characters", p => ({ ...p, characters: arr }));
                        }} />
                    </Field>
                    <Field label="背景故事">
                        <Textarea rows={2} value={ch.background || ""} onChange={(e) => {
                            const arr = [...c.characters]; arr[i] = { ...arr[i], background: e.target.value };
                            updateData("characters", p => ({ ...p, characters: arr }));
                        }} />
                    </Field>
                    <Field label="成长弧光">
                        <Textarea rows={1} value={ch.arc || ""} onChange={(e) => {
                            const arr = [...c.characters]; arr[i] = { ...arr[i], arc: e.target.value };
                            updateData("characters", p => ({ ...p, characters: arr }));
                        }} />
                    </Field>
                </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => updateData("characters", p => ({ ...p, characters: [...(p.characters || []), { name: "", role: "", age: "", personality: [] }] }))}>
                <Plus className="mr-1 h-3 w-3" /> 添加角色
            </Button>
        </div>
    );

    const renderRelationships = (r: any) => (
        <div className="space-y-2">
            {(r.relationships || []).map((rel: any, i: number) => (
                <div key={i} className="flex gap-2 items-center">
                    <Input value={rel.from || ""} placeholder="A" className="w-1/5" onChange={(e) => {
                        const arr = [...r.relationships]; arr[i] = { ...arr[i], from: e.target.value };
                        updateData("relationships", p => ({ ...p, relationships: arr }));
                    }} />
                    <span className="text-slate-400 text-xs">→</span>
                    <Input value={rel.to || ""} placeholder="B" className="w-1/5" onChange={(e) => {
                        const arr = [...r.relationships]; arr[i] = { ...arr[i], to: e.target.value };
                        updateData("relationships", p => ({ ...p, relationships: arr }));
                    }} />
                    <Input value={rel.type || ""} placeholder="关系类型" className="w-1/6" onChange={(e) => {
                        const arr = [...r.relationships]; arr[i] = { ...arr[i], type: e.target.value };
                        updateData("relationships", p => ({ ...p, relationships: arr }));
                    }} />
                    <Input value={rel.desc || ""} placeholder="关系描述" className="flex-1" onChange={(e) => {
                        const arr = [...r.relationships]; arr[i] = { ...arr[i], desc: e.target.value };
                        updateData("relationships", p => ({ ...p, relationships: arr }));
                    }} />
                    <Button variant="ghost" size="icon" className="text-red-500 h-7 w-7 shrink-0" onClick={() => updateData("relationships", p => ({ ...p, relationships: p.relationships.filter((x: any, idx: number) => idx !== i) }))}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => updateData("relationships", p => ({ ...p, relationships: [...(p.relationships || []), { from: "", to: "", type: "", desc: "" }] }))}>
                <Plus className="mr-1 h-3 w-3" /> 添加关系
            </Button>
        </div>
    );

    const components = {
        worldview: renderWorldview,
        main_plot: renderMainPlot,
        characters: renderCharacters,
        relationships: renderRelationships,
    };

    if (!activeProject) {
        return (
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <p>请先在左侧选择一个项目。</p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold">世界设定 Story Bible</h3>
                    <p className="text-sm text-slate-500">世界观 · 主线剧情 · 人物设定 · 人物关系（AI生成或手动编辑）</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                    <Loader2 className={"mr-1 h-3 w-3 " + (loading ? "animate-spin" : "")} /> 刷新
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {COMPONENT_META.map(meta => {
                    const Icon = meta.icon;
                    const hasData = !!data[meta.key];
                    return (
                        <Card key={meta.key}>
                            <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Icon className={"h-4 w-4 " + meta.color} />
                                    {meta.label}
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => generateComponent(meta.key)}
                                        disabled={generating[meta.key]}
                                    >
                                        {generating[meta.key] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                        AI生成
                                    </Button>
                                    {hasData && (
                                        <Button size="sm" onClick={() => saveComponent(meta.key)}>
                                            <Save className="mr-1 h-3 w-3" /> 保存
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="px-4 pb-4">
                                {hasData ? (
                                    components[meta.key](data[meta.key])
                                ) : (
                                    <div className="text-sm text-slate-400 h-8 flex items-center">
                                        {generating[meta.key] ? "生成中..." : `点击「AI生成」或手动填写后保存。`}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function Field({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
    return (
        <div className="space-y-1">
            <label className={"text-xs text-slate-400 font-medium " + (compact ? "block" : "block")}>{label}</label>
            {children}
        </div>
    );
}
