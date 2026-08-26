import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { experimentApi, tasksApi, type ExperimentData, type TaskDetail, type Question } from "../api-client";
import { TopicDeletedState } from "../components/TopicDeletedState";
import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../experiment/sample-plan-display";
import { PPS_UNAVAILABLE_STATUS_MESSAGE } from "../experiment/sampling-messages";
import { getPreviewSubmitBlocker, isSubmissionCompleteResponse } from "../experiment/preview-submit";
import { ImmersiveReportPreview } from "../components/ImmersiveReportPreview";

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <Card className="bg-muted/50 border-input/50">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold mt-0.5">
                        {index + 1}
                    </span>
                    <div className="space-y-2 flex-1">
                        <div className="text-sm font-medium text-foreground">
                            {question.content}
                        </div>
                        {question.type === "boolean" && (
                            <div className="text-xs text-muted-foreground bg-card/40 inline-block px-2 py-1 rounded border border-input/50">
                                选项：是 / 否
                            </div>
                        )}
                        {(question.type === "single" || question.type === "multiple") && (
                            <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                                {(question.options ?? []).map((opt, i) => (
                                    <li key={`${question.id}-opt-${i}`} className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                                        {opt}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {question.type === "scale" && (
                            <div className="text-xs text-muted-foreground bg-card/40 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-input/50">
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-info" />
            </div>
        );
    }

    if (accessDeniedVariant) {
        return <TopicDeletedState variant={accessDeniedVariant} />;
    }

    if (!task || !experiment) {
        return (
            <div className="text-center text-muted-foreground mt-20">未找到实验数据</div>
        );
    }

    const questionnaire = experiment.questionnaire;
    const questionnaireQuestions = questionnaire?.questions ?? [];
    const samplePlan = experiment.samplePlan;
    const samplingResults = experiment.samplingResults;
    const reportContent = experiment.reportContent ?? "";
    const submitBlocker = getPreviewSubmitBlocker({
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        populationSize: experiment.populationSize,
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

            <Card className="border-primary/20 bg-card/40 backdrop-blur-xl shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-info opacity-20" />
                <CardHeader className="border-b border-input/30 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-3 text-2xl text-foreground">
                            <FileText className="w-6 h-6 text-primary" />
                            提交前预览
                        </CardTitle>
                        <Button variant="outline" size="sm" className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary" onClick={() => setShowFullPreview(true)}>
                            <Maximize2 className="w-4 h-4 mr-1.5" />
                            全屏预览
                        </Button>
                    </div>
                    <CardDescription className="text-muted-foreground">
                        课题：<span className="text-foreground/90 font-medium">{task.name}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-muted/50 border border-input/30 p-1 w-auto h-auto rounded-lg" data-testid="student-preview-tabs">
                            <TabsTrigger
                                value="report"
                                data-testid="student-preview-tab-report"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground transition-all"
                            >
                                实验报告预览
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                data-testid="student-preview-tab-questionnaire"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground transition-all"
                            >
                                问卷预览
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-muted/30 rounded-xl p-6 border border-border min-h-[300px] space-y-5">
                                <div className="rounded-lg border border-border bg-card/30 p-4">
                                    <h3 className="text-base font-semibold text-foreground mb-3">阶段一：问卷设计</h3>
                                    <div className="text-sm text-foreground/90 space-y-1">
                                        <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                        <p>题目数量：{questionnaireQuestions.length} 题</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-border bg-card/30 p-4">
                                    <h3 className="text-base font-semibold text-foreground mb-3">阶段二：样本量规划</h3>
                                    {samplePlan ? (
                                        <div className="text-sm text-foreground/90 space-y-1">
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
                                                <p className="text-xs text-warning">
                                                    说明：推荐样本量仍对应常规公式建议，当前最终样本量来自「{advancedSourceLabel}」。
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground italic">暂无样本量规划数据</div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-border bg-card/30 p-4">
                                    <h3 className="text-base font-semibold text-foreground mb-3">阶段三：抽样执行</h3>
                                    <div className="text-sm text-foreground/90 space-y-1">
                                        <p>简单随机抽样：{samplingResults?.simple?.completed ? `已完成（${samplingResults.simple.sampleCount} 样本）` : "未完成"}</p>
                                        <p>系统抽样：{samplingResults?.systematic?.completed ? `已完成（${samplingResults.systematic.sampleCount} 样本）` : "未完成"}</p>
                                        <p>PPS抽样：{samplingResults?.pps?.unavailable ? PPS_UNAVAILABLE_STATUS_MESSAGE : samplingResults?.pps?.completed ? `已完成（${samplingResults.pps.sampleCount} 样本）` : "未完成"}</p>
                                        <p>分层抽样：{samplingResults?.stratified?.completed ? "已完成" : "未完成"}</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-border bg-card/30 p-4">
                                    <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-success" />
                                        阶段四：分析报告
                                    </h3>
                                    {reportContent ? (
                                        <RichTextContent
                                            html={reportContent}
                                            className="text-sm text-foreground/90 leading-relaxed pl-4 border-l-2 border-input"
                                        />
                                    ) : (
                                        <div className="text-sm text-muted-foreground italic">暂无报告内容</div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-muted/30 rounded-xl p-6 border border-border">
                                {!questionnaire ? (
                                    <div className="text-sm text-muted-foreground italic">暂无问卷内容</div>
                                ) : (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-border">
                                            <div className="text-xl font-bold text-foreground mb-2">{questionnaire.title || "未命名问卷"}</div>
                                            <RichTextContent
                                                html={questionnaire.welcomeText ?? ""}
                                                className="text-sm text-muted-foreground bg-card/30 p-3 rounded-lg border border-border"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            {questionnaireQuestions.length === 0 ? (
                                                <div className="text-sm text-muted-foreground">暂无题目</div>
                                            ) : (
                                                questionnaireQuestions.map((q, index) => (
                                                    <QuestionPreview key={q.id} question={q} index={index} />
                                                ))
                                            )}
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-border">
                                            <RichTextContent
                                                html={questionnaire.endingText ?? ""}
                                                className="text-sm text-muted-foreground bg-card/30 p-3 rounded-lg border border-border/60"
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
                    <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg border border-destructive/20 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {submitBlocker}
                    </div>
                )}
                {error && (
                    <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg border border-destructive/20">
                        {error}
                    </div>
                )}

                <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || submitting}
                    data-testid="student-preview-submit"
                    className="w-auto h-12 px-8 text-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
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
                        <AlertDialogCancel className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
