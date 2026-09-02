"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ModelSettings {
    model: string;
    temperature: number;
}

interface ModelContextType {
    settings: ModelSettings;
    isLoading: boolean;
    updateSettings: (partial: Partial<ModelSettings>) => void;
}

const defaultSettings: ModelSettings = {
    model: "", // 默认为空，强制用户选择
    temperature: 0.7
};

const ModelContext = createContext<ModelContextType | undefined>(undefined);

/** Stage key under which settings are persisted in the project's settings.json. */
function getStageName(pathname: string | null): string | null {
    if (pathname === "/") return null;
    const match = pathname?.match(/^\/(stage\d+)/);
    if (match) return match[1];
    if (pathname?.includes("/import")) return "import";
    return null;
}

export function ModelProvider({ children }: { children: React.ReactNode }) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const project = searchParams.get("project");
    const stage = getStageName(pathname);

    const [settings, setSettings] = useState<ModelSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(false);

    // Ref to track if we should save (avoid saving on initial load)
    const isFirstLoad = useRef(true);
    const lastSavedSettings = useRef<string>("");

    // Outside stage pages there is no stage-scoped settings key to work with.
    const stageActive = Boolean(project && stage);

    // Load settings when project or stage changes
    useEffect(() => {
        if (!stageActive) {
            isFirstLoad.current = true;
            return;
        }

        setIsLoading(true);
        isFirstLoad.current = true;

        api.get(`/api/common/projects/${project}/settings`)
            .then((res: any) => {
                const stageSettings = res[stage!] || {};
                const merged = { ...defaultSettings, ...stageSettings };
                setSettings(merged);
                lastSavedSettings.current = JSON.stringify(merged);
            })
            .catch(err => {
                console.error("Failed to load settings", err);
                toast.error("读取配置失败");
            })
            .finally(() => {
                setIsLoading(false);
                // After load, mark as not first load after a short tick
                setTimeout(() => { isFirstLoad.current = false; }, 100);
            });

    }, [project, stage, stageActive]);

    // Autosave when settings change (debounced)
    useEffect(() => {
        if (!stageActive || isFirstLoad.current) return;

        const currentStr = JSON.stringify(settings);

        if (currentStr === lastSavedSettings.current) return;

        const timer = setTimeout(() => {
            api.post(`/api/common/projects/${project}/settings`, {
                settings: { [stage!]: settings } // Partial update for this stage
            })
                .then(() => {
                    lastSavedSettings.current = JSON.stringify(settings);
                })
                .catch(() => {
                    toast.error("配置保存失败");
                });
        }, 800); // 800ms debounce

        return () => clearTimeout(timer);
    }, [settings, project, stage, stageActive]);

    const updateSettings = useCallback((partial: Partial<ModelSettings>) => {
        setSettings(prev => ({ ...prev, ...partial }));
    }, []);

    return (
        <ModelContext.Provider value={{ settings, isLoading, updateSettings }}>
            {children}
        </ModelContext.Provider>
    );
}

export function useModelSettings() {
    const context = useContext(ModelContext);
    if (context === undefined) {
        throw new Error("useModelSettings must be used within a ModelProvider");
    }
    return context;
}
