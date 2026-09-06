import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, FileText, Loader2, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { RichTextContent } from "@/components/RichTextContent";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { LoadingStatus } from "@/components/LoadingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    const { loading, error, run, cancel } = useAsyncLoad("实验结果加载失败");
    const numericTaskId = Number(taskId);
    const load = () => run(async () => requireApiData(await submissionsApi.getByTask(numericTaskId), "实验结果加载失败"), setDetail);

    useEffect(() => {
        if (Number.isInteger(numericTaskId) && numericTaskId > 0) void load();
        return cancel;
    }, [numericTaskId, cancel]);
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return <p>无效的任务</p>;
    if (error) return <RequestError message={error} onRetry={() => void load()} />;

    if (loading) return <LoadingStatus className="py-24" iconClassName="h-8 w-8" label="正在加载实验结果" />;
    if (!detail) return <div className="mx-auto max-w-xl rounded-surface border border-border bg-card p-8 text-center text-muted-foreground">{error ?? "未找到提交记录"}</div>;

    const status = statusConfig[detail.status];
    const scoreWeights = [
        ["问卷设计", detail.weights.questionnaire],
        ["实验过程", detail.weights.process],
        ["实验报告", detail.weights.report],
    ] as const;
    const totalLabel = detail.status === "graded" ? detail.totalScore ?? "-" : detail.status === "rejected" ? "待修改" : "待批改";

    return (
        <div className="mx-auto max-w-4xl space-y-6" data-testid="student-submission-detail">
            <div className="flex items-center justify-between gap-4">
                <Button asChild variant="ghost" className="gap-2">
                    <Link to={`/task/${detail.taskId}`}><ArrowLeft className="h-4 w-4" />返回任务</Link>
                </Button>
                <StatusBadge intent={status.intent}>
                    {detail.status === "graded" ? <CheckCircle2 className="h-3.5 w-3.5" /> : detail.status === "rejected" ? <AlertCircle className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5" />}
                    {status.label}
                </StatusBadge>
            </div>

            <Card>
                <CardHeader className="border-b border-border">
                    <CardTitle>
                        <h1 className="text-page-title">{detail.topicName}</h1>
                    </CardTitle>
                    <div className="flex flex-wrap gap-4 pt-2 text-label text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />提交：{formatDateTimeDisplay(detail.submittedAt, "-")}</span>
                        {detail.gradedAt && <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />批改：{formatDateTimeDisplay(detail.gradedAt, "-")}</span>}
                        {detail.graderName && <span className="flex items-center gap-1.5"><User className="h-4 w-4" />教师：{detail.graderName}</span>}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="grid gap-4 grid-cols-4">
                        {scoreWeights.map(([label, weight]) => (
                            <div key={label} className="rounded-surface border border-border bg-muted p-4 text-center">
                                <p className="text-meta text-muted-foreground">{label}</p>
                                <p className="mt-1 text-page-title font-bold">{weight}%</p>
                                <p className="mt-1 text-meta text-muted-foreground">评分权重</p>
                            </div>
                        ))}
                        <div className="rounded-surface border border-primary-border bg-primary-muted p-4 text-center">
                            <p className="text-meta font-medium text-primary">总分</p>
                            <p className={cn("mt-1 font-bold", detail.status === "graded" ? "text-display text-primary" : "text-section-title text-foreground")}>{totalLabel}</p>
                        </div>
                    </div>

                    <section data-testid="student-submission-content" className="rounded-surface border border-border bg-card">
                        <div className="border-b border-border px-5 py-4">
                            <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />提交内容快照</h2>
                            <p className="mt-1 text-meta text-muted-foreground">以下内容固定为本次提交时的版本，不受后续实验模板修改影响。</p>
                        </div>
                        <div className="p-5">
                            <Tabs defaultValue="report">
                                <TabsList className="grid h-auto w-full grid-cols-4">
                                    <TabsTrigger value="report">实验报告</TabsTrigger>
                                    <TabsTrigger value="questionnaire">问卷</TabsTrigger>
                                    <TabsTrigger value="plan">抽样方案</TabsTrigger>
                                    <TabsTrigger value="sampling">抽样结果</TabsTrigger>
                                </TabsList>
                                <TabsContent value="report" className="mt-4 rounded-surface bg-muted p-5">
                                    <RichTextContent html={detail.snapshot.reportContent} className="text-label leading-relaxed" emptyFallback="暂无报告内容" />
                                </TabsContent>
                                <TabsContent value="questionnaire" className="mt-4"><QuestionnaireSnapshot questionnaire={detail.snapshot.questionnaire} /></TabsContent>
                                <TabsContent value="plan" className="mt-4"><SamplePlanSnapshot value={detail.snapshot.samplePlan} populationSize={detail.snapshot.populationSize} /></TabsContent>
                                <TabsContent value="sampling" className="mt-4"><SamplingResultsSnapshot value={detail.snapshot.samplingResults} samplingPolicy={detail.snapshot.samplingPolicy} /></TabsContent>
                            </Tabs>
                        </div>
                    </section>

                    {detail.teacherComment && (
                        <section className="rounded-surface border border-border bg-muted p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-label font-medium"><FileText className="h-4 w-4 text-primary" />教师评语</h2>
                            <p className="whitespace-pre-line text-label leading-relaxed text-foreground">{detail.teacherComment}</p>
                        </section>
                    )}

                    {detail.rejectReason && (
                        <section className="rounded-surface border border-destructive-border bg-destructive-muted p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-label font-medium text-destructive"><AlertCircle className="h-4 w-4" />驳回理由</h2>
                            <p className="whitespace-pre-line text-label leading-relaxed text-destructive">{detail.rejectReason}</p>
                            <Button asChild className="mt-4"><Link to={`/task/${detail.taskId}/experiment`}>继续修改</Link></Button>
                        </section>
                    )}

                    {!detail.teacherComment && !detail.rejectReason && detail.status === "submitted" && (
                        <p className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">实验已经提交，等待教师批改。</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
