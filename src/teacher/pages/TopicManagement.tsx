import { useState, useEffect, useMemo } from "react";
import { BookOpen, Search, Layers, FileText } from "lucide-react";
import { getRichTextPlainText } from "@/utils/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { teacherApi, type Topic, type TopicDetail, type Question } from "../api-client";
import { TopicWizardDialog } from "../components/TopicWizardDialog";
import { TopicViewDialog } from "../components/TopicViewDialog";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

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
    const [recommendQuestions, setRecommendQuestions] = useState<Question[]>([]);
    const [weightConfig, setWeightConfig] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [uploadingExcel, setUploadingExcel] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [copyingTopicId, setCopyingTopicId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
    const [searchTerm, setSearchTerm] = useState("");

    // Form state
    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    /** 当前编辑的课题是否已发布（已发布则「上传数据」「字段映射」只读且下一步不发起相关保存请求） */
    const [editingTopicPublished, setEditingTopicPublished] = useState(false);
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
            const topicRow = res.data.topic;
            if (topicRow && typeof topicRow.status === "number") {
                setEditingTopicPublished(topicRow.status === 1);
            }
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
        setEditingTopicPublished(false);
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
        setEditingTopicPublished(topic.status === 1);
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
        if (!editingTopicId || editingTopicPublished) return;
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
        if (editingTopicPublished) {
            setCurrentStep(4);
            return;
        }
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
        const res = await teacherApi.updateRecommendQuestions(editingTopicId, recommendQuestions);
        if (res.success) {
            setCurrentStep(6);
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
    }

    async function handleSaveWeights() {
        if (!editingTopicId) return;
        if (editingTopicPublished) {
            setShowCreateModal(false);
            setCurrentStep(1);
            setEditingTopicId(null);
            setEditingTopicPublished(false);
            return;
        }
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
            setEditingTopicPublished(false);
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
                <h2 className="text-lg font-semibold text-foreground">课题管理</h2>
                <p className="text-sm text-muted-foreground mt-1">配置课题信息、数据与评分权重。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">课题总数</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <BookOpen className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已发布</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.published}</p>
                        </div>
                        <IconTile intent="success">
                            <Layers className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">草稿</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.draft}</p>
                        </div>
                        <IconTile intent="warning">
                            <FileText className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">数据行数</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalRows.toLocaleString()}</p>
                        </div>
                        <IconTile intent="auxiliary">
                            <Layers className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">课题列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredTopics.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-topic-search"
                                placeholder="搜索课题名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "draft" | "published")}>
                            <SelectTrigger data-testid="teacher-topic-status-filter" className="bg-background border-border text-foreground sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-topic-create-open" onClick={openCreateModal} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            + 创建课题
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="space-y-4 pt-4">
                    {loading ? <div className="text-center py-12 text-muted-foreground">加载中...</div> : filteredTopics.map((topic) => (
                        <div data-testid={`teacher-topic-row-${topic.id}`} key={topic.id} className="border border-border rounded-lg p-5 bg-background hover:bg-card hover:border-input transition-all">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-foreground text-lg">{topic.name}</h4>
                                            {topic.status === 1 ? (
                                                <StatusBadge intent="success">已发布</StatusBadge>
                                            ) : (
                                                <StatusBadge intent="warning">草稿</StatusBadge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</div>
                                        <div className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-2xl">{getRichTextPlainText(topic.description) || "暂无描述"}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
                                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-2">
                                        <Layers className="w-4 h-4" />
                                        数据行数：<span className="text-foreground/90">{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {topic.status === 0 ? (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info/10" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button data-testid={`teacher-topic-publish-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-success hover:bg-success/10" onClick={() => setConfirmDialog({ open: true, type: "publish", topic })}>发布</Button>
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info/10" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button
                                                data-testid={`teacher-topic-copy-${topic.id}`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={copyingTopicId !== null}
                                                className="text-muted-foreground hover:text-info hover:bg-info/10"
                                                onClick={async () => {
                                                    setCopyingTopicId(topic.id);
                                                    try {
                                                        const res = await teacherApi.copyTopic(topic.id);
                                                        if (res.success) {
                                                            loadTopics();
                                                        } else {
                                                            toast.error("复制失败: " + res.error?.message);
                                                        }
                                                    } finally {
                                                        setCopyingTopicId(null);
                                                    }
                                                }}
                                            >
                                                复制
                                            </Button>
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
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
                onOpenChange={(open) => {
                    setShowCreateModal(open);
                    if (!open) {
                        setEditingTopicId(null);
                        setEditingTopicPublished(false);
                        setNewTopicName("");
                        setNewTopicDesc("");
                        setCurrentStep(1);
                        setExcelInfo(null);
                        setColumns([]);
                        setFieldMapping({ stratified: [], numeric: [], others: [] });
                        setAttachments([]);
                        setRecommendQuestions([]);
                        setWeightConfig({ questionnaire: 30, process: 30, report: 40 });
                    }
                }}
                editingTopicId={editingTopicId}
                isPublishedTopic={editingTopicPublished}
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
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认操作</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {confirmDialog.type === "delete" && "确认删除该课题吗？删除后无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该课题吗？发布后学生将可见。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })} className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-primary hover:bg-primary/90 text-primary-foreground"}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
