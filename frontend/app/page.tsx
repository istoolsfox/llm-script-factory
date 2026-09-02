"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
    FolderPlus,
    Trash2,
    Archive,
    Clapperboard,
    Play,
    Check,
    History,
    Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useProject } from "@/lib/contexts/project-context";
import { STAGES, getNextStage, getStageHref, getStageProgress } from "@/lib/stages";

/** 就近日期显示（项目头） */
function fmtDate(t: string) {
    try {
        return new Date(t).toLocaleDateString("zh-CN");
    } catch { return t; }
}

export default function Home() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { projects, activeProject, refreshProjects, createProject } = useProject();
    const currentProjectName = searchParams.get("project");

    // Derived from the shared project list so create/delete/archive in the
    // sidebar and this page stay in sync without full page reloads.
    const project = activeProject?.name === currentProjectName
        ? activeProject
        : projects.find(p => p.name === currentProjectName) || null;

    // Create Project State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectDesc, setNewProjectDesc] = useState("");
    // Delete/Archive Project State
    const [isDeleting, setIsDeleting] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) {
            toast.error("项目名称不能为空");
            return;
        }

        setIsCreating(true);
        const success = await createProject(newProjectName, newProjectDesc);
        setIsCreating(false);

        if (success) {
            setIsDialogOpen(false);
            setNewProjectName("");
            setNewProjectDesc("");
            router.push(`/?project=${encodeURIComponent(newProjectName)}`);
        }
    };

    const handleDeleteProject = async () => {
        if (!project) return;

        setIsDeleting(true);
        try {
            await api.delete(`/api/common/projects/${encodeURIComponent(project.name)}`);
            toast.success("项目已删除");
            await refreshProjects();
            router.push("/");
        } catch (e: any) {
            const msg = e.message || String(e);
            toast.error("删除失败: " + msg);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleArchiveProject = async () => {
        if (!project) return;

        setIsArchiving(true);
        try {
            const res: any = await api.post(`/api/common/projects/${encodeURIComponent(project.name)}/archive`, {});
            toast.success(`项目已归档到: ${res.archived_path}`);
            await refreshProjects();
            router.push("/");
        } catch (e: any) {
            const msg = e.message || String(e);
            toast.error("归档失败: " + msg);
        } finally {
            setIsArchiving(false);
        }
    };

    const fmtDate = (t: string) => {
        try {
            return new Date(t).toLocaleDateString("zh-CN");
        } catch { return t; }
    };

    return (
        <div className="max-w-4xl w-full mx-auto px-8 py-10">
            {!project ? <NoProjectHero onCreate={() => setIsDialogOpen(true)} /> : (
                <ProjectConsole
                    project={project}
                    onDelete={handleDeleteProject}
                    onArchive={handleArchiveProject}
                    isDeleting={isDeleting}
                    isArchiving={isArchiving}
                />
            )}

            {/* 新建项目对话框（空状态与侧边栏共用逻辑） */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建新项目</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">项目名称</label>
                            <Input
                                placeholder="例如：霸道总裁爱上我"
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">简介 (可选)</label>
                            <Input
                                placeholder="一句话描述故事梗概..."
                                value={newProjectDesc}
                                onChange={e => setNewProjectDesc(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                        <Button onClick={handleCreateProject} disabled={isCreating}>
                            {isCreating ? "创建中..." : "立即创建"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 未选择项目：开始创作的引导                                            */
/* ------------------------------------------------------------------ */

function NoProjectHero({ onCreate }: { onCreate: () => void }) {
    return (
        <div>
            <div className="flex items-start gap-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-100">
                    <Clapperboard size={26} className="text-white dark:text-slate-900" />
                </div>
                <div className="pt-0.5">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        从一个创意，到 80 集完整剧本
                    </h1>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500 max-w-xl">
                        按短剧行业的创作流程，AI 陪你走完六步：磨创意、拉大纲、分场次、写正文、做润色、精修交付。
                        先选择左侧一个项目继续，或者从这里开始一部新剧。
                    </p>
                </div>
            </div>

            <div className="mt-8 flex items-center gap-3">
                <Button onClick={onCreate} className="gap-2">
                    <FolderPlus size={16} />
                    新建项目
                </Button>
                <Link href="/import">
                    <Button variant="outline" className="gap-2">
                        <Upload size={16} />
                        导入已有剧本
                    </Button>
                </Link>
                <span className="text-xs text-slate-400">已有剧本可直接从润色阶段接手</span>
            </div>

            {/* 六步流程预览：让新用户在动手前看懂方法 */}
            <ol className="mt-10 border-t pt-8 space-y-5">
                {STAGES.map(s => (
                    <li key={s.id} className="flex items-baseline gap-4">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-medium text-slate-500 dark:border-slate-600 dark:text-slate-400 self-start translate-y-0.5">
                            {s.step}
                        </span>
                        <div>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.name}</span>
                            <span className="ml-2 text-xs text-slate-400">{s.en}</span>
                            <p className="mt-0.5 text-sm text-slate-500">{s.hint}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 已选择项目：创作控制台                                               */
/* ------------------------------------------------------------------ */

function ProjectConsole({
    project,
    onDelete,
    onArchive,
    isDeleting,
    isArchiving,
}: {
    project: { name: string; updated_at: string; stages: Record<string, boolean> };
    onDelete: () => void;
    onArchive: () => void;
    isDeleting: boolean;
    isArchiving: boolean;
}) {
    const next = getNextStage(project.stages);
    const progress = getStageProgress(project.stages);
    const allDone = progress.done === progress.total;

    return (
        <div>
            {/* 项目头 */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        {project.name}
                    </h1>
                    <p className="mt-1 text-xs text-slate-400">最近更新 {fmtDate(project.updated_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Link
                        href={`/versions?project=${encodeURIComponent(project.name)}`}
                        className="inline-flex"
                    >
                        <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500">
                            <History size={14} />
                            版本历史
                        </Button>
                    </Link>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 hover:text-amber-600">
                                <Archive size={14} />
                                归档
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认归档项目？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    项目 <span className="font-semibold">"{project.name}"</span> 将被移动到 backup/ 目录。如需恢复，可手动将文件夹移回 projects/ 目录。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={onArchive}
                                    disabled={isArchiving}
                                    className="bg-amber-600 hover:bg-amber-700"
                                >
                                    {isArchiving ? "归档中..." : "确认归档"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 hover:text-red-600">
                                <Trash2 size={14} />
                                删除
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    此操作将<span className="text-red-600 font-semibold">永久删除</span>项目 <span className="font-semibold">"{project.name}"</span> 及其所有内容，包括剧本、设定等所有数据。此操作不可恢复。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={onDelete}
                                    disabled={isDeleting}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    {isDeleting ? "删除中..." : "确认删除"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* 下一步引导：根据完成态指向真正该做的阶段 */}
            <div className="mt-6 rounded-2xl border bg-slate-900 dark:bg-slate-800 dark:border-slate-700 px-6 py-5 text-white flex items-center justify-between gap-6">
                <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-300">
                        {allDone ? "全部阶段已完成，可以终审交付" : `下一步 · 第 ${next.step} 步（共 6 步）`}
                    </div>
                    <div className="mt-1 text-lg font-semibold truncate">
                        {next.name}
                        <span className="ml-2 text-sm font-normal text-slate-300">{next.en}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-300 truncate">{next.hint}</p>
                </div>
                <Link href={getStageHref(next, project.name)} className="shrink-0">
                    <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                        <Play size={15} />
                        {progress.done === 0 ? "开始创作" : "继续创作"}
                    </Button>
                </Link>
            </div>

            {/* 六阶段流程进度（可点击跳转） */}
            <div className="mt-8">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">创作流程</h2>
                    <span className="text-xs text-slate-400">已完成 {progress.done}/{progress.total} 个阶段</span>
                </div>
                <ol className="mt-3 grid grid-cols-6 gap-2">
                    {STAGES.map(s => {
                        const done = !!project.stages[s.key];
                        const isNext = s.step === next.step && !allDone;
                        return (
                            <li key={s.id}>
                                <Link
                                    href={getStageHref(s, project.name)}
                                    className={
                                        "block rounded-xl border px-3 py-3 transition-colors " +
                                        (isNext
                                            ? "border-slate-900 dark:border-slate-100"
                                            : done
                                                ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-900/20"
                                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600")
                                    }
                                >
                                    <span
                                        className={
                                            "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium leading-none " +
                                            (done
                                                ? "border-emerald-500 bg-emerald-500 text-white"
                                                : isNext
                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                    : "border-slate-300 text-slate-400 dark:border-slate-600")
                                        }
                                    >
                                        {done ? <Check size={11} strokeWidth={3} /> : s.step}
                                    </span>
                                    <div className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                        {s.name}
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-snug text-slate-400 line-clamp-2 hidden lg:block">
                                        {s.hint}
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}
