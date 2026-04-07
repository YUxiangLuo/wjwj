import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submissionsApi, type SubmissionSummary } from "../api-client";
import { cn } from "@/lib/utils";
import { TopicDeletedState } from "../components/TopicDeletedState";

const statusConfig: Record<number, { label: string; color: string; icon: any }> = {
    0: { label: "待批改", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
    1: { label: "待批改", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
    2: { label: "已批改", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
    3: { label: "被驳回", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
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
                <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
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
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-white to-slate-600 dark:to-slate-400">
                        提交记录
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">查看该任务的历史提交与批改状态</p>
                </div>
                <Link to={`/task/${taskId}`}>
                    <Button variant="outline" className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                        <ArrowLeft className="w-4 h-4" />
                        返回任务详情
                    </Button>
                </Link>
            </div>

            <div className="space-y-4">
                {submissions.length === 0 ? (
                    <Card className="border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center mb-4">
                                <FileText className="w-6 h-6 text-slate-500" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">暂无提交记录</h3>
                            <p className="text-slate-500 mt-2 max-w-sm">
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
                                className="group border-slate-300/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:border-indigo-500/30 transition-all duration-300 backdrop-blur-sm overflow-hidden"
                            >
                                <CardContent className="p-0">
                                    <div className="flex flex-col md:flex-row items-stretch">
                                        {/* Left Status Strip */}
                                        <div className={cn("w-full md:w-1.5 min-h-[4px]",
                                            sub.status === 2 ? "bg-emerald-500" :
                                                sub.status === 3 ? "bg-red-500" :
                                                    "bg-amber-500"
                                        )} />

                                        <div className="flex-1 p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={cn("px-2.5 py-0.5 border flex items-center gap-1.5", status.color)}>
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {status.label}
                                                    </Badge>
                                                    <span className="text-sm text-slate-500">
                                                        提交时间：<span className="text-slate-700 dark:text-slate-300 font-mono">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</span>
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-6 mt-2">
                                                    {sub.totalScore !== null ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-600 dark:text-slate-400 text-sm">得分</span>
                                                            <span className={cn("text-xl font-bold font-mono",
                                                                sub.totalScore >= 90 ? "text-emerald-600" :
                                                                    sub.totalScore >= 60 ? "text-cyan-600" :
                                                                        "text-red-600"
                                                            )}>
                                                                {sub.totalScore}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-slate-500">等待评分...</div>
                                                    )}

                                                    {sub.graderName && (
                                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                                            <span>批改人:</span>
                                                            <span className="text-slate-700 dark:text-slate-300">{sub.graderName}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {sub.rejectReason && (
                                                    <div className="flex items-start gap-2 text-sm text-red-600/90 bg-red-400/5 px-3 py-2 rounded-md border border-red-500/10 mt-2">
                                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                                        <span>驳回原因：{sub.rejectReason}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="w-full md:w-auto flex flex-row md:flex-col gap-2">
                                                <Link to={`/submissions/${sub.id}`} className="w-full md:w-auto">
                                                    <Button variant="outline" size="sm" className="w-full gap-2 border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:text-white hover:bg-indigo-600 hover:border-indigo-500 transition-all">
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
