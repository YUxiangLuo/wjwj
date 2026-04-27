import { useState, useEffect } from "react";
import { ArrowLeft, FileText, Download, Play, Image, File, CheckCircle, Loader2, Clock, AlertTriangle, BookOpen, ChevronRight, Eye } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

type StatusView = {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    dotClass: string;
};

const statusConfig: Record<TaskStatus, StatusView> = {
    not_started: { label: "未开始", variant: "secondary", dotClass: "bg-muted-foreground" },
    in_progress: { label: "进行中", variant: "default", dotClass: "bg-primary animate-pulse" },
    submitted: { label: "已提交", variant: "outline", dotClass: "bg-primary" },
    grading: { label: "批改中", variant: "outline", dotClass: "bg-primary" },
    graded: { label: "已批改", variant: "default", dotClass: "bg-primary" },
    rejected: { label: "被驳回", variant: "destructive", dotClass: "bg-destructive" },
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
        return <Image className="size-5 text-primary" />;
    }
    if (lowerType.includes("video") || lowerType.includes("mp4")) {
        return <Play className="size-5 text-primary" />;
    }
    if (lowerType.includes("pdf")) {
        return <FileText className="size-5 text-destructive" />;
    }
    if (lowerType.includes("doc") || lowerType.includes("word")) {
        return <FileText className="size-5 text-primary" />;
    }
    return <File className="size-5 text-muted-foreground" />;
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
                <Loader2 className="size-10 animate-spin text-primary" />
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
    const effectiveStatus: StatusView = deadlinePassed && isActiveStatus
        ? { label: "已截止", variant: "secondary", dotClass: "bg-muted-foreground" }
        : notOpenYet && isActiveStatus
            ? { label: "未开放", variant: "outline", dotClass: "bg-primary" }
            : status;

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
        <div className="flex flex-col gap-4 pb-12" data-testid="student-task-detail">
            <div>
                <Button variant="ghost" size="sm" className="-ml-4" asChild>
                    <Link to="/">
                        <ArrowLeft data-icon="inline-start" />
                        返回任务列表
                    </Link>
                </Button>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-1">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{task.name}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="size-3.5" /> {notOpenYet ? "开放于" : "发布于"} {formatDateTime(task.publishedAt)}</span>
                            {task.deadline && <span>截止于 {formatDateTime(task.deadline)}</span>}
                        </div>
                    </div>
                    <Badge variant={effectiveStatus.variant} className="whitespace-nowrap">{effectiveStatus.label}</Badge>
                </div>
            </div>

            <Card size="sm">
                <CardContent>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex max-w-2xl flex-col gap-1">
                            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                <BookOpen className="size-3" />
                                实验目标
                            </div>
                            <p className="text-base font-medium leading-relaxed text-foreground">完成抽样统计实验，形成完整报告。</p>
                            <p className="text-sm text-muted-foreground">按步骤推进，及时提交，体验完整的数据分析流程。</p>
                        </div>
                        <div className="min-w-[180px] rounded-lg border border-border bg-background/60 px-5 py-3 shadow-sm">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {notOpenYet ? "开放状态" : "截止状态"}
                            </div>
                            <div className="mt-0.5 text-xl font-bold text-foreground">
                                {notOpenYet ? getOpeningLabel(task.publishedAt) : getDeadlineLabel(task.deadline)}
                            </div>
                            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {notOpenYet
                                    ? `开放于 ${formatDateTime(task.publishedAt)}`
                                    : task.deadline ? formatDateTime(task.deadline) : "未设置截止时间"}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-4 lg:col-span-2">
                    <Card size="sm">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="flex items-center gap-2 text-sm normal-case tracking-normal">
                                <FileText className="size-4 text-primary" />
                                课题介绍
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <RichTextContent
                                html={task.description ?? ""}
                                className="prose prose-sm max-w-none leading-relaxed text-foreground/80 dark:prose-invert"
                                emptyFallback="暂无描述"
                            />
                        </CardContent>
                    </Card>

                    {task.attachments.length > 0 && (
                        <Card size="sm">
                            <CardHeader className="border-b border-border">
                                <CardTitle className="flex items-center gap-2 text-sm normal-case tracking-normal">
                                    <Download className="size-4 text-primary" />
                                    相关资料 ({task.attachments.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {task.attachments.map((file) => (
                                        <div key={file.id} className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 transition-colors hover:bg-muted">
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                <div className="shrink-0 rounded-md border border-border bg-background p-1.5">
                                                    {getFileIcon(file.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                {getAttachmentPreviewType(file) && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        onClick={() => setPreviewFile(file)}
                                                        title="预览"
                                                    >
                                                        <Eye />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    onClick={() => handleDownload(file)}
                                                    title="下载"
                                                >
                                                    <Download />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {task.status === "rejected" && task.rejectReason && (
                        <Card size="sm" className="border-destructive/20 bg-destructive/10">
                            <CardContent>
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                                    <div>
                                        <div className="mb-1 text-sm font-semibold text-destructive">驳回理由</div>
                                        <p className="text-sm leading-relaxed text-destructive opacity-90">{task.rejectReason}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                </div>

                <div className="flex flex-col gap-4">
                    <Card size="sm" className="h-fit bg-muted/40">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-sm normal-case tracking-normal">任务状态</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <div className="flex flex-col gap-0.5">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">当前阶段</div>
                                <div className="text-sm font-medium text-foreground">{task.currentStage > 0 && task.currentStage <= 4 ? stageNames[task.currentStage - 1] : "尚未开始"}</div>
                            </div>
                            <Separator />
                            <div className="flex flex-col gap-0.5">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">任务状态</div>
                                <div className="flex items-center gap-2">
                                    <span className={cn("size-2 rounded-full", effectiveStatus.dotClass)}></span>
                                    <span className="text-sm font-medium text-foreground">{effectiveStatus.label}</span>
                                </div>
                            </div>
                            <Separator />
                            <div className="flex flex-col gap-0.5">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">操作提示</div>
                                <div className="text-sm leading-relaxed text-muted-foreground">开始实验后，请按步骤完成并保存进度。系统将自动记录您的每一次操作。</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card size="sm" className="border-primary/20 bg-primary/5">
                        <CardContent className="flex flex-col gap-3">
                            <div className="text-sm font-medium text-primary">
                                {task.status === "submitted" || task.status === "graded" ? "已提交实验内容" : "准备好开始了吗？"}
                            </div>
                            {task.status === "graded" && task.score !== undefined && (
                                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
                                    <CheckCircle className="size-4 shrink-0 text-primary" />
                                    <span className="text-sm font-medium text-primary">实验成绩</span>
                                    <span className="ml-auto text-xl font-bold tracking-tight text-primary">{task.score}</span>
                                </div>
                            )}
                            {task.status === "rejected" ? (
                                <Button
                                    size="lg"
                                    className="w-full"
                                    disabled={action.disabled}
                                    onClick={() => setShowRestartConfirm(true)}
                                >
                                    {action.text}
                                    <ChevronRight data-icon="inline-end" />
                                </Button>
                            ) : action.link && !action.disabled ? (
                                <Button size="lg" className="w-full" asChild>
                                    <Link to={action.link}>
                                        {action.text}
                                        <ChevronRight data-icon="inline-end" />
                                    </Link>
                                </Button>
                            ) : (
                                <Button size="lg" variant="secondary" className="w-full" disabled>{action.text}</Button>
                            )}
                            {shouldShowTaskAvailabilityHint(task.status, canStartExperiment) && (
                                <div className="flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                                    <AlertTriangle className="size-3" />
                                    {notOpenYet ? "任务尚未开放，暂不可操作" : "任务已截止，无法继续操作"}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card size="sm" className="bg-muted/40">
                <CardHeader className="border-b border-border">
                    <CardTitle className="text-sm normal-case tracking-normal">实验进度概览</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative flex items-center justify-between px-4">
                        <div className="absolute left-4 right-4 top-5 h-1 rounded-full bg-border"></div>

                        {stageNames.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = task.currentStage > stageNum || task.status === "graded";
                            const isCurrent = task.currentStage === stageNum && task.status !== "graded";

                            return (
                                <div key={stage} className="relative z-10 flex flex-1 flex-col items-center">
                                    <div
                                        className={cn(
                                            "flex size-10 items-center justify-center rounded-full border-4 border-card text-sm font-bold transition-all duration-300",
                                            isCompleted
                                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                                                : isCurrent
                                                    ? "scale-110 bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-primary/20"
                                                    : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {isCompleted ? <CheckCircle className="size-5" /> : stageNum}
                                    </div>
                                    <span
                                        className={cn(
                                            "mt-2 text-xs font-medium transition-colors duration-300",
                                            isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                                        )}
                                    >
                                        {stage}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={showRestartConfirm} onOpenChange={setShowRestartConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认重新开始实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-base leading-relaxed">
                            重新开始将<strong className="text-destructive">清空所有已有的实验数据</strong>，从问卷设计阶段重新开始。
                            <br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
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
                <DialogContent className="max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>附件预览</DialogTitle>
                        <DialogDescription>
                            {previewFile?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 rounded-lg border border-border bg-background/60 p-2">
                        {previewType === "image" && (
                            <img src={previewUrl} alt={previewFile?.name ?? "附件图片"} className="max-h-[70vh] w-full object-contain rounded-lg" />
                        )}
                        {previewType === "pdf" && (
                            <iframe title={previewFile?.name ?? "PDF预览"} src={previewUrl} className="h-[70vh] w-full rounded-lg" />
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
