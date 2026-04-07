import { useState, useEffect } from "react";
import { ArrowLeft, FileText, Download, Play, Image, File, CheckCircle, Loader2, Clock, AlertTriangle, BookOpen, ChevronRight, Eye } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
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
import { experimentApi, tasksApi, type TaskDetail, type TaskStatus, type TopicAttachment } from "../api-client";
import { clearReportDraft } from "../draft-sync";
import { TopicDeletedState } from "../components/TopicDeletedState";
import { getTaskPrimaryAction, shouldShowTaskAvailabilityHint } from "./topic-detail-action";
import { parseDeadline, formatDateTimeDisplay } from "@/utils/format";

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
    in_progress: { label: "进行中", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
    submitted: { label: "已提交", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    grading: { label: "批改中", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    graded: { label: "已批改", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    rejected: { label: "被驳回", color: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

function formatDateTime(value: string | null) {
    return formatDateTimeDisplay(value, "无");
}

type PreviewType = "image" | "pdf" | "video";

function getAttachmentPreviewType(file: TopicAttachment): PreviewType | null {
    const lowerType = file.type.toLowerCase();
    const lowerName = file.name.toLowerCase();

    if (lowerType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName)) {
        return "image";
    }
    if (lowerType === "application/pdf" || lowerName.endsWith(".pdf")) {
        return "pdf";
    }
    if (lowerType.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(lowerName)) {
        return "video";
    }
    return null;
}

function isDeadlinePassed(deadline: string | null) {
    const end = parseDeadline(deadline);
    if (!end) return false;
    return Date.now() > end.getTime();
}

function getDeadlineLabel(deadline: string | null) {
    const end = parseDeadline(deadline);
    if (!end) return "暂无截止";
    const remainingMs = end.getTime() - Date.now();
    if (remainingMs <= 0) return "已截止";
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.ceil(remainingMs / dayMs);
    return days <= 1 ? "即将截止" : `剩余 ${days} 天`;
}

function getOpeningLabel(publishedAt: string) {
    const t = new Date(publishedAt);
    if (Number.isNaN(t.getTime())) return "未知";
    const ms = t.getTime() - Date.now();
    if (ms <= 0) return "已开放";
    const days = Math.ceil(ms / 86400000);
    return days <= 1 ? "即将开放" : `${days} 天后开放`;
}

function getFileIcon(type: string) {
    const lowerType = type.toLowerCase();
    if (lowerType.includes("image") || lowerType.includes("png") || lowerType.includes("jpg")) {
        return <Image className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    }
    if (lowerType.includes("video") || lowerType.includes("mp4")) {
        return <Play className="w-5 h-5 text-purple-600" />;
    }
    if (lowerType.includes("pdf")) {
        return <FileText className="w-5 h-5 text-rose-600" />;
    }
    if (lowerType.includes("doc") || lowerType.includes("word")) {
        return <FileText className="w-5 h-5 text-blue-500" />;
    }
    return <File className="w-5 h-5 text-slate-600 dark:text-slate-400" />;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TopicDetails() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState<TaskDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accessDeniedVariant, setAccessDeniedVariant] = useState<"topic_deleted" | "task_revoked" | null>(null);
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    const [previewFile, setPreviewFile] = useState<TopicAttachment | null>(null);

    useEffect(() => {
        async function loadTask() {
            if (!taskId) {
                setNotFound(true);
                return;
            }

            setLoading(true);
            setNotFound(false);
            setAccessDeniedVariant(null);
            try {
                const res = await tasksApi.get(parseInt(taskId));
                if (res.success && res.data) {
                    setTask(res.data);
                } else if (res.error?.code === "TOPIC_DELETED" || res.error?.code === "TASK_REVOKED") {
                    setTask(null);
                    setAccessDeniedVariant(res.error?.code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                } else {
                    setTask(null);
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load task:", error);
                setTask(null);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        }
        loadTask();
    }, [taskId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (accessDeniedVariant) {
        return <TopicDeletedState variant={accessDeniedVariant} />;
    }

    if (notFound || !task) {
        return <Navigate to="/" replace />;
    }

    const status = statusConfig[task.status];
    const deadlinePassed = isDeadlinePassed(task.deadline);
    const openAt = new Date(task.publishedAt);
    const notOpenYet = !Number.isNaN(openAt.getTime()) && openAt.getTime() > Date.now();
    const isActiveStatus = ["not_started", "in_progress", "rejected"].includes(task.status);
    const canStartExperiment = isActiveStatus && !deadlinePassed && !notOpenYet;
    const effectiveStatus = deadlinePassed && isActiveStatus
        ? { label: "已截止", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" }
        : notOpenYet && isActiveStatus
            ? { label: "未开放", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" }
            : status;
    const effectiveStatusDotClass = deadlinePassed && isActiveStatus
        ? "bg-slate-500"
        : notOpenYet && isActiveStatus
            ? "bg-cyan-400"
            : task.status === "in_progress"
                ? "bg-indigo-500 animate-pulse"
                : task.status === "not_started"
                    ? "bg-slate-500"
                    : task.status === "rejected"
                        ? "bg-rose-500"
                        : "bg-emerald-500";

    const action = getTaskPrimaryAction(task.id, task.status, canStartExperiment);

    const handleDownload = async (file: TopicAttachment) => {
        try {
            const res = await fetch(`/api/student/attachments/${file.id}/download`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("下载失败");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to download attachment:", error);
        }
    };

    const previewType = previewFile ? getAttachmentPreviewType(previewFile) : null;
    const previewUrl = previewFile ? `/api/student/attachments/${previewFile.id}/download?mode=preview` : "";

    return (
        <div className="space-y-4 pb-12" data-testid="student-task-detail">
            <div>
                <Link to="/">
                    <Button variant="ghost" className="gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 -ml-4 h-8 text-sm">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        返回任务列表
                    </Button>
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-1">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{task.name}</h1>
                        <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-slate-600 dark:text-slate-400">
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {notOpenYet ? "开放于" : "发布于"} {formatDateTime(task.publishedAt)}</span>
                            {task.deadline && <span>截止于 {formatDateTime(task.deadline)}</span>}
                        </div>
                    </div>
                    <Badge variant="outline" className={`${effectiveStatus.color} px-3 py-1 text-sm h-7`}>{effectiveStatus.label}</Badge>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 shadow-sm">
                <CardContent className="px-5 py-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1 max-w-2xl">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-500 border border-indigo-500/20">
                                <BookOpen className="w-3 h-3" />
                                实验目标
                            </div>
                            <p className="text-base font-medium text-slate-800 dark:text-slate-200 leading-relaxed">完成抽样统计实验，形成完整报告。</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">按步骤推进，及时提交，体验完整的数据分析流程。</p>
                        </div>
                        <div className="rounded-xl bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 px-5 py-3 shadow-sm backdrop-blur-sm min-w-[180px]">
                            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                {notOpenYet ? "开放状态" : "截止状态"}
                            </div>
                            <div className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {notOpenYet ? getOpeningLabel(task.publishedAt) : getDeadlineLabel(task.deadline)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                {notOpenYet
                                    ? `开放于 ${formatDateTime(task.publishedAt)}`
                                    : task.deadline ? formatDateTime(task.deadline) : "未设置截止时间"}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-3">
                            <CardTitle className="text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                课题介绍
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4">
                            <RichTextContent
                                html={task.description ?? ""}
                                className="prose prose-sm prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed"
                                emptyFallback="暂无描述"
                            />
                        </CardContent>
                    </Card>

                    {task.attachments.length > 0 && (
                        <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                            <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-3">
                                <CardTitle className="text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Download className="w-4 h-4 text-indigo-500" />
                                    相关资料 ({task.attachments.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3 pb-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {task.attachments.map((file) => (
                                        <div key={file.id} className="flex items-center justify-between rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 px-3 py-2 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors group gap-2">
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                <div className="p-1.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shrink-0">
                                                    {getFileIcon(file.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-500 transition-colors">{file.name}</p>
                                                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                {getAttachmentPreviewType(file) && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                        onClick={() => setPreviewFile(file)}
                                                        title="预览"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                    onClick={() => handleDownload(file)}
                                                    title="下载"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {task.status === "rejected" && task.rejectReason && (
                        <Card className="rounded-2xl border-rose-500/20 bg-rose-500/10">
                            <CardContent className="py-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-sm font-semibold text-rose-600 mb-1">驳回理由</div>
                                        <p className="text-rose-500 text-sm leading-relaxed opacity-90">{task.rejectReason}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                </div>

                <div className="space-y-4">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-fit">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-3">
                            <CardTitle className="text-sm text-slate-800 dark:text-slate-200">任务状态</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4 space-y-3">
                            <div className="space-y-0.5">
                                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">当前阶段</div>
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{task.currentStage > 0 && task.currentStage <= 4 ? stageNames[task.currentStage - 1] : "尚未开始"}</div>
                            </div>
                            <div className="w-full h-px bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-0.5">
                                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">任务状态</div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${effectiveStatusDotClass}`}></span>
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{effectiveStatus.label}</span>
                                </div>
                            </div>
                            <div className="w-full h-px bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-0.5">
                                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">操作提示</div>
                                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">开始实验后，请按步骤完成并保存进度。系统将自动记录您的每一次操作。</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm">
                        <CardContent className="pt-4 pb-4 space-y-3">
                            <div className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                                {task.status === "submitted" || task.status === "graded" ? "已提交实验内容" : "准备好开始了吗？"}
                            </div>
                            {task.status === "graded" && task.score !== undefined && (
                                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span className="text-sm font-medium text-emerald-600">实验成绩</span>
                                    <span className="text-xl font-bold text-emerald-600 tracking-tight ml-auto">{task.score}</span>
                                </div>
                            )}
                            {task.status === "rejected" ? (
                                <Button
                                    size="lg"
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                                    disabled={action.disabled}
                                    onClick={() => setShowRestartConfirm(true)}
                                >
                                    {action.text} <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            ) : action.link ? (
                                <Link to={action.link} className="w-full block">
                                    <Button
                                        size="lg"
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 h-11 text-base font-medium"
                                        disabled={action.disabled}
                                    >
                                        {action.text} <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            ) : (
                                <Button size="lg" className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300" disabled>{action.text}</Button>
                            )}
                            {shouldShowTaskAvailabilityHint(task.status, canStartExperiment) && (
                                <div className="flex items-center justify-center gap-1.5 text-xs text-rose-600 bg-rose-500/10 p-2 rounded-lg">
                                    <AlertTriangle className="w-3 h-3" />
                                    {notOpenYet ? "任务尚未开放，暂不可操作" : "任务已截止，无法继续操作"}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-3">
                    <CardTitle className="text-sm text-slate-800 dark:text-slate-200">实验进度概览</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 pb-5">
                    <div className="flex items-center justify-between relative px-4">
                        {/* Connecting Line - Background */}
                        <div className="absolute left-4 right-4 top-5 h-1 bg-slate-200 dark:bg-slate-800 rounded-full -z-0"></div>

                        {stageNames.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = task.currentStage > stageNum || task.status === "graded";
                            const isCurrent = task.currentStage === stageNum && task.status !== "graded";

                            return (
                                <div key={stage} className="flex flex-col items-center relative z-10 flex-1">
                                    <div className={`
                                        w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-4 transition-all duration-300
                                        ${isCompleted
                                            ? "bg-emerald-500 border-slate-50 dark:border-slate-900 text-white shadow-lg shadow-emerald-500/30"
                                            : isCurrent
                                                ? "bg-indigo-600 border-slate-50 dark:border-slate-900 text-white ring-4 ring-indigo-500/20 scale-110 shadow-lg shadow-indigo-500/40"
                                                : "bg-slate-200 dark:bg-slate-800 border-slate-50 dark:border-slate-900 text-slate-500"}
                                    `}>
                                        {isCompleted ? <CheckCircle className="w-5 h-5" /> : stageNum}
                                    </div>
                                    <span className={`text-xs mt-2 font-medium transition-colors duration-300 ${isCurrent ? "text-indigo-500" : isCompleted ? "text-emerald-500" : "text-slate-500"}`}>
                                        {stage}
                                    </span>
                                </div>
                            );
                        })}

                        {/* Connecting Line - Active Progress (Partial implementation for visual simplified) */}
                        {/* Real implementation needs exact widths which is hard in flex, visually the circles cover the line breaks */}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={showRestartConfirm} onOpenChange={setShowRestartConfirm}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认重新开始实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                            重新开始将<strong className="text-rose-600">清空所有已有的实验数据</strong>，从问卷设计阶段重新开始。
                            <br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                            onClick={async () => {
                                if (!taskId) return;
                                const res = await experimentApi.reset(Number(taskId), {
                                    resetToStage: 1,
                                    clearQuestionnaire: true,
                                });
                                if (res.success && res.data) {
                                    clearReportDraft(res.data.id);
                                    navigate(`/task/${taskId}/experiment`);
                                }
                            }}
                        >
                            确认重新开始
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
                <DialogContent className="max-w-5xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100">附件预览</DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">
                            {previewFile?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 p-2">
                        {previewType === "image" && (
                            <img src={previewUrl} alt={previewFile?.name ?? "附件图片"} className="max-h-[70vh] w-full object-contain rounded-lg" />
                        )}
                        {previewType === "pdf" && (
                            <iframe title={previewFile?.name ?? "PDF预览"} src={previewUrl} className="w-full h-[70vh] rounded-lg" />
                        )}
                        {previewType === "video" && (
                            <video src={previewUrl} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default TopicDetails;
