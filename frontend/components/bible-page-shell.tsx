"use client";

import { useProject } from "@/lib/contexts/project-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen } from "lucide-react";

/** Story Bible 子页通用外壳：无项目守卫 + 标题区 + 滚动容器 */
export function BiblePageShell({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    const { activeProject } = useProject();

    if (!activeProject) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center text-slate-500">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>请先在左侧选择或新建一个剧本项目。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-hidden flex flex-col">
            <div className="px-6 lg:px-8 pt-6 pb-4 shrink-0">
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                <p className="text-xs text-muted-foreground mt-1">项目：{activeProject.name}</p>
            </div>
            <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 lg:px-8 pb-8">{children}</div>
            </ScrollArea>
        </div>
    );
}
