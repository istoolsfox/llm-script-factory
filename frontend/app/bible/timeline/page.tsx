"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useProject } from "@/lib/contexts/project-context";
import { BiblePageShell } from "@/components/bible-page-shell";
import { Badge } from "@/components/ui/badge";

type Ep = { ep_id: number; title?: string; outline?: string; emotional_value?: string };

export default function TimelinePage() {
    const { activeProject } = useProject();
    const [eps, setEps] = useState<Ep[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!activeProject) return;
        (async () => {
            try {
                const res = await api.get(`/api/stage2/${encodeURIComponent(activeProject.name)}/data`);
                setEps((res.outlines || []).sort((a: Ep, b: Ep) => a.ep_id - b.ep_id));
            } catch { /* ignore */ }
            setLoaded(true);
        })();
    }, [activeProject]);

    return (
        <BiblePageShell title="Timeline 时间线" description="按集数排列的剧情主线（来自 Structure 阶段的分集大纲）。">
            {!loaded ? null : eps.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无分集大纲。请先完成 Production → Structure 阶段。</p>
            ) : (
                <div className="relative max-w-3xl">
                    <div aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                    <ol className="space-y-4">
                        {eps.map((ep) => (
                            <li key={ep.ep_id} className="relative pl-7">
                                <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border border-border bg-background flex items-center justify-center">
                                    <span className="h-[5px] w-[5px] rounded-full bg-primary" />
                                </span>
                                <div className="text-sm">
                                    <span className="font-medium">第 {ep.ep_id} 集</span>
                                    {ep.title && <span className="ml-2 text-foreground/90">{ep.title}</span>}
                                    {ep.emotional_value && (
                                        <Badge variant="outline" className="ml-2 text-[11px] font-normal">{ep.emotional_value}</Badge>
                                    )}
                                    {ep.outline && (
                                        <p className="mt-1 text-muted-foreground leading-6">{ep.outline}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </BiblePageShell>
    );
}
