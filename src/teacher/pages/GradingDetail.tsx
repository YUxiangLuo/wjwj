import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, CheckCircle, XCircle, FileText, BarChart3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
            alert("提交成功");
            navigate("/grading");
        } else {
            alert("提交失败: " + res.error?.message);
        }
    }

    if (loading) return <div className="p-12 text-center text-slate-500">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-slate-500">未找到提交记录</div>;

    const isReadOnly = !!data.readonly;
    const questionnaire = data.questionnaire as any;
    const samplingResults = data.samplingResults as any;

    const renderQuestion = (q: any, index: number) => {
        const title = `${index + 1}. ${q.content ?? ""}`;
        let content = null;

        if (q.type === "boolean") {
            content = <div className="text-sm text-slate-400 pl-4 border-l-2 border-slate-700 mt-2">是 / 否</div>;
        } else if (q.type === "single" || q.type === "multiple") {
            content = (
                <ul className="list-disc list-inside text-sm text-slate-400 pl-4 border-l-2 border-slate-700 mt-2 space-y-1">
                    {(q.options ?? []).map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                    ))}
                </ul>
            );
        } else if (q.type === "scale") {
            content = (
                <div className="text-sm text-slate-400 pl-4 border-l-2 border-slate-700 mt-2">
                    {q.scaleMinLabel ?? ""} {q.scaleMin ?? 1} - {q.scaleMax ?? 10} {q.scaleMaxLabel ?? ""}
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <div className="font-medium text-slate-200">{title}</div>
                {content}
                {q.type === "multiple" && (q.minSelect || q.maxSelect) && (
                    <div className="text-xs text-slate-500 mt-1 pl-4">选择 {q.minSelect ?? 0} - {q.maxSelect ?? "不限"}</div>
                )}
            </div>
        );
    };

    const renderSamplingPreview = (label: string, dataList: any[] | undefined) => {
        if (!dataList || dataList.length === 0) {
            return (
                <div className="space-y-2">
                    <div className="font-medium text-slate-300">{label}</div>
                    <div className="text-sm text-slate-500 italic">暂无数据</div>
                </div>
            );
        }
        const columns = Object.keys(dataList[0] ?? {}).slice(0, 6);
        return (
            <div className="space-y-3">
                <div className="font-medium text-slate-300 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    {label}
                </div>
                <div className="overflow-x-auto border border-slate-700 rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800">
                            <tr>
                                {columns.map((c) => (
                                    <th key={c} className="px-3 py-2 text-left font-medium text-slate-400 border-b border-slate-700">{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-slate-900">
                            {dataList.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50">
                                    {columns.map((c) => (
                                        <td key={c} className="px-3 py-2 text-slate-300">
                                            {String(row[c] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {dataList.length > 10 && <div className="text-xs text-slate-500 text-right">仅显示前 10 条，共 {dataList.length} 条</div>}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-950 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 h-16 bg-slate-900 border-b border-slate-800 shrink-0">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => navigate("/grading")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-slate-800 mx-2"></div>
                <div>
                    <h2 className="text-base font-semibold text-slate-100">{data.topic}</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{data.studentName} ({data.studentId})</span>
                        <span>·</span>
                        <span>{data.className}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    {data.status === 1 && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">待批改</Badge>}
                    {data.status === 2 && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">已批改</Badge>}
                    {data.status === 3 && <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">已驳回</Badge>}
                </div>
            </div>
            {isReadOnly && (
                <div className="px-6 py-2 text-sm text-rose-300 bg-rose-900/20 border-b border-rose-900/30 flex items-center justify-center">
                    <XCircle className="w-4 h-4 mr-2" />
                    该作业正在被他人批改中，当前为只读模式。
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Submission Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
                    <Tabs defaultValue="report" className="h-full flex flex-col">
                        <TabsList className="bg-slate-900 border border-slate-800 self-start mb-6">
                            <TabsTrigger value="report" className="data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-400 text-slate-400">
                                <FileText className="w-4 h-4 mr-2" /> 实验报告
                            </TabsTrigger>
                            <TabsTrigger value="questionnaire" className="data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-400 text-slate-400">
                                <ListChecks className="w-4 h-4 mr-2" /> 调查问卷
                            </TabsTrigger>
                            <TabsTrigger value="data" className="data-[state=active]:bg-slate-800 data-[state=active]:text-indigo-400 text-slate-400">
                                <BarChart3 className="w-4 h-4 mr-2" /> 样本数据
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1">
                            <TabsContent value="report" className="mt-0 bg-slate-900 rounded-lg border border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-indigo-400" />
                                        实验报告详情
                                    </h3>
                                    {data.reportPdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">
                                                    <ExternalLink className="w-4 h-4" />
                                                    预览
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/report`} download>
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">
                                                    <Download className="w-4 h-4" />
                                                    下载
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="prose prose-invert max-w-none">
                                    {data.reportContent ? (
                                        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-6 rounded-lg border border-slate-800/50">{data.reportContent}</pre>
                                    ) : (
                                        <div className="text-slate-500 text-center py-20 bg-slate-950/30 rounded-lg border border-dashed border-slate-800">
                                            暂无报告内容
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="questionnaire" className="mt-0 bg-slate-900 rounded-lg border border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                                    <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                                        <ListChecks className="w-5 h-5 text-indigo-400" />
                                        问卷设计
                                    </h3>
                                    {data.questionnairePdfPath && (
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} target="_blank" rel="noreferrer">
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">
                                                    <ExternalLink className="w-4 h-4" />
                                                    预览
                                                </Button>
                                            </a>
                                            <a href={`/api/teacher/submissions/${submissionId}/pdf/questionnaire`} download>
                                                <Button variant="outline" size="sm" className="gap-2 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">
                                                    <Download className="w-4 h-4" />
                                                    下载
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    {questionnaire && questionnaire.title ? (
                                        <div className="space-y-6 max-w-3xl mx-auto bg-slate-950 p-8 rounded-lg border border-slate-800 shadow-inner">
                                            <div className="text-center space-y-2 border-b border-slate-800 pb-6 mb-6">
                                                <div className="font-bold text-xl text-slate-100">{questionnaire.title}</div>
                                                {questionnaire.welcomeText && (
                                                    <div className="text-sm text-slate-400">{questionnaire.welcomeText}</div>
                                                )}
                                            </div>
                                            <div className="space-y-6">
                                                {(questionnaire.questions ?? []).map((q: any, idx: number) => (
                                                    <div key={q.id ?? idx} className="p-4 border border-slate-800 rounded-lg bg-slate-900/50">
                                                        {renderQuestion(q, idx)}
                                                    </div>
                                                ))}
                                            </div>
                                            {questionnaire.endingText && (
                                                <div className="text-sm text-slate-500 text-center border-t border-slate-800 pt-6 mt-6">{questionnaire.endingText}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 text-center py-20 bg-slate-950/30 rounded-lg border border-dashed border-slate-800">
                                            未设计问卷
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="data" className="mt-0 bg-slate-900 rounded-lg border border-slate-800 p-8 min-h-[500px] shadow-sm">
                                <h3 className="text-lg font-semibold text-slate-100 mb-6 pb-4 border-b border-slate-800 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-indigo-400" />
                                    样本数据概览
                                </h3>
                                <div className="space-y-8">
                                    {renderSamplingPreview("简单随机抽样", samplingResults?.simple?.data)}
                                    {renderSamplingPreview("系统抽样", samplingResults?.systematic?.data)}
                                    {renderSamplingPreview("分层抽样", samplingResults?.stratified?.data)}
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right: Grading Form */}
                <div className="w-96 bg-slate-900 border-l border-slate-800 shrink-0 flex flex-col shadow-xl z-10">
                    <div className="p-4 border-b border-slate-800 font-medium text-slate-100 bg-slate-900/50 flex items-center justify-between">
                        <span>评分</span>
                        <div className="text-xs text-slate-500">权重总和: {weights.questionnaire + weights.process + weights.report}%</div>
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <Label className="text-slate-300 flex justify-between">
                                    <span>问卷设计</span>
                                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.questionnaire}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.questionnaire}
                                        onChange={(e) => setScores({ ...scores, questionnaire: e.target.value })}
                                        className="text-right bg-slate-950 border-slate-700 text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-300 flex justify-between">
                                    <span>实施过程</span>
                                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.process}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.process}
                                        onChange={(e) => setScores({ ...scores, process: e.target.value })}
                                        className="text-right bg-slate-950 border-slate-700 text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-300 flex justify-between">
                                    <span>分析报告</span>
                                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{weights.report}%</span>
                                </Label>
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={scores.report}
                                        onChange={(e) => setScores({ ...scores, report: e.target.value })}
                                        className="text-right bg-slate-950 border-slate-700 text-slate-100 h-10 text-lg font-mono focus:border-indigo-500"
                                        disabled={saving || isReadOnly}
                                    />
                                    <span className="text-sm text-slate-500 whitespace-nowrap">分</span>
                                </div>
                            </div>

                            <Separator className="bg-slate-800" />

                            <div className="flex justify-between items-center bg-indigo-900/20 p-4 rounded-lg border border-indigo-500/20">
                                <span className="font-semibold text-indigo-300">总分</span>
                                <span className="text-3xl font-bold text-indigo-400 font-mono">{totalScore.toFixed(1)}</span>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-slate-300">教师评语</Label>
                                <Textarea
                                    rows={8}
                                    placeholder="请输入评语..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="bg-slate-950 border-slate-700 text-slate-200 resize-none focus:border-indigo-500"
                                    disabled={saving || isReadOnly}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-800 space-y-3 bg-slate-900/50">
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11" onClick={() => handleSubmit(2)} disabled={saving || isReadOnly}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "确认评分"}
                        </Button>
                        <Button variant="outline" className="w-full border-slate-700 bg-transparent text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 h-11" onClick={() => setShowRejectModal(true)} disabled={saving || isReadOnly}>
                            <XCircle className="w-4 h-4 mr-2" />
                            {saving ? "提交中..." : "驳回重做"}
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">驳回理由</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                        <Label className="text-slate-300">驳回理由（学生可见，至少10字）</Label>
                        <Textarea
                            rows={4}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="bg-slate-950 border-slate-700 text-slate-200"
                            placeholder="请详细说明驳回原因..."
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700 text-white"
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
