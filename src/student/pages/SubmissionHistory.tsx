import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submissionsApi, type SubmissionSummary } from "../api-client";

const statusLabels: Record<number, { label: string; color: string }> = {
    0: { label: "批改草稿", color: "bg-slate-100 text-slate-700" },
    1: { label: "待批改", color: "bg-amber-100 text-amber-700" },
    2: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    3: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

export function SubmissionHistory() {
    const { taskId } = useParams();
    const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            if (!taskId) return;
            setLoading(true);
            try {
                const res = await submissionsApi.listByTask(Number(taskId));
                if (res.success && res.data) {
                    setSubmissions(res.data);
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [taskId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Link to={`/task/${taskId}`}>
                <Button variant="ghost" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    返回任务详情
                </Button>
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle>历史提交记录</CardTitle>
                    <CardDescription>查看该任务的所有提交情况</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {submissions.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">暂无提交记录</div>
                    )}
                    {submissions.map((sub) => {
                        const status = statusLabels[sub.status] ?? statusLabels[1] ?? { label: "待批改", color: "bg-amber-100 text-amber-700" };
                        return (
                            <div key={sub.id} className="flex items-center justify-between gap-4 border rounded-lg p-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge className={status.color}>{status.label}</Badge>
                                        <span className="text-sm text-muted-foreground">
                                            提交时间：{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString("zh-CN") : "-"}
                                        </span>
                                    </div>
                                    {sub.totalScore !== null && (
                                        <div className="text-sm font-medium">得分：{sub.totalScore}</div>
                                    )}
                                    {sub.rejectReason && (
                                        <div className="text-sm text-red-600">驳回原因：{sub.rejectReason}</div>
                                    )}
                                    {sub.graderName && (
                                        <div className="text-xs text-muted-foreground">批改人：{sub.graderName}</div>
                                    )}
                                </div>
                                <Link to={`/submissions/${sub.id}`}>
                                    <Button variant="outline" size="sm" className="gap-1">
                                        <FileText className="w-4 h-4" />
                                        查看详情
                                    </Button>
                                </Link>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionHistory;
