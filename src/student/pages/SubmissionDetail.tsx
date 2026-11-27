import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, Clock, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { RichTextContent } from "@/components/RichTextContent";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { LoadingStatus } from "@/components/LoadingStatus";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTimeDisplay } from "@/utils/format";
import { submissionsApi } from "../api-client";
import type { SubmissionDetail } from "@/domain/experiment/student-contracts";
import { AnalysisAppendices } from "@/components/AnalysisAppendices";
import { WaveLoopSnapshot } from "@/components/WaveLoopSnapshot";
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
        <div className="mx-auto max-w-4xl space-y-5" data-testid="student-submission-detail" data-submission-status={detail.status}>
            <div className="flex items-center justify-between gap-4">
                <Button asChild variant="ghost" size="sm" className="-ml-2.5 h-8 gap-1.5 px-2.5">
                    <Link to={`/task/${detail.taskId}`}><ArrowLeft className="h-4 w-4" />返回任务</Link>
                </Button>
            </div>

            <div className="rounded-surface border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h1 className="text-page-title font-medium text-foreground">{detail.topicName}</h1>
                    <StatusBadge intent={status.intent}>
                        {detail.status === "graded" ? (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : detail.status === "rejected" ? (
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {status.label}
                    </StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 rounded-control bg-muted px-3.5 py-2 text-meta tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />提交：{formatDateTimeDisplay(detail.submittedAt, "-")}
                    </span>
                    {detail.gradedAt && (
                        <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />批改：{formatDateTimeDisplay(detail.gradedAt, "-")}
                        </span>
                    )}
                    {detail.graderName && (
                        <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" aria-hidden="true" />教师：{detail.graderName}
                        </span>
                    )}
                </div>
            </div>

            {detail.status === "graded" && (
                <section
                    data-testid="student-submission-scores"
                    aria-labelledby="submission-score-heading"
                    className="rounded-surface border border-border bg-card p-5"
                >
                    <h2 id="submission-score-heading" className="mb-3.5 text-subheading font-medium text-foreground">批改成绩</h2>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
                        {scores.map(([label, value, weight]) => (
                            <div key={label} className="rounded-surface bg-muted p-4">
                                <p className="text-meta text-muted-foreground">{label}</p>
                                <p className="mt-1 text-page-title font-medium tabular-nums text-foreground">{value ?? "—"}</p>
                                <p className="mt-1 text-meta tabular-nums text-muted-foreground">权重 {weight}%</p>
                            </div>
                        ))}
                        <div className="rounded-surface bg-muted p-4">
                            <p className="text-meta font-medium text-muted-foreground">总分</p>
                            <p className="mt-1 text-display font-medium tabular-nums text-primary">{detail.totalScore ?? "—"}</p>
                        </div>
                    </div>
                </section>
            )}

            {detail.rejectReason && (
                <section
                    data-testid="student-submission-rejection"
                    className="rounded-surface border border-destructive-border bg-card p-5"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge intent="destructive">
                                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                已驳回
                            </StatusBadge>
                            <h2 className="text-subheading font-medium text-foreground">需要修改后重新提交</h2>
                        </div>
                        <Button asChild variant="default" size="sm">
                            <Link to={`/task/${detail.taskId}/experiment`}>继续修改</Link>
                        </Button>
                    </div>
                    <p className="mt-3 whitespace-pre-line rounded-control bg-destructive-muted px-4 py-3 text-label leading-relaxed text-destructive">
                        {detail.rejectReason}
                    </p>
                </section>
            )}

            {detail.teacherComment && (
                <section
                    data-testid="student-submission-feedback"
                    className="rounded-surface border border-border bg-card p-5"
                >
                    <h2 className="mb-2 text-subheading font-medium text-foreground">教师评语</h2>
                    <p className="whitespace-pre-line rounded-surface bg-muted p-4 text-label leading-relaxed text-foreground">
                        {detail.teacherComment}
                    </p>
                </section>
            )}

            {!detail.teacherComment && !detail.rejectReason && detail.status === "submitted" && (
                <section
                    data-testid="student-submission-pending"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card px-5 py-4"
                >
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-subheading font-medium text-foreground">已提交，等待教师批改</h2>
                            <StatusBadge intent="warning">待批改</StatusBadge>
                        </div>
                        <p className="text-label text-muted-foreground">批改后显示成绩和评语。</p>
                    </div>
                </section>
            )}

            <section data-testid="student-submission-content" className="rounded-surface border border-border bg-card p-5">
                <div>
                    <h2 className="text-subheading font-medium text-foreground">提交内容快照</h2>
                    <p className="mt-1 text-meta text-muted-foreground">以下为提交时的冻结版本，不受模板后续修改影响。</p>
                </div>
                <Tabs defaultValue="report" className="mt-4">
                    <TabsList className="w-full flex-wrap justify-start">
                        <TabsTrigger value="report">商业决策报告</TabsTrigger>
                        {(detail.snapshot.waves?.length ?? 0) > 0 && (
                            <TabsTrigger value="waves">试投质检与调优闭环</TabsTrigger>
                        )}
                        <TabsTrigger value="questionnaire">问卷</TabsTrigger>
                        <TabsTrigger value="plan">正式轮样本规划</TabsTrigger>
                        <TabsTrigger value="sampling">正式轮抽样结果</TabsTrigger>
                    </TabsList>
                    <TabsContent value="report" className="mt-5 space-y-6">
                        <div className="rounded-surface bg-muted p-5">
                            <RichTextContent html={detail.snapshot.reportContent} className="text-label leading-relaxed text-foreground" emptyFallback="暂无报告内容" />
                        </div>
                        {detail.snapshot.targetMetrics && <div><TargetMetricsPanel target={detail.snapshot.targetMetrics} /></div>}
                        <AnalysisAppendices records={detail.snapshot.analysisAppendices ?? []} />
                    </TabsContent>
                    {(detail.snapshot.waves?.length ?? 0) > 0 && (
                        <TabsContent value="waves" className="mt-5">
                            <WaveLoopSnapshot
                                waves={detail.snapshot.waves}
                                adjustmentPlan={detail.snapshot.adjustmentPlan}
                                analysisTarget={detail.snapshot.targetMetrics?.contract
                                    ? {
                                        target: detail.snapshot.targetMetrics.contract.contract.target,
                                        inferred: detail.snapshot.targetMetrics.contract.inferred,
                                    }
                                    : null}
                                unitLabel={detail.snapshot.targetMetrics?.unit ?? ""}
                                confidenceLevel={detail.snapshot.targetMetrics?.confidenceLevel ?? detail.snapshot.samplePlan?.confidenceLevel}
                            />
                        </TabsContent>
                    )}
                    <TabsContent value="questionnaire" className="mt-5"><QuestionnaireSnapshot questionnaire={detail.snapshot.questionnaire} /></TabsContent>
                    <TabsContent value="plan" className="mt-5"><SamplePlanSnapshot value={detail.snapshot.samplePlan} populationSize={detail.snapshot.populationSize} /></TabsContent>
                    <TabsContent value="sampling" className="mt-5"><SamplingResultsSnapshot value={detail.snapshot.samplingResults} samplingPolicy={detail.snapshot.samplingPolicy} /></TabsContent>
                </Tabs>
            </section>
        </div>
    );
}

export default SubmissionDetailPage;
