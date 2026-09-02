"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    FolderPlus,
    LayoutDashboard,
    Check,
    Upload,
    Search,
    History,
    ChevronLeft,
    ChevronRight,
    KeyRound,
    SlidersHorizontal,
    Bug,
    Clapperboard,
    PenLine,
    LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/model-selector";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, setAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { useProject, type Project } from "@/lib/contexts/project-context";
import { ProjectCommand } from "@/components/project-command";
import { STAGES } from "@/lib/stages";

/** 把 token 数换算成写作者可感知的"约多少字"（中文 1 token ≈ 1 字）。 */
function tokensToChars(n: number | undefined | null): string {
    const v = n || 0;
    if (v >= 10000) return `${(v / 10000).toFixed(1)} 万字`;
    return `${v.toLocaleString()} 字`;
}

export function AppSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const { projects, activeProject, setActiveProject, createProject, isLoading } = useProject();
    const [usage, setUsage] = React.useState<any>(null);

    // Create Project State
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [newProjectName, setNewProjectName] = React.useState("");
    const [newProjectDesc, setNewProjectDesc] = React.useState("");
    const [isCreating, setIsCreating] = React.useState(false);

    // Command Palette State
    const [isCommandOpen, setIsCommandOpen] = React.useState(false);
    const [recentProjects, setRecentProjects] = React.useState<Project[]>([]);

    // Load Usage on Mount and when 'usage-updated' event fires
    React.useEffect(() => {
        loadUsage();

        // Listen for usage update events from API calls
        const handleUsageUpdate = () => loadUsage();
        window.addEventListener('usage-updated', handleUsageUpdate);

        return () => {
            window.removeEventListener('usage-updated', handleUsageUpdate);
        };
    }, []);

    // Global Ctrl+K shortcut
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsCommandOpen(true);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Sync URL project param
    React.useEffect(() => {
        const p = searchParams.get("project");
        if (p && projects.length > 0) {
            const found = projects.find(proj => proj.name === p);
            if (found && found.name !== activeProject?.name) {
                setActiveProject(found);
            }
        } else if (!p && activeProject) {
            // Sync URL if activeProject is set but URL is empty?
            // Or better: Let user action drive URL.
            // If we want detailed deep linking, we should set URL when activeProject changes.
        }
    }, [searchParams, projects, activeProject]);

    // Reverse Sync: Update URL when activeProject changes
    React.useEffect(() => {
        if (activeProject) {
            const params = new URLSearchParams(searchParams.toString());
            if (params.get("project") !== activeProject.name) {
                params.set("project", activeProject.name);
                router.replace(`${pathname}?${params.toString()}`);
            }
        }
    }, [activeProject]);


    const loadUsage = async () => {
        try {
            const res: any = await api.get("/api/common/usage");
            setUsage(res);
        } catch (e) {
            console.error(e);
        }
    };

    const handleProjectChange = (val: string) => {
        if (val === '__all__') {
            setIsCommandOpen(true);
            return;
        }
        const found = projects.find(p => p.name === val);
        if (found) {
            selectProject(found);
        }
    };

    const selectProject = (project: Project) => {
        setActiveProject(project);
        // Update recent projects
        setRecentProjects(prev => {
            const filtered = prev.filter(p => p.name !== project.name);
            return [project, ...filtered].slice(0, 5);
        });
    };

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
        }
    };

    const projectName = activeProject?.name || "";
    const withProject = (href: string) => `${href}?project=${encodeURIComponent(projectName)}`;
    const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
    const stagesDone = activeProject?.stages;

    const toolItems = [
        { name: "导入已有剧本", icon: Upload, href: "/import" },
        { name: "版本历史", icon: History, href: "/versions" },
    ];
    const settingsItems = [
        { name: "API Keys", icon: KeyRound, href: "/settings/keys" },
        { name: "模型配置", icon: SlidersHorizontal, href: "/settings/models" },
        { name: "调试控制台", icon: Bug, href: "/debug" },
    ];

    const handleLogout = () => {
        setAuthToken(null);
        router.push("/login");
    };

    const renderNavLink = (item: { name: string; icon: any; href: string }) => (
        <Link
            key={item.href}
            href={withProject(item.href)}
            className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive(item.href)
                    ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50",
                isCollapsed && "justify-center px-2"
            )}
            title={isCollapsed ? item.name : undefined}
        >
            <item.icon size={16} />
            {!isCollapsed && <span>{item.name}</span>}
        </Link>
    );

    return (
        <div
            className={cn(
                "flex flex-col border-r bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out h-screen",
                isCollapsed ? "w-16" : "w-60"
            )}
        >
            {/* Header */}
            <div className={cn("flex items-center h-14 px-4 border-b shrink-0", isCollapsed ? "justify-center px-2" : "justify-between")}>
                {!isCollapsed && (
                    <span className="flex items-center gap-2 font-bold text-base truncate">
                        <Clapperboard size={18} className="text-slate-900 dark:text-slate-100 shrink-0" />
                        剧本工厂
                    </span>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </Button>
            </div>

            {/* Project Selector */}
            <div className="p-3 border-b shrink-0">
                {isCollapsed ? (
                    <div className="flex justify-center" title={activeProject?.name || "选择项目"}>
                        <FolderPlus className="text-blue-600" />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400">当前剧本项目</label>
                        <Select value={activeProject?.name || ""} onValueChange={handleProjectChange} disabled={isLoading}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={isLoading ? "加载中..." : "选择项目..."} />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(p => (
                                    <SelectItem key={p.name} value={p.name}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                                <div className="border-t my-1" />
                                <SelectItem value="__all__" className="text-muted-foreground">
                                    <span className="flex items-center gap-2">
                                        <Search size={14} />
                                        全部项目...
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Create & Import Buttons */}
                        <div className="flex gap-2">
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex-1 h-7 gap-1 text-xs text-slate-500 border-dashed">
                                        <FolderPlus size={13} />
                                        新建项目
                                    </Button>
                                </DialogTrigger>
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

                            <Link href="/import" className="flex-1">
                                <Button variant="outline" size="sm" className="w-full h-7 gap-1 text-xs text-slate-500 border-dashed">
                                    <Upload size={13} />
                                    导入
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Nav */}
            <div className="flex-1 overflow-y-auto py-3">
                {/* 概览 */}
                <nav className={cn("grid gap-0.5 px-2", isCollapsed && "px-1")}>
                    {renderNavLink({ name: "概览", icon: LayoutDashboard, href: "/" })}
                </nav>

                {/* 创作流程：六阶段 Stepper */}
                <div className={cn("mt-4 px-2", isCollapsed && "px-1")}>
                    {!isCollapsed && (
                        <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">创作流程</div>
                    )}
                    <nav className="grid gap-0.5" aria-label="创作流程">
                        {STAGES.map((stage, index) => {
                            const done = !!stagesDone?.[stage.key];
                            const isCurrent = pathname.startsWith(`/${stage.id}`);
                            // 未选项目时流程只读，避免用户在无项目状态下误入
                            const disabled = !activeProject;
                            const item = (
                                <span
                                    className={cn(
                                        "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                                        isCurrent
                                            ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                            : done
                                                ? "text-slate-600 dark:text-slate-300"
                                                : "text-slate-500 dark:text-slate-400",
                                        !disabled && !isCurrent && "hover:bg-slate-100 dark:hover:bg-slate-800",
                                        disabled && "opacity-50 cursor-not-allowed",
                                        isCollapsed && "justify-center px-2"
                                    )}
                                >
                                    {/* 连接线（非最后一项） */}
                                    {!isCollapsed && index < STAGES.length - 1 && (
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "absolute left-[26px] top-[28px] h-[14px] w-px",
                                                done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-slate-200 dark:bg-slate-700"
                                            )}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium leading-none",
                                            isCurrent
                                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                : done
                                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                                    : "border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500"
                                        )}
                                    >
                                        {done ? <Check size={11} strokeWidth={3} /> : stage.step}
                                    </span>
                                    {!isCollapsed && (
                                        <span className="truncate">
                                            {stage.name}
                                            <span className="ml-1.5 text-xs text-slate-400">{stage.en}</span>
                                        </span>
                                    )}
                                </span>
                            );
                            return disabled ? (
                                <span key={stage.id} title="请先选择或新建项目" className="block">
                                    {item}
                                </span>
                            ) : (
                                <Link key={stage.id} href={withProject(`/${stage.id}`)} className="block">
                                    {item}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* 工具 */}
                <div className={cn("mt-4 px-2", isCollapsed && "px-1")}>
                    {!isCollapsed && (
                        <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">工具</div>
                    )}
                    <nav className="grid gap-0.5">{toolItems.map(renderNavLink)}</nav>
                </div>

                {/* 设置 */}
                <div className={cn("mt-4 px-2", isCollapsed && "px-1")}>
                    {!isCollapsed && (
                        <div className="px-3 pb-1.5 text-xs font-medium text-slate-400">设置</div>
                    )}
                    <nav className="grid gap-0.5">
                        {settingsItems.map(renderNavLink)}
                        <button
                            onClick={handleLogout}
                            className={cn(
                                "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50",
                                isCollapsed && "justify-center px-2"
                            )}
                            title={isCollapsed ? "退出登录" : undefined}
                        >
                            <LogOut size={16} />
                            {!isCollapsed && <span>退出登录</span>}
                        </button>
                    </nav>
                </div>

                {/* Model Selector (Only when not collapsed) */}
                {!isCollapsed && <ModelSelector />}
            </div>

            {/* Footer: Usage Stats */}
            <div className="px-3 py-2 border-t bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                {isCollapsed ? (
                    <div className="flex justify-center" title="今日创作量">
                        <PenLine size={15} className="text-slate-400" />
                    </div>
                ) : (
                    <div className="text-xs space-y-0.5">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                            <span className="text-slate-400">今日创作量（约）</span>
                            <span className="font-medium" title={`输入 ${usage?.today?.input_tokens?.toLocaleString() || 0} + 输出 ${usage?.today?.output_tokens?.toLocaleString() || 0} tokens`}>
                                {tokensToChars((usage?.today?.input_tokens || 0) + (usage?.today?.output_tokens || 0))}
                            </span>
                        </div>
                        {usage?.last_request && (
                            <div className="flex items-center justify-between text-slate-400">
                                <span>上次请求</span>
                                <span title={`输入 ${usage.last_request.input_tokens?.toLocaleString() || 0} + 输出 ${usage.last_request.output_tokens?.toLocaleString() || 0} tokens`}>
                                    +{tokensToChars((usage.last_request.input_tokens || 0) + (usage.last_request.output_tokens || 0))}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Project Command Palette */}
            <ProjectCommand
                open={isCommandOpen}
                onOpenChange={setIsCommandOpen}
                projects={projects}
                onSelect={selectProject}
                recentProjects={recentProjects}
            />
        </div >
    );
}
