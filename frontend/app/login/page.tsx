"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clapperboard, Loader2 } from "lucide-react";
import { setAuthToken } from "@/lib/api";
import { toast } from "sonner";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            setError("请输入用户名和密码");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "登录失败");
            }
            setAuthToken(data.token);
            toast.success(`欢迎回来，${data.username}`);
            router.push("/");
        } catch (err: any) {
            setError(err.message || "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100">
                        <Clapperboard size={22} className="text-white dark:text-slate-900" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">剧本工厂</h1>
                        <p className="text-xs text-slate-400">全流程 AI 短剧创作工作站</p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="rounded-2xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                    <div className="space-y-1.5">
                        <label htmlFor="username" className="text-sm font-medium text-slate-700 dark:text-slate-200">用户名</label>
                        <Input
                            id="username"
                            autoComplete="username"
                            placeholder="用户名"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-200">密码</label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 size={15} className="mr-2 animate-spin" />}
                        登录
                    </Button>
                </form>
            </div>
        </div>
    );
}
