"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    FolderPlus,
    LayoutDashboard,
    Lightbulb,
    GalleryVerticalEnd,
    Clapperboard,
    FileText,
    Wand2,
    Stethoscope,
    ChevronLeft,
    ChevronRight,
    Settings,
    Activity,
    Bug,
    Zap,
    Upload,
    Search,
    History
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
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useProject, type Project } from "@/lib/contexts/project-context";
import { ProjectCommand } from "@/components/project-command";

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
    }, [searchParams, projects]);

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
            // Auto-selection handled in context/effect or we can force it here if context returns the new project object
            // For now rely on Context updating list and user selecting it or Context auto-selecting.
        }
    };

    const navItems = [
        { name: "概览 Dashboard", icon: LayoutDashboard, href: "/" },
        { name: "Stage 1: 创意孵化", icon: Lightbulb, href: "/stage1", disabled: false },
        { name: "Stage 2: 结构构建", icon: GalleryVerticalEnd, href: "/stage2", disabled: false },
        { name: "Stage 3: 分场编写", icon: Clapperboard, href: "/stage3", disabled: false },
        { name: "Stage 4: 剧本撰写", icon: FileText, href: "/stage4", disabled: false },
        { name: "Stage 5: 润色优化", icon: Wand2, href: "/stage5", disabled: false },
        { name: "Stage 6: 剧本医生", icon: Stethoscope, href: "/stage6", disabled: false },
        { name: "Cache Manager", icon: Zap, href: "/cache", disabled: false },
        { name: "版本历史", icon: History, href: "/versions", disabled: false },
        { name: "API Keys", icon: Settings, href: "/settings/keys", disabled: false },
        { name: "Models", icon: Settings, href: "/settings/models", disabled: false },
        { name: "Debug Console", icon: Bug, href: "/debug", disabled: false },
    ];

    return (
        <div
            className={cn(
                "flex flex-col border-r bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out h-screen",
                isCollapsed ? "w-16" : "w-64"
            )}
        >
            {/* Header */}
            <div className={cn("flex items-center h-14 px-3 border-b shrink-0", isCollapsed ? "justify-center" : "justify-between")}>
                {!isCollapsed && <span className="font-bold text-lg truncate">🎬 ScriptFactory</span>}
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
                    <div className="flex justify-center" title={activeProject?.name || "Select Project"}>
                        <FolderPlus className="text-blue-600" />
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">当前项目</label>
                        <Select value={activeProject?.name || ""} onValueChange={handleProjectChange} disabled={isLoading}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={isLoading ? "Loading..." : "选择项目..."} />
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
                        <div className="flex gap-2 mt-2">
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-slate-500 border-dashed">
                                        <FolderPlus size={14} />
                                        新建
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

                            <Link href="/import">
                                <Button variant="outline" size="sm" className="gap-1 text-slate-500 border-dashed">
                                    <Upload size={14} />
                                    导入
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Nav List */}
            <div className="flex-1 overflow-y-auto py-2">
                <nav className="grid gap-1 px-2">
                    {navItems.map((item, index) => {
                        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={index}
                                href={item.disabled ? "#" : `${item.href}?project=${encodeURIComponent(activeProject?.name || "")}`}
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50",
                                    item.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
                                    isCollapsed && "justify-center px-2"
                                )}
                                title={isCollapsed ? item.name : undefined}
                            >
                                <item.icon size={18} />
                                {!isCollapsed && <span>{item.name}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Model Selector (Only when not collapsed) */}
                {!isCollapsed && <ModelSelector />}
            </div>

            {/* Footer: Usage Stats */}
            <div className="px-3 py-2 border-t bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                {isCollapsed ? (
                    <div className="flex justify-center" title="Token Usage">
                        <Activity size={16} className="text-slate-400" />
                    </div>
                ) : (
                    <div className="text-xs space-y-1">
                        <div className="flex items-center gap-1 text-slate-500 font-medium">
                            <Activity size={10} /> Token 消耗
                        </div>
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                            <span>
                                今日: <span className="font-mono">{usage?.today?.input_tokens?.toLocaleString() || 0}</span>/<span className="font-mono">{usage?.today?.output_tokens?.toLocaleString() || 0}</span>
                            </span>
                            {usage?.last_request && (
                                <span className="text-slate-400">
                                    上次: <span className={`font-mono ${(usage.last_request.input_tokens || 0) > 30000 ? 'text-red-500 font-bold' : 'text-green-600'}`}>+{usage.last_request.input_tokens?.toLocaleString()}</span>/<span className={`font-mono ${(usage.last_request.output_tokens || 0) > 5000 ? 'text-red-500 font-bold' : 'text-blue-600'}`}>+{usage.last_request.output_tokens?.toLocaleString()}</span>
                                </span>
                            )}
                        </div>
                        {/* Warning for high token usage */}
                        {usage?.last_request && ((usage.last_request.input_tokens || 0) > 30000 || (usage.last_request.output_tokens || 0) > 5000) && (
                            <div className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1 mt-1">
                                ⚠️ Token 用量过高，请检查提示词
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
