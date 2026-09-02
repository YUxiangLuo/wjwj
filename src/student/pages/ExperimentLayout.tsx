import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ChevronRight, Clock, FileText, Home, Play, RefreshCw, Ruler } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { getRemainingDeadlineSummary } from "@/utils/format";
import { LoadingStatus } from "@/components/LoadingStatus";
import { experimentApi, tasksApi, type ExperimentData } from "../api-client";
import { formatStudyContractSummary } from "@/lib/analysis-target";
import { formatMarginOfError } from "../experiment/sample-plan-display";
import { TopicDeletedState } from "../components/TopicDeletedState";
import { getExperimentRouteRedirect } from "../experiment/page-access";
import { AnalysisReport } from "./stages/AnalysisReport";
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";

const stages = [
    { name: "问卷预试", description: "设计问卷原型并完成认知预试", icon: FileText },
    { name: "样本量规划", description: "按研究目标变量计算邀请人数", icon: Ruler },
    { name: "抽样执行", description: "按实验模板要求完成必做与选做抽样方法", icon: Play },
    { name: "分析与报告", description: "比较抽样框字段上的设计并撰写报告", icon: BarChart3 },
] as const;

interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
}

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function useExperiment() {
    const value = useContext(ExperimentContext);
    if (!value) throw new Error("useExperiment must be used within ExperimentLayout");
    return value;
}

