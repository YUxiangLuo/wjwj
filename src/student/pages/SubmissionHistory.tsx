import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { submissionsApi, type SubmissionSummary } from "../api-client";
import { cn } from "@/lib/utils";
import { TopicDeletedState } from "../components/TopicDeletedState";

const statusConfig: Record<number, { label: string; intent: StatusBadgeIntent; icon: any }> = {
    0: { label: "待批改", intent: "warning", icon: Clock },
    1: { label: "待批改", intent: "warning", icon: Clock },
    2: { label: "已批改", intent: "success", icon: CheckCircle2 },
    3: { label: "被驳回", intent: "destructive", icon: XCircle },
};

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
                <Loader2 className="w-8 h-8 animate-spin text-info" />
            </div>
        );
    }

    if (accessDeniedVariant) {
        return <TopicDeletedState variant={accessDeniedVariant} />;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto" data-testid="student-submission-history">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                        提交记录
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">查看该任务的历史提交与批改状态</p>
                </div>
                <Link to={`/task/${taskId}`}>
                    <Button variant="outline" className="gap-2 border-input hover:bg-muted text-foreground/90">
                        <ArrowLeft className="w-4 h-4" />
                        返回任务详情
                    </Button>
                </Link>
            </div>

            <div className="space-y-4">
                {submissions.length === 0 ? (
                    <Card className="border-dashed border-input bg-card/30">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <FileText className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground/90">暂无提交记录</h3>
                            <p className="text-muted-foreground mt-2 max-w-sm">
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
                                className="group border-input/50 bg-card/50 hover:bg-muted/50 hover:border-primary/30 transition-all duration-300 backdrop-blur-sm overflow-hidden"
                            >
                                <CardContent className="p-0">
                                    <div className="flex flex-col md:flex-row items-stretch">
                                        {/* Left Status Strip */}
                                        <div className={cn("w-full md:w-1.5 min-h-[4px]",
                                            sub.status === 2 ? "bg-success" :
                                                sub.status === 3 ? "bg-destructive" :
                                                    "bg-warning"
                                        )} />

                                        <div className="flex-1 p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <StatusBadge intent={status.intent} className="px-2.5 py-0.5">
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {status.label}
                                                    </StatusBadge>
                                                    <span className="text-sm text-muted-foreground">
                                                        提交时间：<span className="text-foreground/90 font-mono">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</span>
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-6 mt-2">
                                                    {sub.totalScore !== null ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-muted-foreground text-sm">得分</span>
                                                            <span className={cn("text-xl font-bold font-mono",
                                                                sub.totalScore >= 90 ? "text-success" :
                                                                    sub.totalScore >= 60 ? "text-info" :
                                                                        "text-destructive"
                                                            )}>
                                                                {sub.totalScore}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground">等待评分...</div>
                                                    )}

                                                    {sub.graderName && (
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                            <span>批改人:</span>
                                                            <span className="text-foreground/90">{sub.graderName}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {sub.rejectReason && (
                                                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md border border-destructive/10 mt-2">
                                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                                        <span>驳回原因：{sub.rejectReason}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="w-full md:w-auto flex flex-row md:flex-col gap-2">
                                                <Link to={`/submissions/${sub.id}`} className="w-full md:w-auto">
                                                    <Button variant="outline" size="sm" className="w-full gap-2 border-input bg-muted/50 text-foreground/90 hover:text-primary-foreground hover:bg-primary/90 hover:border-primary transition-all">
                                                        <FileText className="w-4 h-4" />
                                                        查看详情
                                                    </Button>
                                                </Link>
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
