"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Settings, Plus, Loader2, RotateCcw, Pencil, Trash2, Database, HelpCircle } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModelConfig {
    id: string;
    provider: string;
    model_name: string;
    api_key_env: string;
    base_url?: string;
    thinking_level?: string;
    supports_cache: boolean;
    description?: string;
    pricing?: { input: number; output: number };
}

const emptyModel: Omit<ModelConfig, "id"> = {
    provider: "openai",
    model_name: "",
    api_key_env: "DASHSCOPE_API_KEY",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    thinking_level: "minimal",
    supports_cache: false,
    description: "",
    pricing: { input: 0, output: 0 }
};

export default function ModelsPage() {
    const [models, setModels] = React.useState<ModelConfig[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [editingId, setEditingId] = React.useState("");
    const [formData, setFormData] = React.useState<Omit<ModelConfig, "id">>(emptyModel);
    const [saving, setSaving] = React.useState(false);

    // 加载模型列表
    const loadModels = async () => {
        setLoading(true);
        try {
            const res: any = await api.get("/api/settings/models");
            setModels(res.models || []);
        } catch (err) {
            toast.error("加载失败");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadModels();
    }, []);

    // 打开新增对话框
    const handleAdd = () => {
        setIsEditing(false);
        setEditingId("");
        setFormData(emptyModel);
        setDialogOpen(true);
    };

    // 打开编辑对话框
    const handleEdit = (model: ModelConfig) => {
        setIsEditing(true);
        setEditingId(model.id);
        setFormData({
            provider: model.provider,
            model_name: model.model_name,
            api_key_env: model.api_key_env,
            base_url: model.base_url || "",
            thinking_level: model.thinking_level || "",
            supports_cache: model.supports_cache,
            description: model.description || "",
            pricing: model.pricing || { input: 0, output: 0 }
        });
        setDialogOpen(true);
    };

    // 保存模型
    const handleSave = async () => {
        if (!editingId.trim() && !isEditing) {
            toast.error("请输入模型 ID");
            return;
        }
        if (!formData.model_name.trim()) {
            toast.error("请输入模型名称");
            return;
        }

        setSaving(true);
        try {
            const modelId = isEditing ? editingId : editingId;
            const endpoint = isEditing
                ? `/api/settings/models/${modelId}`
                : `/api/settings/models/${editingId}`;
            const method = isEditing ? api.put : api.post;

            await method(endpoint, formData);
            toast.success(isEditing ? "模型已更新" : "模型已创建");
            setDialogOpen(false);
            loadModels();
        } catch (err: any) {
            toast.error(err?.detail || "保存失败");
        } finally {
            setSaving(false);
        }
    };

    // 删除模型
    const handleDelete = async (modelId: string) => {
        if (!confirm(`确定删除模型 ${modelId}？`)) return;

        try {
            await api.delete(`/api/settings/models/${modelId}`);
            toast.success("模型已删除");
            loadModels();
        } catch (err: any) {
            toast.error(err?.detail || "删除失败");
        }
    };

    // 恢复默认
    const handleReset = async () => {
        if (!confirm("确定恢复默认配置？现有模型配置将被覆盖。")) return;

        try {
            await api.post("/api/settings/models/reset", {});
            toast.success("已恢复默认配置");
            loadModels();
        } catch (err: any) {
            toast.error(err?.detail || "重置失败");
        }
    };

    // 更新表单字段
    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="container mx-auto py-8 px-4 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Settings className="w-8 h-8 text-purple-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Models</h1>
                        <p className="text-sm text-slate-500">管理 LLM 模型配置</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleReset}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        恢复默认
                    </Button>
                    <Button size="sm" onClick={handleAdd}>
                        <Plus className="w-4 h-4 mr-2" />
                        新增模型
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Model Name</TableHead>
                            <TableHead>API Key Env</TableHead>
                            <TableHead>Cache</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                </TableCell>
                            </TableRow>
                        ) : models.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                                    暂无模型配置
                                </TableCell>
                            </TableRow>
                        ) : (
                            models.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell className="font-mono text-sm font-medium">{m.id}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-0.5 rounded text-xs ${m.provider === "google"
                                            ? "bg-blue-100 text-blue-700"
                                            : "bg-green-100 text-green-700"
                                            }`}>
                                            {m.provider}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">{m.model_name}</TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500">{m.api_key_env}</TableCell>
                                    <TableCell>
                                        {m.supports_cache ? (
                                            <Database className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleEdit(m)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:text-red-600"
                                            onClick={() => handleDelete(m.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Edit/Create Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? `编辑 ${editingId}` : "新增模型"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Model ID (only for create) */}
                        {!isEditing && (
                            <div className="grid gap-2">
                                <Label>模型 ID *</Label>
                                <Input
                                    placeholder="例如: my-custom-model"
                                    value={editingId}
                                    onChange={(e) => setEditingId(e.target.value)}
                                />
                            </div>
                        )}

                        {/* Provider */}
                        <div className="grid gap-2">
                            <Label>Provider *</Label>
                            <Select
                                value={formData.provider}
                                onValueChange={(v) => {
                                    updateField("provider", v);
                                    // 自动切换 api_key_env
                                    if (v === "openai") {
                                        updateField("api_key_env", "DASHSCOPE_API_KEY");
                                        updateField("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1");
                                    } else {
                                        updateField("api_key_env", "DASHSCOPE_API_KEY");
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="google">Google</SelectItem>
                                    <SelectItem value="openai">OpenAI Compatible</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Model Name */}
                        <div className="grid gap-2">
                            <Label>Model Name *</Label>
                            <Input
                                placeholder="例如: qwen3.8-max"
                                value={formData.model_name}
                                onChange={(e) => updateField("model_name", e.target.value)}
                            />
                        </div>

                        {/* API Key Env */}
                        <div className="grid gap-2">
                            <div className="flex items-center gap-1">
                                <Label>API Key 变量名 *</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle className="w-4 h-4 text-slate-400 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs text-xs">
                                            <p className="font-semibold mb-1">这是存储在 .env 文件中的变量名</p>
                                            <p className="text-slate-300 mb-2">模型会通过这个变量名获取对应的 API Key</p>
                                            <p className="font-semibold">示例：</p>
                                            <ul className="list-disc list-inside text-slate-300">
                                                <li>DASHSCOPE_API_KEY → 阿里云百炼</li>
                                                <li>OPENAI_API_KEY → OpenAI</li>
                                                <li>MY_CUSTOM_KEY → 自定义服务</li>
                                            </ul>
                                            <p className="text-slate-400 mt-2 text-[10px]">
                                                格式：全大写字母 + 下划线，如 XXX_API_KEY（建议：每个供应商使用不同的变量名）
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input
                                placeholder="例如: DASHSCOPE_API_KEY"
                                value={formData.api_key_env}
                                onChange={(e) => updateField("api_key_env", e.target.value)}
                            />
                        </div>

                        {/* Base URL (OpenAI only) */}
                        {formData.provider === "openai" && (
                            <div className="grid gap-2">
                                <Label>Base URL</Label>
                                <Input
                                    placeholder="例如: https://dashscope.aliyuncs.com/compatible-mode/v1"
                                    value={formData.base_url}
                                    onChange={(e) => updateField("base_url", e.target.value)}
                                />
                            </div>
                        )}

                        {/* Thinking Level (Google only) */}
                        {formData.provider === "google" && (
                            <div className="grid gap-2">
                                <Label>Thinking Level</Label>
                                <Select
                                    value={formData.thinking_level || "minimal"}
                                    onValueChange={(v) => updateField("thinking_level", v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="minimal">Minimal</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Supports Cache */}
                        <div className="flex items-center justify-between">
                            <Label>支持缓存</Label>
                            <Switch
                                checked={formData.supports_cache}
                                onCheckedChange={(v) => updateField("supports_cache", v)}
                            />
                        </div>

                        {/* Description */}
                        <div className="grid gap-2">
                            <Label>描述</Label>
                            <Input
                                placeholder="模型描述"
                                value={formData.description}
                                onChange={(e) => updateField("description", e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
