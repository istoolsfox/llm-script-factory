"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useProject } from "@/lib/contexts/project-context";
import { BiblePageShell } from "@/components/bible-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Thread = { stage?: string; desc?: string };
type KeyEvent = { ep?: string | number; event?: string; desc?: string };

export default function ThreadsPage() {
    const { activeProject } = useProject();
    const [threads, setThreads] = useState<Thread[]>([]);
    const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([]);
    const [coreConflict, setCoreConflict] = useState("");
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!activeProject) return;
        (async () => {
            try {
                const res = await api.get(`/api/bible/${encodeURIComponent(activeProject.name)}/data`);
                const mp = res?.main_plot || {};
                setThreads(mp.main_thread || []);
                setKeyEvents(mp.key_events || []);
                setCoreConflict(mp.core_conflict || "");
            } catch { /* ignore */ }
            setLoaded(true);
        })();
    }, [activeProject]);

    return (
        <BiblePageShell title="Story Threads 故事线" description="主线脉络与关键事件（来自故事圣经的主线剧情，可在 World 页编辑）。">
            {!loaded ? null : threads.length === 0 && keyEvents.length === 0 && !coreConflict ? (
                <p className="text-sm text-muted-foreground">暂无主线数据。请在 Story Bible → World 页生成主线剧情。</p>
            ) : (
                <div className="max-w-3xl space-y-4">
                    {coreConflict && (
                        <Card>
                            <CardHeader className="py-3 px-4"><CardTitle className="text-sm">核心冲突</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-4 text-sm leading-6 text-muted-foreground">{coreConflict}</CardContent>
                        </Card>
                    )}
                    {threads.length > 0 && (
                        <Card>
                            <CardHeader className="py-3 px-4"><CardTitle className="text-sm">主线脉络</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-4 space-y-3">
                                {threads.map((t, i) => (
                                    <div key={i} className="text-sm">
                                        {t.stage && <div className="font-medium">{t.stage}</div>}
                                        {t.desc && <p className="text-muted-foreground leading-6 mt-0.5">{t.desc}</p>}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {keyEvents.length > 0 && (
                        <Card>
                            <CardHeader className="py-3 px-4"><CardTitle className="text-sm">关键事件</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-4 space-y-2">
                                {keyEvents.map((k, i) => (
                                    <div key={i} className="text-sm flex gap-3">
                                        {k.ep != null && <span className="font-medium shrink-0 w-16">第 {k.ep} 集</span>}
                                        <span className="text-muted-foreground leading-6">{k.event || k.desc}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </BiblePageShell>
    );
}
