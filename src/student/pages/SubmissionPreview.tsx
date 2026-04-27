import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2, CheckCircle2, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
import { RichTextContent } from "@/components/RichTextContent";
import { experimentApi, tasksApi, type ExperimentData, type TaskDetail, type Question } from "../api-client";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { TopicDeletedState } from "../components/TopicDeletedState";
import {
    formatSystematicRange,
    getSystematicAcceptedRange,
} from "../experiment/systematic-sampling";
import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../experiment/sample-plan-display";
import { PPS_UNAVAILABLE_STATUS_MESSAGE } from "../experiment/sampling-messages";
import { getPreviewSubmitBlocker } from "../experiment/preview-submit";
import { ImmersiveReportPreview } from "../components/ImmersiveReportPreview";
import { clearReportDraft } from "../draft-sync";
import { parseDeadline } from "@/utils/format";

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <Card size="sm" className="bg-muted/30">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {index + 1}
                    </span>
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="text-sm font-medium text-foreground">
                            {question.content}
                        </div>
                        {question.type === "boolean" && (
                            <div className="inline-block rounded border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                选项：是 / 否
                            </div>
                        )}
                        {(question.type === "single" || question.type === "multiple") && (
                            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                                {(question.options ?? []).map((opt, i) => (
                                    <li key={`${question.id}-opt-${i}`} className="flex items-center gap-2">
                                        <div className="size-1.5 rounded-full bg-muted-foreground/60" />
                                        {opt}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {question.type === "scale" && (
                            <div className="inline-flex items-center gap-2 rounded border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                                <span>量表范围：{question.scaleMin ?? 1} - {question.scaleMax ?? 10}</span>
                                {(question.scaleMinLabel || question.scaleMaxLabel) && (
                                    <span className="text-muted-foreground">
                                        ({question.scaleMinLabel ?? "Min"} ~ {question.scaleMaxLabel ?? "Max"})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function SubmissionPreview() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState<TaskDetail | null>(null);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accessDeniedVariant, setAccessDeniedVariant] = useState<"topic_deleted" | "task_revoked" | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [showFullPreview, setShowFullPreview] = useState(false);

    useEffect(() => {
        async function loadData() {
            if (!taskId) return;
            setLoading(true);
            setAccessDeniedVariant(null);
            try {
                const [taskRes, expRes] = await Promise.all([
                    tasksApi.get(Number(taskId)),
                    experimentApi.get(Number(taskId)),
                ]);

                if (
                    taskRes.error?.code === "TOPIC_DELETED" ||
                    taskRes.error?.code === "TASK_REVOKED" ||
                    expRes.error?.code === "TOPIC_DELETED" ||
                    expRes.error?.code === "TASK_REVOKED"
                ) {
                    setTask(null);
                    setExperiment(null);
                    const code = taskRes.error?.code ?? expRes.error?.code;
                    setAccessDeniedVariant(code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                    return;
                }

                if (taskRes.success && taskRes.data) {
                    setTask(taskRes.data);
                }
                if (expRes.success && expRes.data) {
                    setExperiment(expRes.data);
                }
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [taskId]);

    const handleSubmit = async () => {
        if (!taskId || !experiment) return;
        setConfirmOpen(false);
        setError(null);

        // Pre-submission deadline check
        if (task?.deadline) {
            const deadlineDate = parseDeadline(task.deadline);
            if (deadlineDate && new Date() > deadlineDate) {
                setError("任务已截止，无法提交");
                return;
            }
        }

        if (!navigator.onLine) {
            setError("网络连接异常，请检查网络后重试");
            return;
        }

        setSubmitting(true);
        try {
            const nonRetryableCodes = new Set([
                "TASK_DEADLINE",
                "ALREADY_GRADED",
                "ALREADY_SUBMITTED",
                "REJECTED_NEED_RESET",
                "INCOMPLETE",
                "REPORT_TOO_SHORT",
                "VERSION_CONFLICT",
                "VALIDATION_ERROR",
            ]);

            const first = await experimentApi.submit(Number(taskId));
            if (first.success || first.error?.code === "ALREADY_SUBMITTED") {
                clearReportDraft(experiment.id);
                navigate("/", { replace: true });
                return;
            }

            if (nonRetryableCodes.has(first.error?.code ?? "")) {
                setError(first.error?.message ?? "提交失败");
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 800));

            const second = await experimentApi.submit(Number(taskId));
            if (second.success || second.error?.code === "ALREADY_SUBMITTED") {
                clearReportDraft(experiment.id);
                navigate("/", { replace: true });
                return;
            }

            setError(second.error?.message ?? first.error?.message ?? "提交失败（已自动重试一次）");
        } catch (e) {
            setError(e instanceof Error ? e.message : "提交失败");
        } finally {
            setSubmitting(false);
        }
    };

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

    if (!task || !experiment) {
        return (
            <div className="mt-20 text-center text-muted-foreground">未找到实验数据</div>
        );
    }

    const questionnaire = experiment.questionnaire;
    const questionnaireQuestions = questionnaire?.questions ?? [];
    const samplePlan = experiment.samplePlan;
    const samplingResults = experiment.samplingResults;
    const reportContent = experiment.reportContent ?? "";
    const reportLength = getRichTextPlainLength(reportContent);
    const submitBlocker = getPreviewSubmitBlocker({
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        populationSize: experiment.populationSize,
    });
    const reportLengthValid = reportLength >= 100 && reportLength <= 5000;
    const canSubmit = submitBlocker === null;
    const systematicAcceptedRange = getSystematicAcceptedRange(samplePlan?.finalSampleSize);
    const systematicSampleCount = samplingResults?.systematic?.sampleCount ?? null;
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);
    const showSystematicSampleNote =
        samplePlan !== null &&
        samplingResults?.systematic?.completed === true &&
        systematicSampleCount !== null &&
        systematicSampleCount !== samplePlan.finalSampleSize;

    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-6" data-testid="student-submission-preview">
            <Button asChild variant="ghost" className="self-start">
                <Link to={`/task/${task.id}/experiment`}>
                    <ArrowLeft data-icon="inline-start" />
                    返回修改
                </Link>
            </Button>

            <Card className="relative">
                <div className="absolute left-0 top-0 h-1 w-full bg-primary/15" />
                <CardHeader className="border-b border-border">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-3 text-2xl text-foreground">
                            <FileText className="size-6 text-primary" />
                            提交前预览
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={() => setShowFullPreview(true)}>
                            <Maximize2 data-icon="inline-start" />
                            全屏预览
                        </Button>
                    </div>
                    <CardDescription>
                        课题：<span className="font-medium text-foreground">{task.name}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="h-auto w-full md:w-auto" data-testid="student-preview-tabs">
                            <TabsTrigger
                                value="report"
                                data-testid="student-preview-tab-report"
                                className="px-6"
                            >
                                实验报告预览
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                data-testid="student-preview-tab-questionnaire"
                                className="px-6"
                            >
                                问卷预览
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="flex min-h-[300px] flex-col gap-5 rounded-lg border border-border bg-muted/30 p-6">
                                <div className="rounded-lg border border-border bg-card/70 p-4">
                                    <h3 className="mb-3 text-base font-semibold text-foreground">阶段一：问卷设计</h3>
                                    <div className="flex flex-col gap-1 text-sm text-foreground/80">
                                        <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                        <p>题目数量：{questionnaireQuestions.length} 题</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-border bg-card/70 p-4">
                                    <h3 className="mb-3 text-base font-semibold text-foreground">阶段二：样本量规划</h3>
                                    {samplePlan ? (
                                        <div className="flex flex-col gap-1 text-sm text-foreground/80">
                                            <p>估计类型：{getEstimationTypeLabel(samplePlan.estimationType)}</p>
                                            {advancedSourceLabel && (
                                                <p>最终样本量来源：{advancedSourceLabel}（高级工具）</p>
                                            )}
                                            <p>置信水平：{samplePlan.confidenceLevel}%</p>
                                            <p>
                                                {getMarginOfErrorLabel(samplePlan.estimationType)}：
                                                {formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}
                                            </p>
                                            {samplePlan.estimationType === "mean" && samplePlan.populationVariance != null && (
                                                <p>总体方差 σ²：{samplePlan.populationVariance}</p>
                                            )}
                                            <p>建议样本量：{samplePlan.recommendedSize}</p>
                                            <p>最终样本量：{samplePlan.finalSampleSize}</p>
                                            {advancedSourceLabel && (
                                                <p className="text-xs text-muted-foreground">
                                                    说明：推荐样本量仍对应常规公式建议，当前最终样本量来自「{advancedSourceLabel}」。
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-sm italic text-muted-foreground">暂无样本量规划数据</div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-border bg-card/70 p-4">
                                    <h3 className="mb-3 text-base font-semibold text-foreground">阶段三：抽样执行</h3>
                                    <div className="flex flex-col gap-1 text-sm text-foreground/80">
                                        <p>简单随机抽样：{samplingResults?.simple?.completed ? `已完成（${samplingResults.simple.sampleCount} 样本）` : "未完成"}</p>
                                        <p>系统抽样：{samplingResults?.systematic?.completed ? `已完成（${samplingResults.systematic.sampleCount} 样本）` : "未完成"}</p>
                                        <p>PPS抽样：{samplingResults?.pps?.unavailable ? PPS_UNAVAILABLE_STATUS_MESSAGE : samplingResults?.pps?.completed ? `已完成（${samplingResults.pps.sampleCount} 样本）` : "未完成"}</p>
                                        <p>分层抽样：{samplingResults?.stratified?.completed ? "已完成" : "未完成"}</p>
                                    </div>
                                    {showSystematicSampleNote && (
                                        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                                            系统抽样样本量受 K 值和随机起点影响，不要求与规划样本量完全一致。
                                            当前结果为 {systematicSampleCount}，规划样本量为 {samplePlan.finalSampleSize}，
                                            允许范围为 {formatSystematicRange(systematicAcceptedRange)}。
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-border bg-card/70 p-4">
                                    <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                                        <FileText className="size-4 text-primary" />
                                        阶段四：分析报告
                                    </h3>
                                    {reportContent ? (
                                        <RichTextContent
                                            html={reportContent}
                                            className="border-l-2 border-border pl-4 text-sm leading-relaxed text-foreground/80"
                                        />
                                    ) : (
                                        <div className="text-sm italic text-muted-foreground">暂无报告内容</div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="rounded-lg border border-border bg-muted/30 p-6">
                                {!questionnaire ? (
                                    <div className="text-sm italic text-muted-foreground">暂无问卷内容</div>
                                ) : (
                                    <div className="flex flex-col gap-6">
                                        <div className="flex flex-col gap-4">
                                            <div className="text-xl font-bold text-foreground">{questionnaire.title || "未命名问卷"}</div>
                                            <RichTextContent
                                                html={questionnaire.welcomeText ?? ""}
                                                className="rounded-lg border border-border bg-card/70 p-3 text-sm text-muted-foreground"
                                            />
                                            <Separator />
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            {questionnaireQuestions.length === 0 ? (
                                                <div className="text-sm text-muted-foreground">暂无题目</div>
                                            ) : (
                                                questionnaireQuestions.map((q, index) => (
                                                    <QuestionPreview key={q.id} question={q} index={index} />
                                                ))
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            <Separator />
                                            <RichTextContent
                                                html={questionnaire.endingText ?? ""}
                                                className="rounded-lg border border-border bg-card/70 p-3 text-sm text-muted-foreground"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <div className="flex flex-col items-end gap-4 pb-12">
                {!canSubmit && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
                        <AlertCircle className="size-4" />
                        {submitBlocker}
                    </div>
                )}
                {error && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
                        {error}
                    </div>
                )}

                <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || submitting}
                    data-testid="student-preview-submit"
                    size="lg"
                    className="w-full md:w-auto"
                >
                    {submitting ? (
                        <>
                            <Loader2 data-icon="inline-start" className="animate-spin" />
                            提交中...
                        </>
                    ) : (
                        <>
                            <Send data-icon="inline-start" />
                            确认提交
                        </>
                    )}
                </Button>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent data-testid="student-preview-submit-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription>
                            提交后将无法修改实验内容。确定现在提交吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleSubmit}
                            disabled={submitting}
                            data-testid="student-preview-submit-confirm"
                        >
                            {submitting ? "提交中..." : "确认提交"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {showFullPreview && (
                <ImmersiveReportPreview
                    experiment={experiment}
                    taskName={task.name}
                    onClose={() => setShowFullPreview(false)}
                />
            )}
        </div>
    );
}

export default SubmissionPreview;
