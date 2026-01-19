import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Save, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// import { Toaster, toast } from "sonner";
import { teacherApi, type SubmissionDetail } from "../api-client";

export function GradingDetail() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Grading Form State
    const [scores, setScores] = useState({
        questionnaire: "0",
        process: "0",
        report: "0"
    });
    const [comment, setComment] = useState("");

    useEffect(() => {
        if (!submissionId) return;
        loadDetail(Number(submissionId));
    }, [submissionId]);

    async function loadDetail(id: number) {
        setLoading(true);
        const res = await teacherApi.getSubmissionDetail(id);
        if (res.success && res.data) {
            setData(res.data);
            setScores({
                questionnaire: String(res.data.scoreQuestionnaire ?? 0),
                process: String(res.data.scoreProcess ?? 0),
                report: String(res.data.scoreReport ?? 0),
            });
            setComment(res.data.teacherComment ?? "");
        }
        setLoading(false);
    }

    const totalScore = (
        (parseFloat(scores.questionnaire) || 0) +
        (parseFloat(scores.process) || 0) +
        (parseFloat(scores.report) || 0)
    ) / 3;

    async function handleSubmit(status: number) { // 2=Graded, 3=Rejected
        if (!submissionId) return;
        setSaving(true);

        const payload = {
            scoreQuestionnaire: parseFloat(scores.questionnaire) || 0,
            scoreProcess: parseFloat(scores.process) || 0,
            scoreReport: parseFloat(scores.report) || 0,
            totalScore: parseFloat(totalScore.toFixed(2)),
            comment: comment,
            status: status
        };

        const res = await teacherApi.submitGrade(Number(submissionId), payload);

        setSaving(false);
        if (res.success) {
            // Toast success
            alert("提交成功"); // Replace with toast if available
            navigate("/grading");
        } else {
            alert("提交失败: " + res.error?.message);
        }
    }

    if (loading) return <div className="p-8 text-center">加载中...</div>;
    if (!data) return <div className="p-8 text-center">未找到提交记录</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 bg-background border-b shrink-0">
                <Button variant="ghost" size="sm" onClick={() => navigate("/grading")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div>
                    <h2 className="text-lg font-semibold">{data.topic}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{data.studentName} ({data.studentId})</span>
                        <span>·</span>
                        <span>{data.className}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Badge variant={data.status === 2 ? "default" : "secondary"}>
                        {data.status === 1 ? "待批改" : data.status === 2 ? "已批改" : data.status === 3 ? "已驳回" : "草稿"}
                    </Badge>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Submission Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <Card className="min-h-full shadow-sm border-0 bg-transparent">
                        <Tabs defaultValue="report">
                            <TabsList className="mb-4">
                                <TabsTrigger value="report">实验报告</TabsTrigger>
                                <TabsTrigger value="questionnaire">调查问卷</TabsTrigger>
                                <TabsTrigger value="data">样本数据</TabsTrigger>
                            </TabsList>

                            <TabsContent value="report" className="bg-white rounded-lg border p-6 min-h-[500px]">
                                <h3 className="text-lg font-bold mb-4">实验报告详情</h3>
                                <div className="prose max-w-none">
                                    {data.reportContent ? (
                                        <pre className="whitespace-pre-wrap font-sans text-sm">{data.reportContent}</pre>
                                    ) : (
                                        <div className="text-muted-foreground text-center py-12">暂无报告内容</div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="questionnaire" className="bg-white rounded-lg border p-6 min-h-[500px]">
                                <h3 className="text-lg font-bold mb-4">问卷设计</h3>
                                <div className="space-y-4">
                                    {data.questionnaire && data.questionnaire.title ? (
                                        <div>
                                            <div className="font-medium text-lg mb-2">{data.questionnaire.title}</div>
                                            {/* Render questions mock */}
                                            <div className="p-4 border rounded bg-slate-50 text-sm text-muted-foreground">
                                                Mock Question Content...
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground text-center py-12">未设计问卷</div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="data" className="bg-white rounded-lg border p-6 min-h-[500px]">
                                <h3 className="text-lg font-bold mb-4">样本数据概览</h3>
                                <div className="text-muted-foreground text-center py-12">功能开发中...</div>
                            </TabsContent>
                        </Tabs>
                    </Card>
                </div>

                {/* Right: Grading Form */}
                <div className="w-80 bg-background border-l shrink-0 flex flex-col">
                    <div className="p-4 border-b font-medium">评分</div>
                    <div className="flex-1 p-4 overflow-y-auto">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>问卷设计 (30%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.questionnaire}
                                        onChange={(e) => setScores({ ...scores, questionnaire: e.target.value })}
                                        className="text-right"
                                    />
                                    <span className="text-sm text-muted-foreground w-6">分</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>实施过程 (30%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.process}
                                        onChange={(e) => setScores({ ...scores, process: e.target.value })}
                                        className="text-right"
                                    />
                                    <span className="text-sm text-muted-foreground w-6">分</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>分析报告 (40%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.report}
                                        onChange={(e) => setScores({ ...scores, report: e.target.value })}
                                        className="text-right"
                                    />
                                    <span className="text-sm text-muted-foreground w-6">分</span>
                                </div>
                            </div>

                            <Separator />

                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                                <span className="font-semibold">总分</span>
                                <span className="text-2xl font-bold text-primary">{totalScore.toFixed(1)}</span>
                            </div>

                            <div className="space-y-2">
                                <Label>教师评语</Label>
                                <Textarea
                                    rows={5}
                                    placeholder="输入评语..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t space-y-2 bg-slate-50">
                        <Button className="w-full" onClick={() => handleSubmit(2)} disabled={saving}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "确认评分"}
                        </Button>
                        <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => handleSubmit(3)} disabled={saving}>
                            <XCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "驳回重做"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
