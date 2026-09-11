import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, History, XCircle } from "lucide-react";
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
import { formatDateTimeDisplay } from "@/utils/format";
import { teacherApi, teacherResourceUrl, type SubmissionDetail } from "../api-client";

function parseScoreField(value: string) {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
    return parsed;
}

function scoreFieldMessage(scores: { questionnaire: string; process: string; report: string }) {
    const values = [scores.questionnaire, scores.process, scores.report];
    if (values.some((value) => value.trim() === "")) return "请填写三项分数后再提交。";
    if (values.some((value) => parseScoreField(value) === null)) return "分项分数需在 0–100 之间。";
    return null;
}

export function GradingDetail() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<SubmissionDetail | null>(null);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("批改记录加载失败");
    const [conflict, setConflict] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [scores, setScores] = useState({ questionnaire: "", process: "", report: "" });
    const [comment, setComment] = useState("");
    const [gradeConfirmOpen, setGradeConfirmOpen] = useState(false);
    const id = Number(submissionId);
    const currentId = useRef(id);
    currentId.current = id;
    const load = (preserveInput = false) => run(async () => requireApiData(await teacherApi.getSubmissionDetail(id), "批改记录加载失败"), (loaded) => {
        setData(loaded);
        setConflict(false);
        if (!preserveInput) {
            setScores({
                questionnaire: loaded.scoreQuestionnaire == null ? "" : String(loaded.scoreQuestionnaire),
                process: loaded.scoreProcess == null ? "" : String(loaded.scoreProcess),
                report: loaded.scoreReport == null ? "" : String(loaded.scoreReport),
            });
            setComment(loaded.teacherComment ?? "");
            setRejectReason(loaded.rejectReason ?? "");
        }
    });
    useEffect(() => {
        currentId.current = id;
        setData(null);
        setConflict(false);
        setSaving(false);
        setRejectOpen(false);
        setGradeConfirmOpen(false);
        if (Number.isInteger(id) && id > 0) void load();
        return () => { currentId.current = Number.NaN; cancel(); };
    }, [id, cancel]);
    const weights = data?.weights ?? { questionnaire: 30, process: 30, report: 40 };
    const parsedScores = useMemo(() => ({
        questionnaire: parseScoreField(scores.questionnaire),
        process: parseScoreField(scores.process),
        report: parseScoreField(scores.report),
    }), [scores]);
    const scoresReady = parsedScores.questionnaire !== null && parsedScores.process !== null && parsedScores.report !== null;
    const total = useMemo(() => {
        if (!scoresReady) return null;
        return (
            parsedScores.questionnaire! * weights.questionnaire
            + parsedScores.process! * weights.process
            + parsedScores.report! * weights.report
        ) / 100;
    }, [parsedScores, scoresReady, weights]);
    const grade = async () => {
        if (!data || !scoresReady) return;
        setGradeConfirmOpen(false);
        setSaving(true);
        const response = await teacherApi.submitGrade(id, data.version, {
            scoreQuestionnaire: parsedScores.questionnaire!,
            scoreProcess: parsedScores.process!,
            scoreReport: parsedScores.report!,
            comment,
        });
        if (currentId.current !== id) return;
        setSaving(false);
        if (!response.success) {
            toast.error(response.error?.message ?? "评分失败");
            if (response.error?.code === "VERSION_CONFLICT") setConflict(true);
            return;
        }
        toast.success("评分已保存");
        navigate("/grading");
    };
    const reject = async () => {
        if (!data) return;
        const response = await teacherApi.rejectSubmission(id, data.version, rejectReason);
        if (currentId.current !== id) return;
        if (!response.success) {
            toast.error(response.error?.message ?? "驳回失败");
            if (response.error?.code === "VERSION_CONFLICT") { setConflict(true); setRejectOpen(false); }
            return;
        }
        toast.success("已驳回，学生可修改后重交");
        navigate("/grading");
    };
    if (!Number.isInteger(id) || id <= 0) return <p className="py-12 text-center text-muted-foreground">未找到提交记录</p>;
    if (!data && loadError) return <RequestError message={loadError} onRetry={() => void load()} />;
    if (loading && !data) return <p role="status" aria-live="polite" className="py-12 text-center text-muted-foreground">加载中...</p>;
    if (!data) return <p className="py-12 text-center text-muted-foreground">未找到提交记录</p>;
    const canGrade = !conflict && !loading && !loadError && (data.status === "submitted" || data.status === "graded");
    const scoreLabels = {
        questionnaire: `问卷设计（${weights.questionnaire}%）`,
        process: `实验过程（${weights.process}%）`,
        report: `实验报告（${weights.report}%）`,
    };
    return (
        <div className="space-y-5">
            {loadError && <RequestError message={loadError} onRetry={() => void load(true)} retrying={loading} />}
            {conflict && <div role="alert" className="space-y-3 rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning"><p>记录已在其他页面更新，当前评分和评语已保留。请加载最新记录后核对再提交。</p><Button variant="outline" disabled={loading} onClick={() => void load(true)}>加载最新记录并保留输入</Button></div>}
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => navigate("/grading")}><ArrowLeft className="mr-2 h-4 w-4" />返回列表</Button>
                <div className="flex items-center gap-2">
                    <StatusBadge intent={data.status === "graded" ? "success" : data.status === "rejected" ? "destructive" : "warning"}>
                        {data.status === "graded" ? "已批改" : data.status === "rejected" ? "已驳回" : "待批改"}
                    </StatusBadge>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>
                        <h2>{data.studentName} · {data.topic}</h2>
                    </CardTitle>
                    <p className="text-label text-muted-foreground">{data.className} · {data.studentId}</p>
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
                        <TabsContent value="sampling" className="mt-4 space-y-4">
                            {data.samplingResults && (
                                <div className="flex items-center justify-between gap-3 rounded-surface border border-info-border bg-info-muted p-4">
                                    <p className="text-label text-info">页面最多预览每种抽样方法的前 50 行；CSV 包含本次提交的完整样本。</p>
                                    <Button asChild variant="outline" className="shrink-0 border-info-border text-info hover:bg-info-muted hover:text-info hover:border-info-border">
                                        <a
                                            href={teacherResourceUrl(`/api/teacher/grading/${id}/sampling-export?type=all`)}
                                            download
                                            data-testid="teacher-sampling-export"
                                        >
                                            <Download className="mr-2 h-4 w-4" />
                                            导出完整样本
                                        </a>
                                    </Button>
                                </div>
                            )}
                            <SamplingResultsSnapshot value={data.samplingResults} samplingPolicy={data.samplingPolicy} />
                            <div className="rounded-surface border border-border bg-card p-4">
                                <h3 className="flex items-center gap-2 font-medium"><History className="h-4 w-4 text-primary" />抽样执行记录</h3>
                                <p className="mt-1 text-meta text-muted-foreground">记录每次服务端抽样，便于识别重复尝试；每个实验保留并展示最近 100 次。</p>
                                {data.samplingAttempts?.length ? (
                                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                                        {data.samplingAttempts.map((attempt) => {
                                            const methodLabel = {
                                                simple: "简单随机",
                                                systematic: "系统抽样",
                                                pps: "PPS",
                                                stratified: "分层抽样",
                                            }[attempt.method];
                                            return (
                                                <div key={attempt.id} className="flex items-center justify-between rounded-surface bg-muted px-3 py-2 text-label">
                                                    <span className="font-medium">{methodLabel} · {attempt.sampleCount.toLocaleString()} 个</span>
                                                    <span className="text-meta text-muted-foreground">seed {attempt.seed} · {formatDateTimeDisplay(attempt.createdAt)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : <p className="mt-3 text-label text-muted-foreground">暂无执行记录（旧提交不会补记历史尝试）。</p>}
                            </div>
                        </TabsContent>
                        <TabsContent value="report" className="mt-4 rounded-surface border border-border p-5"><RichTextContent html={data.reportContent} /></TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
            {data.status === "rejected" ? (
                <Card className="border-destructive-border">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" />驳回理由</CardTitle></CardHeader>
                    <CardContent><p className="whitespace-pre-wrap text-label">{data.rejectReason}</p></CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" />评分</CardTitle></CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid gap-4 grid-cols-3">
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
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface bg-muted p-4">
                            <p>加权总分：<span className="text-page-title font-bold text-primary">{total === null ? "—" : total.toFixed(2)}</span></p>
                            <div className="flex flex-wrap gap-2">
                                {data.status === "submitted" && <Button variant="destructive" disabled={!canGrade || saving} onClick={() => setRejectOpen(true)}>驳回修改</Button>}
                                {gradeConfirmOpen ? (
                                    <>
                                        <p className="w-full text-label text-muted-foreground" role="status">
                                            {scoreFieldMessage(scores)
                                                ?? (total === 0
                                                    ? "三项得分都是 0，加权总分为 0.00。确认记为 0 分吗？"
                                                    : `确认提交评分？加权总分为 ${total?.toFixed(2) ?? "—"}。`)}
                                        </p>
                                        <Button variant="outline" disabled={saving} onClick={() => setGradeConfirmOpen(false)}>取消</Button>
                                        <Button data-testid="teacher-grade-confirm" disabled={saving || !scoresReady} onClick={() => void grade()}>确认提交</Button>
                                    </>
                                ) : (
                                    <Button disabled={!canGrade || saving || !scoresReady} onClick={() => setGradeConfirmOpen(true)}>{saving ? "保存中..." : data.status === "graded" ? "更新评分" : "提交评分"}</Button>
                                )}
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
