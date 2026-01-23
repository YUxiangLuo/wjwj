import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { experimentApi, tasksApi, type ExperimentData, type TaskDetail, type Question } from "../api-client";
import { cn } from "@/lib/utils";

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold mt-0.5">
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
                                    <span className="text-slate-600">
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

    useEffect(() => {
        async function loadData() {
            if (!taskId) return;
            setLoading(true);
            try {
                const [taskRes, expRes] = await Promise.all([
                    tasksApi.get(Number(taskId)),
                    experimentApi.get(Number(taskId)),
                ]);
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
        setError(null);
        setSubmitting(true);
        try {
            const res = await experimentApi.submit(Number(taskId));
            if (res.success) {
                navigate("/", { replace: true });
            } else {
                setError(res.error?.message ?? "提交失败");
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
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            </div>
        );
    }

    if (!task || !experiment) {
        return (
            <div className="text-center text-slate-500 mt-20">未找到实验数据</div>
        );
    }

    const questionnaire = experiment.questionnaire;
    const questionnaireQuestions = questionnaire?.questions ?? [];
    const reportContent = experiment.reportContent ?? "";
    const reportLengthValid = reportContent.length >= 100 && reportContent.length <= 5000;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Link to={`/task/${task.id}/experiment`}>
                <Button variant="ghost" className="gap-2 text-slate-400 hover:text-white hover:bg-slate-800">
                    <ArrowLeft className="w-4 h-4" />
                    返回修改
                </Button>
            </Link>

            <Card className="border-indigo-500/20 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-400 opacity-20" />
                <CardHeader className="border-b border-slate-700/30 pb-4">
                    <CardTitle className="flex items-center gap-3 text-2xl text-white">
                        <FileText className="w-6 h-6 text-indigo-400" />
                        提交前预览
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        课题：<span className="text-slate-300 font-medium">{task.name}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-slate-800/50 border border-slate-700/30 p-1 w-full md:w-auto h-auto rounded-lg">
                            <TabsTrigger
                                value="report"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all"
                            >
                                实验报告预览
                            </TabsTrigger>
                            <TabsTrigger
                                value="questionnaire"
                                className="px-6 py-2 rounded-md data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-all"
                            >
                                问卷预览
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-white/5 rounded-xl p-6 border border-white/10 min-h-[300px]">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-emerald-400" />
                                    实验报告正文
                                </h3>
                                {reportContent ? (
                                    <div className="whitespace-pre-line break-words text-sm text-slate-300 leading-relaxed pl-4 border-l-2 border-slate-700">
                                        {reportContent}
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500 italic">暂无报告内容</div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="questionnaire" className="mt-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2">
                            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                                {!questionnaire ? (
                                    <div className="text-sm text-slate-500 italic">暂无问卷内容</div>
                                ) : (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-white/10">
                                            <div className="text-xl font-bold text-white mb-2">{questionnaire.title || "未命名问卷"}</div>
                                            <div className="text-sm text-slate-400 whitespace-pre-line bg-slate-900/30 p-3 rounded-lg border border-white/5">
                                                {questionnaire.welcomeText}
                                            </div>
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

                                        <div className="mt-6 pt-4 border-t border-white/10">
                                            <div className="text-sm text-slate-400 whitespace-pre-line bg-slate-900/30 p-3 rounded-lg border border-white/5">
                                                {questionnaire.endingText}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <div className="flex flex-col items-end gap-4 pb-12">
                {!reportLengthValid && (
                    <div className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        报告字数不符合要求（100-5000字），请返回修改。
                    </div>
                )}
                {error && (
                    <div className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
                        {error}
                    </div>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={!reportLengthValid || submitting}
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
        </div>
    );
}

export default SubmissionPreview;