export function ExperimentLayout() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const numericTaskId = Number(taskId);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [taskName, setTaskName] = useState("");
    const [deadline, setDeadline] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accessDenied, setAccessDenied] = useState<"topic_deleted" | "task_revoked" | null>(null);
    const [redirect, setRedirect] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [versionConflict, setVersionConflict] = useState(false);
    const [editorRevision, setEditorRevision] = useState(0);
    const [reopenStage, setReopenStage] = useState<number | null>(null);
    const [inspectStage, setInspectStage] = useState<number | null>(null);

    useEffect(() => {
        if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) { setNotFound(true); setLoading(false); return; }
        void Promise.all([experimentApi.get(numericTaskId), tasksApi.get(numericTaskId)]).then(([experimentResponse, taskResponse]) => {
            if (!taskResponse.success || !taskResponse.data) {
                const code = taskResponse.error?.code;
                if (code === "TOPIC_DELETED" || code === "TASK_REVOKED") setAccessDenied(code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                else setNotFound(true);
                return;
            }
            setTaskName(taskResponse.data.name);
            setDeadline(taskResponse.data.deadline);
            setRedirect(getExperimentRouteRedirect({ taskId: numericTaskId, publishedAt: taskResponse.data.publishedAt, deadline: taskResponse.data.deadline, status: taskResponse.data.status }));
            if (experimentResponse.success && experimentResponse.data) setExperiment(experimentResponse.data);
            else setNotFound(true);
        }).finally(() => setLoading(false));
    }, [numericTaskId]);

    const completeStage = useCallback(async (stage: number, data: Record<string, unknown>) => {
        if (!experiment) return false;
        if (versionConflict) {
            setSaveError("检测到其他页面已更新。请先复制需要保留的内容，再加载最新版本。");
            return false;
        }
        setIsSaving(true); setSaveError(null);
        const response = await experimentApi.completeStage(numericTaskId, stage, experiment.version, data);
        setIsSaving(false);
        if (response.success && response.data) {
            setExperiment(response.data);
            setVersionConflict(false);
            return true;
        }
        setSaveError(response.error?.message ?? "阶段保存失败，请重试");
        if (response.error?.code === "VERSION_CONFLICT") {
            setVersionConflict(true);
            setSaveError("检测到其他页面已更新。当前草稿尚未覆盖服务器数据；请先复制需要保留的内容，再加载最新版本。");
        }
        return false;
    }, [experiment, numericTaskId, versionConflict]);

    const loadLatestVersion = async () => {
        setIsSaving(true);
        const latest = await experimentApi.get(numericTaskId);
        setIsSaving(false);
        if (!latest.success || !latest.data) {
            setSaveError(latest.error?.message ?? "加载最新版本失败，请重试");
            return;
        }
        setExperiment(latest.data);
        setEditorRevision((revision) => revision + 1);
        setVersionConflict(false);
        setSaveError(null);
    };

    const applyReopen = async () => {
        if (reopenStage === null || !experiment) return;
        if (versionConflict) {
            setSaveError("检测到其他页面已更新。请先加载最新版本，再重新编辑阶段。");
            setReopenStage(null);
            return;
        }
        const response = await experimentApi.reopenStage(numericTaskId, reopenStage, experiment.version);
        if (response.success && response.data) {
            setExperiment(response.data);
            setVersionConflict(false);
        }
        else {
            setSaveError(response.error?.message ?? "无法重新编辑该阶段");
            if (response.error?.code === "VERSION_CONFLICT") {
                setVersionConflict(true);
                setSaveError("检测到其他页面已更新。请先加载最新版本，再重新编辑阶段。");
            }
        }
        setReopenStage(null);
    };

    const [now, setNow] = useState(Date.now());
    useEffect(() => { if (!deadline) return; const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, [deadline]);
    const deadlineInfo = useMemo(() => {
        const remaining = getRemainingDeadlineSummary(deadline, now);
        if (!remaining) return null;
        if (remaining.passed) return { text: "已截止", urgent: true };
        if (remaining.wholeHours < 24) return { text: `剩余 ${remaining.wholeHours} 小时`, urgent: true };
        return { text: `剩余 ${remaining.calendarDays} 天`, urgent: false };
    }, [deadline, now]);
    const currentStage = experiment ? Math.max(1, Math.min(4, experiment.currentStage)) : 1;
    useEffect(() => {
        if (!experiment) return;
        window.scrollTo({ top: 0, behavior: "auto" });
        const heading = document.querySelector("[data-testid=student-experiment-layout] h1, [data-testid=student-analysis-target-summary]");
        if (heading instanceof HTMLElement) heading.focus?.();
    }, [currentStage, experiment]);

    if (loading) return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载实验进度" />;
    if (accessDenied) return <TopicDeletedState variant={accessDenied} />;
    if (redirect) return <Navigate to={redirect} replace />;
    if (notFound || !experiment) return <Navigate to="/" replace />;
    const completed = [experiment.stage1CompletedAt, experiment.stage2CompletedAt, experiment.stage3CompletedAt, experiment.stage4CompletedAt];
    const renderStage = () => {
        if (currentStage === 1) return <QuestionnaireDesign />;
        if (currentStage === 2) return <SamplePlanning onPrev={() => setInspectStage(1)} />;
        if (currentStage === 3) return <SamplingExecution onPrev={() => setInspectStage(2)} />;
        return <AnalysisReport onPrev={() => setInspectStage(3)} onSubmit={() => navigate(`/task/${numericTaskId}/preview`)} />;
    };
    const reopenImpact = reopenStage === 1
        ? "问卷内容会保留；样本量规划、抽样结果和分析报告将被清空。"
        : reopenStage === 2
            ? "样本量规划会保留；抽样结果和分析报告将被清空。"
            : reopenStage === 3
                ? "抽样结果会保留；分析报告将被清空。"
                : "分析报告内容会保留，但需要重新确认本阶段。";

    return (
        <ExperimentContext.Provider value={{ experiment, populationSize: experiment.populationSize, isSaving, completeStage }}>
            <div className="pb-12" data-testid="student-experiment-layout">
                <div className="sticky top-16 z-40 -mt-2 border-b border-border bg-background">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2"><Button asChild variant="ghost" size="icon"><Link to="/" aria-label="返回任务大厅"><Home className="h-4 w-4" /></Link></Button><Button asChild variant="ghost" className="gap-2 flex"><Link to={`/task/${numericTaskId}`}><ArrowLeft className="h-4 w-4" />退出实验</Link></Button><h1 className="ml-2 line-clamp-1 border-l border-border pl-4 text-label font-semibold">{taskName}</h1></div>
                        {deadlineInfo && <span className={`items-center gap-1 text-meta flex ${deadlineInfo.urgent ? "text-destructive" : "text-muted-foreground"}`}>{deadlineInfo.urgent ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{deadlineInfo.text}</span>}
                    </div>
                    {saveError && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-surface border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive"><span>{saveError}</span>{versionConflict && <Button type="button" size="sm" variant="outline" disabled={isSaving} data-testid="student-load-latest-version" onClick={() => void loadLatestVersion()} className="border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isSaving ? "animate-spin" : ""}`} />加载最新版本</Button>}</div>}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2.5" data-testid="student-experiment-stages">
                        {stages.map((stage, index) => {
                            const number = index + 1;
                            const isCurrent = number === currentStage;
                            const isCompleted = completed[index] !== null;
                            const Icon = stage.icon;
                            return <div key={stage.name} className="flex items-center gap-2">{index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}<button aria-label={`${isCurrent ? "当前阶段" : "查看已完成阶段"} ${number}：${stage.name}`} disabled={number >= currentStage || !isCompleted} onClick={() => setInspectStage(number)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-surface px-2.5 py-1 text-meta font-medium ${isCurrent ? "border border-primary-border bg-primary-muted text-primary" : isCompleted ? "text-success hover:bg-success-muted" : "text-muted-foreground"}`}>{isCompleted && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}<span>{stage.name}</span></button></div>;
                        })}
                    </div>
                </div>
                <div className="my-6 flex items-center gap-3 rounded-surface border border-border bg-card px-4 py-3"><span className="grid h-8 w-8 place-items-center rounded-surface bg-primary-muted text-primary">{(() => { const Icon = stages[currentStage - 1]!.icon; return <Icon className="h-4 w-4" />; })()}</span><div><p className="text-label font-semibold">阶段 {currentStage}：{stages[currentStage - 1]!.name}</p><p className="text-meta text-muted-foreground">{stages[currentStage - 1]!.description}。编辑草稿自动保存在当前浏览器；抽样结果每次执行即保存，点击阶段完成后正式写入服务器。</p></div></div>
                <p className="mb-6 rounded-surface border border-info-border bg-info-muted px-4 py-3 text-label text-info" data-testid="student-analysis-target-summary">
                    {formatStudyContractSummary(experiment.studyContract ?? null, experiment.samplePlan
                        ? { marginLabel: formatMarginOfError(experiment.samplePlan.marginOfError, experiment.studyContract?.contract.target.kind ?? experiment.samplePlan.estimationType) }
                        : undefined)}
                </p>
                {experiment.status === "rejected" && experiment.rejectReason?.trim() && (
                    <div
                        role="alert"
                        className="mb-6 flex items-start gap-3 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-destructive"
                        data-testid="student-experiment-rejection-notice"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-label font-semibold">本次提交已被驳回，请按教师意见修改后重新提交</p>
                            <p className="mt-1 whitespace-pre-line text-label leading-relaxed">{experiment.rejectReason}</p>
                        </div>
                    </div>
                )}
                <div key={editorRevision} className="min-h-[500px]">{renderStage()}</div>
            </div>
            <Dialog open={inspectStage !== null} onOpenChange={(open) => !open && setInspectStage(null)}>
                <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto" data-testid="student-stage-inspect-dialog">
                    <DialogHeader>
                        <DialogTitle>查看“{inspectStage ? stages[inspectStage - 1]!.name : ""}”</DialogTitle>
                        <DialogDescription>这是已保存内容的只读快照。关闭查看后会返回当前阶段，不会清空或修改任何数据。</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        {inspectStage === 1 && <QuestionnaireSnapshot questionnaire={experiment.questionnaire} />}
                        {inspectStage === 2 && <SamplePlanSnapshot value={experiment.samplePlan} populationSize={experiment.populationSize} />}
                        {inspectStage === 3 && <SamplingResultsSnapshot value={experiment.samplingResults} samplingPolicy={experiment.samplingPolicy} />}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setInspectStage(null)}>返回当前阶段</Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                const stage = inspectStage;
                                setInspectStage(null);
                                setReopenStage(stage);
                            }}
                        >
                            重新编辑此阶段
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AlertDialog open={reopenStage !== null} onOpenChange={(open) => !open && setReopenStage(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重新编辑“{reopenStage ? stages[reopenStage - 1]!.name : ""}”</AlertDialogTitle><AlertDialogDescription>{reopenImpact} 此操作不可撤销，确认后才能重新编辑。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void applyReopen()}>确认重新编辑</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
