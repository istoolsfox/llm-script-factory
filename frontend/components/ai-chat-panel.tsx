"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, SendHorizontal, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };

/**
 * AI 对话修改面板：针对某个数据块（target）提意见，AI 直接修改并自动保存。
 * target: synopsis | rough_outline | detailed_cards | characters_rel | world_bible
 */
export function AiChatPanel({
    project,
    target,
    label,
    onUpdated,
    className,
    extra,
    placeholder,
}: {
    project: string;
    target: string;
    label?: string;
    onUpdated?: () => void;
    className?: string;
    extra?: Record<string, any>;
    placeholder?: string;
}) {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        setMessages((m) => [...m, { role: "user", text }]);
        setBusy(true);
        try {
            const res = await api.post("/api/chat/revise", {
                project_name: project,
                target,
                instruction: text,
                ...(extra || {})
            }, { timeoutMs: 15 * 60 * 1000 });
            const reply = res.reply || "已修改";
            setMessages((m) => [...m, { role: "assistant", text: `${reply}（已自动保存，修订前已存版本快照）` }]);
            onUpdated?.();
        } catch (e: any) {
            setMessages((m) => [...m, { role: "assistant", text: `修改失败：${e.message}` }]);
            toast.error("AI 修改失败: " + e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn("flex flex-col min-h-0 border rounded-lg bg-white dark:bg-slate-950", className)}>
            <div className="px-3 py-2 border-b flex items-center gap-2 shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    AI 对话修改{label ? ` · ${label}` : ""}
                </span>
                <span className="text-[10px] text-slate-400 ml-auto">改完自动保存并记版本</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2 min-h-0">
                {messages.length === 0 && (
                    <p className="text-xs text-slate-400 leading-5">
                        直接说要改什么，例如「反派动机太弱，改成和主角有血海深仇」「把时代背景改成民国」。
                        AI 会直接修改当前选中的内容。
                    </p>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                        <div
                            className={cn(
                                "max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-5 whitespace-pre-wrap",
                                m.role === "user"
                                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            )}
                        >
                            {m.text}
                        </div>
                    </div>
                ))}
                {busy && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> AI 正在修改...
                    </div>
                )}
            </div>
            <div className="p-2 border-t flex gap-2 shrink-0">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    placeholder={placeholder || "输入修改意见，Enter 发送"}
                    className="min-h-[40px] h-10 text-xs resize-none"
                    disabled={busy}
                />
                <Button size="icon" className="h-10 w-10 shrink-0" onClick={send} disabled={busy || !input.trim()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}
