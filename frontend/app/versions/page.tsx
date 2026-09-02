"use client";

import { useEffect, useState, Fragment } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, History, Camera, RotateCcw, Trash2, ChevronDown, ChevronRight, FileText } from "lucide-react";
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

interface VersionMeta {
    id: string;
    timestamp: string;
    tag: string;
    files: string[];
}

export default function VersionPage() {
    const { projects, activeProject, setActiveProject } = useProject();
    const [versions, setVersions] = useState<VersionMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [snapshotting, setSnapshotting] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [viewData, setViewData] = useState<Record<string, any>>({});
    const [viewingComp, setViewingComp] = useState<string>("");

    const loadVersions = async () => {
        if (!activeProject) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/version/${encodeURIComponent(activeProject.name)}/list`);
            setVersions(res.versions || []);
        } catch (e: any) {
            toast.error("加载版本失败: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeProject) {
            loadVersions();
        } else {
            setVersions([]);
        }
    }, [activeProject]);

    const handleSnapshot = async () => {
        if (!activeProject) return;
        setSnapshotting(true);
        try {
            const res: any = await api.post("/api/version/snapshot", { project_name: activeProject.name, tag: "manual" });
            if (res.success) {
                toast.success("已创建版本快照");
                await loadVersions();
            }
        } catch (e: any) {
            toast.error("快照失败: " + e.message);
        } finally {
            setSnapshotting(false);
        }
    };

    const handleRestore = async (vid: string) => {
        if (!activeProject) return;
        try {
            const res = await api.post(`/api/version/${encodeURIComponent(activeProject.name)}/restore?version_id=${vid}`, {});
            toast.success("已恢复到该版本");
            await loadVersions();
        } catch (e: any) {
            toast.error("恢复失败: " + e.message);
        }
    };

    const handleDelete = async (vid: string) => {
        if (!activeProject) return;
        try {
            await api.delete(`/api/version/${encodeURIComponent(activeProject.name)}/${vid}`);
            toast.success("版本已删除");
            await loadVersions();
        } catch (e: any) {
            toast.error("删除失败: " + e.message);
        }
    };

    const toggleView = async (vid: string) => {
        if (!activeProject) return;
        if (expanded === vid) {
            setExpanded(null);
            return;
        }
        setExpanded(vid);
        try {
            // Load a few key components for preview
            const comps = ["1_ideas/story_bible.json", "1_ideas/bible.json", "settings.json"];
            const data: Record<string, any> = {};
            for (const c of comps) {
                const res = await api.get(
                    `/api/version/${encodeURIComponent(activeProject.name)}/view?version_id=${encodeURIComponent(vid)}&component=${encodeURIComponent(c)}`
                );
                data[c] = res.data ?? {};
            }
            setViewData(data);
            setViewingComp(comps[0]);
        } catch (e: any) {
            toast.error("加载版本内容失败: " + e.message);
        }
    };

    const fmtTime = (t: string) => {
        try {
            return new Date(t).toLocaleString();
        } catch { return t; }
    };

    return (
        <div className="container mx-auto py-8 px-4 max-w-5xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <History className="w-8 h-8 text-indigo-500" />
                    <div>
                        <h1 className="text-2xl font-bold">版本历史</h1>
                        <p className="text-sm text-slate-500">每次生成/保存自动记录版本，可查看、回溯</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-56">
                        <Select
                            value={activeProject?.name || ""}
                            onValueChange={(v) => {
                                const p = projects.find(p => p.name === v);
                                if (p) setActiveProject(p);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择项目" />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(p => (
                                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button size="sm" onClick={handleSnapshot} disabled={!activeProject || snapshotting}>
                        {snapshotting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />}
                        立即快照
                    </Button>
                </div>
            </div>

            {!activeProject ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                    <p>请先选择一个项目。</p>
                </div>
            ) : (
                <Card>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4" /> {activeProject.name} 的版本（{versions.length}）
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {loading ? (
                            <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>
                        ) : versions.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">暂无版本。生成或保存内容后会自动创建版本。</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>版本 ID</TableHead>
                                        <TableHead>时间</TableHead>
                                        <TableHead>标签</TableHead>
                                        <TableHead>包含</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {versions.map(v => (
                                        <Fragment key={v.id}>
                                            <TableRow>
                                                <TableCell className="font-mono text-xs">{v.id}</TableCell>
                                                <TableCell className="text-xs text-slate-500">{fmtTime(v.timestamp)}</TableCell>
                                                <TableCell><Badge variant="secondary" className="text-xs">{v.tag}</Badge></TableCell>
                                                <TableCell className="text-xs">{v.files?.join(", ")}</TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="sm" onClick={() => toggleView(v.id)}>
                                                        {expanded === v.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} 查看
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="outline" size="sm"><RotateCcw className="h-4 w-4" /> 回滚</Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>确认回滚到 {v.id}？</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    当前数据会先自动快照（可撤销），然后项目数据将恢复到该版本。
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>取消</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleRestore(v.id)}>确认回滚</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>删除版本 {v.id}？</AlertDialogTitle>
                                                                <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>取消</AlertDialogCancel>
                                                                <AlertDialogAction className="bg-red-500" onClick={() => handleDelete(v.id)}>确认删除</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                            {expanded === v.id && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="bg-slate-50 dark:bg-slate-900/50">
                                                        <div className="p-3 space-y-3">
                                                            <div className="flex flex-wrap gap-2">
                                                                <Button size="sm" variant={viewingComp === "1_ideas/story_bible.json" ? "default" : "outline"} onClick={() => setViewingComp("1_ideas/story_bible.json")}>剧情梗概</Button>
                                                                <Button size="sm" variant={viewingComp === "1_ideas/bible.json" ? "default" : "outline"} onClick={() => setViewingComp("1_ideas/bible.json")}>世界设定</Button>
                                                                <Button size="sm" variant={viewingComp === "settings.json" ? "default" : "outline"} onClick={() => setViewingComp("settings.json")}>设置</Button>
                                                            </div>
                                                            <pre className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap">
                                                                {JSON.stringify(viewData[viewingComp], null, 2)}
                                                            </pre>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
