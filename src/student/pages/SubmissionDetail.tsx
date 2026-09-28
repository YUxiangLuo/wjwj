import { StudentStatusPage } from "../components/StudentStatusPage";
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
import { formatDateTimeDisplay } from "@/utils/format";
import { submissionsApi } from "../api-client";
import type { SubmissionDetail } from "@/domain/experiment/student-contracts";
import { AnalysisAppendices } from "@/components/AnalysisAppendices";
import { TargetMetricsPanel } from "../components/TargetMetricsPanel";

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
    // 整页状态（无效编号 / 加载失败 / 记录不存在）都带一级标题与出口：见 StudentStatusPage 注释。
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
        return <StudentStatusPage title="实验结果" message="无效的任务编号，无法显示实验结果。" />;
    }
    if (error) {
        return <StudentStatusPage title="实验结果" error={{ message: error, onRetry: () => void load() }} />;
    }

    if (loading) return <LoadingStatus className="py-24" iconClassName="h-8 w-8" label="正在加载实验结果" />;
    if (!detail) return <StudentStatusPage title="实验结果" message="未找到提交记录，可能尚未提交或记录已被删除。" />;

    const status = statusConfig[detail.status];
    const scores = [
        ["问卷设计", detail.scoreQuestionnaire, detail.weights.questionnaire],
        ["实验过程", detail.scoreProcess, detail.weights.process],
        ["实验报告", detail.scoreReport, detail.weights.report],
    ] as const;
    return (
        <div className="mx-auto max-w-4xl space-y-6" data-testid="student-submission-detail" data-submission-status={detail.status}>
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
                    {detail.status === "graded" && (
                        <section data-testid="student-submission-scores" aria-labelledby="submission-score-heading">
                            <h2 id="submission-score-heading" className="mb-3 text-section-title">批改成绩</h2>
                            <div className="grid grid-cols-4 gap-3">
                                {scores.map(([label, value, weight]) => (
                                    <div key={label} className="rounded-surface bg-muted p-4 text-center">
                                        <p className="text-meta text-muted-foreground">{label}</p>
                                        <p className="mt-1 text-page-title font-bold">{value ?? "—"}</p>
                                        <p className="mt-1 text-meta text-muted-foreground">权重 {weight}%</p>
                                    </div>
                                ))}
                                <div className="rounded-surface bg-primary-muted p-4 text-center">
                                    <p className="text-meta font-medium text-primary">总分</p>
                                    <p className="mt-1 text-display font-bold text-primary">{detail.totalScore ?? "—"}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {detail.rejectReason && (
                        <section data-testid="student-submission-rejection" className="rounded-surface border border-destructive-border bg-destructive-muted p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-section-title text-destructive"><AlertCircle className="h-5 w-5" />需要修改后重新提交</h2>
                            <p className="whitespace-pre-line text-label leading-relaxed text-destructive">{detail.rejectReason}</p>
                            <Button asChild className="mt-4"><Link to={`/task/${detail.taskId}/experiment`}>继续修改</Link></Button>
                        </section>
                    )}

                    {detail.teacherComment && (
                        <section data-testid="student-submission-feedback" className="rounded-surface bg-muted p-5">
                            <h2 className="mb-2 flex items-center gap-2 text-section-title"><FileText className="h-4 w-4 text-primary" />教师评语</h2>
                            <p className="whitespace-pre-line text-label leading-relaxed text-foreground">{detail.teacherComment}</p>
                        </section>
                    )}

                    {!detail.teacherComment && !detail.rejectReason && detail.status === "submitted" && (
                        <section data-testid="student-submission-pending" className="rounded-surface bg-warning-muted p-4">
                            <h2 className="text-label font-medium text-warning">已提交，等待教师批改</h2>
                            <p className="mt-1 text-label text-muted-foreground">批改后显示成绩和评语。</p>
                        </section>
                    )}

                    <section data-testid="student-submission-content" className="border-t border-border pt-6">
                        <div className="border-b border-border px-5 py-4">
                            <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />提交内容快照</h2>
                            <p className="mt-1 text-meta text-muted-foreground">以下为提交时的冻结版本，不受模板后续修改影响。</p>
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
                                    {detail.snapshot.targetMetrics && <div className="mt-6"><TargetMetricsPanel target={detail.snapshot.targetMetrics} /></div>}
                                    <AnalysisAppendices records={detail.snapshot.analysisAppendices ?? []} />
                                </TabsContent>
                                <TabsContent value="questionnaire" className="mt-4"><QuestionnaireSnapshot questionnaire={detail.snapshot.questionnaire} /></TabsContent>
                                <TabsContent value="plan" className="mt-4"><SamplePlanSnapshot value={detail.snapshot.samplePlan} populationSize={detail.snapshot.populationSize} /></TabsContent>
                                <TabsContent value="sampling" className="mt-4"><SamplingResultsSnapshot value={detail.snapshot.samplingResults} samplingPolicy={detail.snapshot.samplingPolicy} /></TabsContent>
                            </Tabs>
                        </div>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
