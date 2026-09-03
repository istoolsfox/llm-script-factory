"use client";

import { useState } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import { useProject } from "@/lib/contexts/project-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FileDown, Loader2, FileText, FileArchive } from "lucide-react";
import { BiblePageShell } from "@/components/bible-page-shell";

type Ep = { ep_id: number; title?: string; outline?: string; emotional_value?: string };
type Scene = { scene_id?: string; time?: string; location?: string; characters?: string; content?: string };
type ScriptEp = { ep_id: number; scenes?: Scene[]; content?: string };

function download(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ExportPage() {
    const { activeProject } = useProject();
    const [busy, setBusy] = useState<string | null>(null);

    const exportOutlines = async () => {
        if (!activeProject) return;
        setBusy("outlines");
        try {
            const res = await api.get(`/api/stage2/${encodeURIComponent(activeProject.name)}/data`);
            const eps: Ep[] = (res.outlines || []).sort((a: Ep, b: Ep) => a.ep_id - b.ep_id);
            if (!eps.length) { toast.error("暂无分集大纲"); return; }
            const md = [
                `# ${activeProject.name} — 分集大纲`,
                "",
                ...eps.map((ep) => `## 第 ${ep.ep_id} 集 ${ep.title || ""}\n\n${ep.outline || ""}${ep.emotional_value ? `\n\n情绪价值：${ep.emotional_value}` : ""}`),
            ].join("\n");
            download(`${activeProject.name}-大纲.md`, md);
            toast.success("大纲已导出");
        } catch (e: any) { toast.error(e.message); }
        finally { setBusy(null); }
    };

    const exportScript = async () => {
        if (!activeProject) return;
        setBusy("script");
        try {
            const res = await api.get(`/api/stage6/scripts?project=${encodeURIComponent(activeProject.name)}`);
            const eps: ScriptEp[] = res.scripts || res.episodes || [];
            if (!eps.length) { toast.error("暂无剧本正文（Stage 6）"); return; }
            const parts: string[] = [`# ${activeProject.name} — 剧本`];
            for (const ep of [...eps].sort((a, b) => a.ep_id - b.ep_id)) {
                parts.push(`\n## 第 ${ep.ep_id} 集\n`);
                if (ep.scenes?.length) {
                    for (const sc of ep.scenes) {
                        const head = [sc.scene_id, sc.time, sc.location, sc.characters].filter(Boolean).join("  ");
                        if (head) parts.push(`【${head}】`);
                        parts.push(sc.content || "");
                        parts.push("");
                    }
                } else if (ep.content) {
                    parts.push(ep.content);
                }
            }
            download(`${activeProject.name}-剧本.txt`, parts.join("\n"));
            toast.success("剧本已导出");
        } catch (e: any) { toast.error(e.message); }
        finally { setBusy(null); }
    };

    const exportDocx = async () => {
        if (!activeProject) return;
        setBusy("docx");
        try {
            const res = await fetch(`/api/stage6/export-docx?project=${encodeURIComponent(activeProject.name)}`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "导出失败");
            toast.success(data.message || "已导出 DOCX（服务器项目目录）");
        } catch (e: any) { toast.error(e.message); }
        finally { setBusy(null); }
    };

    return (
        <BiblePageShell title="Export 导出" description="把当前项目的成果导出为可交付文件。">
            {!activeProject ? null : (
                <div className="max-w-3xl grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-sm mt-2">分集大纲</CardTitle>
                            <CardDescription className="text-xs">Markdown 格式，全部集数</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button size="sm" variant="outline" className="w-full" onClick={exportOutlines} disabled={busy !== null}>
                                {busy === "outlines" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} 导出 .md
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-sm mt-2">剧本正文</CardTitle>
                            <CardDescription className="text-xs">纯文本，按集按场</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button size="sm" variant="outline" className="w-full" onClick={exportScript} disabled={busy !== null}>
                                {busy === "script" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} 导出 .txt
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <FileArchive className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-sm mt-2">剧本 DOCX</CardTitle>
                            <CardDescription className="text-xs">保存到服务器项目目录</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button size="sm" variant="outline" className="w-full" onClick={exportDocx} disabled={busy !== null}>
                                {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} 生成 .docx
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </BiblePageShell>
    );
}
