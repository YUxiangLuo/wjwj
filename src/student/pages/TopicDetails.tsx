import { useState, useEffect } from "react";
import { ArrowLeft, FileText, Download, Play, Image, File, CheckCircle, Loader2 } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-teal-50 text-teal-700" },
    in_progress: { label: "进行中", color: "bg-cyan-50 text-cyan-700" },
    submitted: { label: "已提交", color: "bg-amber-50 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-50 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-50 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-rose-50 text-rose-700" },
};

function parseDeadline(deadline: string | null): Date | null {
    if (!deadline) return null;
    const withTime = deadline.includes("T") ? deadline : `${deadline}T23:59:00`;
    const parsed = new Date(withTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function getFileIcon(type: string) {
    const lowerType = type.toLowerCase();
    if (lowerType.includes("image") || lowerType.includes("png") || lowerType.includes("jpg")) {
        return <Image className="w-5 h-5 text-blue-500" />;
    }
    if (lowerType.includes("video") || lowerType.includes("mp4")) {
        return <Play className="w-5 h-5 text-purple-500" />;
    }
    if (lowerType.includes("pdf")) {
        return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (lowerType.includes("doc") || lowerType.includes("word")) {
        return <FileText className="w-5 h-5 text-blue-600" />;
    }
    return <File className="w-5 h-5 text-slate-500" />;
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
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);

    useEffect(() => {
        async function loadTask() {
            if (!taskId) {
                setNotFound(true);
                return;
            }

            setLoading(true);
            try {
                const res = await tasksApi.get(parseInt(taskId));
                if (res.success && res.data) {
                    setTask(res.data);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load task:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        }
        loadTask();
    }, [taskId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (notFound || !task) {
        return <Navigate to="/" replace />;
    }

    const status = statusConfig[task.status];
    const deadlinePassed = isDeadlinePassed(task.deadline);
    const canStartExperiment = ["not_started", "in_progress", "rejected"].includes(task.status) && !deadlinePassed;

    const getActionButton = () => {
        switch (task.status) {
            case "not_started":
                return { text: "开始实验", link: `/task/${task.id}/experiment` };
            case "in_progress":
                return { text: "继续实验", link: `/task/${task.id}/experiment` };
            case "submitted":
            case "grading":
                return { text: "查看提交内容", link: `/task/${task.id}/history` };
            case "graded":
                return { text: "查看成绩", link: `/task/${task.id}/history` };
            case "rejected":
                return { text: "重新开始", link: null };
        }
    };

    const action = getActionButton();

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

    return (
        <div className="space-y-8">
            <Link to="/">
                <Button variant="ghost" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    返回任务列表
                </Button>
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{task.name}</h1>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span>发布时间：{task.publishedAt}</span>
                        {task.deadline && <span>截止时间：{task.deadline}</span>}
                    </div>
                </div>
                <Badge className={status.color + " text-sm px-3 py-1"}>{status.label}</Badge>
            </div>

            <Card className="rounded-3xl border-white/70 bg-gradient-to-r from-teal-500/15 via-cyan-500/15 to-indigo-500/15 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                <CardContent className="py-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-teal-700/80">实验目标</p>
                            <p className="text-lg font-semibold text-foreground">完成抽样统计实验，形成完整报告。</p>
                            <p className="text-sm text-muted-foreground">按步骤推进，及时提交，体验完整的数据分析流程。</p>
                        </div>
                        <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm shadow-sm">
                            <div className="text-xs text-muted-foreground">截止提醒</div>
                            <div className="text-base font-semibold text-foreground">{getDeadlineLabel(task.deadline)}</div>
                            <div className="text-xs text-muted-foreground mt-1">{task.deadline ?? "未设置截止时间"}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="text-base">课题介绍</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="prose prose-sm max-w-none">
                                <div className="whitespace-pre-line">{task.description}</div>
                            </div>
                        </CardContent>
                    </Card>

                    {task.attachments.length > 0 && (
                        <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle className="text-base">相关资料 ({task.attachments.length})</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {task.attachments.map((file) => (
                                        <div key={file.id} className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/90 p-3">
                                            <div className="flex items-center gap-3">
                                                {getFileIcon(file.type)}
                                                <div>
                                                    <p className="text-sm font-medium">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => handleDownload(file)}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {task.status === "rejected" && task.rejectReason && (
                        <Card className="rounded-2xl border-rose-200 bg-rose-50">
                            <CardHeader>
                                <CardTitle className="text-base text-rose-700">驳回理由</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-rose-700">{task.rejectReason}</p>
                            </CardContent>
                        </Card>
                    )}

                    {task.status === "graded" && task.score !== undefined && (
                        <Card className="rounded-2xl border-emerald-200 bg-emerald-50">
                            <CardHeader>
                                <CardTitle className="text-base text-emerald-700">实验成绩</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3">
                                    <span className="text-4xl font-bold text-emerald-600">{task.score}</span>
                                    <span className="text-emerald-600">分</span>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="text-base">任务提示</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <div>当前阶段：{task.currentStage > 0 ? stageNames[task.currentStage - 1] : "尚未开始"}</div>
                            <div>任务状态：{status.label}</div>
                            <div>截止时间：{task.deadline ?? "未设置"}</div>
                            <div>开始实验后，请按步骤完成并保存进度。</div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="text-base">继续实验</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="text-sm text-muted-foreground">准备好了就开始吧。</div>
                            {task.status === "rejected" ? (
                                <Button size="lg" className="w-full" disabled={!canStartExperiment} onClick={() => setShowRestartConfirm(true)}>
                                    {action.text}
                                </Button>
                            ) : action.link ? (
                                <Link to={action.link} className="w-full">
                                    <Button size="lg" className="w-full" disabled={!canStartExperiment}>{action.text}</Button>
                                </Link>
                            ) : (
                                <Button size="lg" className="w-full">{action.text}</Button>
                            )}
                            {!canStartExperiment && ["not_started", "in_progress", "rejected"].includes(task.status) && (
                                <div className="text-xs text-muted-foreground">任务已截止，无法继续操作</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <CardHeader>
                    <CardTitle className="text-base">实验进度</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        {stageNames.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = task.currentStage > stageNum || task.status === "graded";
                            const isCurrent = task.currentStage === stageNum && task.status !== "graded";

                            return (
                                <div key={stage} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center">
                                        <div className={`
                                            w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                                            ${isCompleted ? "bg-emerald-500 text-white" :
                                                isCurrent ? "bg-teal-500 text-white" :
                                                    "bg-slate-200 text-slate-500"}
                                        `}>
                                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : stageNum}
                                        </div>
                                        <span className={`text-xs mt-2 ${isCurrent ? "font-medium text-teal-600" : "text-muted-foreground"}`}>
                                            {stage}
                                        </span>
                                    </div>
                                    {index < stageNames.length - 1 && (
                                        <div className={`flex-1 h-1 mx-2 ${task.currentStage > stageNum ? "bg-emerald-500" : "bg-slate-200"
                                            }`} />
                                    )}
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
                        <AlertDialogDescription>
                            重新开始将清空所有已有的实验数据，从问卷设计阶段重新开始。
                            <br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (!taskId) return;
                                const res = await experimentApi.reset(Number(taskId), {
                                    resetToStage: 1,
                                    clearQuestionnaire: true,
                                });
                                if (res.success) {
                                    navigate(`/task/${taskId}/experiment`);
                                }
                            }}
                        >
                            确认重新开始
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default TopicDetails;
