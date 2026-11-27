import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link, Navigate } from "react-router-dom";
import { ArrowLeft, Send, Loader2, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { LoadingStatus } from "@/components/LoadingStatus";
import { PageHeader } from "@/components/PageHeader";
import { experimentApi, tasksApi } from "../api-client";
import type { ExperimentData } from "@/domain/experiment/types";
import type { TaskDetail } from "@/domain/experiment/student-contracts";
import type { Question } from "@/lib/questionnaire-types";
import {
    formatMarginOfError,
    formatSamplePlanNumber,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../experiment/sample-plan-display";
import { PPS_UNAVAILABLE_STATUS_MESSAGE } from "../experiment/sampling-messages";
import { getPreviewSubmitBlocker, isSubmissionCompleteResponse } from "../experiment/preview-submit";
import { ImmersiveReportPreview } from "../components/ImmersiveReportPreview";
import {
    getSamplingMethodState,
    resolveSamplingPolicy,
    SAMPLING_METHODS,
    type SamplingMethod,
} from "@/lib/sampling-policy";
import { getSamplingResultCount } from "../experiment/sampling-results";
import { AnalysisAppendices } from "@/components/AnalysisAppendices";
import { inferTargetUnitFromExperiment, WaveLoopSnapshot } from "@/components/WaveLoopSnapshot";

const SAMPLING_METHOD_LABELS: Record<SamplingMethod, string> = {
    simple: "简单随机抽样",
    systematic: "系统抽样",
    pps: "PPS抽样",
    stratified: "分层抽样",
};

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <div className="border-b border-border py-4 last:border-b-0">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-muted text-meta font-medium tabular-nums text-muted-foreground">
                    {index + 1}
                </span>
                <div className="flex-1 space-y-2">
                    <div className="text-label font-medium text-foreground">
                        {question.content}
                    </div>
                    {question.type === "boolean" && (
                        <div className="inline-block rounded-control bg-muted px-2.5 py-1 text-meta text-muted-foreground">
                            选项：是 / 否
                        </div>
                    )}
                    {(question.type === "single" || question.type === "multiple") && (
                        <ul className="mt-2 space-y-1 text-label text-muted-foreground">
                            {(question.options ?? []).map((opt, i) => (
                                <li key={`${question.id}-opt-${i}`} className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-circle bg-muted-foreground" aria-hidden="true" />
                                    {opt}
                                </li>
                            ))}
                        </ul>
                    )}
                    {question.type === "scale" && (
                        <div className="inline-flex items-center gap-2 rounded-control bg-muted px-3 py-1 text-meta text-muted-foreground">
                            <span>量表范围：{question.scaleMin ?? 1} - {question.scaleMax ?? 10}</span>
                            {(question.scaleMinLabel || question.scaleMaxLabel) && (
                                <span className="text-muted-foreground">
                                    ({question.scaleMinLabel ?? "Min"} ~ {question.scaleMaxLabel ?? "Max"})
                                </span>
                            )}
                        </div>
                    )}
                    {question.type === "numeric" && (
                        <div className="inline-flex flex-wrap items-center gap-2 rounded-control bg-muted px-3 py-1 text-meta text-muted-foreground">
                            <span>数值题{question.unit ? `（单位：${question.unit}）` : ""}</span>
                            <span>小数位：{question.decimalPlaces ?? 0}</span>
                            {(question.numericMin !== undefined || question.numericMax !== undefined) && (
                                <span>范围：[{question.numericMin ?? "-∞"}, {question.numericMax ?? "+∞"}]</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SubmissionPreview() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState<TaskDetail | null>(null);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("提交预览加载失败");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [refreshRequired, setRefreshRequired] = useState(false);
    const [showFullPreview, setShowFullPreview] = useState(false);

    const numericTaskId = Number(taskId);
    const loadData = () => run(async () => {
        const [taskRes, expRes] = await Promise.all([tasksApi.get(numericTaskId), experimentApi.get(numericTaskId)]);
        return { task: requireApiData(taskRes, "任务加载失败"), experiment: requireApiData(expRes, "实验加载失败") };
    }, (data) => { setTask(data.task); setExperiment(data.experiment); });
    useEffect(() => {
        if (Number.isInteger(numericTaskId) && numericTaskId > 0) void loadData();
        return cancel;
    }, [numericTaskId, cancel]);

    const handleSubmit = async () => {
        if (!taskId || !experiment || refreshRequired) return;
        setConfirmOpen(false);
        setError(null);

        setSubmitting(true);
        try {
            const response = await experimentApi.submit(Number(taskId), experiment.version);
            if (isSubmissionCompleteResponse(response)) {
                navigate(`/task/${taskId}/result`, { replace: true });
            }
            else {
                if (response.error?.code === "VERSION_CONFLICT") {
                    setRefreshRequired(true);
                    setError("实验进度已更新，请返回实验页面刷新并确认后再提交。");
                } else {
                    setError(response.error?.message ?? "提交失败");
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
        return <StudentStatusPage title="提交预览" message="无效的任务编号，无法生成预览。" />;
    }
    if (loadError) {
        return <StudentStatusPage title="提交预览" error={{ message: loadError, onRetry: () => void loadData() }} />;
    }
    if (loading) {
        return <LoadingStatus className="py-24" iconClassName="h-8 w-8 text-primary" label="正在加载提交预览" />;
    }

    if (!task || !experiment) return <StudentStatusPage title="提交预览" message="未找到实验数据，请先完成实验各阶段。" />;
    if (experiment.status === "submitted" || experiment.status === "graded") {
        return <Navigate to={`/task/${taskId}/result`} replace />;
    }

    const questionnaire = experiment.questionnaire;
    const questionnaireQuestions = questionnaire?.questions ?? [];
    const samplePlan = experiment.samplePlan;
    const samplingResults = experiment.samplingResults;
    const reportContent = experiment.reportContent ?? "";
    const samplingPolicy = resolveSamplingPolicy(experiment.samplingPolicy);
    const samplingMethodRows = SAMPLING_METHODS.flatMap((method) => {
        const result = samplingResults?.[method];
        const state = getSamplingMethodState(samplingPolicy, method, result);
        if (state === "disabled") return [];
        const status = state === "completed"
            ? `已完成（${getSamplingResultCount(method, result)} 样本）`
            : state === "unavailable"
                ? PPS_UNAVAILABLE_STATUS_MESSAGE
                : state === "unselected"
                    ? "未选择"
                    : "未完成";
        return [{ method, label: SAMPLING_METHOD_LABELS[method], status }];
    });
    const submitBlocker = getPreviewSubmitBlocker({
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        populationSize: experiment.populationSize,
        analysisTarget: experiment.analysisTarget,
        samplingPolicy: experiment.samplingPolicy,
        adjustmentPlan: experiment.adjustmentPlan,
        waves: experiment.waves,
    });
    const canSubmit = submitBlocker === null;
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);
    const previewUnitLabel = inferTargetUnitFromExperiment({
        analysisTarget: experiment.analysisTarget,
        waves: experiment.waves,
        questionnaire,
    });

    return (
        <div className="mx-auto max-w-4xl space-y-5" data-testid="student-submission-preview">
            <div>
                <Button asChild variant="ghost" size="sm" className="-ml-2.5 h-8 gap-1.5 px-2.5">
                    <Link to={`/task/${task.id}/experiment`}>
                        <ArrowLeft className="h-4 w-4" />
                        返回修改
                    </Link>
                </Button>

                <PageHeader border={false} className="mt-1.5">
                    <div className="min-w-0">
                        <h1 className="text-page-title font-medium text-foreground">提交前预览</h1>
                        <p className="mt-1 text-label text-muted-foreground">
                            实验课题：<span className="font-medium text-foreground">{task.name}</span>
                        </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setShowFullPreview(true)}>
                        <Maximize2 className="h-4 w-4" />
                        全屏预览
                    </Button>
                </PageHeader>
            </div>

            <section
                data-testid="student-preview-submit-panel"
                aria-labelledby="preview-submit-heading"
                className="flex flex-wrap items-center justify-between gap-4 rounded-surface border border-border bg-card p-5"
            >
                <div className="min-w-0 flex-1">
                    <h2 id="preview-submit-heading" className="text-subheading font-medium text-foreground">确认内容并提交</h2>
                    <p className="mt-1 text-label text-muted-foreground">提交后内容冻结；教师驳回后，可重开阶段修改。</p>
                    {!canSubmit && (
                        <div className="mt-2.5 flex items-center gap-2 text-label text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{submitBlocker}</span>
                        </div>
                    )}
                    {error && (
                        <div role="alert" data-testid="student-preview-submit-error" className="mt-2.5 text-label text-destructive">
                            {error}
                        </div>
                    )}
                </div>
                <Button
                    variant="default"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || submitting || refreshRequired}
                    data-testid="student-preview-submit"
                    className="shrink-0"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            提交中...
                        </>
                    ) : (
                        <>
                            <Send className="h-4 w-4" aria-hidden="true" />
                            确认提交
                        </>
                    )}
                </Button>
            </section>

            <section aria-labelledby="preview-content-heading" className="rounded-surface border border-border bg-card p-5">
                <div>
                    <h2 id="preview-content-heading" className="text-subheading font-medium text-foreground">提交内容</h2>
                    <p className="mt-1 text-label text-muted-foreground">报告为主要提交内容，问卷与波次轨迹供核对。</p>
                </div>

                <Tabs defaultValue="report" className="mt-4 w-full">
                    <TabsList className="w-full justify-start" data-testid="student-preview-tabs">
                        <TabsTrigger value="report" data-testid="student-preview-tab-report">
                            商业报告与过程摘要
                        </TabsTrigger>
                        {(experiment.waves?.length ?? 0) > 0 && (
                            <TabsTrigger value="waves" data-testid="student-preview-tab-waves">
                                试投质检与二轮调优轨迹
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="questionnaire" data-testid="student-preview-tab-questionnaire">
                            正式轮问卷核对
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="report" className="mt-5">
                        <div className="divide-y divide-border">
                            <div className="pb-4">
                                <h3 className="mb-2 text-body font-medium text-foreground">阶段一：商业问卷设计</h3>
                                <div className="space-y-1 text-label text-foreground">
                                    <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                    <p>题目数量：{questionnaireQuestions.length} 题</p>
                                    {questionnaireQuestions.slice(0, 3).map((question, index) => (
                                        <p key={question.id ?? index} className="text-muted-foreground">第 {index + 1} 题：{question.content}</p>
                                    ))}
                                    {questionnaireQuestions.length > 3 && (
                                        <p className="text-meta text-muted-foreground">其余题目见「正式轮问卷核对」。</p>
                                    )}
                                </div>
                            </div>

                            {(experiment.waves?.length ?? 0) > 0 && (
                                <div className="py-4">
                                    <h3 className="mb-2 text-body font-medium text-foreground">阶段二至三：首轮试投、回收质检与调优决策</h3>
                                    <div className="space-y-1 text-label text-foreground">
                                        <p>已完成波次数：共 {experiment.waves!.length} 轮（含首轮试投及正式调优投放）</p>
                                        {experiment.adjustmentPlan && (
                                            <p className="text-muted-foreground">
                                                调优依据摘要：{experiment.adjustmentPlan.rationale}
                                            </p>
                                        )}
                                        <p className="text-meta text-muted-foreground">完整漏斗、客群结构偏差与森林对比图见「试投质检与二轮调优轨迹」。</p>
                                    </div>
                                </div>
                            )}

                            <div className="py-4">
                                <h3 className="mb-2 text-body font-medium text-foreground">阶段四：正式轮样本量规划</h3>
                                {samplePlan ? (
                                    <div className="space-y-1 text-label text-foreground">
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
                                            <p>
                                                {samplePlan.varianceSource === "wave1_empirical"
                                                    ? "首轮实测样本方差 s²"
                                                    : "抽样框总体方差 σ²"}：{formatSamplePlanNumber(samplePlan.populationVariance)}
                                            </p>
                                        )}
                                        {typeof samplePlan.nonResponseRate === "number" && (
                                            <p>预期无回答率：{Math.round(samplePlan.nonResponseRate * 100)}%</p>
                                        )}
                                        <p>建议样本量：{samplePlan.recommendedSize}</p>
                                        <p>最终样本量：{samplePlan.finalSampleSize}</p>
                                        {advancedSourceLabel && (
                                            <p className="text-meta text-muted-foreground">
                                                说明：推荐样本量仍对应常规公式建议，当前最终样本量来自「{advancedSourceLabel}」。
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-label text-muted-foreground">暂无样本量规划数据</div>
                                )}
                            </div>

                            <div className="py-4">
                                <h3 className="mb-2 text-body font-medium text-foreground">阶段四：正式轮抽样与投放执行</h3>
                                <div className="space-y-1 text-label text-foreground">
                                    {samplingMethodRows.map((row) => (
                                        <p key={row.method} data-testid={`student-preview-sampling-${row.method}`}>{row.label}：{row.status}</p>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4">
                                <h3 className="mb-3 text-body font-medium text-foreground">
                                    阶段五：商务分析与决策报告
                                </h3>
                                {reportContent ? (
                                    <div className="rounded-surface bg-muted p-5">
                                        <RichTextContent
                                            html={reportContent}
                                            className="text-label leading-relaxed text-foreground"
                                        />
                                    </div>
                                ) : (
                                    <div className="text-label text-muted-foreground">暂无报告内容</div>
                                )}
                                <AnalysisAppendices records={experiment.analysisAppendices ?? []} />
                            </div>
                        </div>
                    </TabsContent>

                    {(experiment.waves?.length ?? 0) > 0 && (
                        <TabsContent value="waves" className="mt-5">
                            <WaveLoopSnapshot
                                waves={experiment.waves}
                                adjustmentPlan={experiment.adjustmentPlan}
                                analysisTarget={experiment.analysisTarget}
                                unitLabel={previewUnitLabel}
                                confidenceLevel={samplePlan?.confidenceLevel}
                            />
                        </TabsContent>
                    )}

                    <TabsContent value="questionnaire" className="mt-5">
                        {!questionnaire ? (
                            <div className="rounded-surface bg-muted p-5 text-label text-muted-foreground">暂无问卷内容</div>
                        ) : (
                            <div>
                                <div className="mb-4 border-b border-border pb-4">
                                    <h3 className="mb-2 text-section-title font-medium text-foreground">{questionnaire.title || "未命名问卷"}</h3>
                                    <RichTextContent
                                        html={questionnaire.welcomeText ?? ""}
                                        className="text-label text-muted-foreground"
                                    />
                                </div>

                                <div>
                                    {questionnaireQuestions.length === 0 ? (
                                        <div className="py-4 text-label text-muted-foreground">暂无题目</div>
                                    ) : (
                                        questionnaireQuestions.map((q, index) => (
                                            <QuestionPreview key={q.id} question={q} index={index} />
                                        ))
                                    )}
                                </div>

                                <div className="mt-4 border-t border-border pt-4">
                                    <RichTextContent
                                        html={questionnaire.endingText ?? ""}
                                        className="text-label text-muted-foreground"
                                    />
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </section>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent className="border-border bg-card text-foreground" data-testid="student-preview-submit-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            提交后内容冻结；教师驳回后，可重开阶段修改。确认提交？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleSubmit}
                            disabled={submitting || refreshRequired}
                            data-testid="student-preview-submit-confirm"
                        >
                            {submitting ? "提交中..." : "确认提交"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ImmersiveReportPreview
                open={showFullPreview}
                experiment={experiment}
                taskName={task.name}
                onClose={() => setShowFullPreview(false)}
            />
        </div>
    );
}

export default SubmissionPreview;
