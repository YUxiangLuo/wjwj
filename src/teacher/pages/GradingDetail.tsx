import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, CheckCircle, XCircle, FileText, BarChart3, ListChecks, UserCheck, ShieldAlert, MessageSquarePlus, ChevronDown, ChevronUp, ChevronRight, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type SubmissionDetail } from "../api-client";
import { didPendingGradingCountChange, dispatchTeacherGradingQueueUpdated } from "../grading-queue-events";
import { DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE, getSamplingPreviewState } from "./grading-detail-utils";
import { toast } from "sonner";

const COMMENT_TEMPLATES = [
    "总体完成较好",
    "问卷设计合理",
    "抽样方法选择恰当",
    "报告分析深入",
    "数据对比清晰",
    "实验过程规范",
    "问卷题目需增加多样性",
    "抽样误差分析不够充分",
    "报告结构需优化",
    "建议加强方法对比",
];

function samplingRowsToCsv(rows: unknown[]): string {
    if (rows.length === 0) return "";
    const keys = Object.keys(rows[0] as object);
    const escapeCell = (v: unknown) => {
        const s = String(v ?? "");
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const header = keys.join(",");
    const lines = rows.map((row) => {
        const r = row as Record<string, unknown>;
        return keys.map((k) => escapeCell(r[k])).join(",");
    });
    return [header, ...lines].join("\n");
}

function triggerCsvDownload(filename: string, csvBody: string) {
    const blob = new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function GradingDetail() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Grading Form State
    const [scores, setScores] = useState({
        questionnaire: "0",
        process: "0",
        report: "0"
    });
    const [comment, setComment] = useState("");
    const [weights, setWeights] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [showTemplates, setShowTemplates] = useState(false);
    const [refreshingPdfState, setRefreshingPdfState] = useState(false);
    /** 样本数据各方法表格是否展开（默认折叠） */
    const [samplingSectionOpen, setSamplingSectionOpen] = useState<Record<string, boolean>>({});

    const serverSnapshotRef = useRef("");
    const submissionStatusRef = useRef<number | null>(null);

    useEffect(() => {
        if (!submissionId) return;
        loadDetail(Number(submissionId));
    }, [submissionId]);

    async function loadDetail(id: number) {
        setLoading(true);
        // Reset stale state so effects cannot apply to a previous submissionId
        setData(null);
        setScores({ questionnaire: "0", process: "0", report: "0" });
        setComment("");
        serverSnapshotRef.current = "";
        const res = await teacherApi.getSubmissionDetail(id);
        if (res.success && res.data) {
            setData(res.data);
            const serverData = {
                scores: {
                    questionnaire: String(res.data.scoreQuestionnaire ?? 0),
                    process: String(res.data.scoreProcess ?? 0),
                    report: String(res.data.scoreReport ?? 0),
                },
                comment: res.data.teacherComment ?? "",
            };
            serverSnapshotRef.current = JSON.stringify(serverData);

            setScores(serverData.scores);
            setComment(serverData.comment);
            setWeights(res.data.weights ?? { questionnaire: 30, process: 30, report: 40 });
            setRejectReason(res.data.rejectReason ?? "");
            submissionStatusRef.current = res.data.status;
        } else if (!res.success) {
            toast.error(`加载失败: ${res.error?.message ?? "未知错误"}`);
        }
        setLoading(false);
    }

    async function refreshPdfState() {
        if (!submissionId) return;

        setRefreshingPdfState(true);
        try {
            const res = await teacherApi.getSubmissionDetail(Number(submissionId));
            const detail = res.success ? (res.data ?? null) : null;
            if (detail) {
                setData((prev) => prev
                    ? {
                        ...prev,
                        questionnairePdfPath: detail.questionnairePdfPath ?? null,
                        reportPdfPath: detail.reportPdfPath ?? null,
                        pdfStatus: detail.pdfStatus,
                        pdfStatusMessage: detail.pdfStatusMessage ?? null,
                    }
                    : detail
                );
            }
        } finally {
            setRefreshingPdfState(false);
        }
    }

    useEffect(() => {
        if (!submissionId || !data) return;
        if (data.pdfStatus === "ready" || data.pdfStatus === "failed") return;

        const timer = window.setInterval(() => {
            void refreshPdfState();
        }, 10000);

        return () => window.clearInterval(timer);
    }, [data?.pdfStatus, submissionId]);

    const totalScore = (
        (parseFloat(scores.questionnaire) || 0) * (weights.questionnaire / 100) +
        (parseFloat(scores.process) || 0) * (weights.process / 100) +
        (parseFloat(scores.report) || 0) * (weights.report / 100)
    );

    const updatePendingQueueStatus = useCallback((nextStatus: number) => {
        const previousStatus = submissionStatusRef.current;
        if (didPendingGradingCountChange(previousStatus, nextStatus)) {
            dispatchTeacherGradingQueueUpdated();
        }
        submissionStatusRef.current = nextStatus;
    }, []);

    const buildGradingSnapshot = useCallback(() => ({
        scores,
        comment,
    }), [scores, comment]);

    // Warn before closing tab when form differs from last loaded server snapshot (未提交)
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            const snapshot = JSON.stringify(buildGradingSnapshot());
            if (snapshot !== serverSnapshotRef.current) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [buildGradingSnapshot]);

    async function handleSubmit(status: number) { // 2=Graded, 3=Rejected
        if (!submissionId) return;
        if (data?.readonly) return;
        if (data?.status === 3) return;
        setSaving(true);

        const payload = {
            scoreQuestionnaire: parseFloat(scores.questionnaire) || 0,
            scoreProcess: parseFloat(scores.process) || 0,
            scoreReport: parseFloat(scores.report) || 0,
            totalScore: parseFloat(totalScore.toFixed(2)),
            comment: comment,
            status: status,
            rejectReason: status === 3 ? rejectReason : undefined
        };

        const res = await teacherApi.submitGrade(Number(submissionId), payload);

        setSaving(false);
        if (res.success) {
            if (data?.status === 2 && status === 2) {
                toast.success("成绩已更新，学生将收到通知");
                await loadDetail(Number(submissionId));
            } else {
                updatePendingQueueStatus(status);
                toast.success("提交成功");
                navigate("/grading");
            }
        } else {
            toast.error("提交失败: " + res.error?.message);
        }
    }

    if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-muted-foreground">未找到提交记录</div>;

    const isReadOnly = !!data.readonly;
    /** 他人锁定只读，或已驳回不可改分 */
    const gradingLocked = isReadOnly || data.status === 3;
    const questionnaire = data.questionnaire as any;
    const samplingResults = data.samplingResults as any;

    const renderQuestion = (q: any, index: number) => {
        const title = `${index + 1}. ${q.content ?? ""}`;
        let content = null;

        if (q.type === "boolean") {
            content = <div className="text-sm text-muted-foreground pl-4 border-l-2 border-border mt-2">是 / 否</div>;
        } else if (q.type === "single" || q.type === "multiple") {
            content = (
                <ul className="list-disc list-inside text-sm text-muted-foreground pl-4 border-l-2 border-border mt-2 space-y-1">
                    {(q.options ?? []).map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                    ))}
                </ul>
            );
        } else if (q.type === "scale") {
            content = (
                <div className="text-sm text-muted-foreground pl-4 border-l-2 border-border mt-2">
                    {q.scaleMinLabel ?? ""} {q.scaleMin ?? 1} - {q.scaleMax ?? 10} {q.scaleMaxLabel ?? ""}
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <div className="font-medium text-foreground">{title}</div>
                {content}
                {q.type === "multiple" && (q.minSelect || q.maxSelect) && (
                    <div className="text-xs text-muted-foreground mt-1 pl-4">选择 {q.minSelect ?? 0} - {q.maxSelect ?? "不限"}</div>
                )}
            </div>
        );
    };

    const toggleSamplingSection = (key: string) => {
        setSamplingSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const downloadSamplingCsv = (sectionKey: string, rows: unknown[]) => {
        try {
            const csv = samplingRowsToCsv(rows);
            const sid = submissionId ?? "export";
            triggerCsvDownload(`抽样结果_${sectionKey}_${sid}.csv`, csv);
        } catch {
            toast.error("导出失败");
        }
    };

    const renderSamplingPreview = (sectionKey: string, label: string, section: unknown) => {
        const previewState = getSamplingPreviewState(section);

        if (previewState.kind === "unavailable") {
            return (
                <div className="space-y-2 border border-warning/30 bg-warning/5 px-4 py-3">
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-sm text-warning">{DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE}</div>
                    {previewState.reason !== DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE && (
                        <div className="text-xs text-warning/80">{previewState.reason}</div>
                    )}
                </div>
            );
        }

        if (previewState.kind === "empty") {
            return (
                <div className="space-y-2">
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-sm text-muted-foreground italic">暂无数据</div>
                </div>
            );
        }

        const dataList = previewState.rows;
        const columns = Object.keys(dataList[0] ?? {}).slice(0, 6);
        const isOpen = !!samplingSectionOpen[sectionKey];
        return (
            <div className="border border-border bg-card/30 overflow-hidden">
                <div className="flex items-stretch gap-1 border-b border-border bg-muted/60">
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-w-0 flex-1 justify-start gap-2 px-3 py-2.5 text-left font-medium normal-case tracking-normal"
                        aria-expanded={isOpen}
                        onClick={() => toggleSamplingSection(sectionKey)}
                    >
                        <ChevronRight
                            className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                            aria-hidden
                        />
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <span className="font-medium text-foreground truncate">{label}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">共 {dataList.length} 条</span>
                    </Button>
                    <div className="flex items-center pr-2 py-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                                e.stopPropagation();
                                downloadSamplingCsv(sectionKey, dataList);
                            }}
                        >
                            <Download data-icon="inline-start" />
                            下载 CSV
                        </Button>
                    </div>
                </div>
                {isOpen && (
                    <div className="p-3 space-y-2">
                        <div className="border border-border rounded-md">
                            <Table>
                                <TableHeader className="bg-muted">
                                    <TableRow>
                                        {columns.map((c) => (
                                            <TableHead key={c} className="h-auto py-2 normal-case tracking-normal">{c}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="bg-card">
                                    {dataList.slice(0, 10).map((row, i) => (
                                        <TableRow key={i} className="hover:bg-accent">
                                            {columns.map((c) => (
                                                <TableCell key={c} className="py-2 text-foreground">
                                                    {String(row[c] ?? "")}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {dataList.length > 10 && (
                            <div className="text-xs text-muted-foreground text-right">预览仅显示前 10 条，下载 CSV 包含全部 {dataList.length} 条</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 h-16 bg-card border-b border-border shrink-0">
                <Button variant="ghost" size="sm" onClick={() => navigate("/grading")}>
                    <ArrowLeft data-icon="inline-start" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-border mx-2"></div>
                <div>
                    <h2 className="text-base font-semibold text-foreground">{data.topic}</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{data.studentName} ({data.studentId})</span>
                        <span>·</span>
                        <span>{data.className}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    {data.isAssistant && (
                        <Badge variant="secondary">
                            <ShieldAlert data-icon="inline-start" />
                            助教模式
                        </Badge>
                    )}
                    {(data.status === 0 || data.status === 1) && <Badge variant="warning">待批改</Badge>}
                    {data.status === 2 && <Badge variant="success">已批改</Badge>}
                    {data.status === 3 && <Badge variant="destructive">已驳回</Badge>}
                </div>
            </div>
            {isReadOnly && (
                <Alert data-testid="teacher-grading-readonly-banner" variant="destructive" className="border-x-0 border-t-0 px-6 py-2">
                    <AlertDescription className="flex items-center justify-center gap-2">
                        <XCircle />
                        该作业正在被他人批改中，当前为只读模式。
                    </AlertDescription>
                </Alert>
            )}
            {data.status === 3 && !isReadOnly && (
                <Alert data-testid="teacher-grading-rejected-no-edit-banner" variant="warning" className="border-x-0 border-t-0 px-6 py-2">
                    <AlertDescription className="text-center">
                        已驳回的作业不可修改评分；学生重新提交后可在新记录上批改。
                    </AlertDescription>
                </Alert>
            )}
            {(data.status === 2 || data.status === 3) && data.gradedByName && (
                <Alert variant="info" className="border-x-0 border-t-0 px-6 py-2">
                    <AlertDescription className="flex items-center justify-center gap-2">
                        <UserCheck />
                        <span>
                            由 {data.gradedByType === 2 ? '教师' : '助教'} <span className="font-medium">{data.gradedByName}</span>
                            于 {data.gradedAt ? new Date(data.gradedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : '-'} 批改
                        </span>
                    </AlertDescription>
                </Alert>
            )}
            {data.status === 3 && data.rejectReason && (
                <Alert
                    data-testid="teacher-grading-reject-reason-banner"
                    variant="destructive"
                    className="border-x-0 border-t-0 px-6 py-3"
                >
                    <div className="mx-auto flex max-w-5xl items-start gap-2">
                        <XCircle className="mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-1">
                            <AlertTitle>驳回原因</AlertTitle>
                            <AlertDescription className="leading-6">{data.rejectReason}</AlertDescription>
                        </div>
                    </div>
                </Alert>
            )}

            {data.pdfStatus !== "ready" && data.pdfStatusMessage && (
                <div className={`mx-6 mt-6 border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
                    data.pdfStatus === "failed"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/20 bg-primary/10 text-primary"
                }`}>
                    <span>{data.pdfStatusMessage}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { void refreshPdfState(); }}
                        disabled={refreshingPdfState}
                        className="gap-2 border-current/20 bg-transparent text-current hover:bg-foreground/5"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshingPdfState ? "animate-spin" : ""}`} />
                        刷新 PDF 状态
                    </Button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Submission Content */}
                <div className="flex-1 overflow-y-auto bg-background p-5">
                    <Tabs defaultValue="report" className="h-full flex flex-col">
                        <TabsList variant="line" className="mb-6 self-start">
                            <TabsTrigger value="report">
                                <FileText data-icon="inline-start" /> 实验报告
                            </TabsTrigger>
                            <TabsTrigger value="questionnaire">
                                <ListChecks data-icon="inline-start" /> 调查问卷
                            </TabsTrigger>
                            <TabsTrigger value="data">
                                <BarChart3 data-icon="inline-start" /> 样本数据
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1">
                            <TabsContent value="report" className="mt-0 min-h-[500px] border border-border bg-card p-6">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-primary" />
                                        实验报告详情
                                    </h3>
                                    {data.reportPdfPath && (
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} target="_blank" rel="noreferrer">
                                                    <ExternalLink data-icon="inline-start" />
                                                    预览
                                                </a>
                                            </Button>
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} download>
                                                    <Download data-icon="inline-start" />
                                                    下载
                                                </a>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="prose prose-invert max-w-none">
                                    {data.reportContent ? (
                                        <RichTextContent
                                            html={data.reportContent}
                                            className="border border-border/50 bg-background/50 p-5 text-sm leading-relaxed text-foreground"
                                        />
                                    ) : (
                                        <div className="text-muted-foreground text-center py-20 bg-muted/30 border border-dashed border-border">
                                            暂无报告内容
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="questionnaire" className="mt-0 min-h-[500px] border border-border bg-card p-6">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <ListChecks className="w-5 h-5 text-primary" />
                                        问卷设计
                                    </h3>
                                    {data.questionnairePdfPath && (
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} target="_blank" rel="noreferrer">
                                                    <ExternalLink data-icon="inline-start" />
                                                    预览
                                                </a>
                                            </Button>
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} download>
                                                    <Download data-icon="inline-start" />
                                                    下载
                                                </a>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    {questionnaire && questionnaire.title ? (
                                        <div className="mx-auto max-w-3xl space-y-6 border border-border bg-background p-6 shadow-inner">
                                            <div className="text-center space-y-2 border-b border-border pb-6 mb-6">
                                                <div className="font-bold text-xl text-foreground">{questionnaire.title}</div>
                                                {questionnaire.welcomeText && (
                                                    <RichTextContent
                                                        html={questionnaire.welcomeText}
                                                        className="text-sm text-muted-foreground"
                                                    />
                                                )}
                                            </div>
                                            <div className="space-y-6">
                                                {(questionnaire.questions ?? []).map((q: any, idx: number) => (
                                                    <div key={q.id ?? idx} className="p-4 border border-border bg-card/50">
                                                        {renderQuestion(q, idx)}
                                                    </div>
                                                ))}
                                            </div>
                                            {questionnaire.endingText && (
                                                <RichTextContent
                                                    html={questionnaire.endingText}
                                                    className="text-sm text-muted-foreground text-center border-t border-border pt-6 mt-6"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground text-center py-20 bg-muted/30 border border-dashed border-border">
                                            未设计问卷
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="data" className="mt-0 min-h-[500px] border border-border bg-card p-6">
                                <h3 className="text-lg font-semibold text-foreground mb-6 pb-4 border-b border-border flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-primary" />
                                    样本数据概览
                                </h3>
                                <div className="space-y-8">
                                    {renderSamplingPreview("simple", "简单随机抽样", samplingResults?.simple)}
                                    {renderSamplingPreview("systematic", "系统抽样", samplingResults?.systematic)}
                                    {renderSamplingPreview("pps", "PPS 抽样", samplingResults?.pps)}
                                    {renderSamplingPreview("stratified", "分层抽样", samplingResults?.stratified)}
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right: Grading Form */}
                <div className="z-10 flex min-h-0 w-80 shrink-0 flex-col border-l border-border bg-card shadow-xl">
                    <div className="p-4 border-b border-border font-medium text-foreground bg-card/50 flex items-center justify-between shrink-0">
                        <span>{data.isAssistant ? '助教评分' : '评分'}</span>
                        <div className="text-xs text-muted-foreground">权重总和: {weights.questionnaire + weights.process + weights.report}%</div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <FieldGroup className="gap-5 p-5 pb-4">
                            <Field>
                                <FieldLabel className="w-full justify-between">
                                    <span>问卷设计</span>
                                    <Badge variant="info">{weights.questionnaire}%</Badge>
                                </FieldLabel>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-questionnaire"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.questionnaire}
                                        onChange={(e) => setScores({ ...scores, questionnaire: e.target.value })}
                                        className="h-9 border-input bg-background px-3 text-left font-mono"
                                        disabled={saving || gradingLocked}
                                    />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">分</span>
                                </div>
                            </Field>

                            <Field>
                                <FieldLabel className="w-full justify-between">
                                    <span>实施过程</span>
                                    <Badge variant="info">{weights.process}%</Badge>
                                </FieldLabel>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-process"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.process}
                                        onChange={(e) => setScores({ ...scores, process: e.target.value })}
                                        className="h-9 border-input bg-background px-3 text-left font-mono"
                                        disabled={saving || gradingLocked}
                                    />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">分</span>
                                </div>
                            </Field>

                            <Field>
                                <FieldLabel className="w-full justify-between">
                                    <span>分析报告</span>
                                    <Badge variant="info">{weights.report}%</Badge>
                                </FieldLabel>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-report"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.report}
                                        onChange={(e) => setScores({ ...scores, report: e.target.value })}
                                        className="h-9 border-input bg-background px-3 text-left font-mono"
                                        disabled={saving || gradingLocked}
                                    />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">分</span>
                                </div>
                            </Field>

                            <Separator className="bg-border" />

                            <div className="flex items-center justify-between border border-primary/20 bg-primary/20 p-3">
                                <span className="font-semibold text-primary">总分</span>
                                <span className="text-3xl font-bold text-primary font-mono">{totalScore.toFixed(1)}</span>
                            </div>

                            <Field>
                                <div className="flex items-center justify-between">
                                    <FieldLabel>{data.isAssistant ? '助教评语' : '教师评语'}</FieldLabel>
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => setShowTemplates(!showTemplates)}
                                        disabled={saving || gradingLocked}
                                    >
                                        <MessageSquarePlus data-icon="inline-start" />
                                        常用评语
                                        {showTemplates ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}
                                    </Button>
                                </div>
                                {showTemplates && (
                                    <div className="flex flex-wrap gap-1.5 p-3 bg-background border border-border rounded-lg">
                                        {COMMENT_TEMPLATES.map((tpl, idx) => (
                                            <Button
                                                key={idx}
                                                type="button"
                                                variant="outline"
                                                size="xs"
                                                disabled={saving || gradingLocked}
                                                onClick={() =>
                                                    setComment((prev) => {
                                                        const next = prev ? `${prev}，${tpl}` : tpl;
                                                        if (next.length > 2000) {
                                                            toast.warning("评语已达字数上限（2000字）");
                                                            return prev;
                                                        }
                                                        setShowTemplates(false);
                                                        return next;
                                                    })
                                                }
                                            >
                                                {tpl}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                <Textarea
                                    data-testid="teacher-grading-comment"
                                    rows={6}
                                    maxLength={2000}
                                    placeholder="请输入评语..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="resize-none"
                                    disabled={saving || gradingLocked}
                                />
                                <div className="text-xs text-muted-foreground text-right">{comment.length}/2000</div>
                            </Field>
                        </FieldGroup>

                        <div className="space-y-3 border-t border-b border-border bg-card/50 px-5 pb-5 pt-4">
                            {!gradingLocked && data.status === 2 && (
                                <Button
                                    data-testid="teacher-grading-update"
                                    size="lg"
                                    className="w-full"
                                    onClick={() => { void handleSubmit(2); }}
                                    disabled={saving}
                                >
                                    <CheckCircle data-icon="inline-start" />
                                    {saving ? "提交中..." : "更新评分"}
                                </Button>
                            )}
                            {(data.status === 0 || data.status === 1) && !isReadOnly && (
                                <>
                                    <Button data-testid="teacher-grading-submit" size="lg" className="w-full" onClick={() => { void handleSubmit(2); }} disabled={saving}>
                                        <CheckCircle data-icon="inline-start" />
                                        {saving ? "提交中..." : "确认评分"}
                                    </Button>
                                    <Button data-testid="teacher-grading-reject-open" variant="destructive" size="lg" className="w-full" onClick={() => setShowRejectModal(true)} disabled={saving}>
                                        <XCircle data-icon="inline-start" />
                                        {saving ? "提交中..." : "驳回重做"}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">驳回理由</DialogTitle>
                        <DialogDescription className="sr-only">
                            输入驳回原因，学生将看到这段说明。
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup className="gap-3 py-4">
                        <Field>
                        <FieldLabel>驳回理由（学生可见，至少10字）</FieldLabel>
                        <Textarea
                            data-testid="teacher-grading-reject-reason"
                            rows={4}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="请详细说明驳回原因..."
                        />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowRejectModal(false)}>取消</Button>
                        <Button
                            data-testid="teacher-grading-reject-submit"
                            variant="destructive"
                            onClick={() => {
                                if (rejectReason.trim().length < 10) {
                                    toast.error("驳回理由至少10字");
                                    return;
                                }
                                setShowRejectModal(false);
                                handleSubmit(3);
                            }}
                        >
                            确认驳回
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
