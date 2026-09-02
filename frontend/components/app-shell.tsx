"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { getAuthToken } from "@/lib/api";

/**
 * Global shell: the login page renders standalone; every other page is
 * framed by the sidebar and requires a token (requests will 401-redirect
 * to /login when it is missing or expired).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === "/login";

    useEffect(() => {
        if (!isLoginPage && !getAuthToken()) {
            router.replace("/login");
        }
    }, [isLoginPage, pathname, router]);

    if (isLoginPage) {
        return <div className="h-screen w-full overflow-auto">{children}</div>;
    }

    return (
        <div className="flex h-full w-full">
            <AppSidebar />
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
                <div className="flex-1 overflow-auto">{children}</div>
            </main>
        </div>
    );
}
