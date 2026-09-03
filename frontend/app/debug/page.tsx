"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Bug, CheckCircle2, XCircle, Zap, Globe, FileText } from "lucide-react";

// --- Types ---
interface LogEntry {
    timestamp: string;
    model: string;
    cache_hit: boolean;
    system: string;
    prompt: string;
    response_parsed: any;
    response_raw: string;
    token_usage: { input: number; output: number };
    error: string | null;
}

interface Stats {
    total_calls: number;
    error_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
}

export default function DebugPage() {
    // Data State
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);

    // UI State
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Load available dates on mount
    useEffect(() => {
        loadDates();
    }, []);

    // Load logs when date or filter changes
    useEffect(() => {
        if (selectedDate) {
            loadLogs(selectedDate);
        }
    }, [selectedDate, errorsOnly]);

    const loadDates = async () => {
        try {
            const res = await api.get("/api/debug/dates");
            setDates(res.dates || []);
            if (res.dates?.length > 0) {
                setSelectedDate(res.dates[0]); // Select newest
            }
        } catch (e: any) {
            toast.error("加载日期列表失败: " + e.message);
        }
    };

    const loadLogs = async (date: string) => {
        setIsLoading(true);
        try {
            const res = await api.get(`/api/debug/logs/${date}?errors_only=${errorsOnly}`);
            setLogs(res.logs || []);
            setStats(res.stats);
            setSelectedLogIndex(res.logs?.length > 0 ? 0 : null);
        } catch (e: any) {
            toast.error("加载日志失败: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const selectedLog = selectedLogIndex !== null ? logs[selectedLogIndex] : null;

    const formatTime = (timestamp: string) => {
        return timestamp.split("T")[1]?.substring(0, 8) || "";
    };

    const getLogTitle = (log: LogEntry) => {
        // Use source field if available (preferred)
        if ((log as any).source && (log as any).source !== "unknown") {
            return (log as any).source;
        }
        // Fallback: Try to extract stage info from prompt
        if (log.prompt?.includes("Stage 1") || log.prompt?.includes("梗概")) return "stage1/synopsis";
        if (log.prompt?.includes("粗大纲") || log.prompt?.includes("rough")) return "stage1/rough";
        if (log.prompt?.includes("Stage 2") || log.prompt?.includes("详细大纲")) return "stage2/batch";
        if (log.prompt?.includes("Stage 3") || log.prompt?.includes("集纲")) return "stage3/generate";
        return "AI 请求";
    };

    // --- Render ---
    if (dates.length === 0 && !isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
                    <Bug size={64} className="opacity-50" />
                </div>
                <h2 className="text-xl font-semibold mb-2">暂无日志</h2>
                <p className="text-slate-400 max-w-sm text-center">
                    执行 AI 生成后，交互日志将显示在这里。
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Bug className="text-amber-500" />
                        <div>
                            <h1 className="text-xl font-bold">Debug Console</h1>
                            <p className="text-sm text-slate-500">检查 LLM 原始交互记录</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Date Selector */}
                        <Select value={selectedDate} onValueChange={setSelectedDate}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="选择日期" />
                            </SelectTrigger>
                            <SelectContent>
                                {dates.map(date => (
                                    <SelectItem key={date} value={date}>{date}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Errors Only Toggle */}
                        <div className="flex items-center gap-2">
                            <Switch
                                id="errors-only"
                                checked={errorsOnly}
                                onCheckedChange={setErrorsOnly}
                            />
                            <Label htmlFor="errors-only" className="text-sm cursor-pointer">仅错误</Label>
                        </div>
                    </div>
                </div>

                {/* Stats Bar */}
                {stats && (
                    <div className="flex items-center gap-6 mt-3 text-sm text-slate-500">
                        <span>请求: <strong className="text-slate-700 dark:text-slate-300">{stats.total_calls}</strong></span>
                        <span>错误: <strong className={stats.error_count > 0 ? "text-red-500" : "text-green-500"}>{stats.error_count}</strong></span>
                        <span>Input: <strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.total_input_tokens.toLocaleString()}</strong></span>
                        <span>Output: <strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.total_output_tokens.toLocaleString()}</strong></span>
                    </div>
                )}
            </div>

            {/* Main Content: Master-Detail Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Log List */}
                <div className="w-72 border-r flex flex-col bg-slate-50/50 dark:bg-slate-900/50 shrink-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-2 space-y-1">
                            {isLoading ? (
                                <div className="p-8 text-center text-slate-400">
                                    <Loader2 className="animate-spin mx-auto mb-2" />
                                    加载中...
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">
                                    {errorsOnly ? "无错误记录" : "当日无日志"}
                                </div>
                            ) : (
                                logs.map((log, idx) => {
                                    const isSelected = idx === selectedLogIndex;
                                    const isError = !!log.error;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedLogIndex(idx)}
                                            className={`w-full text-left p-3 rounded-lg transition-all ${isSelected
                                                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 border'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                {isError ? (
                                                    <XCircle size={14} className="text-red-500" />
                                                ) : (
                                                    <CheckCircle2 size={14} className="text-green-500" />
                                                )}
                                                <span className="text-xs text-slate-400 font-mono">{formatTime(log.timestamp)}</span>
                                                {log.cache_hit ? (
                                                    <span title="Cache Hit"><Zap size={12} className="text-amber-500" /></span>
                                                ) : (
                                                    <span title="Network"><Globe size={12} className="text-blue-400" /></span>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium truncate">{getLogTitle(log)}</p>
                                            <p className="text-xs text-slate-500 truncate">{log.model}</p>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Detail Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedLog ? (
                        <>
                            {/* Log Header */}
                            <div className="p-4 border-b bg-white dark:bg-slate-950 shrink-0">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold flex items-center gap-2">
                                            {selectedLog.error ? (
                                                <XCircle className="text-red-500" />
                                            ) : (
                                                <CheckCircle2 className="text-green-500" />
                                            )}
                                            {getLogTitle(selectedLog)}
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {selectedLog.timestamp} · {selectedLog.model}
                                            {selectedLog.cache_hit && <Badge variant="secondary" className="ml-2">Cached</Badge>}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm">
                                        <div className="text-slate-500">Token Usage</div>
                                        <div className="font-mono">
                                            <span className="text-green-600">{selectedLog.token_usage.input.toLocaleString()}</span>
                                            {" / "}
                                            <span className="text-blue-600">{selectedLog.token_usage.output.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                {selectedLog.error && (
                                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                                        ❌ {selectedLog.error}
                                    </div>
                                )}
                            </div>

                            {/* Tabs */}
                            <Tabs defaultValue="request" className="flex-1 flex flex-col overflow-hidden">
                                <TabsList className="mx-4 mt-2 shrink-0">
                                    <TabsTrigger value="request">📤 Request</TabsTrigger>
                                    <TabsTrigger value="response">📥 Raw Response</TabsTrigger>
                                    <TabsTrigger value="parsed">🔧 Parsed JSON</TabsTrigger>
                                </TabsList>

                                <TabsContent value="request" className="flex-1 overflow-y-auto p-4 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">System Prompt</h3>
                                        <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap max-h-48">
                                            {selectedLog.system || "(None)"}
                                        </pre>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">User Prompt</h3>
                                        <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                                            {selectedLog.prompt || "(None)"}
                                        </pre>
                                    </div>
                                </TabsContent>

                                <TabsContent value="response" className="flex-1 overflow-y-auto p-4">
                                    <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                                        {selectedLog.response_raw || "(No raw response captured)"}
                                    </pre>
                                </TabsContent>

                                <TabsContent value="parsed" className="flex-1 overflow-y-auto p-4">
                                    <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(selectedLog.response_parsed, null, 2) || "(No parsed data)"}
                                    </pre>
                                </TabsContent>
                            </Tabs>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            <div className="text-center">
                                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                                <p>选择左侧日志查看详情</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
