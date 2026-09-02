"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Settings2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useModelSettings } from "@/lib/contexts/model-context";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface ModelOption {
    id: string;
    name: string;
    provider: string;
}

export function ModelSelector() {
    const { settings, updateSettings, isLoading } = useModelSettings();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = React.useState(true);
    const [models, setModels] = React.useState<ModelOption[]>([]);
    const [fetchingModels, setFetchingModels] = React.useState(false);

    // Load available models from backend
    React.useEffect(() => {
        setFetchingModels(true);
        api.get("/api/common/models")
            .then((res: any) => {
                if (res.models) {
                    setModels(res.models);
                }
            })
            .catch(err => {
                console.error("Failed to load models", err);
            })
            .finally(() => setFetchingModels(false));
    }, []);

    // Only render controls on stage/import pages; elsewhere settings are not
    // stage-scoped and would be written into a meaningless settings key.
    const currentStage = getCurrentStage(pathname);
    if (!currentStage) {
        return null;
    }

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="mt-auto border-t bg-slate-50/50 dark:bg-slate-900/50"
        >
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <div className="flex items-center gap-2">
                    <Settings2 size={14} />
                    <span>AI 设置</span>
                </div>
                <div className="flex items-center gap-2">
                    {(isLoading || fetchingModels) && <Loader2 size={12} className="animate-spin" />}
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 px-4 pb-4">
                {/* Model Select */}
                <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">生成模型</label>
                    <Select
                        value={settings.model}
                        onValueChange={(val) => updateSettings({ model: val })}
                        disabled={isLoading || fetchingModels}
                    >
                        <SelectTrigger className="h-8 text-xs w-full">
                            <SelectValue placeholder="默认模型" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] w-[220px]">
                            {models.length > 0 ? models.map(m => (
                                <SelectItem key={m.id} value={m.id} className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            m.id.includes("flash") ? "bg-amber-400" :
                                                m.id.includes("pro") ? "bg-blue-400" : "bg-slate-400"
                                        )} />
                                        <span className="truncate max-w-[180px]" title={m.name}>{m.name}</span>
                                    </div>
                                </SelectItem>
                            )) : (
                                <div className="p-2 text-xs text-slate-400 text-center">Loading models...</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {/* Temperature */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400 font-medium">创意温度</label>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{settings.temperature}</span>
                    </div>
                    <Slider
                        value={[settings.temperature]}
                        min={0}
                        max={2}
                        step={0.1}
                        onValueChange={([val]) => updateSettings({ temperature: val })}
                        className="py-1"
                    />
                    <p className="text-[11px] leading-snug text-slate-400">
                        越高越有天马行空的创意，越低越稳定贴合大纲
                    </p>
                </div>

                <Separator className="bg-slate-200 dark:bg-slate-800" />
            </CollapsibleContent>
        </Collapsible>
    );
}

// Extract current stage/page from pathname (e.g., /stage3 -> "stage3", /import -> "import")
function getCurrentStage(pathname: string | null): string | null {
    // Match /stageN or /import
    const stageMatch = pathname?.match(/\/(stage\d)/);
    if (stageMatch) return stageMatch[1];

    if (pathname?.includes("/import")) return "import";

    return null;
}
