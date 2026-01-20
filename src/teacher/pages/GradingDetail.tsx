import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    const [weights, setWeights] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

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
            setWeights(res.data.weights ?? { questionnaire: 30, process: 30, report: 40 });
            setRejectReason(res.data.rejectReason ?? "");
        }
        setLoading(false);
    }

    const totalScore = (
        (parseFloat(scores.questionnaire) || 0) * (weights.questionnaire / 100) +
        (parseFloat(scores.process) || 0) * (weights.process / 100) +
        (parseFloat(scores.report) || 0) * (weights.report / 100)
    );

    async function handleSubmit(status: number) { // 2=Graded, 3=Rejected
        if (!submissionId) return;
        if (data?.readonly) return;
        setSaving(true);

        const payload = {
            scoreQuestionnaire: parseFloat(scores.questionnaire) || 0,
            scoreProcess: parseFloat(scores.process) || 0,
            scoreReport: parseFloat(scores.report) || 0,
            totalScore: parseFloat(totalScore.toFixed(2)),
            comment: comment,
            status: status,
            rejectReason: status === 3 ? rejectReason : undefined
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

    const isReadOnly = !!data.readonly;
    const questionnaire = data.questionnaire as any;
    const samplingResults = data.samplingResults as any;

    const renderQuestion = (q: any, index: number) => {
        const title = `${index + 1}. ${q.content ?? ""}`;
        if (q.type === "boolean") {
            return (
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <div className="text-sm text-muted-foreground">是 / 否</div>
                </div>
            );
        }
        if (q.type === "single") {
            return (
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {(q.options ?? []).map((opt: string, i: number) => (
                            <li key={i}>{opt}</li>
                        ))}
                    </ul>
                </div>
            );
        }
        if (q.type === "multiple") {
            return (
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {(q.options ?? []).map((opt: string, i: number) => (
                            <li key={i}>{opt}</li>
                        ))}
                    </ul>
                    {(q.minSelect || q.maxSelect) && (
                        <div className="text-xs text-muted-foreground">选择 {q.minSelect ?? 0} - {q.maxSelect ?? "不限"}</div>
                    )}
                </div>
            );
        }
        if (q.type === "scale") {
            return (
                <div className="space-y-1">
                    <div className="font-medium">{title}</div>
                    <div className="text-sm text-muted-foreground">
                        {q.scaleMinLabel ?? ""} {q.scaleMin ?? 1} - {q.scaleMax ?? 10} {q.scaleMaxLabel ?? ""}
                    </div>
                </div>
            );
        }
        return (
            <div className="space-y-1">
                <div className="font-medium">{title}</div>
                <div className="text-sm text-muted-foreground">未知题型</div>
            </div>
        );
    };

    const renderSamplingPreview = (label: string, dataList: any[] | undefined) => {
        if (!dataList || dataList.length === 0) {
            return <div className="text-sm text-muted-foreground">暂无数据</div>;
        }
        const columns = Object.keys(dataList[0] ?? {}).slice(0, 6);
        return (
            <div className="space-y-2">
                <div className="font-medium">{label}</div>
                <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                {columns.map((c) => (
                                    <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dataList.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-t">
                                    {columns.map((c) => (
                                        <td key={c} className="px-3 py-2 text-muted-foreground">
                                            {String(row[c] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

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
            {isReadOnly && (
                <div className="px-6 py-2 text-sm text-destructive bg-destructive/10 border-b">
                    该作业正在被他人批改中，当前为只读模式。
                </div>
            )}

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
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold">实验报告详情</h3>
                                    {data.reportPdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <ExternalLink className="w-4 h-4" />
                                                    查看PDF
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} download>
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <Download className="w-4 h-4" />
                                                    下载PDF
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="prose max-w-none">
                                    {data.reportContent ? (
                                        <pre className="whitespace-pre-wrap font-sans text-sm">{data.reportContent}</pre>
                                    ) : (
                                        <div className="text-muted-foreground text-center py-12">暂无报告内容</div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="questionnaire" className="bg-white rounded-lg border p-6 min-h-[500px]">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold">问卷设计</h3>
                                    {data.questionnairePdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <ExternalLink className="w-4 h-4" />
                                                    查看PDF
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} download>
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <Download className="w-4 h-4" />
                                                    下载PDF
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {questionnaire && questionnaire.title ? (
                                        <div className="space-y-3">
                                            <div className="font-medium text-lg">{questionnaire.title}</div>
                                            {questionnaire.welcomeText && (
                                                <div className="text-sm text-muted-foreground">{questionnaire.welcomeText}</div>
                                            )}
                                            <div className="space-y-4">
                                                {(questionnaire.questions ?? []).map((q: any, idx: number) => (
                                                    <div key={q.id ?? idx} className="p-3 border rounded-md bg-slate-50">
                                                        {renderQuestion(q, idx)}
                                                    </div>
                                                ))}
                                            </div>
                                            {questionnaire.endingText && (
                                                <div className="text-sm text-muted-foreground">{questionnaire.endingText}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground text-center py-12">未设计问卷</div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="data" className="bg-white rounded-lg border p-6 min-h-[500px]">
                                <h3 className="text-lg font-bold mb-4">样本数据概览</h3>
                                <div className="space-y-6">
                                    {renderSamplingPreview("简单随机抽样", samplingResults?.simple?.data)}
                                    {renderSamplingPreview("系统抽样", samplingResults?.systematic?.data)}
                                    {renderSamplingPreview("分层抽样", samplingResults?.stratified?.data)}
                                </div>
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
                                <Label>问卷设计 ({weights.questionnaire}%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.questionnaire}
                                        onChange={(e) => setScores({ ...scores, questionnaire: e.target.value })}
                                        className="text-right"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-muted-foreground w-6">分</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>实施过程 ({weights.process}%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.process}
                                        onChange={(e) => setScores({ ...scores, process: e.target.value })}
                                        className="text-right"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-muted-foreground w-6">分</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>分析报告 ({weights.report}%)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.report}
                                        onChange={(e) => setScores({ ...scores, report: e.target.value })}
                                        className="text-right"
                                        disabled={saving || isReadOnly}
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
                                    disabled={saving || isReadOnly}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t space-y-2 bg-slate-50">
                        <Button className="w-full" onClick={() => handleSubmit(2)} disabled={saving || isReadOnly}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "确认评分"}
                        </Button>
                        <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setShowRejectModal(true)} disabled={saving || isReadOnly}>
                            <XCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "驳回重做"}
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>驳回理由</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>驳回理由（至少10字）</Label>
                        <Textarea
                            rows={4}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                        />
                    </div>
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowRejectModal(false)}>取消</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (rejectReason.trim().length < 10) {
                                    alert("驳回理由至少10字");
                                    return;
                                }
                                setShowRejectModal(false);
                                handleSubmit(3);
                            }}
                        >
                            确认驳回
                        </Button>
                    </CardFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
