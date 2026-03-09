import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, CheckCircle, XCircle, FileText, BarChart3, ListChecks, UserCheck, ShieldAlert, Save, SkipForward, MessageSquarePlus, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type SubmissionDetail } from "../api-client";
import { didPendingGradingCountChange, dispatchTeacherGradingQueueUpdated } from "../grading-queue-events";
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
    const [savingDraft, setSavingDraft] = useState(false);
    const [refreshingPdfState, setRefreshingPdfState] = useState(false);

    // Auto-save state & refs
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<{ scores: typeof scores; comment: string } | null>(null);
    const serverSnapshotRef = useRef("");
    const saveInFlightRef = useRef(false);
    const draftResolvedRef = useRef(false);
    const submissionStatusRef = useRef<number | null>(null);

    const draftKey = submissionId ? `teacher_grading_draft_${submissionId}` : null;

    useEffect(() => {
        if (!submissionId) return;
        loadDetail(Number(submissionId));
    }, [submissionId]);

    async function loadDetail(id: number) {
        setLoading(true);
        setLastSavedAt(null);
        draftResolvedRef.current = false;
        // Reset stale state so auto-save cannot post old data to a new submissionId
        setData(null);
        setScores({ questionnaire: "0", process: "0", report: "0" });
        setComment("");
        serverSnapshotRef.current = "";
        const res = await teacherApi.getSubmissionDetail(id);
        if (res.success && res.data) {
            setData(res.data);
            setScores({
                questionnaire: String(res.data.scoreQuestionnaire ?? 0),
                process: String(res.data.scoreProcess ?? 0),
                report: String(res.data.scoreReport ?? 0),
            });
            setComment(res.data.teacherComment ?? "");
            setWeights(res.data.weights ?? { questionnaire: 30, process: 30, report: 40 });
            setRejectReason(res.data.rejectReason ?? "");
            submissionStatusRef.current = res.data.status;

            // Initialize server snapshot for auto-save comparison
            const serverData = {
                scores: {
                    questionnaire: String(res.data.scoreQuestionnaire ?? 0),
                    process: String(res.data.scoreProcess ?? 0),
                    report: String(res.data.scoreReport ?? 0),
                },
                comment: res.data.teacherComment ?? "",
            };
            serverSnapshotRef.current = JSON.stringify(serverData);

            // Check for localStorage draft recovery
            const key = `teacher_grading_draft_${id}`;
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const draft = JSON.parse(raw) as { scores: typeof scores; comment: string };
                    if (JSON.stringify(draft) !== JSON.stringify(serverData)) {
                        setPendingDraft(draft);
                        setRestoreDraftOpen(true);
                    } else {
                        draftResolvedRef.current = true;
                    }
                } else {
                    draftResolvedRef.current = true;
                }
            } catch {
                draftResolvedRef.current = true;
            }
        } else if (!res.success) {
            toast.error(`加载失败: ${res.error?.message ?? "未知错误"}`);
            draftResolvedRef.current = true;
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

    // ─── Auto-save ───────────────────────────────────────────────
    const buildGradingSnapshot = useCallback(() => ({
        scores,
        comment,
    }), [scores, comment]);

    const autoSave = useCallback(async () => {
        if (!submissionId || !data || data.readonly) return;
        if (data.status !== 0 && data.status !== 1) return;
        if (!draftResolvedRef.current) return;

        const gradingData = buildGradingSnapshot();
        const snapshot = JSON.stringify(gradingData);

        if (snapshot === serverSnapshotRef.current || saveInFlightRef.current) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        saveInFlightRef.current = true;
        try {
            const sq = parseFloat(gradingData.scores.questionnaire) || 0;
            const sp = parseFloat(gradingData.scores.process) || 0;
            const sr = parseFloat(gradingData.scores.report) || 0;
            const total = sq * (weights.questionnaire / 100) + sp * (weights.process / 100) + sr * (weights.report / 100);

            const res = await teacherApi.submitGrade(Number(submissionId), {
                scoreQuestionnaire: sq,
                scoreProcess: sp,
                scoreReport: sr,
                totalScore: parseFloat(total.toFixed(2)),
                comment: gradingData.comment,
                status: 0,
                action: "draft",
            });

            if (res.success) {
                serverSnapshotRef.current = snapshot;
                setLastSavedAt(new Date().toLocaleTimeString("zh-CN", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
                }));
                updatePendingQueueStatus(0);
            }
        } finally {
            saveInFlightRef.current = false;
        }
    }, [submissionId, data, buildGradingSnapshot, updatePendingQueueStatus, weights]);

    const autoSaveRef = useRef(autoSave);
    useEffect(() => { autoSaveRef.current = autoSave; }, [autoSave]);

    // Debounce: auto-save 3s after user stops typing
    useEffect(() => {
        if (!draftResolvedRef.current) return;
        const timer = window.setTimeout(() => { void autoSave(); }, 3000);
        return () => window.clearTimeout(timer);
    }, [autoSave]);

    // Interval: auto-save every 30s
    useEffect(() => {
        const timer = window.setInterval(() => { void autoSaveRef.current(); }, 30_000);
        return () => window.clearInterval(timer);
    }, []);

    // localStorage draft save on every change
    useEffect(() => {
        if (!draftKey || !draftResolvedRef.current) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify(buildGradingSnapshot()));
        } catch { /* ignore write errors */ }
    }, [draftKey, buildGradingSnapshot]);

    // Warn before closing tab/window with unsaved changes
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!draftResolvedRef.current) return;
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
            updatePendingQueueStatus(status);
            if (draftKey) localStorage.removeItem(draftKey);
            toast.success("提交成功");
            navigate("/grading");
        } else {
            toast.error("提交失败: " + res.error?.message);
        }
    }

    async function handleSaveDraft() {
        if (!submissionId || data?.readonly) return;
        setSavingDraft(true);

        const gradingData = buildGradingSnapshot();
        const payload = {
            scoreQuestionnaire: parseFloat(gradingData.scores.questionnaire) || 0,
            scoreProcess: parseFloat(gradingData.scores.process) || 0,
            scoreReport: parseFloat(gradingData.scores.report) || 0,
            totalScore: parseFloat(totalScore.toFixed(2)),
            comment: gradingData.comment,
            status: 0,
            action: "draft",
        };

        const res = await teacherApi.submitGrade(Number(submissionId), payload);
        setSavingDraft(false);

        if (res.success) {
            serverSnapshotRef.current = JSON.stringify(gradingData);
            setLastSavedAt(new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            }));
            updatePendingQueueStatus(0);
            toast.success("草稿已保存");
        } else {
            toast.error("保存失败: " + res.error?.message);
        }
        return res.success;
    }

    async function handleNextStudent() {
        if (!submissionId) return;
        setSavingDraft(true);

        // Save current work first (skip if readonly)
        if (!data?.readonly && data?.status !== 2 && data?.status !== 3) {
            const payload = {
                scoreQuestionnaire: parseFloat(scores.questionnaire) || 0,
                scoreProcess: parseFloat(scores.process) || 0,
                scoreReport: parseFloat(scores.report) || 0,
                totalScore: parseFloat(totalScore.toFixed(2)),
                comment: comment,
                status: 0,
                action: "draft",
            };
            const saveRes = await teacherApi.submitGrade(Number(submissionId), payload);
            if (!saveRes.success) {
                setSavingDraft(false);
                toast.error("保存失败: " + (saveRes.error?.message ?? "未知错误"));
                return;
            }
            updatePendingQueueStatus(0);
        }

        // Find next pending submission
        const listRes = await teacherApi.getGradingList("pending");
        setSavingDraft(false);

        if (listRes.success && listRes.data) {
            const next = listRes.data.find(item => item.id !== Number(submissionId));
            if (next) {
                navigate(`/grading/${next.id}`, { replace: true });
            } else {
                toast.info("没有更多待批改作业");
                navigate("/grading");
            }
        } else {
            toast.error("获取列表失败");
        }
    }

    if (loading) return <div className="p-12 text-center text-slate-500">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-slate-500">未找到提交记录</div>;

    const isReadOnly = !!data.readonly;
    const questionnaire = data.questionnaire as any;
    const samplingResults = data.samplingResults as any;

    const renderQuestion = (q: any, index: number) => {
        const title = `${index + 1}. ${q.content ?? ""}`;
        let content = null;

        if (q.type === "boolean") {
            content = <div className="text-sm text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-slate-300 dark:border-slate-700 mt-2">是 / 否</div>;
        } else if (q.type === "single" || q.type === "multiple") {
            content = (
                <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-slate-300 dark:border-slate-700 mt-2 space-y-1">
                    {(q.options ?? []).map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                    ))}
                </ul>
            );
        } else if (q.type === "scale") {
            content = (
                <div className="text-sm text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-slate-300 dark:border-slate-700 mt-2">
                    {q.scaleMinLabel ?? ""} {q.scaleMin ?? 1} - {q.scaleMax ?? 10} {q.scaleMaxLabel ?? ""}
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <div className="font-medium text-slate-800 dark:text-slate-200">{title}</div>
                {content}
                {q.type === "multiple" && (q.minSelect || q.maxSelect) && (
                    <div className="text-xs text-slate-500 mt-1 pl-4">选择 {q.minSelect ?? 0} - {q.maxSelect ?? "不限"}</div>
                )}
            </div>
        );
    };

    const renderSamplingPreview = (label: string, dataList: any[] | undefined) => {
        if (!dataList || dataList.length === 0) {
            return (
                <div className="space-y-2">
                    <div className="font-medium text-slate-700 dark:text-slate-300">{label}</div>
                    <div className="text-sm text-slate-500 italic">暂无数据</div>
                </div>
            );
        }
        const columns = Object.keys(dataList[0] ?? {}).slice(0, 6);
        return (
            <div className="space-y-3">
                <div className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    {label}
                </div>
                <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-200 dark:bg-slate-800">
                            <tr>
                                {columns.map((c) => (
                                    <th key={c} className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400 border-b border-slate-300 dark:border-slate-700">{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-slate-50 dark:bg-slate-900">
                            {dataList.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-b border-slate-200 dark:border-slate-800 last:border-0 hover:bg-slate-200/50 dark:hover:bg-slate-800/50">
                                    {columns.map((c) => (
                                        <td key={c} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                            {String(row[c] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {dataList.length > 10 && <div className="text-xs text-slate-500 text-right">仅显示前 10 条，共 {dataList.length} 条</div>}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 h-16 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => navigate("/grading")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>
                <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{data.topic}</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{data.studentName} ({data.studentId})</span>
                        <span>·</span>
                        <span>{data.className}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    {data.isAssistant && (
                        <Badge variant="outline" className="text-purple-600 border-purple-500/30 bg-purple-500/10">
                            <ShieldAlert className="w-3 h-3 mr-1" />
                            助教模式
                        </Badge>
                    )}
                    {data.status === 1 && <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">待批改</Badge>}
                    {data.status === 2 && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">已批改</Badge>}
                    {data.status === 3 && <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20">已驳回</Badge>}
                </div>
            </div>
            {isReadOnly && (
                <div data-testid="teacher-grading-readonly-banner" className="px-6 py-2 text-sm text-rose-500 bg-rose-900/20 border-b border-rose-900/30 flex items-center justify-center">
                    <XCircle className="w-4 h-4 mr-2" />
                    该作业正在被他人批改中，当前为只读模式。
                </div>
            )}
            {(data.status === 2 || data.status === 3) && data.gradedByName && (
                <div className="px-6 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-900/20 border-b border-blue-900/30 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 mr-2" />
                    由 {data.gradedByType === 2 ? '教师' : '助教'} <span className="font-medium mx-1">{data.gradedByName}</span> 
                    于 {data.gradedAt ? new Date(data.gradedAt).toLocaleString() : '-'} 批改
                </div>
            )}
            {data.status === 3 && data.rejectReason && (
                <div
                    data-testid="teacher-grading-reject-reason-banner"
                    className="px-6 py-3 text-sm text-rose-800 dark:text-rose-200 bg-rose-950/40 border-b border-rose-900/40"
                >
                    <div className="mx-auto flex max-w-5xl items-start gap-2">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <div className="space-y-1">
                            <div className="font-medium text-rose-500">驳回原因</div>
                            <div className="leading-6 text-rose-100/90">{data.rejectReason}</div>
                        </div>
                    </div>
                </div>
            )}

            {data.pdfStatus !== "ready" && data.pdfStatusMessage && (
                <div className={`mx-6 mt-6 rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
                    data.pdfStatus === "failed"
                        ? "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
                        : "border-cyan-500/20 bg-cyan-500/10 text-cyan-800 dark:text-cyan-100"
                }`}>
                    <span>{data.pdfStatusMessage}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { void refreshPdfState(); }}
                        disabled={refreshingPdfState}
                        className="gap-2 border-current/20 bg-transparent text-current hover:bg-white/5"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshingPdfState ? "animate-spin" : ""}`} />
                        刷新 PDF 状态
                    </Button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Submission Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-950">
                    <Tabs defaultValue="report" className="h-full flex flex-col">
                        <TabsList className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start mb-6">
                            <TabsTrigger value="report" className="data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-500 text-slate-600 dark:text-slate-400">
                                <FileText className="w-4 h-4 mr-2" /> 实验报告
                            </TabsTrigger>
                            <TabsTrigger value="questionnaire" className="data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-500 text-slate-600 dark:text-slate-400">
                                <ListChecks className="w-4 h-4 mr-2" /> 调查问卷
                            </TabsTrigger>
                            <TabsTrigger value="data" className="data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-500 text-slate-600 dark:text-slate-400">
                                <BarChart3 className="w-4 h-4 mr-2" /> 样本数据
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1">
                            <TabsContent value="report" className="mt-0 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-indigo-500" />
                                        实验报告详情
                                    </h3>
                                    {data.reportPdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700">
                                                    <ExternalLink className="w-4 h-4" />
                                                    预览
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} download>
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700">
                                                    <Download className="w-4 h-4" />
                                                    下载
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="prose prose-invert max-w-none">
                                    {data.reportContent ? (
                                        <RichTextContent
                                            html={data.reportContent}
                                            className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-white/50 dark:bg-slate-950/50 p-6 rounded-lg border border-slate-200/50 dark:border-slate-800/50"
                                        />
                                    ) : (
                                        <div className="text-slate-500 text-center py-20 bg-white/30 dark:bg-slate-950/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                            暂无报告内容
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="questionnaire" className="mt-0 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <ListChecks className="w-5 h-5 text-indigo-500" />
                                        问卷设计
                                    </h3>
                                    {data.questionnairePdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700">
                                                    <ExternalLink className="w-4 h-4" />
                                                    预览
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} download>
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700">
                                                    <Download className="w-4 h-4" />
                                                    下载
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    {questionnaire && questionnaire.title ? (
                                        <div className="space-y-6 max-w-3xl mx-auto bg-white dark:bg-slate-950 p-8 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner">
                                            <div className="text-center space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6 mb-6">
                                                <div className="font-bold text-xl text-slate-900 dark:text-slate-100">{questionnaire.title}</div>
                                                {questionnaire.welcomeText && (
                                                    <RichTextContent
                                                        html={questionnaire.welcomeText}
                                                        className="text-sm text-slate-600 dark:text-slate-400"
                                                    />
                                                )}
                                            </div>
                                            <div className="space-y-6">
                                                {(questionnaire.questions ?? []).map((q: any, idx: number) => (
                                                    <div key={q.id ?? idx} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                                                        {renderQuestion(q, idx)}
                                                    </div>
                                                ))}
                                            </div>
                                            {questionnaire.endingText && (
                                                <RichTextContent
                                                    html={questionnaire.endingText}
                                                    className="text-sm text-slate-500 text-center border-t border-slate-200 dark:border-slate-800 pt-6 mt-6"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 text-center py-20 bg-white/30 dark:bg-slate-950/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                            未设计问卷
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="data" className="mt-0 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                                    样本数据概览
                                </h3>
                                <div className="space-y-8">
                                    {renderSamplingPreview("简单随机抽样", samplingResults?.simple?.data)}
                                    {renderSamplingPreview("系统抽样", samplingResults?.systematic?.data)}
                                    {renderSamplingPreview("分层抽样", samplingResults?.stratified?.data)}
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right: Grading Form */}
                <div className="w-96 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shrink-0 flex flex-col shadow-xl z-10">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-medium text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                        <span>{data.isAssistant ? '助教评分' : '评分'}</span>
                        <div className="text-xs text-slate-500">权重总和: {weights.questionnaire + weights.process + weights.report}%</div>
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <Label className="text-slate-700 dark:text-slate-300 flex justify-between">
                                    <span>问卷设计</span>
                                    <span className="text-xs text-indigo-500 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.questionnaire}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-questionnaire"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.questionnaire}
                                        onChange={(e) => setScores({ ...scores, questionnaire: e.target.value })}
                                        className="text-right bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-700 dark:text-slate-300 flex justify-between">
                                    <span>实施过程</span>
                                    <span className="text-xs text-indigo-500 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.process}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-process"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.process}
                                        onChange={(e) => setScores({ ...scores, process: e.target.value })}
                                        className="text-right bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-700 dark:text-slate-300 flex justify-between">
                                    <span>分析报告</span>
                                    <span className="text-xs text-indigo-500 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.report}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        data-testid="teacher-grading-score-report"
                                        type="number"
                                        min="0" max="100"
                                        value={scores.report}
                                        onChange={(e) => setScores({ ...scores, report: e.target.value })}
                                        className="text-right bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <Separator className="bg-slate-200 dark:bg-slate-800" />

                            <div className="flex justify-between items-center bg-indigo-900/20 p-4 rounded-lg border border-indigo-500/20">
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">总分</span>
                                <span className="text-3xl font-bold text-indigo-500 font-mono">{totalScore.toFixed(1)}</span>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                    <span>{data.isAssistant ? '助教评语' : '教师评语'}</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 px-2"
                                        onClick={() => setShowTemplates(!showTemplates)}
                                        disabled={saving || isReadOnly}
                                    >
                                        <MessageSquarePlus className="w-3 h-3 mr-1" />
                                        常用评语
                                        {showTemplates ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                    </Button>
                                </Label>
                                {showTemplates && (
                                    <div className="flex flex-wrap gap-1.5 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                                        {COMMENT_TEMPLATES.map((tpl, idx) => (
                                            <button
                                                key={idx}
                                                className="text-xs px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
                                                disabled={saving || isReadOnly}
                                                onClick={() => setComment(prev => {
                                                    const next = prev ? `${prev}，${tpl}` : tpl;
                                                    if (next.length > 2000) {
                                                        toast.warning("评语已达字数上限（2000字）");
                                                        return prev;
                                                    }
                                                    return next;
                                                })}
                                            >
                                                {tpl}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <Textarea
                                    data-testid="teacher-grading-comment"
                                    rows={8}
                                    maxLength={2000}
                                    placeholder="请输入评语..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 resize-none focus:border-indigo-500"
                                    disabled={saving || isReadOnly}
                                />
                                <div className="text-xs text-slate-500 text-right">{comment.length}/2000</div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                        {lastSavedAt && (
                            <div className="text-xs text-slate-500 text-center">已保存于 {lastSavedAt}</div>
                        )}
                        {(data.status === 0 || data.status === 1) && !isReadOnly && (
                            <>
                                <div className="flex gap-2">
                                    <Button data-testid="teacher-grading-save-draft" variant="outline" className="flex-1 border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 h-11" onClick={handleSaveDraft} disabled={saving || savingDraft}>
                                        <Save className="w-4 h-4 mr-2" />
                                        {savingDraft ? "保存中..." : "保存草稿"}
                                    </Button>
                                    <Button data-testid="teacher-grading-next" variant="outline" className="flex-1 border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 h-11" onClick={handleNextStudent} disabled={saving || savingDraft}>
                                        <SkipForward className="w-4 h-4 mr-2" />
                                        {savingDraft ? "保存中..." : "下一位"}
                                    </Button>
                                </div>
                                <Button data-testid="teacher-grading-submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11" onClick={() => handleSubmit(2)} disabled={saving}>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {saving ? "提交中..." : "确认评分"}
                                </Button>
                                <Button data-testid="teacher-grading-reject-open" variant="outline" className="w-full border-slate-300 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 h-11" onClick={() => setShowRejectModal(true)} disabled={saving}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    {saving ? "提交中..." : "驳回重做"}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100">驳回理由</DialogTitle>
                        <DialogDescription className="sr-only">
                            输入驳回原因，学生将看到这段说明。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                        <Label className="text-slate-700 dark:text-slate-300">驳回理由（学生可见，至少10字）</Label>
                        <Textarea
                            data-testid="teacher-grading-reject-reason"
                            rows={4}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                            placeholder="请详细说明驳回原因..."
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowRejectModal(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">取消</Button>
                        <Button
                            data-testid="teacher-grading-reject-submit"
                            className="bg-rose-600 hover:bg-rose-700 text-white"
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

            <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                            检测到未完成的批改草稿，是否恢复？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                setPendingDraft(null);
                                setRestoreDraftOpen(false);
                                draftResolvedRef.current = true;
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => {
                                if (!pendingDraft) return;
                                setScores(pendingDraft.scores);
                                setComment(pendingDraft.comment);
                                setPendingDraft(null);
                                setRestoreDraftOpen(false);
                                draftResolvedRef.current = true;
                            }}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
