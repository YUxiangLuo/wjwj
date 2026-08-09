import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextContent } from "@/components/RichTextContent";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { teacherApi, type SubmissionDetail } from "../api-client";

export function GradingDetail() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [scores, setScores] = useState({ questionnaire: "0", process: "0", report: "0" });
    const [comment, setComment] = useState("");
    const id = Number(submissionId);
    const load = async () => {
        setLoading(true);
        const response = await teacherApi.getSubmissionDetail(id);
        if (response.success && response.data) {
            setData(response.data);
            setScores({ questionnaire: String(response.data.scoreQuestionnaire ?? 0), process: String(response.data.scoreProcess ?? 0), report: String(response.data.scoreReport ?? 0) });
            setComment(response.data.teacherComment ?? "");
            setRejectReason(response.data.rejectReason ?? "");
        } else toast.error(response.error?.message ?? "加载失败");
        setLoading(false);
    };
    useEffect(() => {
        if (!Number.isInteger(id) || id <= 0) {
            setData(null);
            setLoading(false);
            return;
        }
        void load();
    }, [id]);
    const weights = data?.weights ?? { questionnaire: 30, process: 30, report: 40 };
    const total = useMemo(() => (
        (Number(scores.questionnaire) || 0) * weights.questionnaire
        + (Number(scores.process) || 0) * weights.process
        + (Number(scores.report) || 0) * weights.report
    ) / 100, [scores, weights]);
    const grade = async () => {
        if (!data) return;
        setSaving(true);
        const response = await teacherApi.submitGrade(id, data.version, {
            scoreQuestionnaire: Number(scores.questionnaire),
            scoreProcess: Number(scores.process),
            scoreReport: Number(scores.report),
            comment,
        });
        setSaving(false);
        if (!response.success) {
            toast.error(response.error?.message ?? "评分失败");
            if (response.error?.code === "VERSION_CONFLICT") void load();
            return;
        }
        toast.success("评分已保存");
        navigate("/grading");
    };
    const reject = async () => {
        if (!data) return;
        const response = await teacherApi.rejectSubmission(id, data.version, rejectReason);
        if (!response.success) {
            toast.error(response.error?.message ?? "驳回失败");
            if (response.error?.code === "VERSION_CONFLICT") void load();
            return;
        }
        toast.success("已驳回，学生可修改后重交");
        navigate("/grading");
    };
    if (loading) return <p className="py-12 text-center text-muted-foreground">加载中...</p>;
    if (!data) return <p className="py-12 text-center text-muted-foreground">未找到提交记录</p>;
    const canGrade = data.status === "submitted" || data.status === "graded";
    const scoreLabels = {
        questionnaire: `问卷设计（${weights.questionnaire}%）`,
        process: `实验过程（${weights.process}%）`,
        report: `实验报告（${weights.report}%）`,
    };
    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => navigate("/grading")}><ArrowLeft className="mr-2 h-4 w-4" />返回列表</Button>
                <StatusBadge intent={data.status === "graded" ? "success" : data.status === "rejected" ? "destructive" : "warning"}>
                    {data.status === "graded" ? "已批改" : data.status === "rejected" ? "已驳回" : "待批改"}
                </StatusBadge>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>
                        <h2>{data.studentName} · {data.topic}</h2>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{data.className} · {data.studentId}</p>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="questionnaire">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="questionnaire">问卷</TabsTrigger>
                            <TabsTrigger value="plan">方案</TabsTrigger>
                            <TabsTrigger value="sampling">抽样结果</TabsTrigger>
                            <TabsTrigger value="report">报告</TabsTrigger>
                        </TabsList>
                        <TabsContent value="questionnaire" className="mt-4"><QuestionnaireSnapshot questionnaire={data.questionnaire} /></TabsContent>
                        <TabsContent value="plan" className="mt-4"><SamplePlanSnapshot value={data.samplePlan} populationSize={data.populationSize} /></TabsContent>
                        <TabsContent value="sampling" className="mt-4"><SamplingResultsSnapshot value={data.samplingResults} /></TabsContent>
                        <TabsContent value="report" className="mt-4 rounded-xl border border-border p-5"><RichTextContent html={data.reportContent} /></TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
            {data.status === "rejected" ? (
                <Card className="border-destructive/30">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" />驳回理由</CardTitle></CardHeader>
                    <CardContent><p className="whitespace-pre-wrap text-sm">{data.rejectReason}</p></CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" />评分</CardTitle></CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {(["questionnaire", "process", "report"] as const).map((key) => {
                                const inputId = `grading-score-${key}`;
                                return (
                                    <div key={key}>
                                        <Label htmlFor={inputId}>{scoreLabels[key]}</Label>
                                        <Input
                                            id={inputId}
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={scores[key]}
                                            disabled={!canGrade}
                                            onChange={(event) => setScores({ ...scores, [key]: event.target.value })}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div>
                            <Label htmlFor="grading-comment">教师评语</Label>
                            <Textarea id="grading-comment" rows={4} value={comment} disabled={!canGrade} onChange={(event) => setComment(event.target.value)} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-4">
                            <p>加权总分：<span className="text-2xl font-bold text-primary">{total.toFixed(2)}</span></p>
                            <div className="flex gap-2">
                                {data.status === "submitted" && <Button variant="destructive" onClick={() => setRejectOpen(true)}>驳回修改</Button>}
                                <Button disabled={!canGrade || saving} onClick={() => void grade()}>{saving ? "保存中..." : data.status === "graded" ? "更新评分" : "提交评分"}</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>驳回实验</DialogTitle>
                        <DialogDescription>说明需要修改的内容；学生重新提交后原评分和驳回状态会被清除。</DialogDescription>
                    </DialogHeader>
                    <div>
                        <Label htmlFor="grading-reject-reason">请说明需要修改的内容</Label>
                        <Textarea id="grading-reject-reason" rows={5} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
                        <Button variant="destructive" disabled={rejectReason.trim().length < 5} onClick={() => void reject()}>确认驳回</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
