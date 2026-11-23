import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect } from "react";
import {
    ArrowLeft, FileText, Download, Play, Image, File, CheckCircle,
    Clock, AlertTriangle, ChevronRight, Eye, BriefcaseBusiness, Coins, Users, Target
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { LoadingStatus } from "@/components/LoadingStatus";
import { tasksApi, downloadStudentFile, studentResourceUrl } from "../api-client";
import type { TaskDetail, TopicAttachment } from "@/domain/experiment/student-contracts";
import type { TaskStatus } from "@/domain/experiment/types";
import { resolveFieldworkConfig } from "@/domain/fieldwork";
import { EXPERIMENT_STAGE_NAMES } from "@/lib/experiment-progress";
import { getTaskPrimaryAction, shouldShowTaskAvailabilityHint } from "./topic-detail-action";
import { parseDeadline, formatDateTimeDisplay, getRemainingDeadlineSummary } from "@/utils/format";
import { resolveSamplingPolicy, SAMPLING_METHODS } from "@/lib/sampling-policy";

const stageNames = [...EXPERIMENT_STAGE_NAMES];

const statusConfig: Record<TaskStatus, { label: string; intent: StatusBadgeIntent }> = {
    not_started: { label: "待立项", intent: "neutral" },
    in_progress: { label: "调研进行中", intent: "primary" },
    submitted: { label: "已提交待评", intent: "warning" },
    graded: { label: "已批改结项", intent: "success" },
    rejected: { label: "退回重调", intent: "destructive" },
};

const FIELDWORK_PRESET_LABELS = {
    balanced: "常规均衡实地回收",
    stratum_differential: "细分客群差异化拒访",
    high_burden_sensitive: "问卷时长与负担高敏感",
    peak_congestion: "营业高峰拥堵漏接场景",
} as const;

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
    const remaining = getRemainingDeadlineSummary(deadline);
    if (!remaining) return "暂无截止";
    if (remaining.passed) return "已截止";
    return remaining.calendarDays <= 1 ? "即将截止" : `剩余 ${remaining.calendarDays} 天`;
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
        return <Image className="w-5 h-5 text-info" />;
    }
    if (lowerType.includes("video") || lowerType.includes("mp4")) {
        return <Play className="w-5 h-5 text-auxiliary-strong" />;
    }
    if (lowerType.includes("pdf")) {
        return <FileText className="w-5 h-5 text-destructive" />;
    }
    if (lowerType.includes("doc") || lowerType.includes("word")) {
        return <FileText className="w-5 h-5 text-info" />;
    }
    return <File className="w-5 h-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TopicDetails() {
    const { taskId } = useParams();
    const [task, setTask] = useState<TaskDetail | null>(null);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("实验任务加载失败");
    const id = Number(taskId);
    const load = () => run(async () => requireApiData(await tasksApi.get(id), "实验任务加载失败"), setTask);
    const [previewFile, setPreviewFile] = useState<TopicAttachment | null>(null);

    useEffect(() => {
        if (Number.isInteger(id) && id > 0) void load();
        return cancel;
    }, [id, cancel]);
    if (!Number.isInteger(id) || id <= 0) return <Navigate to="/" replace />;
    if (loadError) {
        return (
            <StudentStatusPage title="课题详情" message="课题信息加载失败，请重试或返回任务大厅。" error={{ message: loadError, onRetry: () => void load() }} />
        );
    }

    if (loading) {
        return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载实验任务" />;
    }

    if (!task) {
        return <Navigate to="/" replace />;
    }

    const status = statusConfig[task.status];
    const deadlinePassed = isDeadlinePassed(task.deadline);
    const openAt = new Date(task.publishedAt);
    const notOpenYet = !Number.isNaN(openAt.getTime()) && openAt.getTime() > Date.now();
    const isActiveStatus = ["not_started", "in_progress", "rejected"].includes(task.status);
    const canStartExperiment = isActiveStatus && !deadlinePassed && !notOpenYet;
    const effectiveStatus =
        deadlinePassed && isActiveStatus
            ? { label: "已截止", intent: "neutral" as const }
            : notOpenYet && isActiveStatus
                ? { label: "未开放", intent: "info" as const }
                : status;
    const action = getTaskPrimaryAction(task.id, task.status, canStartExperiment);
    const samplingPolicy = resolveSamplingPolicy(task.samplingPolicy);
    const fieldworkConfig = resolveFieldworkConfig(task.fieldworkConfig);
    const samplingMethodLabels = { simple: "简单随机", systematic: "系统抽样", pps: "PPS抽样", stratified: "分层抽样" } as const;
    const hasQuestionnaireTemplateAttachment = task.attachments.some((file) => file.name.includes("调查问卷设计规范与模板"));
    const contract = task.studyContract?.contract ?? null;

    const handleDownload = async (file: TopicAttachment) => {
        try {
            await downloadStudentFile(`/api/student/attachments/${file.id}/download`, file.name);
        } catch (error) {
            console.error("Failed to download attachment:", error);
        }
    };

    const previewType = previewFile ? getAttachmentPreviewType(previewFile) : null;
    const previewUrl = previewFile ? studentResourceUrl(`/api/student/attachments/${previewFile.id}/download?mode=preview`) : "";

    return (
        <div className="space-y-5 pb-4" data-testid="student-task-detail">
            <div>
                <Button asChild variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted -ml-3 h-8 text-label">
                    <Link to="/">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        返回实验大厅
                    </Link>
                </Button>

                <div className="flex items-start justify-between gap-5 mt-2 rounded-surface border border-border bg-card p-5">
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-page-title font-bold text-foreground break-words">{task.name}</h1>
                            <StatusBadge intent={effectiveStatus.intent}>{effectiveStatus.label}</StatusBadge>
                            {task.activeWaveNumber && task.activeWaveNumber >= 1 && (task.status === "in_progress" || task.status === "rejected") && (
                                <StatusBadge intent="info">当前第 {task.activeWaveNumber} 轮投放</StatusBadge>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted-foreground tabular-nums">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> {notOpenYet ? "开放于" : "发布于"} {formatDateTime(task.publishedAt)}（UTC+8）
                            </span>
                            <span>{task.deadline ? `截止于 ${formatDateTime(task.deadline)}（UTC+8）` : "未设置截止时间"}</span>
                            <span>{notOpenYet ? getOpeningLabel(task.publishedAt) : getDeadlineLabel(task.deadline)}</span>
                        </div>
                    </div>
                    <div className="shrink-0 space-y-2 text-right" data-testid="student-task-action">
                        {task.status === "graded" && task.score !== undefined && (
                            <p className="text-label font-semibold text-success tabular-nums">实验成绩：{task.score}</p>
                        )}
                        {action.link && !action.disabled ? (
                            <Button asChild size="lg">
                                <Link to={action.link}>
                                    {action.text}
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        ) : (
                            <Button size="lg" disabled>
                                {action.text}
                            </Button>
                        )}
                    </div>
                </div>
                {shouldShowTaskAvailabilityHint(task.status, canStartExperiment) && (
                    <p className="mt-2 flex items-center gap-2 text-label text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        {notOpenYet ? "任务尚未开放，暂不可操作" : "任务已截止，无法继续操作"}
                    </p>
                )}
            </div>

            {/* 5-Stage Closed-Loop Milestone Stepper */}
            <ol aria-label="实验进度概览" className="grid grid-cols-5 gap-2.5 rounded-surface border border-border bg-card p-3">
                {stageNames.map((stage, index) => {
                    const completed = task.currentStage > index + 1 || task.status === "graded" || task.status === "submitted";
                    const current = !completed && task.status !== "not_started" && task.currentStage === index + 1;
                    return (
                        <li
                            key={stage}
                            aria-current={current ? "step" : undefined}
                            className={`flex items-center gap-2 rounded-control border px-3 py-2 text-meta ${
                                current
                                    ? "border-primary-border bg-primary-muted font-semibold text-primary"
                                    : completed
                                        ? "border-success-border bg-success-muted text-success"
                                        : "border-transparent bg-muted text-muted-foreground"
                            }`}
                        >
                            {completed ? (
                                <CheckCircle className="h-4 w-4 shrink-0 text-success" aria-label="已完成" />
                            ) : (
                                <span className="font-mono font-semibold">{index + 1}.</span>
                            )}
                            <span className="truncate">{stage}</span>
                        </li>
                    );
                })}
            </ol>

            {task.status === "rejected" && task.rejectReason && (
                <section className="flex flex-wrap items-start justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3" data-testid="student-task-rejection-banner">
                    <div className="min-w-0 flex-1 space-y-1">
                        <h2 className="text-label font-semibold text-destructive">退回重调理由</h2>
                        <p className="text-label leading-relaxed text-destructive break-words">{task.rejectReason}</p>
                        <p className="text-meta text-muted-foreground">
                            操作指引：点击右上角「继续修改」可进入实验工作台修订报告或回退重开前序阶段；也可先核对上次冻结的提交快照。
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0 bg-card">
                        <Link to={`/task/${task.id}/result`}>查看上次提交快照</Link>
                    </Button>
                </section>
            )}

            {/* Business Decision Contract Cards */}
            {contract && (
                <section aria-label="商业调研立项任务书" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4" data-testid="student-task-study-contract">
                    <div className="rounded-surface border border-border bg-card p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-meta font-semibold text-primary">
                            <BriefcaseBusiness className="h-4 w-4" />
                            商业管理决策场景
                        </div>
                        <p className="text-label leading-relaxed text-foreground">
                            {contract.businessDecision?.trim()
                                ? contract.businessDecision
                                : contract.researchQuestion}
                        </p>
                    </div>
                    <div className="rounded-surface border border-border bg-card p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-meta font-semibold text-info">
                            <Target className="h-4 w-4" />
                            核心估计指标与抽样总体
                        </div>
                        <p className="text-label leading-relaxed text-foreground">
                            {contract.target.kind === "mean"
                                ? `估计「${contract.target.field}」的总体均值`
                                : `估计「${contract.target.field} = ${contract.target.value}」的总体占比`}
                        </p>
                        <p className="text-meta text-muted-foreground">
                            <Users className="mr-1 inline h-3.5 w-3.5" />
                            {contract.targetPopulation}（总体规模 N = {task.populationSize.toLocaleString()} · 每条记录代表：{contract.unitOfAnalysis}）
                        </p>
                    </div>
                    <div className="rounded-surface border border-border bg-card p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-meta font-semibold text-success">
                            <Coins className="h-4 w-4" />
                            虚拟发放环境与参考经费参数
                        </div>
                        <p className="text-label text-foreground">
                            场景特征：{FIELDWORK_PRESET_LABELS[fieldworkConfig.preset]}
                        </p>
                        <p className="text-meta text-muted-foreground tabular-nums">
                            触达 ¥{fieldworkConfig.contactCostPerUnit}/份（按发出名单计）· 完答礼金 ¥{fieldworkConfig.incentiveCostPerComplete}/份（按回收答卷计，仅作方案性价比评估，不设预算硬上限）
                        </p>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-5 items-start gap-5 rounded-surface border border-border bg-card p-5">
                <section className="col-span-3 min-w-0">
                    <h2 className="mb-3 text-subheading font-semibold text-foreground">项目背景与实验要求</h2>
                    <RichTextContent html={task.description ?? ""} className="prose max-w-none text-body text-foreground" emptyFallback="暂无描述" />
                </section>

                <div className="sticky top-20 col-span-2 min-w-0 space-y-4 border-l border-border pl-5">
                    <section className="space-y-2" data-testid="student-task-sampling-policy">
                        <h2 className="text-subheading font-semibold text-foreground">正式轮抽样方法要求</h2>
                        <p className="text-meta text-muted-foreground">首轮试投可快速探索任意方法；正式投放阶段须完成全部必做方法且至少完成两种启用方法进行效率对比。</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                            {SAMPLING_METHODS.map((method) => {
                                const requirement = samplingPolicy.methods[method];
                                return (
                                    <div key={method} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-background px-2.5 py-1.5">
                                        <span className="text-meta font-medium text-foreground">{samplingMethodLabels[method]}</span>
                                        <StatusBadge intent={requirement === "required" ? "primary" : requirement === "optional" ? "info" : "neutral"}>
                                            {requirement === "required" ? "必做" : requirement === "optional" ? "选做" : "不适用"}
                                        </StatusBadge>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {!hasQuestionnaireTemplateAttachment && (
                        <section className="space-y-2 border-t border-border pt-3" data-testid="student-task-built-in-questionnaire-resource">
                            <h2 className="text-subheading font-semibold text-foreground">标准问卷设计资料</h2>
                            <p className="text-label text-muted-foreground">调查问卷设计规范与模板</p>
                            <div className="flex gap-2">
                                <Button asChild variant="outline" size="sm">
                                    <a href="/templates/调查问卷设计规范与模板.pdf" target="_blank" rel="noreferrer">
                                        预览 PDF
                                    </a>
                                </Button>
                                <Button asChild size="sm">
                                    <a href="/templates/调查问卷设计规范与模板.docx" download>
                                        下载 DOCX
                                    </a>
                                </Button>
                            </div>
                        </section>
                    )}

                    {task.attachments.length > 0 && (
                        <section className="space-y-2 border-t border-border pt-3">
                            <h2 className="text-subheading font-semibold text-foreground">相关资料 ({task.attachments.length})</h2>
                            <div className="space-y-2">
                                {task.attachments.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <div className="shrink-0">{getFileIcon(file.type)}</div>
                                            <div className="min-w-0">
                                                <p className="text-label text-foreground break-words">{file.name}</p>
                                                <p className="text-meta text-muted-foreground">{formatFileSize(file.size)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            {getAttachmentPreviewType(file) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`预览附件：${file.name}`}
                                                    className="text-muted-foreground"
                                                    onClick={() => setPreviewFile(file)}
                                                    title="预览"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`下载附件：${file.name}`}
                                                className="text-muted-foreground"
                                                onClick={() => handleDownload(file)}
                                                title="下载"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>

            <p className="text-meta leading-relaxed text-muted-foreground">
                数据与存档说明：问卷编辑、调优决策单与报告草稿实时暂存于当前浏览器；抽样抽取、虚拟问卷发放与质检清洗每次执行后立即同步保存至服务器，保障首轮试投至正式投放的多波次记录完整可复现。
            </p>

            <Dialog
                open={!!previewFile}
                onOpenChange={(open) => {
                    if (!open) setPreviewFile(null);
                }}
            >
                <DialogContent className="max-w-5xl bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">附件预览</DialogTitle>
                        <DialogDescription className="text-muted-foreground">{previewFile?.name}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 rounded-surface border border-border bg-background p-2">
                        {previewType === "image" && (
                            <img src={previewUrl} alt={previewFile?.name ?? "附件图片"} className="max-h-[70vh] w-full object-contain rounded-surface" />
                        )}
                        {previewType === "pdf" && (
                            <iframe title={previewFile?.name ?? "PDF预览"} src={previewUrl} tabIndex={-1} className="w-full h-[70vh] rounded-surface" />
                        )}
                        {previewType === "video" && <video src={previewUrl} controls className="max-h-[70vh] w-full rounded-surface bg-overlay" />}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default TopicDetails;
