import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Clock, CheckCircle2, XCircle, AlertCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submissionsApi, type SubmissionSummary } from "../api-client";
import { cn } from "@/lib/utils";
import { TopicDeletedState } from "../components/TopicDeletedState";

type SubmissionStatusView = {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    stripClass: string;
    icon: LucideIcon;
};

const statusConfig: Record<number, SubmissionStatusView> = {
    0: { label: "待批改", variant: "outline", stripClass: "bg-primary", icon: Clock },
    1: { label: "待批改", variant: "outline", stripClass: "bg-primary", icon: Clock },
    2: { label: "已批改", variant: "default", stripClass: "bg-primary", icon: CheckCircle2 },
    3: { label: "被驳回", variant: "destructive", stripClass: "bg-destructive", icon: XCircle },
};

function getScoreClass(score: number) {
    if (score < 60) return "text-destructive";
    return "text-primary";
}

export function SubmissionHistory() {
    const { taskId } = useParams();
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessDeniedVariant, setAccessDeniedVariant] = useState<"topic_deleted" | "task_revoked" | null>(null);

    useEffect(() => {
        async function load() {
            if (!taskId) return;
            setLoading(true);
            setAccessDeniedVariant(null);
            try {
                const res = await submissionsApi.listByTask(Number(taskId));
                if (res.success && res.data) {
                    setSubmissions(res.data);
                } else if (res.error?.code === "TOPIC_DELETED" || res.error?.code === "TASK_REVOKED") {
                    setSubmissions([]);
                    setAccessDeniedVariant(res.error?.code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [taskId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    if (accessDeniedVariant) {
        return <TopicDeletedState variant={accessDeniedVariant} />;
    }

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6" data-testid="student-submission-history">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">提交记录</h2>
                    <p className="mt-1 text-sm text-muted-foreground">查看该任务的历史提交与批改状态</p>
                </div>
                <Button variant="outline" asChild>
                    <Link to={`/task/${taskId}`}>
                        <ArrowLeft data-icon="inline-start" />
                        返回任务详情
                    </Link>
                </Button>
            </div>

            <div className="flex flex-col gap-4">
                {submissions.length === 0 ? (
                    <Card size="sm" className="border-dashed bg-muted/40">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                                <FileText className="size-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">暂无提交记录</h3>
                            <p className="mt-2 max-w-sm text-muted-foreground">
                                当你完成实验并提交报告后，这里将显示你的提交历史和老师的反馈。
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    submissions.map((sub) => {
                        const status = statusConfig[sub.status] ?? statusConfig[1]!;
                        const StatusIcon = status.icon;

                        return (
                            <Card
                                key={sub.id}
                                data-testid={`student-submission-row-${sub.id}`}
                                size="sm"
                                className="group overflow-hidden bg-muted/30 transition-colors hover:bg-muted/50"
                            >
                                <CardContent className="p-0">
                                    <div className="flex flex-col items-stretch md:flex-row">
                                        <div className={cn("min-h-1 w-full md:w-1.5", status.stripClass)} />

                                        <div className="flex flex-1 flex-col items-start gap-4 p-5 md:flex-row md:items-center">
                                            <div className="flex flex-1 flex-col gap-2">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={status.variant}>
                                                        <StatusIcon />
                                                        {status.label}
                                                    </Badge>
                                                    <span className="text-sm text-muted-foreground">
                                                        提交时间：<span className="font-mono text-foreground">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</span>
                                                    </span>
                                                </div>

                                                <div className="mt-2 flex items-center gap-6">
                                                    {sub.totalScore !== null ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-muted-foreground">得分</span>
                                                            <span className={cn("font-mono text-xl font-bold", getScoreClass(sub.totalScore))}>
                                                                {sub.totalScore}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground">等待评分...</div>
                                                    )}

                                                    {sub.graderName && (
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                            <span>批改人:</span>
                                                            <span className="text-foreground">{sub.graderName}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {sub.rejectReason && (
                                                    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                                        <span>驳回原因：{sub.rejectReason}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex w-full flex-row gap-2 md:w-auto md:flex-col">
                                                <Button variant="outline" size="sm" className="w-full" asChild>
                                                    <Link to={`/submissions/${sub.id}`}>
                                                        <FileText data-icon="inline-start" />
                                                        查看详情
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default SubmissionHistory;
