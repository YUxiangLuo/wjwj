import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
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
import { isStudyContractComplete, type FieldMappingState } from "../components/StudyContractEditor";
import { parseStudyContract } from "@/lib/analysis-target";
import { TopicViewDialog } from "../components/TopicViewDialog";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { buildDefaultSamplingPolicy, resolveSamplingPolicy, type SamplingPolicyV1 } from "@/lib/sampling-policy";

export function TopicManagement() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingTopic, setViewingTopic] = useState<Topic | null>(null);
    const { loading, error: loadError, run } = useAsyncLoad("模板列表加载失败");
    const [currentStep, setCurrentStep] = useState(1);
    const [excelInfo, setExcelInfo] = useState<{
        rowCount: number;
        colCount: number;
        columns: string[];
        preview: any[];
        columnValues?: Record<string, string[]>;
        columnValuesTruncated?: string[];
    } | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [fieldMapping, setFieldMapping] = useState<FieldMappingState>({
        stratified: [],
        numeric: [],
        others: [],
    });
    const [attachments, setAttachments] = useState<TopicDetail["attachments"]>([]);
    const [recommendQuestions, setRecommendQuestions] = useState<Question[]>([]);
    const [weightConfig, setWeightConfig] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [samplingPolicy, setSamplingPolicy] = useState<SamplingPolicyV1>(() => buildDefaultSamplingPolicy());
    const detailLoad = useAsyncLoad("实验模板详情加载失败");
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
        return run(async () => requireApiData(await teacherApi.getTopics(), "模板列表加载失败"), setTopics);
    }

    async function loadTopicDetail(id: number) {
        await detailLoad.run(async () => requireApiData(await teacherApi.getTopicDetail(id), "实验模板详情加载失败"), (data) => {
            const topicRow = data.topic;
            if (topicRow && typeof topicRow.status === "number") {
                setEditingTopicPublished(topicRow.status === 1);
            }
            const mapping = data.topic?.fieldMapping ?? null;
            const parsed = typeof mapping === "string" ? (() => { try { return JSON.parse(mapping); } catch { return null; } })() : mapping;
            setFieldMapping({
                identifier: parsed?.identifier ?? undefined,
                stratified: parsed?.stratified ?? [],
                numeric: parsed?.numeric ?? [],
                others: parsed?.others ?? [],
                analysisTarget: parsed?.analysisTarget,
                studyContract: parsed?.studyContract,
            });
            if (data.excelInfo?.columns?.length) {
                setColumns(data.excelInfo.columns);
            }
            if (data.excelInfo) {
                setExcelInfo({
                    rowCount: data.topic?.excelRowCount ?? 0,
                    colCount: data.excelInfo.columns.length,
                    columns: data.excelInfo.columns,
                    preview: data.excelInfo.preview,
                    columnValues: data.excelInfo.columnValues,
                    columnValuesTruncated: data.excelInfo.columnValuesTruncated,
                });
            }
            setAttachments(data.attachments ?? []);
            setRecommendQuestions(data.recommendQuestions ?? []);
            const weight = data.topic?.weightConfig;
            const weightParsed = typeof weight === "string" ? (() => { try { return JSON.parse(weight); } catch { return null; } })() : weight;
            setWeightConfig({
                questionnaire: weightParsed?.questionnaire ?? 30,
                process: weightParsed?.process ?? 30,
                report: weightParsed?.report ?? 40,
            });
            setSamplingPolicy(resolveSamplingPolicy(data.topic?.samplingPolicy));
        });
    }

    async function handleSubmitTopic() {
        if (!newTopicName.trim()) {
            toast.error("请输入实验模板名称");
            return;
        }

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
                setCurrentStep(Math.min(currentStep + 1, 7));
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
        setSamplingPolicy(buildDefaultSamplingPolicy());
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

    function requestPublish(topic: Topic) {
        if (topic.dataRows <= 0) {
            toast.error("实验模板需先上传总体数据后才能发布");
            return;
        }
        setConfirmDialog({ open: true, type: "publish", topic });
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
            setExcelInfo({
                rowCount: res.data.rowCount ?? 0,
                colCount: res.data.colCount ?? res.data.columns.length,
                columns: res.data.columns,
                preview: res.data.preview,
                columnValues: res.data.columnValues,
                columnValuesTruncated: res.data.columnValuesTruncated,
            });
            setColumns(res.data.columns ?? []);
            setFieldMapping({ stratified: [], numeric: [], others: [] });
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
        // 新课题要求研究合同完整；仅有旧版对照变量的历史课题保持可保存（兼容）。
        if (parseStudyContract(fieldMapping) !== null || fieldMapping.studyContract !== undefined) {
            if (!isStudyContractComplete(fieldMapping.studyContract)) {
                toast.error("请完成研究合同：研究问题、目标总体、分析单位和对照变量");
                return;
            }
        } else if (!fieldMapping.analysisTarget?.field || (fieldMapping.analysisTarget.kind === "proportion" && !fieldMapping.analysisTarget.value)) {
            toast.error("请指定对照变量");
            return;
        }
        const res = await teacherApi.updateFieldMapping(editingTopicId, fieldMapping);
        if (res.success) {
            await loadTopicDetail(editingTopicId);
            setCurrentStep(4);
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
    }

    async function handleSaveSamplingPolicy() {
        if (!editingTopicId) return;
        if (editingTopicPublished) {
            setCurrentStep(5);
            return;
        }
        const res = await teacherApi.updateSamplingPolicy(editingTopicId, samplingPolicy);
        if (res.success) {
            setCurrentStep(5);
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
            setCurrentStep(7);
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
            <p className="text-label text-muted-foreground">配置总体数据、研究目标、抽样策略、教学资料与评分规则。</p>

            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">模板总数</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || loadError ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <BookOpen className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">已发布</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || loadError ? "-" : summary.published}</p>
                        </div>
                        <IconTile intent="success">
                            <Layers className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">草稿</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || loadError ? "-" : summary.draft}</p>
                        </div>
                        <IconTile intent="warning">
                            <FileText className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">数据行数</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || loadError ? "-" : summary.totalRows.toLocaleString()}</p>
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
                        <CardTitle className="text-body text-foreground">实验模板列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">共 {filteredTopics.length} 条数据</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <div className="relative w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-topic-search"
                                aria-label="搜索实验模板名称"
                                placeholder="搜索实验模板名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "draft" | "published")}>
                            <SelectTrigger aria-label="按实验模板状态筛选" data-testid="teacher-topic-status-filter" className="bg-card border-input text-foreground w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-topic-create-open" onClick={openCreateModal} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                            + 创建实验模板
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="space-y-4 pt-4">
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadTopics()} /> : loading ? <div role="status" aria-live="polite" className="text-center py-12 text-muted-foreground">加载中...</div> : topics.length === 0 ? (
                        <div className="rounded-surface border border-dashed border-border py-16 text-center">
                            <p className="text-subheading font-medium text-foreground">还没有实验模板</p>
                            <p className="mt-2 text-label text-muted-foreground">点击「创建实验模板」，配置总体数据、研究目标和抽样策略。</p>
                        </div>
                    ) : filteredTopics.length === 0 ? (
                        <div className="rounded-surface border border-dashed border-border py-16 text-center">
                            <p className="text-subheading font-medium text-foreground">没有符合条件的实验模板</p>
                            <p className="mt-2 text-label text-muted-foreground">试试清空搜索或切换状态筛选。</p>
                        </div>
                    ) : filteredTopics.map((topic) => (
                        <div data-testid={`teacher-topic-row-${topic.id}`} key={topic.id} className="border border-border rounded-surface p-5 bg-background">
                            <div className="flex gap-3 flex-row items-start justify-between mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-surface bg-primary-muted text-primary flex items-center justify-center border border-primary-border">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-foreground text-subheading">{topic.name}</h3>
                                            {topic.status === 1 ? (
                                                <StatusBadge intent="success">已发布</StatusBadge>
                                            ) : (
                                                <StatusBadge intent="warning">草稿</StatusBadge>
                                            )}
                                            {topic.hasTasks && <StatusBadge intent="info">实验任务已分配 · 内容只读</StatusBadge>}
                                        </div>
                                        <div className="text-meta text-muted-foreground mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</div>
                                        <div className="text-label text-muted-foreground mt-2 line-clamp-2 max-w-2xl">{getRichTextPlainText(topic.description) || "暂无描述"}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
                                <div className="flex items-center gap-6 text-label text-muted-foreground">
                                    <span className="flex items-center gap-2">
                                        <Layers className="w-4 h-4" />
                                        数据行数：<span className="text-foreground">{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {topic.hasTasks ? (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info-muted" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button
                                                data-testid={`teacher-topic-copy-${topic.id}`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={copyingTopicId !== null}
                                                className="text-muted-foreground hover:text-info hover:bg-info-muted"
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
                                        </>
                                    ) : topic.status === 0 ? (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info-muted" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary-muted" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button data-testid={`teacher-topic-publish-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-success hover:bg-success-muted" onClick={() => requestPublish(topic)}>发布</Button>
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info-muted" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button data-testid={`teacher-topic-edit-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary-muted" onClick={() => openEditModal(topic)}>编辑</Button>
                                            <Button
                                                data-testid={`teacher-topic-copy-${topic.id}`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={copyingTopicId !== null}
                                                className="text-muted-foreground hover:text-info hover:bg-info-muted"
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
                                            <Button data-testid={`teacher-topic-delete-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
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
                        detailLoad.cancel();
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
                        setSamplingPolicy(buildDefaultSamplingPolicy());
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
                loadingDetail={detailLoad.loading || Boolean(detailLoad.error)}
                detailError={editingTopicId ? detailLoad.error : null}
                onRetryDetail={() => { if (editingTopicId) void loadTopicDetail(editingTopicId); }}
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
                samplingPolicy={samplingPolicy}
                setSamplingPolicy={setSamplingPolicy}
                onSubmitTopic={handleSubmitTopic}
                onSaveFieldMapping={handleSaveFieldMapping}
                onSaveSamplingPolicy={handleSaveSamplingPolicy}
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
                            {confirmDialog.type === "delete" && "将永久删除该实验模板、总体数据和全部附件。已分配任务的模板不能删除，此操作无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该实验模板吗？发布后可分配给班级。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} variant={confirmDialog.type === "delete" ? "destructive" : "default"}>
                            {confirmDialog.type === "delete" ? "永久删除" : "确认"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
