import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Search, Layers } from "lucide-react";
import { getRichTextPlainText } from "@/utils/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
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
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { buildDefaultSamplingPolicy, resolveSamplingPolicy, type SamplingPolicyV1 } from "@/lib/sampling-policy";
import { clearTeacherDraft, readTeacherDraft, useTeacherId, writeTeacherDraft } from "../teacher-draft";

const NEW_TOPIC_DRAFT = "topic:new";

export function TopicManagement() {
    const teacherId = useTeacherId();
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingTopic, setViewingTopic] = useState<Topic | null>(null);
    const { loading, error: loadError, run } = useAsyncLoad("模板列表加载失败");
    const [currentStep, setCurrentStep] = useState(1);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [excelInfo, setExcelInfo] = useState<{
        rowCount: number;
        colCount: number;
        columns: string[];
        preview: any[];
        columnValues?: Record<string, string[]>;
        columnValuesTruncated?: string[];
        ppsEligibleFields?: string[];
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
    const [copiedTopicId, setCopiedTopicId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
    const [searchTerm, setSearchTerm] = useState("");

    // Form state
    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    const [topicWizardMode, setTopicWizardMode] = useState<"create" | "edit">("create");
    /** 当前编辑的课题是否已发布（已发布则「上传数据」「字段映射」只读且下一步不发起相关保存请求） */
    const [editingTopicPublished, setEditingTopicPublished] = useState(false);
    const [newTopicName, setNewTopicName] = useState("");
    const [newTopicDesc, setNewTopicDesc] = useState("");

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "publish" | "published" | null;
        topic: Topic | null;
    }>({ open: false, type: null, topic: null });
    const [confirmBusy, setConfirmBusy] = useState(false);
    const confirmLock = useRef(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [publishReady, setPublishReady] = useState(false);

    useEffect(() => {
        loadTopics();
    }, []);

    useEffect(() => {
        setSaveError(null);
    }, [currentStep, showCreateModal]);

    function reportSaveError(message: string) {
        setSaveError(message);
        toast.error(message);
    }

    useEffect(() => {
        if (!showCreateModal || topicWizardMode !== "create" || editingTopicId !== null) return;
        if (newTopicName || newTopicDesc) {
            writeTeacherDraft(teacherId, NEW_TOPIC_DRAFT, { name: newTopicName, description: newTopicDesc });
        } else {
            clearTeacherDraft(teacherId, NEW_TOPIC_DRAFT);
        }
    }, [editingTopicId, newTopicDesc, newTopicName, showCreateModal, teacherId, topicWizardMode]);

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
                    ppsEligibleFields: data.excelInfo.ppsEligibleFields,
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
            reportSaveError("请输入实验模板名称");
            return;
        }

        setSaveError(null);
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
            setSaveError(null);
            if (!editingTopicId && res.data && typeof res.data === "object" && "id" in res.data) {
                const newId = (res.data as { id: number }).id;
                clearTeacherDraft(teacherId, NEW_TOPIC_DRAFT);
                setEditingTopicId(newId);
                setCurrentStep(2);
                loadTopicDetail(newId);
            } else if (editingTopicId) {
                setCurrentStep(Math.min(currentStep + 1, 7));
                loadTopicDetail(editingTopicId);
            }
            loadTopics();
        } else {
            // Keep the precise server message (for example a row-level data error)
            // visible inside the wizard instead of only flashing a toast.
            setSaveError(res.error?.message || "保存失败，请重试");
            toast.error((editingTopicId ? "更新" : "创建") + "失败: " + (res.error?.message || "未知错误"));
        }
    }

    function openCreateModal() {
        const draft = readTeacherDraft<{ name?: string; description?: string }>(teacherId, NEW_TOPIC_DRAFT);
        setSaveError(null);
        setEditingTopicId(null);
        setTopicWizardMode("create");
        setEditingTopicPublished(false);
        setNewTopicName(typeof draft?.name === "string" ? draft.name : "");
        setNewTopicDesc(typeof draft?.description === "string" ? draft.description : "");
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
        setSaveError(null);
        setEditingTopicId(topic.id);
        setTopicWizardMode("edit");
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

    async function copyTopic(topic: Topic) {
        setCopyingTopicId(topic.id);
        try {
            const res = await teacherApi.copyTopic(topic.id);
            if (!res.success || !res.data) {
                toast.error("复制失败: " + (res.error?.message ?? "请重试"));
                return;
            }
            setStatusFilter("draft");
            setSearchTerm("");
            setCopiedTopicId(res.data.id);
            toast.success("已复制为草稿，可继续编辑后发布");
            await loadTopics();
        } finally { setCopyingTopicId(null); }
    }

    async function requestPublish(topic: Topic) {
        if (confirmLock.current) return;
        setConfirmDialog({ open: true, type: "publish", topic });
        setConfirmError(null);
        setPublishReady(false);
        confirmLock.current = true;
        setConfirmBusy(true);
        try {
            const result = await teacherApi.checkTopicPublish(topic.id);
            if (result.success) setPublishReady(true);
            else setConfirmError(result.error?.message ?? "发布前检查失败，请重试");
        } catch { setConfirmError("发布前检查失败，请重试"); }
        finally { confirmLock.current = false; setConfirmBusy(false); }
    }

    async function executeConfirmAction() {
        const { type, topic } = confirmDialog;
        if (!topic || !type || type === "published" || confirmLock.current || (type === "publish" && !publishReady)) return;
        confirmLock.current = true;
        setConfirmBusy(true);
        setConfirmError(null);
        try {
            const res = type === "delete" ? await teacherApi.deleteTopic(topic.id) : await teacherApi.updateTopic(topic.id, { status: 1 });
            if (res.success) {
                toast.success(type === "publish" ? "实验模板已发布，可在实验任务中分配给班级" : "实验模板已删除");
                loadTopics();
                setConfirmDialog(type === "publish" ? { open: true, type: "published", topic } : { open: false, type: null, topic: null });
            } else {
                const actionLabel = type === "publish" ? "发布" : "删除";
                setConfirmError(`${actionLabel}失败: ${res.error?.message || "未知错误"}`);
                if (type === "publish") setPublishReady(false);
            }
        } catch { setConfirmError("操作未完成，请重试"); }
        finally { confirmLock.current = false; setConfirmBusy(false); }
    }

    async function handleExcelUpload(file: File) {
        if (!editingTopicId || editingTopicPublished) return;
        setSaveError(null);
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
            reportSaveError(res.error?.message ?? "总体数据上传失败，请重新选择文件后重试。");
        }
    }

    async function handleSaveFieldMapping() {
        if (!editingTopicId) return;
        setSaveError(null);
        if (editingTopicPublished) {
            setSaveError(null);
            setCurrentStep(4);
            return;
        }
        if (!fieldMapping.identifier) {
            reportSaveError("请选择标识符字段");
            return;
        }
        // 新课题要求研究合同完整；仅有旧版对照变量的历史课题保持可保存（兼容）。
        if (parseStudyContract(fieldMapping) !== null || fieldMapping.studyContract !== undefined) {
            if (!isStudyContractComplete(fieldMapping.studyContract)) {
                reportSaveError("请完成研究合同：研究问题、目标总体、分析单位和对照变量");
                return;
            }
        } else if (!fieldMapping.analysisTarget?.field || (fieldMapping.analysisTarget.kind === "proportion" && !fieldMapping.analysisTarget.value)) {
            reportSaveError("请指定对照变量");
            return;
        }
        const res = await teacherApi.updateFieldMapping(editingTopicId, fieldMapping);
        if (res.success) {
            await loadTopicDetail(editingTopicId);
            setSaveError(null);
            setCurrentStep(4);
        } else {
            reportSaveError(res.error?.message ?? "字段配置保存失败，请重试；本页输入已保留。");
        }
    }

    async function handleSaveSamplingPolicy() {
        if (!editingTopicId) return;
        setSaveError(null);
        if (editingTopicPublished) {
            setSaveError(null);
            setCurrentStep(5);
            return;
        }
        const res = await teacherApi.updateSamplingPolicy(editingTopicId, samplingPolicy);
        if (res.success) {
            setSaveError(null);
            setCurrentStep(5);
        } else {
            reportSaveError(res.error?.message ?? "抽样策略保存失败，请重试；本页输入已保留。");
        }
    }

    async function handleUploadAttachment(file: File) {
        if (!editingTopicId) return;
        setSaveError(null);
        setUploadingAttachment(true);
        const res = await teacherApi.uploadAttachment(editingTopicId, file);
        setUploadingAttachment(false);
        if (res.success) {
            await loadTopicDetail(editingTopicId);
        } else {
            reportSaveError(res.error?.message ?? "教学资料上传失败，请重新选择文件后重试。");
        }
    }

    async function handleSaveRecommendQuestions() {
        if (!editingTopicId) return;
        setSaveError(null);
        const res = await teacherApi.updateRecommendQuestions(editingTopicId, recommendQuestions);
        if (res.success) {
            setSaveError(null);
            setCurrentStep(7);
        } else {
            reportSaveError(res.error?.message ?? "推荐题目保存失败，请重试；本页输入已保留。");
        }
    }

    async function handleSaveWeights() {
        if (!editingTopicId) return;
        setSaveError(null);
        if (editingTopicPublished) {
            setShowCreateModal(false);
            setCurrentStep(1);
            setEditingTopicId(null);
            setEditingTopicPublished(false);
            return;
        }
        const { questionnaire, process, report } = weightConfig;
        if (questionnaire < 10 || questionnaire > 50) {
            reportSaveError("问卷设计权重需在10-50%之间");
            return;
        }
        if (process < 20 || process > 60) {
            reportSaveError("实验过程权重需在20-60%之间");
            return;
        }
        if (report < 10 || report > 50) {
            reportSaveError("实验报告权重需在10-50%之间");
            return;
        }
        const total = questionnaire + process + report;
        if (total !== 100) {
            reportSaveError("权重总和必须等于100");
            return;
        }
        const res = await teacherApi.updateWeightConfig(editingTopicId, weightConfig);
        if (res.success) {
            toast.success("模板配置已保存，发布后可分配给班级");
            setShowCreateModal(false);
            setCurrentStep(1);
            setEditingTopicId(null);
            setEditingTopicPublished(false);
            setNewTopicName("");
            setNewTopicDesc("");
            loadTopics();
        } else {
            reportSaveError(res.error?.message ?? "评分规则保存失败，请重试；本页输入已保留。");
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

    useEffect(() => {
        if (copiedTopicId === null) return;
        const editButton = document.querySelector<HTMLButtonElement>(`[data-testid="teacher-topic-edit-${copiedTopicId}"]`);
        if (!editButton) return;
        editButton.scrollIntoView?.({ block: "center", behavior: "instant" });
        editButton.focus({ preventScroll: true });
        setCopiedTopicId(null);
    }, [filteredTopics, copiedTopicId]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <dl aria-label="实验模板概览" className="grid grid-cols-4 gap-5 border-b border-border pb-5">
                <div><dt className="text-meta text-muted-foreground">模板总数</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.total}</dd></div>
                <div><dt className="text-meta text-muted-foreground">已发布</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.published}</dd></div>
                <div><dt className="text-meta text-muted-foreground">草稿</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.draft}</dd></div>
                <div><dt className="text-meta text-muted-foreground">总体数据行数</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.totalRows.toLocaleString()}</dd></div>
            </dl>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <h2 className="text-section-title font-semibold text-foreground">实验模板列表</h2>
                        <p className="text-meta text-muted-foreground mt-1">
                            {loading || loadError ? "共 - 条数据" : `共 ${filteredTopics.length} 条数据`}
                        </p>
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
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadTopics()} backTo="/" backLabel="返回教学概览" /> : loading ? <div role="status" aria-live="polite" className="text-center py-12 text-muted-foreground">加载中...</div> : topics.length === 0 ? (
                        <div className="rounded-surface border border-dashed border-border py-16 text-center">
                            <p className="text-subheading font-medium text-foreground">还没有实验模板</p>
                            <p className="mt-2 text-label text-muted-foreground">创建模板后可配置总体数据、研究目标和抽样策略。</p>
                        </div>
                    ) : filteredTopics.length === 0 ? (
                        <div className="rounded-surface border border-dashed border-border py-16 text-center">
                            <p className="text-subheading font-medium text-foreground">没有符合条件的实验模板</p>
                            <p className="mt-2 text-label text-muted-foreground">请清空搜索或更改状态筛选。</p>
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
                                    {topic.status === 1 && <Button asChild size="sm" variant="outline"><Link to={`/task?topicId=${topic.id}`}>分配到班级</Link></Button>}
                                    {topic.hasTasks ? (
                                        <>
                                            <Button data-testid={`teacher-topic-view-${topic.id}`} variant="ghost" size="sm" className="text-muted-foreground hover:text-info hover:bg-info-muted" onClick={() => openViewModal(topic)}>查看</Button>
                                            <Button
                                                data-testid={`teacher-topic-copy-${topic.id}`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={copyingTopicId !== null}
                                                className="text-muted-foreground hover:text-info hover:bg-info-muted"
                                                onClick={() => void copyTopic(topic)}
                                            >
                                                {copyingTopicId === topic.id ? "正在复制…" : "复制"}
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
                                                onClick={() => void copyTopic(topic)}
                                            >
                                                {copyingTopicId === topic.id ? "正在复制…" : "复制"}
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
                mode={topicWizardMode}
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
                        setSaveError(null);
                    }
                }}
                saveError={saveError}
                editingTopicId={editingTopicId}
                isPublishedTopic={editingTopicPublished}
                currentStep={currentStep}
                setCurrentStep={setCurrentStep}
                newTopicName={newTopicName}
                setNewTopicName={setNewTopicName}
                newTopicDesc={newTopicDesc}
                setNewTopicDesc={setNewTopicDesc}
                loadingDetail={editingTopicId !== null && (detailLoad.loading || Boolean(detailLoad.error))}
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
                onOpenChange={(open) => {
                    if (!open && !confirmBusy) { setConfirmDialog(current => ({ ...current, open: false })); setConfirmError(null); }
                }}
            >
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">{confirmDialog.type === "published" ? "模板已发布" : confirmDialog.type === "publish" ? "发布实验模板" : "确认操作"}</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {confirmDialog.type === "delete" && "将永久删除该实验模板、总体数据和全部附件。已分配任务的模板不能删除，此操作无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该实验模板吗？发布后可分配给班级。"}
                            {confirmDialog.type === "published" && `“${confirmDialog.topic?.name}”已发布。接下来选择班级和截止时间，生成实验任务。`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {confirmDialog.type === "publish" && <p role="status" className="text-label text-muted-foreground">{confirmBusy ? "正在检查或发布，请稍候…" : publishReady ? "检查通过：总体数据、研究目标、抽样策略、评分规则及变量字典一致性。正式发布时将再次检查。" : "请处理以下问题后重新检查。"}</p>}
                    {confirmError && <p role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">{confirmError}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={confirmBusy}>
                            {confirmDialog.type === "published" ? "稍后分配" : "取消"}
                        </AlertDialogCancel>
                        {confirmDialog.type === "published" ? <Button asChild><Link to={`/task?topicId=${confirmDialog.topic?.id}`}>分配到班级</Link></Button>
                        : confirmDialog.type === "publish" && !publishReady ? <>
                            <Button variant="outline" disabled={confirmBusy} onClick={() => { const topic = confirmDialog.topic; setConfirmDialog({ open: false, type: null, topic: null }); setConfirmError(null); if (topic) openEditModal(topic); }}>修改模板</Button>
                            <Button disabled={confirmBusy} onClick={() => { if (confirmDialog.topic) void requestPublish(confirmDialog.topic); }}>重新检查</Button>
                        </> : <Button disabled={confirmBusy} onClick={() => void executeConfirmAction()} variant={confirmDialog.type === "delete" ? "destructive" : "default"}>
                            {confirmDialog.type === "delete" ? "永久删除" : "确认"}
                        </Button>}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
