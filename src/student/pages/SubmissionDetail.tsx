import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, FileText, Loader2, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTimeDisplay } from "@/utils/format";
import { submissionsApi, type SubmissionDetail } from "../api-client";

const statusConfig: Record<SubmissionDetail["status"], { label: string; intent: StatusBadgeIntent }> = {
    submitted: { label: "待批改", intent: "warning" },
    graded: { label: "已批改", intent: "success" },
    rejected: { label: "已驳回", intent: "destructive" },
};

export function SubmissionDetailPage() {
    const { taskId } = useParams();
    const [detail, setDetail] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const numericTaskId = Number(taskId);
        if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
            setError("无效的任务");
            setLoading(false);
            return;
        }
        void submissionsApi.getByTask(numericTaskId).then((response) => {
            if (response.success && response.data) setDetail(response.data);
            else setError(response.error?.message ?? "未找到提交记录");
        }).finally(() => setLoading(false));
    }, [taskId]);

    if (loading) return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (!detail) return <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">{error ?? "未找到提交记录"}</div>;

    const status = statusConfig[detail.status];
    const scores = [
        ["问卷设计", detail.scoreQuestionnaire, detail.weights.questionnaire],
        ["实验过程", detail.scoreProcess, detail.weights.process],
        ["实验报告", detail.scoreReport, detail.weights.report],
    ] as const;

    return (
        <div className="mx-auto max-w-4xl space-y-6" data-testid="student-submission-detail">
            <div className="flex items-center justify-between gap-4">
                <Link to={`/task/${detail.taskId}`}>
                    <Button variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" />返回任务</Button>
                </Link>
                <StatusBadge intent={status.intent}>
                    {detail.status === "graded" ? <CheckCircle2 className="h-3.5 w-3.5" /> : detail.status === "rejected" ? <AlertCircle className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5" />}
                    {status.label}
                </StatusBadge>
            </div>

            <Card>
                <CardHeader className="border-b border-border">
                    <CardTitle className="text-2xl">{detail.topicName}</CardTitle>
                    <div className="flex flex-wrap gap-4 pt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />提交：{formatDateTimeDisplay(detail.submittedAt, "-")}</span>
                        {detail.gradedAt && <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />批改：{formatDateTimeDisplay(detail.gradedAt, "-")}</span>}
                        {detail.graderName && <span className="flex items-center gap-1.5"><User className="h-4 w-4" />教师：{detail.graderName}</span>}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {scores.map(([label, value, weight]) => (
                            <div key={label} className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="mt-1 text-2xl font-bold">{value ?? "-"}</p>
                                <p className="mt-1 text-xs text-muted-foreground">权重 {weight}%</p>
                            </div>
                        ))}
                        <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-center">
                            <p className="text-xs font-medium text-primary">总分</p>
                            <p className={cn("mt-1 text-3xl font-bold", detail.totalScore !== null && detail.totalScore >= 60 ? "text-success" : "text-foreground")}>{detail.totalScore ?? "-"}</p>
                        </div>
                    </div>

                    {detail.teacherComment && (
                        <section className="rounded-xl border border-border bg-muted/30 p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />教师评语</h2>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{detail.teacherComment}</p>
                        </section>
                    )}

                    {detail.rejectReason && (
                        <section className="rounded-xl border border-destructive/20 bg-destructive/10 p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive"><AlertCircle className="h-4 w-4" />驳回理由</h2>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-destructive">{detail.rejectReason}</p>
                            <Link to={`/task/${detail.taskId}/experiment`} className="mt-4 inline-block"><Button>继续修改</Button></Link>
                        </section>
                    )}

                    {!detail.teacherComment && !detail.rejectReason && detail.status === "submitted" && (
                        <p className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">实验已经提交，等待教师批改。</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
