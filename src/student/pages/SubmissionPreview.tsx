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
import { NumericQuestionSummary } from "@/components/questionnaire/NumericQuestionSummary";
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

const SAMPLING_METHOD_LABELS: Record<SamplingMethod, string> = {
    simple: "简单随机抽样",
    systematic: "系统抽样",
    pps: "PPS抽样",
    stratified: "分层抽样",
};

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <Card className="bg-muted border-input">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-control bg-primary-muted text-primary flex items-center justify-center text-label font-bold mt-0.5">
                        {index + 1}
                    </span>
                    <div className="space-y-2 flex-1">
                        <div className="text-label font-medium text-foreground">
                            {question.content}
                        </div>
                        <NumericQuestionSummary question={question} />
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
            </CardContent>
        </Card>
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
        if (!taskId || !experiment) return;
        setConfirmOpen(false);
        setError(null);

        setSubmitting(true);
        try {
            const response = await experimentApi.submit(Number(taskId), experiment.version);
            if (isSubmissionCompleteResponse(response)) {
                navigate(`/task/${taskId}/result`, { replace: true });
            }
            else {
                setError(response.error?.message ?? "提交失败");
                if (response.error?.code === "VERSION_CONFLICT") {
                    const latest = await experimentApi.get(Number(taskId));
                    if (latest.success && latest.data) setExperiment(latest.data);
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

            <Card className="border-primary-border bg-card">
                <div className="absolute top-0 left-0 h-1 w-full bg-primary" />
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
                <CardContent className="pt-6">
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-muted border border-input p-1 w-auto h-auto rounded-surface" data-testid="student-preview-tabs">
                            <TabsTrigger
                                value="report"
                                data-testid="student-preview-tab-report"
                                className="px-6 py-2 rounded-control data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=inactive]:hover:text-foreground transition-none"
                            >
                                实验报告预览
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                data-testid="student-preview-tab-questionnaire"
                                className="px-6 py-2 rounded-control data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=inactive]:hover:text-foreground transition-none"
                            >
                                问卷预览
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-muted rounded-surface p-6 border border-border min-h-[300px] space-y-5">
                                <div className="rounded-surface border border-border bg-card p-4">
                                    <h2 className="text-body font-semibold text-foreground mb-3">阶段一：问卷预试</h2>
                                    <div className="text-label text-foreground space-y-1">
                                        <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                        <p>题目数量：{questionnaireQuestions.length} 题</p>
                                        {questionnaireQuestions.slice(0, 3).map((question, index) => (
                                            <p key={question.id ?? index} className="text-muted-foreground">第 {index + 1} 题：{question.content}</p>
                                        ))}
                                        {questionnaireQuestions.length > 3 && (
                                            <p className="text-meta text-muted-foreground">其余题目见「问卷预览」。</p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-surface border border-border bg-card p-4">
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

                                <div className="rounded-surface border border-border bg-card p-4">
                                    <h2 className="text-body font-semibold text-foreground mb-3">阶段三：抽样执行</h2>
                                    <div className="text-label text-foreground space-y-1">
                                        {samplingMethodRows.map((row) => (
                                            <p key={row.method} data-testid={`student-preview-sampling-${row.method}`}>{row.label}：{row.status}</p>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-surface border border-border bg-card p-4">
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
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-muted rounded-surface p-6 border border-border">
                                {!questionnaire ? (
                                    <div className="text-label text-muted-foreground italic">暂无问卷内容</div>
                                ) : (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-border">
                                            <h2 className="text-section-title font-bold text-foreground mb-2">{questionnaire.title || "未命名问卷"}</h2>
                                            <RichTextContent
                                                html={questionnaire.welcomeText ?? ""}
                                                className="text-label text-muted-foreground bg-card p-3 rounded-surface border border-border"
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
                                                className="text-label text-muted-foreground bg-card p-3 rounded-surface border border-border"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <div className="flex flex-col items-end gap-4 pb-12">
                {!canSubmit && (
                    <div className="text-label text-destructive bg-destructive-muted px-4 py-2 rounded-surface border border-destructive-border flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {submitBlocker}
                    </div>
                )}
                {error && (
                    <div className="text-label text-destructive bg-destructive-muted px-4 py-2 rounded-surface border border-destructive-border">
                        {error}
                    </div>
                )}

                <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || submitting}
                    data-testid="student-preview-submit"
                    className="w-auto h-12 px-8 text-subheading bg-primary hover:bg-primary-hover text-primary-foreground "
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            提交中...
                        </>
                    ) : (
                        <>
                            <Send className="w-5 h-5 mr-2" />
                            确认提交
                        </>
                    )}
                </Button>
            </div>

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
                            disabled={submitting}
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
