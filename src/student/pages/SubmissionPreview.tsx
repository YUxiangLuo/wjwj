import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { experimentApi, tasksApi, type ExperimentData, type TaskDetail, type Question } from "../api-client";

function QuestionPreview({ question, index }: { question: Question; index: number }) {
    return (
        <div className="space-y-2">
            <div className="text-sm font-medium">
                Q{index + 1}. {question.content}
            </div>
            {question.type === "boolean" && (
                <div className="text-sm text-muted-foreground">选项：是 / 否</div>
            )}
            {(question.type === "single" || question.type === "multiple") && (
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                    {(question.options ?? []).map((opt, i) => (
                        <li key={`${question.id}-opt-${i}`}>{opt}</li>
                    ))}
                </ul>
            )}
            {question.type === "scale" && (
                <div className="text-sm text-muted-foreground">
                    量表：{question.scaleMin ?? 1} - {question.scaleMax ?? 10}
                    {question.scaleMinLabel ? `（${question.scaleMinLabel}` : ""}
                    {question.scaleMaxLabel ? ` ~ ${question.scaleMaxLabel}）` : question.scaleMinLabel ? "）" : ""}
                </div>
            )}
        </div>
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
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!task || !experiment) {
        return (
            <div className="text-center text-muted-foreground">未找到实验数据</div>
        );
    }

    const questionnaire = experiment.questionnaire;
    const reportContent = experiment.reportContent ?? "";
    const reportLengthValid = reportContent.length >= 100 && reportContent.length <= 5000;

    return (
        <div className="space-y-6">
            <Link to={`/task/${task.id}/experiment`}>
                <Button variant="ghost" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    返回修改
                </Button>
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        提交前预览
                    </CardTitle>
                    <CardDescription>
                        课题：{task.name}
                    </CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="report">
                <TabsList>
                    <TabsTrigger value="report">实验报告预览</TabsTrigger>
                    <TabsTrigger value="questionnaire">问卷预览</TabsTrigger>
                </TabsList>

                <TabsContent value="report" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>实验报告</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {reportContent ? (
                                <div className="whitespace-pre-line text-sm text-muted-foreground">
                                    {reportContent}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">暂无报告内容</div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="questionnaire" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>问卷信息</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!questionnaire ? (
                                <div className="text-sm text-muted-foreground">暂无问卷内容</div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <div className="text-lg font-semibold">{questionnaire.title || "未命名问卷"}</div>
                                        <div className="text-sm text-muted-foreground whitespace-pre-line">
                                            {questionnaire.welcomeText}
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {questionnaire.questions.map((q, index) => (
                                            <QuestionPreview key={q.id} question={q} index={index} />
                                        ))}
                                    </div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-line">
                                        {questionnaire.endingText}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {!reportLengthValid && (
                <div className="text-sm text-destructive">报告字数不符合要求（100-5000字），请返回修改。</div>
            )}
            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex justify-end">
                <Button onClick={handleSubmit} disabled={!reportLengthValid || submitting}>
                    {submitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            提交中...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            确认提交
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default SubmissionPreview;
