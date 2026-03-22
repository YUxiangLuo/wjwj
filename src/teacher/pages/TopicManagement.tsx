import { useState, useEffect, useMemo } from "react";
import { BookOpen, Search, Layers, FileText } from "lucide-react";
import { getRichTextPlainText } from "@/utils/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TopicWizardDialog } from "../components/TopicWizardDialog";
import { TopicViewDialog } from "../components/TopicViewDialog";
import { toast } from "sonner";

export function TopicManagement() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingTopic, setViewingTopic] = useState<Topic | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentStep, setCurrentStep] = useState(1);
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
    const [loadingDetail, setLoadingDetail] = useState(false);
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
        setLoadingDetail(true);
        const res = await teacherApi.getTopicDetail(id);
        setLoadingDetail(false);
        if (res.success && res.data) {
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
                setCurrentStep(2);
                loadTopicDetail(newId);
            } else if (editingTopicId) {
                setCurrentStep(Math.min(currentStep + 1, 6));
                loadTopicDetail(editingTopicId);
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

    function openViewModal(topic: Topic) {
        setViewingTopic(topic);
        setShowViewModal(true);
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
            const actionLabel = type === "publish" ? "发布" : "删除";
            toast.error(`${actionLabel}失败: ${res?.error?.message || "未知错误"}`);
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
            sortOrder: idx,
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
        const { questionnaire, process, report } = weightConfig;
        if (questionnaire < 10 || questionnaire > 50) {
            toast.error("问卷设计权重需在10-50%之间");
            return;
        }
        if (process < 20 || process > 60) {
            toast.error("实验过程权重需在20-60%之间");
            return;
        }
        if (report < 10 || report > 50) {
            toast.error("实验报告权重需在10-50%之间");
            return;
        }
        const total = questionnaire + process + report;
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
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">课题管理</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">配置课题信息、数据与评分权重。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">课题总数</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <BookOpen className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已发布</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.published}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">草稿</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.draft}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <FileText className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">数据行数</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.totalRows.toLocaleString()}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-900 dark:text-slate-100">课题列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredTopics.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                data-testid="teacher-topic-search"
                                placeholder="搜索课题名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "draft" | "published")}>
                            <SelectTrigger data-testid="teacher-topic-status-filter" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-topic-create-open" onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            + 创建课题
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    {loading ? <div className="text-center py-12 text-slate-500">加载中...</div> : filteredTopics.map((topic) => (
                        <div data-testid={`teacher-topic-row-${topic.id}`} key={topic.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{topic.name}</h4>
                                            {topic.status === 1 ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">已发布</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">草稿</Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString()}</div>
                                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2 max-w-2xl">{getRichTextPlainText(topic.description) || "暂无描述"}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-2">
                                <div className="flex items-center gap-6 text-sm text-slate-500">
                                    <span className="flex items-center gap-2">
                                        <Layers className="w-4 h-4" />
                                        数据行数：<span className="text-slate-700 dark:text-slate-300">{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {topic.status === 0 ? (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-500/10" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button data-testid={`teacher-topic-publish-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10" onClick={() => setConfirmDialog({ open: true, type: "publish", topic })}>发布</Button>
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-500/10" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button
                                                data-testid={`teacher-topic-copy-${topic.id}`}
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-600 dark:text-slate-400 hover:text-cyan-600 hover:bg-cyan-500/10"
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
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <TopicWizardDialog
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                editingTopicId={editingTopicId}
                currentStep={currentStep}
                setCurrentStep={setCurrentStep}
                newTopicName={newTopicName}
                setNewTopicName={setNewTopicName}
                newTopicDesc={newTopicDesc}
                setNewTopicDesc={setNewTopicDesc}
                loadingDetail={loadingDetail}
                excelInfo={excelInfo}
                uploadingExcel={uploadingExcel}
                onExcelUpload={handleExcelUpload}
                columns={columns}
                fieldMapping={fieldMapping}
                setFieldMapping={setFieldMapping}
                attachments={attachments}
                uploadingAttachment={uploadingAttachment}
                onAttachmentUpload={handleUploadAttachment}
                onRefreshTopicDetail={loadTopicDetail}
                recommendQuestions={recommendQuestions}
                setRecommendQuestions={setRecommendQuestions}
                weightConfig={weightConfig}
                setWeightConfig={setWeightConfig}
                onSubmitTopic={handleSubmitTopic}
                onSaveFieldMapping={handleSaveFieldMapping}
                onSaveRecommendQuestions={handleSaveRecommendQuestions}
                onSaveWeights={handleSaveWeights}
            />

            <TopicViewDialog
                open={showViewModal}
                onOpenChange={setShowViewModal}
                topic={viewingTopic}
            />

            <AlertDialog
                open={confirmDialog.open}
                onOpenChange={(open) => !open && setConfirmDialog(markdown => ({ ...markdown, open: false }))}
            >
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认操作</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                            {confirmDialog.type === "delete" && "确认删除该课题吗？删除后无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该课题吗？发布后学生将可见。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })} className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
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
