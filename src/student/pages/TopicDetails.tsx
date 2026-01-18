import { useState, useEffect } from "react";
import { ArrowLeft, FileText, Download, Play, Image, File, CheckCircle, Loader2 } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tasksApi, type TaskDetail, type TaskStatus, type TopicAttachment } from "../api-client";

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "进行中", color: "bg-blue-100 text-blue-700" },
    submitted: { label: "已提交", color: "bg-amber-100 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-100 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

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
    const canStartExperiment = ["not_started", "in_progress", "rejected"].includes(task.status);

    const getActionButton = () => {
        switch (task.status) {
            case "not_started":
                return { text: "开始实验", link: `/task/${task.id}/experiment` };
            case "in_progress":
                return { text: "继续实验", link: `/task/${task.id}/experiment` };
            case "submitted":
            case "grading":
                return { text: "查看提交内容", link: null };
            case "graded":
                return { text: "查看成绩", link: null };
            case "rejected":
                return { text: "重新开始", link: `/task/${task.id}/experiment` };
        }
    };

    const action = getActionButton();

    return (
        <div className="space-y-6">
            {/* Back button */}
            <Link to="/">
                <Button variant="ghost" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    返回任务列表
                </Button>
            </Link>

            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold">{task.name}</h1>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span>发布时间：{task.publishedAt}</span>
                        {task.deadline && <span>截止时间：{task.deadline}</span>}
                    </div>
                </div>
                <Badge className={status.color + " text-sm px-3 py-1"}>{status.label}</Badge>
            </div>

            {/* Progress Stepper */}
            <Card>
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
                                                isCurrent ? "bg-blue-500 text-white" :
                                                    "bg-slate-200 text-slate-500"}
                                        `}>
                                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : stageNum}
                                        </div>
                                        <span className={`text-xs mt-2 ${isCurrent ? "font-medium text-blue-600" : "text-muted-foreground"}`}>
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

            {/* Description */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">课题介绍</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-line">{task.description}</div>
                    </div>
                </CardContent>
            </Card>

            {/* Attachments */}
            {task.attachments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">相关资料 ({task.attachments.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {task.attachments.map((file) => (
                                <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        {getFileIcon(file.type)}
                                        <div>
                                            <p className="text-sm font-medium">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        <Download className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Reject reason */}
            {task.status === "rejected" && task.rejectReason && (
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <CardTitle className="text-base text-red-700">驳回理由</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-red-700">{task.rejectReason}</p>
                    </CardContent>
                </Card>
            )}

            {/* Score */}
            {task.status === "graded" && task.score !== undefined && (
                <Card className="border-emerald-200 bg-emerald-50">
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

            {/* Action Button */}
            <div className="flex justify-end">
                {action.link ? (
                    <Link to={action.link}>
                        <Button size="lg">{action.text}</Button>
                    </Link>
                ) : (
                    <Button size="lg">{action.text}</Button>
                )}
            </div>
        </div>
    );
}

export default TopicDetails;
