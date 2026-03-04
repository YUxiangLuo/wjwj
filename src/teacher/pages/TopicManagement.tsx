import { useState, useEffect, useMemo } from "react";
import { BookOpen, Search, Layers, Loader2, FileText, CheckCircle2, ChevronRight, Upload, X, Download, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { teacherApi, type Topic, type TopicDetail, type TopicRecommendQuestion } from "../api-client";
import { toast } from "sonner";

export function TopicManagement() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentStep, setCurrentStep] = useState(1);
    const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
    const [excelInfo, setExcelInfo] = useState<{ filePath: string; rowCount: number; colCount: number; columns: string[]; preview: any[] } | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [fieldMapping, setFieldMapping] = useState<{ identifier?: string; stratified: string[]; numeric: string[]; others: string[] }>({
        stratified: [],
        numeric: [],
        others: [],
    });
    const [attachments, setAttachments] = useState<TopicDetail["attachments"]>([]);
    const [recommendQuestions, setRecommendQuestions] = useState<TopicRecommendQuestion[]>([]);
    const [weightConfig, setWeightConfig] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [uploadingExcel, setUploadingExcel] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
    const [searchTerm, setSearchTerm] = useState("");

    // Form state
    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    const [newTopicName, setNewTopicName] = useState("");
    const [newTopicDesc, setNewTopicDesc] = useState("");

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "publish" | null;
        topic: Topic | null;
    }>({ open: false, type: null, topic: null });

    useEffect(() => {
        loadTopics();
    }, []);

    async function loadTopics() {
        setLoading(true);
        const res = await teacherApi.getTopics();
        if (res.success && res.data) {
            setTopics(res.data);
        }
        setLoading(false);
    }

    async function loadTopicDetail(id: number) {
        const res = await teacherApi.getTopicDetail(id);
        if (res.success && res.data) {
            setTopicDetail(res.data);
            const mapping = res.data.topic?.fieldMapping ?? null;
            const parsed = typeof mapping === "string" ? (() => { try { return JSON.parse(mapping); } catch { return null; } })() : mapping;
            setFieldMapping({
                identifier: parsed?.identifier ?? undefined,
                stratified: parsed?.stratified ?? [],
                numeric: parsed?.numeric ?? [],
                others: parsed?.others ?? [],
            });
            if (res.data.excelInfo?.columns?.length) {
                setColumns(res.data.excelInfo.columns);
            }
            if (res.data.excelInfo) {
                setExcelInfo({
                    filePath: res.data.topic?.excelFilePath ?? "",
                    rowCount: res.data.topic?.excelRowCount ?? 0,
                    colCount: res.data.excelInfo.columns.length,
                    columns: res.data.excelInfo.columns,
                    preview: res.data.excelInfo.preview,
                });
            }
            setAttachments(res.data.attachments ?? []);
            setRecommendQuestions(res.data.recommendQuestions ?? []);
            const weight = res.data.topic?.weightConfig;
            const weightParsed = typeof weight === "string" ? (() => { try { return JSON.parse(weight); } catch { return null; } })() : weight;
            setWeightConfig({
                questionnaire: weightParsed?.questionnaire ?? 30,
                process: weightParsed?.process ?? 30,
                report: weightParsed?.report ?? 40,
            });
        }
    }

    async function handleSubmitTopic() {
        if (!newTopicName.trim()) return;

        let res;
        if (editingTopicId) {
            // Update
            res = await teacherApi.updateTopic(editingTopicId, {
                name: newTopicName,
                description: newTopicDesc
            });
        } else {
            // Create
            res = await teacherApi.createTopic({
                name: newTopicName,
                description: newTopicDesc
            });
        }

        if (res.success) {
            if (!editingTopicId && res.data && typeof res.data === "object" && "id" in res.data) {
                const newId = (res.data as { id: number }).id;
                setEditingTopicId(newId);
                await loadTopicDetail(newId);
                setCurrentStep(2);
            } else if (editingTopicId) {
                await loadTopicDetail(editingTopicId);
                setCurrentStep(Math.min(currentStep + 1, 6));
            }
            loadTopics();
        } else {
            toast.error((editingTopicId ? "更新" : "创建") + "失败: " + (res.error?.message || "未知错误"));
        }
    }

    function openCreateModal() {
        setEditingTopicId(null);
        setNewTopicName("");
        setNewTopicDesc("");
        setCurrentStep(1);
        setTopicDetail(null);
        setExcelInfo(null);
        setColumns([]);
        setFieldMapping({ stratified: [], numeric: [], others: [] });
        setAttachments([]);
        setRecommendQuestions([]);
        setWeightConfig({ questionnaire: 30, process: 30, report: 40 });
        setShowCreateModal(true);
    }

    function openEditModal(topic: Topic) {
        setEditingTopicId(topic.id);
        setNewTopicName(topic.name);
        setNewTopicDesc(topic.description || "");
        setCurrentStep(1);
        loadTopicDetail(topic.id);
        setShowCreateModal(true);
    }

    async function executeConfirmAction() {
        const { type, topic } = confirmDialog;
        if (!topic || !type) return;

        let res;
        if (type === "delete") {
            res = await teacherApi.deleteTopic(topic.id);
        } else if (type === "publish") {
            res = await teacherApi.updateTopic(topic.id, { status: 1 });
        }

        if (res?.success) {
            loadTopics();
        } else {
            toast.error("操作失败");
        }
        setConfirmDialog({ open: false, type: null, topic: null });
    }

    async function handleExcelUpload(file: File) {
        if (!editingTopicId) return;
        setUploadingExcel(true);
        const res = await teacherApi.uploadTopicExcel(editingTopicId, file);
        setUploadingExcel(false);
        if (res.success && res.data) {
            setExcelInfo(res.data);
            setColumns(res.data.columns ?? []);
        } else {
            toast.error("上传失败: " + res.error?.message);
        }
    }

    async function handleSaveFieldMapping() {
        if (!editingTopicId) return;
        if (!fieldMapping.identifier) {
            toast.error("请选择标识符字段");
            return;
        }
        if (fieldMapping.stratified.length === 0 || fieldMapping.numeric.length === 0) {
            toast.error("至少选择1个分层变量和1个数值变量");
            return;
        }
        const res = await teacherApi.updateFieldMapping(editingTopicId, fieldMapping);
        if (res.success) {
            setCurrentStep(4);
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
    }

    async function handleUploadAttachment(file: File) {
        if (!editingTopicId) return;
        setUploadingAttachment(true);
        const res = await teacherApi.uploadAttachment(editingTopicId, file);
        setUploadingAttachment(false);
        if (res.success) {
            await loadTopicDetail(editingTopicId);
        } else {
            toast.error("上传失败: " + res.error?.message);
        }
    }

    async function handleSaveRecommendQuestions() {
        if (!editingTopicId) return;
        const items = recommendQuestions.map((q, idx) => ({
            questionType: q.questionType,
            content: q.content,
            options: q.options,
            sortOrder: q.sortOrder ?? idx,
        }));
        const res = await teacherApi.updateRecommendQuestions(editingTopicId, items);
        if (res.success) {
            setCurrentStep(6);
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
    }

    async function handleSaveWeights() {
        if (!editingTopicId) return;
        const total = weightConfig.questionnaire + weightConfig.process + weightConfig.report;
        if (total !== 100) {
            toast.error("权重总和必须等于100");
            return;
        }
        const res = await teacherApi.updateWeightConfig(editingTopicId, weightConfig);
        if (res.success) {
            setShowCreateModal(false);
            setCurrentStep(1);
            setEditingTopicId(null);
            setNewTopicName("");
            setNewTopicDesc("");
            loadTopics();
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
    }

    const summary = useMemo(() => {
        const total = topics.length;
        const published = topics.filter((topic) => topic.status === 1).length;
        const draft = total - published;
        const totalRows = topics.reduce((sum, topic) => sum + (topic.dataRows || 0), 0);
        return { total, published, draft, totalRows };
    }, [topics]);

    const filteredTopics = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return topics.filter((topic) => {
            const matchesKeyword = !keyword || topic.name.toLowerCase().includes(keyword);
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "published" ? topic.status === 1 : topic.status === 0);
            return matchesKeyword && matchesStatus;
        });
    }, [topics, searchTerm, statusFilter]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-100">课题管理</h2>
                <p className="text-sm text-slate-400 mt-1">配置课题信息、数据与评分权重。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">课题总数</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <BookOpen className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已发布</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.published}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">草稿</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.draft}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                            <FileText className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">数据行数</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.totalRows.toLocaleString()}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">课题列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredTopics.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                placeholder="搜索课题名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "draft" | "published")}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            + 创建课题
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    {loading ? <div className="text-center py-12 text-slate-500">加载中...</div> : filteredTopics.map((topic) => (
                        <div key={topic.id} className="border border-slate-800 rounded-lg p-5 bg-slate-950 hover:bg-slate-900 hover:border-slate-700 transition-all">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-slate-100 text-lg">{topic.name}</h4>
                                            {topic.status === 1 ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">已发布</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20">草稿</Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString()}</div>
                                        <div className="text-sm text-slate-400 mt-2 line-clamp-2 max-w-2xl">{topic.description || "暂无描述"}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2">
                                <div className="flex items-center gap-6 text-sm text-slate-500">
                                    <span className="flex items-center gap-2">
                                        <Layers className="w-4 h-4" />
                                        数据行数：<span className="text-slate-300">{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {topic.status === 0 ? (
                                        <>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setConfirmDialog({ open: true, type: "publish", topic })}>发布</Button>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-blue-400 hover:bg-blue-500/10" onClick={() => openEditModal(topic)}>查看</Button>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
                                                onClick={async () => {
                                                    const res = await teacherApi.copyTopic(topic.id);
                                                    if (res.success) {
                                                        loadTopics();
                                                    } else {
                                                        toast.error("复制失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                复制
                                            </Button>
                                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                            {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                                <div key={step} className="flex items-center shrink-0">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx + 1 === currentStep ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                                        {idx + 1}
                                    </div>
                                    <span className={`text-xs ml-2 ${idx + 1 === currentStep ? "text-indigo-400 font-medium" : "text-slate-500"}`}>{step}</span>
                                    {idx < 5 && <ChevronRight className="w-3 h-3 mx-2 text-slate-700" />}
                                </div>
                            ))}
                        </div>

                        <div className="min-h-[300px]">
                            {currentStep === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-2">
                                        <Label htmlFor="topicName" className="text-slate-300">课题名称</Label>
                                        <Input
                                            id="topicName"
                                            placeholder="请输入课题名称"
                                            value={newTopicName}
                                            onChange={e => setNewTopicName(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="topicDesc" className="text-slate-300">背景描述</Label>
                                        <Textarea
                                            id="topicDesc"
                                            placeholder="请输入课题背景描述"
                                            className="min-h-40 resize-none bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                            value={newTopicDesc}
                                            onChange={e => setNewTopicDesc(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-slate-300">上传总体数据（Excel）</Label>
                                        <div className="flex items-center gap-3">
                                            <a 
                                                href="/templates/数据上传说明.md" 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                            >
                                                <HelpCircle className="w-3 h-3" />
                                                数据规范
                                            </a>
                                            <a 
                                                href="/templates/空白模板.csv" 
                                                download
                                                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                            >
                                                <Download className="w-3 h-3" />
                                                下载模板
                                            </a>
                                        </div>
                                    </div>
                                    <div className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-lg p-8 text-center hover:border-indigo-500/50 transition-colors">
                                        <Upload className="w-10 h-10 mx-auto text-slate-600 mb-4" />
                                        <p className="text-sm text-slate-400 mb-2">点击或拖拽上传 Excel 文件</p>
                                        <p className="text-xs text-slate-500 mb-4">支持 .xlsx, .xls, .csv 格式，数据行数 1-100,000</p>
                                        <Input
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            className="hidden"
                                            id="excel-upload"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleExcelUpload(file);
                                            }}
                                        />
                                        <div className="flex items-center justify-center gap-3">
                                            <Button variant="outline" onClick={() => document.getElementById('excel-upload')?.click()} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white">
                                                选择文件
                                            </Button>
                                        </div>
                                    </div>
                                    {uploadingExcel && <div className="flex items-center gap-2 text-sm text-indigo-400"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                    {excelInfo && (
                                        <div className="bg-slate-950 border border-slate-800 rounded p-4 text-sm text-slate-300">
                                            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                上传成功
                                            </div>
                                            <div>已解析：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">标识符（必选 1 个）</Label>
                                        <Select value={fieldMapping.identifier ?? ""} onValueChange={(v) => setFieldMapping(prev => ({ ...prev, identifier: v }))}>
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                                <SelectValue placeholder="选择标识符字段" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                {columns.map((c) => (
                                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-slate-500">用于唯一标识每条数据的字段，如“编号”、“ID”等</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">分层变量</Label>
                                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                                {columns.map((c) => (
                                                    <label key={c} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-1.5 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                            checked={fieldMapping.stratified.includes(c)}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => ({
                                                                    ...prev,
                                                                    stratified: e.target.checked
                                                                        ? [...prev.stratified, c]
                                                                        : prev.stratified.filter(x => x !== c)
                                                                }));
                                                            }}
                                                        />
                                                        {c}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">数值变量</Label>
                                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                                {columns.map((c) => (
                                                    <label key={c} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-1.5 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                            checked={fieldMapping.numeric.includes(c)}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => ({
                                                                    ...prev,
                                                                    numeric: e.target.checked
                                                                        ? [...prev.numeric, c]
                                                                        : prev.numeric.filter(x => x !== c)
                                                                }));
                                                            }}
                                                        />
                                                        {c}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <Label className="text-slate-300">附件上传</Label>
                                    <Input
                                        type="file"
                                        className="bg-slate-950 border-slate-800 text-slate-300 file:bg-slate-800 file:text-slate-300"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUploadAttachment(file);
                                        }}
                                    />
                                    {uploadingAttachment && <div className="flex items-center gap-2 text-sm text-indigo-400"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                    <div className="space-y-2 mt-4">
                                        {attachments.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between text-sm p-3 bg-slate-950 border border-slate-800 rounded-lg group">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-4 h-4 text-indigo-400" />
                                                    <span className="text-slate-300">{a.fileName}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                                    onClick={() => teacherApi.deleteAttachment(editingTopicId!, a.id).then(() => loadTopicDetail(editingTopicId!))}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        {attachments.length === 0 && <div className="text-sm text-slate-500 text-center py-4">暂无附件</div>}
                                    </div>
                                </div>
                            )}

                            {currentStep === 5 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-300">推荐题目</Label>
                                        <Button size="sm" onClick={() => setRecommendQuestions(prev => ([...prev, { id: Date.now(), topicId: editingTopicId ?? 0, questionType: 1, content: "", options: "", sortOrder: prev.length }]))} className="bg-indigo-600 hover:bg-indigo-700">
                                            + 添加题目
                                        </Button>
                                    </div>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                        {recommendQuestions.map((q, idx) => (
                                            <div key={q.id} className="border border-slate-800 bg-slate-950 rounded-lg p-4 space-y-3 relative group">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-slate-500 text-xs font-mono w-6">{idx + 1}.</span>
                                                    <Select value={String(q.questionType)} onValueChange={(v) => {
                                                        const next = [...recommendQuestions];
                                                        next[idx] = { ...q, questionType: Number(v) };
                                                        setRecommendQuestions(next);
                                                    }}>
                                                        <SelectTrigger className="w-32 bg-slate-900 border-slate-800 text-slate-300 h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                            <SelectItem value="1">判断题</SelectItem>
                                                            <SelectItem value="2">单选题</SelectItem>
                                                            <SelectItem value="3">多选题</SelectItem>
                                                            <SelectItem value="4">量表题</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 h-8 w-8 p-0"
                                                        onClick={() => setRecommendQuestions(prev => prev.filter((_, i) => i !== idx))}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                                <Input
                                                    placeholder="题目内容"
                                                    value={q.content}
                                                    onChange={(e) => {
                                                        const next = [...recommendQuestions];
                                                        next[idx] = { ...q, content: e.target.value };
                                                        setRecommendQuestions(next);
                                                    }}
                                                    className="bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                                />
                                                <Input
                                                    placeholder="选项（逗号分隔，判断题无需填写）"
                                                    value={typeof q.options === "string" ? q.options : (q.options ? JSON.stringify(q.options) : "")}
                                                    onChange={(e) => {
                                                        const next = [...recommendQuestions];
                                                        next[idx] = { ...q, options: e.target.value };
                                                        setRecommendQuestions(next);
                                                    }}
                                                    className="bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600 text-sm"
                                                    disabled={q.questionType === 1 || q.questionType === 4}
                                                />
                                            </div>
                                        ))}
                                        {recommendQuestions.length === 0 && <div className="text-center text-slate-500 py-8">暂无推荐题目</div>}
                                    </div>
                                </div>
                            )}

                            {currentStep === 6 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                            <Label className="text-slate-300 text-lg">问卷设计权重</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={weightConfig.questionnaire}
                                                    onChange={(e) => setWeightConfig(prev => ({ ...prev, questionnaire: Number(e.target.value) }))}
                                                    className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                                />
                                                <span className="text-slate-500 font-bold text-xl">%</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                            <Label className="text-slate-300 text-lg">实验过程权重</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={weightConfig.process}
                                                    onChange={(e) => setWeightConfig(prev => ({ ...prev, process: Number(e.target.value) }))}
                                                    className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                                />
                                                <span className="text-slate-500 font-bold text-xl">%</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                            <Label className="text-slate-300 text-lg">实验报告权重</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={weightConfig.report}
                                                    onChange={(e) => setWeightConfig(prev => ({ ...prev, report: Number(e.target.value) }))}
                                                    className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                                />
                                                <span className="text-slate-500 font-bold text-xl">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-950/50 p-4 rounded-lg flex justify-between items-center border border-slate-800">
                                        <span className="text-slate-400">当前总权重</span>
                                        <span className={`text-2xl font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <div className="flex gap-2">
                            {currentStep > 1 && (
                                <Button variant="outline" onClick={() => setCurrentStep(prev => prev - 1)} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">上一步</Button>
                            )}
                            {currentStep === 1 && (
                                <Button onClick={handleSubmitTopic} className="bg-indigo-600 hover:bg-indigo-700 text-white">{editingTopicId ? "保存并继续" : "下一步"}</Button>
                            )}
                            {currentStep === 2 && (
                                <Button onClick={() => setCurrentStep(3)} disabled={!excelInfo} className="bg-indigo-600 hover:bg-indigo-700 text-white">下一步</Button>
                            )}
                            {currentStep === 3 && (
                                <Button onClick={handleSaveFieldMapping} disabled={!fieldMapping.identifier} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存并继续</Button>
                            )}
                            {currentStep === 4 && (
                                <Button onClick={() => setCurrentStep(5)} className="bg-indigo-600 hover:bg-indigo-700 text-white">下一步</Button>
                            )}
                            {currentStep === 5 && (
                                <Button onClick={handleSaveRecommendQuestions} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存并继续</Button>
                            )}
                            {currentStep === 6 && (
                                <Button onClick={handleSaveWeights} className="bg-indigo-600 hover:bg-indigo-700 text-white">完成</Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirmDialog.open}
                onOpenChange={(open) => !open && setConfirmDialog(markdown => ({ ...markdown, open: false }))}
            >
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认操作</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            {confirmDialog.type === "delete" && "确认删除该课题吗？删除后无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该课题吗？发布后学生将可见。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
