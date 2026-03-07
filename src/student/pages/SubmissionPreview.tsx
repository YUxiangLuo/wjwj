import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2, CheckCircle2, AlertCircle, Eye } from "lucide-react";
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
import { getRichTextPlainLength } from "@/utils/rich-text";
import { TopicDeletedState } from "../components/TopicDeletedState";
import {
    formatSystematicRange,
    getSystematicAcceptedRange,
} from "../experiment/systematic-sampling";
import { getPreviewSubmitBlocker } from "../experiment/preview-submit";

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center text-sm font-bold mt-0.5">
                        {index + 1}
                    </span>
                    <div className="space-y-2 flex-1">
                        <div className="text-sm font-medium text-slate-200">
                            {question.content}
                        </div>
                        {question.type === "boolean" && (
                            <div className="text-xs text-slate-500 bg-slate-900/40 inline-block px-2 py-1 rounded border border-slate-700/50">
                                选项：是 / 否
                            </div>
                        )}
                        {(question.type === "single" || question.type === "multiple") && (
                            <ul className="text-sm text-slate-400 space-y-1 mt-2">
                                {(question.options ?? []).map((opt, i) => (
                                    <li key={`${question.id}-opt-${i}`} className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                        {opt}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {question.type === "scale" && (
                            <div className="text-xs text-slate-500 bg-slate-900/40 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-slate-700/50">
                                <span>量表范围：{question.scaleMin ?? 1} - {question.scaleMax ?? 10}</span>
                                {(question.scaleMinLabel || question.scaleMaxLabel) && (
                                    <span className="text-slate-500">
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
    const [topicDeleted, setTopicDeleted] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        async function loadData() {
            if (!taskId) return;
            setLoading(true);
            setTopicDeleted(false);
            try {
                const [taskRes, expRes] = await Promise.all([
                    tasksApi.get(Number(taskId)),
                    experimentApi.get(Number(taskId)),
                ]);

                if (taskRes.error?.code === "TOPIC_DELETED" || expRes.error?.code === "TOPIC_DELETED") {
                    setTask(null);
                    setExperiment(null);
                    setTopicDeleted(true);
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
        if (!taskId) return;
        setConfirmOpen(false);
        setError(null);

        // Pre-submission deadline check
        if (task?.deadline) {
            const deadlineDate = new Date(task.deadline.includes("T") ? task.deadline : `${task.deadline}T23:59:00`);
            if (new Date() > deadlineDate) {
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
                <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
            </div>
        );
    }

    if (topicDeleted) {
        return <TopicDeletedState />;
    }

    if (!task || !experiment) {
        return (
            <div className="text-center text-slate-500 mt-20">未找到实验数据</div>
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
    const showSystematicSampleNote =
        samplePlan !== null &&
        samplingResults?.systematic?.completed === true &&
        systematicSampleCount !== null &&
        systematicSampleCount !== samplePlan.finalSampleSize;

    return (
        <div className="space-y-6 max-w-4xl mx-auto" data-testid="student-submission-preview">
            <div className="flex items-center gap-3">
                <Link to={`/task/${task.id}/questionnaire-preview`}>
                    <Button variant="ghost" className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                        <Eye className="w-4 h-4" />
                        返回问卷预览
                    </Button>
                </Link>
                <Link to={`/task/${task.id}/experiment`}>
                    <Button variant="ghost" className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                        <ArrowLeft className="w-4 h-4" />
                        返回修改
                    </Button>
                </Link>
            </div>

            <Card className="border-indigo-500/20 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-400 opacity-20" />
                <CardHeader className="border-b border-slate-700/30 pb-4">
                    <CardTitle className="flex items-center gap-3 text-2xl text-slate-100">
                        <FileText className="w-6 h-6 text-indigo-500" />
                        提交前预览
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        课题：<span className="text-slate-300 font-medium">{task.name}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-slate-800/50 border border-slate-700/30 p-1 w-full md:w-auto h-auto rounded-lg" data-testid="student-preview-tabs">
                            <TabsTrigger
                                value="report"
                                data-testid="student-preview-tab-report"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all"
                            >
                                实验报告预览
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                data-testid="student-preview-tab-questionnaire"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all"
                            >
                                问卷预览
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-800 min-h-[300px] space-y-5">
                                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                                    <h3 className="text-base font-semibold text-slate-100 mb-3">阶段一：问卷设计</h3>
                                    <div className="text-sm text-slate-300 space-y-1">
                                        <p>问卷标题：{questionnaire?.title || "未填写"}</p>
                                        <p>题目数量：{questionnaireQuestions.length} 题</p>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                                    <h3 className="text-base font-semibold text-slate-100 mb-3">阶段二：样本量规划</h3>
                                    {samplePlan ? (
                                        <div className="text-sm text-slate-300 space-y-1">
                                            <p>置信水平：{samplePlan.confidenceLevel}%</p>
                                            <p>允许误差：{samplePlan.marginOfError}%</p>
                                            <p>建议样本量：{samplePlan.recommendedSize}</p>
                                            <p>最终样本量：{samplePlan.finalSampleSize}</p>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-500 italic">暂无样本量规划数据</div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                                    <h3 className="text-base font-semibold text-slate-100 mb-3">阶段三：抽样执行</h3>
                                    <div className="text-sm text-slate-300 space-y-1">
                                        <p>简单随机抽样：{samplingResults?.simple?.completed ? `已完成（${samplingResults.simple.sampleCount} 样本）` : "未完成"}</p>
                                        <p>系统抽样：{samplingResults?.systematic?.completed ? `已完成（${samplingResults.systematic.sampleCount} 样本）` : "未完成"}</p>
                                        <p>分层抽样：{samplingResults?.stratified?.completed ? "已完成" : "未完成"}</p>
                                    </div>
                                    {showSystematicSampleNote && (
                                        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                                            系统抽样样本量受 K 值和随机起点影响，不要求与规划样本量完全一致。
                                            当前结果为 {systematicSampleCount}，规划样本量为 {samplePlan.finalSampleSize}，
                                            允许范围为 {formatSystematicRange(systematicAcceptedRange)}。
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                                    <h3 className="text-base font-semibold text-slate-100 mb-3 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-emerald-600" />
                                        阶段四：分析报告
                                    </h3>
                                    {reportContent ? (
                                        <RichTextContent
                                            html={reportContent}
                                            className="text-sm text-slate-300 leading-relaxed pl-4 border-l-2 border-slate-700"
                                        />
                                    ) : (
                                        <div className="text-sm text-slate-500 italic">暂无报告内容</div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            {/* Link to immersive preview */}
                            <Link
                                to={`/task/${task.id}/questionnaire-preview`}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/15 transition-colors cursor-pointer"
                            >
                                <Eye className="w-4 h-4" />
                                <span className="text-sm font-medium">打开沉浸式问卷预览</span>
                            </Link>

                            <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-800">
                                {!questionnaire ? (
                                    <div className="text-sm text-slate-500 italic">暂无问卷内容</div>
                                ) : (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-slate-800">
                                            <div className="text-xl font-bold text-slate-100 mb-2">{questionnaire.title || "未命名问卷"}</div>
                                            <RichTextContent
                                                html={questionnaire.welcomeText ?? ""}
                                                className="text-sm text-slate-400 bg-slate-900/30 p-3 rounded-lg border border-slate-800"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            {questionnaireQuestions.length === 0 ? (
                                                <div className="text-sm text-slate-500">暂无题目</div>
                                            ) : (
                                                questionnaireQuestions.map((q, index) => (
                                                    <QuestionPreview key={q.id} question={q} index={index} />
                                                ))
                                            )}
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-slate-50/10">
                                            <RichTextContent
                                                html={questionnaire.endingText ?? ""}
                                                className="text-sm text-slate-400 bg-slate-900/30 p-3 rounded-lg border border-slate-50/5"
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
                    <div className="text-sm text-red-600 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {submitBlocker}
                    </div>
                )}
                {error && (
                    <div className="text-sm text-red-600 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
                        {error}
                    </div>
                )}

                <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || submitting}
                    data-testid="student-preview-submit"
                    className="w-full md:w-auto h-12 px-8 text-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
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
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200" data-testid="student-preview-submit-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            提交后将无法修改实验内容。确定现在提交吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={handleSubmit}
                            disabled={submitting}
                            data-testid="student-preview-submit-confirm"
                        >
                            {submitting ? "提交中..." : "确认提交"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default SubmissionPreview;
