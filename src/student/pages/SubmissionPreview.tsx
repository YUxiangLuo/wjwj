import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
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
                    <span className="flex-shrink-0 w-6 h-6 rounded-control bg-primary-muted text-primary flex items-center justify-center text-label font-bold mt-0.5">
                        {index + 1}
                    </span>
                    <div className="space-y-2 flex-1">
                        <div className="text-label font-medium text-foreground">
                            {question.content}
                        </div>
                        {question.type === "boolean" && (
                            <div className="text-meta text-muted-foreground bg-card inline-block px-2 py-1 rounded-control border border-input">
                                选项：是 / 否
                            </div>
                        )}
                        {(question.type === "single" || question.type === "multiple") && (
                            <ul className="text-label text-muted-foreground space-y-1 mt-2">
                                {(question.options ?? []).map((opt, i) => (
                                    <li key={`${question.id}-opt-${i}`} className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-circle bg-input" />
                                        {opt}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {question.type === "scale" && (
                            <div className="text-meta text-muted-foreground bg-card inline-flex items-center gap-2 px-3 py-1.5 rounded-control border border-input">
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
        return <LoadingStatus className="py-24" iconClassName="h-8 w-8 text-info" label="正在加载提交预览" />;
    }

    if (!task || !experiment) return <StudentStatusPage title="提交预览" message="未找到实验数据，请先完成实验各阶段。" />;

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
    });
    const canSubmit = submitBlocker === null;
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);

    return (
        <div className="space-y-6 max-w-4xl mx-auto" data-testid="student-submission-preview">
            <Button asChild variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted">
                <Link to={`/task/${task.id}/experiment`}>
                    <ArrowLeft className="w-4 h-4" />
                    返回修改
                </Link>
            </Button>

            <Card className="border-border bg-card">
                <CardHeader className="border-b border-input pb-4">
                    <div className="flex items-center justify-between">
                        <h1 className="flex items-center gap-3 text-page-title font-semibold text-foreground">
                            <FileText className="w-6 h-6 text-primary" />
                            提交前预览
                        </h1>
                        <Button variant="outline" size="sm" className="border-primary-border bg-primary-muted text-primary hover:bg-primary-muted hover:text-primary" onClick={() => setShowFullPreview(true)}>
                            <Maximize2 className="w-4 h-4 mr-1.5" />
                            全屏预览
                        </Button>
                    </div>
                    <CardDescription className="text-muted-foreground">
                        实验模板：<span className="text-foreground font-medium">{task.name}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <section data-testid="student-preview-submit-panel" aria-labelledby="preview-submit-heading" className="flex flex-wrap items-center justify-between gap-4 rounded-surface bg-primary-muted p-5">
                        <div>
                            <h2 id="preview-submit-heading" className="text-section-title text-foreground">确认内容并提交</h2>
                            <p className="mt-1 text-label text-muted-foreground">提交后内容将冻结，无法再次修改。</p>
                            {!canSubmit && (
                                <div className="mt-3 flex items-center gap-2 text-label text-destructive">
                                    <AlertCircle className="h-4 w-4" />{submitBlocker}
                                </div>
                            )}
                            {error && (
                                <div role="alert" data-testid="student-preview-submit-error" className="mt-3 text-label text-destructive">
                                    {error}
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={() => setConfirmOpen(true)}
                            disabled={!canSubmit || submitting || refreshRequired}
                            data-testid="student-preview-submit"
                            className="h-12 shrink-0 px-8 text-subheading"
                        >
                            {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />提交中...</> : <><Send className="mr-2 h-5 w-5" />确认提交</>}
                        </Button>
                    </section>

                    <section aria-labelledby="preview-content-heading">
                        <div className="mb-4">
                            <h2 id="preview-content-heading" className="text-section-title">提交内容</h2>
                            <p className="mt-1 text-label text-muted-foreground">实验报告是主要提交内容，问卷可作为参考核对。</p>
                        </div>
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-muted border border-input p-1 w-auto h-auto rounded-surface" data-testid="student-preview-tabs">
                            <TabsTrigger
                                value="report"
                                data-testid="student-preview-tab-report"
                                className="px-6 py-2 rounded-control data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=inactive]:hover:text-foreground transition-none"
                            >
                                实验报告
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                data-testid="student-preview-tab-questionnaire"
                                className="px-6 py-2 rounded-control data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=inactive]:hover:text-foreground transition-none"
                            >
                                问卷参考
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="min-h-[300px] rounded-surface bg-muted p-6">
                                <div className="border-b border-border py-4 first:pt-0">
                                    <h2 className="text-body font-semibold text-foreground mb-3">阶段一：问卷预试</h2>
                                    <div className="text-label text-foreground space-y-1">
                                        <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                        <p>题目数量：{questionnaireQuestions.length} 题</p>
                                        {questionnaireQuestions.slice(0, 3).map((question, index) => (
                                            <p key={question.id ?? index} className="text-muted-foreground">第 {index + 1} 题：{question.content}</p>
                                        ))}
                                        {questionnaireQuestions.length > 3 && (
                                            <p className="text-meta text-muted-foreground">其余题目见「问卷参考」。</p>
                                        )}
                                    </div>
                                </div>

                                <div className="border-b border-border py-4">
                                    <h2 className="text-body font-semibold text-foreground mb-3">阶段二：样本量规划</h2>
                                    {samplePlan ? (
                                        <div className="text-label text-foreground space-y-1">
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
                                                <p>总体方差 σ²：{formatSamplePlanNumber(samplePlan.populationVariance)}</p>
                                            )}
                                            <p>建议样本量：{samplePlan.recommendedSize}</p>
                                            <p>最终样本量：{samplePlan.finalSampleSize}</p>
                                            {advancedSourceLabel && (
                                                <p className="text-meta text-warning">
                                                    说明：推荐样本量仍对应常规公式建议，当前最终样本量来自「{advancedSourceLabel}」。
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-label text-muted-foreground italic">暂无样本量规划数据</div>
                                    )}
                                </div>

                                <div className="border-b border-border py-4">
                                    <h2 className="text-body font-semibold text-foreground mb-3">阶段三：抽样执行</h2>
                                    <div className="text-label text-foreground space-y-1">
                                        {samplingMethodRows.map((row) => (
                                            <p key={row.method} data-testid={`student-preview-sampling-${row.method}`}>{row.label}：{row.status}</p>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <h2 className="text-body font-semibold text-foreground mb-3 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-success" />
                                        阶段四：分析报告
                                    </h2>
                                    {reportContent ? (
                                        <RichTextContent
                                            html={reportContent}
                                            className="text-label text-foreground leading-relaxed pl-4 border-l-2 border-input"
                                        />
                                    ) : (
                                        <div className="text-label text-muted-foreground italic">暂无报告内容</div>
                                    )}
                                    <AnalysisAppendices records={experiment.analysisAppendices ?? []} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="rounded-surface bg-muted p-6">
                                {!questionnaire ? (
                                    <div className="text-label text-muted-foreground italic">暂无问卷内容</div>
                                ) : (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-border">
                                            <h2 className="text-section-title font-bold text-foreground mb-2">{questionnaire.title || "未命名问卷"}</h2>
                                            <RichTextContent
                                                html={questionnaire.welcomeText ?? ""}
                                                className="text-label text-muted-foreground"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            {questionnaireQuestions.length === 0 ? (
                                                <div className="text-label text-muted-foreground">暂无题目</div>
                                            ) : (
                                                questionnaireQuestions.map((q, index) => (
                                                    <QuestionPreview key={q.id} question={q} index={index} />
                                                ))
                                            )}
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-border">
                                            <RichTextContent
                                                html={questionnaire.endingText ?? ""}
                                                className="text-label text-muted-foreground"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                    </section>
                </CardContent>
            </Card>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent className="bg-card border-border text-foreground" data-testid="student-preview-submit-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            提交后将无法修改实验内容。确定现在提交吗？
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
