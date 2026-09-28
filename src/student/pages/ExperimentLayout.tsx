import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ChevronRight, Clock, FileText, Play, RefreshCw, Ruler } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { reloadPage } from "@/lib/api-client";
import { experimentApi, tasksApi } from "../api-client";
import type { ExperimentData } from "@/domain/experiment/types";
import { formatStudyContractSummary } from "@/lib/analysis-target";
import { formatMarginOfError } from "../experiment/sample-plan-display";
import { getExperimentRouteRedirect } from "../experiment/page-access";
import { AnalysisReport } from "./stages/AnalysisReport";
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";

const stages = [
    { name: "问卷预试", description: "围绕研究问题设计问卷，再从受访者视角试填一次", icon: FileText },
    { name: "样本量规划", description: "按研究目标变量计算邀请单位数", icon: Ruler },
    { name: "抽样执行", description: "完成必做方法，查看实际入样记录，再比较不同抽样设计", icon: Play },
    { name: "分析与报告", description: "围绕研究目标比较结果，用数据支持你的报告结论", icon: BarChart3 },
] as const;

interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    refreshRequired: boolean;
    requireRefresh: () => void;
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
    // A different task gets its own editor state and async lifecycle.
    return <ExperimentWorkspace key={taskId} />;
}

function ExperimentWorkspace() {
    const { taskId } = useParams();
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const navigate = useNavigate();
    const numericTaskId = Number(taskId);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [taskName, setTaskName] = useState("");
    const [deadline, setDeadline] = useState<string | null>(null);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("实验加载失败，请重试");
    const [redirect, setRedirect] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<{ message: string; refresh: boolean } | null>(null);
    const [reopenStage, setReopenStage] = useState<number | null>(null);
    const [inspectStage, setInspectStage] = useState<number | null>(null);
    const refreshRequired = saveError?.refresh === true;
    const requireRefresh = useCallback(() => {
        setSaveError({ message: "实验进度已更新，请刷新页面后继续。", refresh: true });
    }, []);

    const loadExperiment = useCallback(() => run(async () => {
        const [experimentResponse, taskResponse] = await Promise.all([experimentApi.get(numericTaskId), tasksApi.get(numericTaskId)]);
        return {
            experiment: requireApiData(experimentResponse, "实验加载失败，请重试"),
            task: requireApiData(taskResponse, "任务加载失败，请重试"),
        };
    }, ({ experiment: loaded, task }) => {
        setExperiment(loaded);
        setTaskName(task.name);
        setDeadline(task.deadline);
        setRedirect(getExperimentRouteRedirect({ taskId: numericTaskId, publishedAt: task.publishedAt, deadline: task.deadline, status: task.status }));
        setSaveError(null);
    }), [numericTaskId, run]);
    useEffect(() => {
        if (Number.isInteger(numericTaskId) && numericTaskId > 0) void loadExperiment();
        return cancel;
    }, [numericTaskId, loadExperiment, cancel]);

    const completeStage = useCallback(async (stage: number, data: Record<string, unknown>) => {
        if (!mounted.current || !experiment || refreshRequired) return false;
        setIsSaving(true); setSaveError(null);
        const response = await experimentApi.completeStage(numericTaskId, stage, experiment.version, data);
        // The server may have saved successfully, but a departed editor must
        // not update another task, clear its draft, or navigate to old previews.
        if (!mounted.current) return false;
        setIsSaving(false);
        if (response.success && response.data) {
            setExperiment(response.data);
            return true;
        }
        const refresh = response.error?.code === "VERSION_CONFLICT";
        if (refresh) requireRefresh();
        else setSaveError({ message: response.error?.message ?? "阶段保存失败，请重试", refresh: false });
        return false;
    }, [experiment, numericTaskId, refreshRequired, requireRefresh]);

    const applyReopen = async () => {
        if (!mounted.current || reopenStage === null || !experiment || refreshRequired) return;
        const response = await experimentApi.reopenStage(numericTaskId, reopenStage, experiment.version);
        if (!mounted.current) return;
        if (response.success && response.data) {
            setExperiment(response.data);
        }
        else {
            const refresh = response.error?.code === "VERSION_CONFLICT";
            if (refresh) requireRefresh();
            else setSaveError({ message: response.error?.message ?? "无法重新编辑该阶段", refresh: false });
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

    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return <Navigate to="/" replace />;
    if (loadError) {
        return <StudentStatusPage title="实验过程" message="实验进度加载失败，请重试或返回任务。" error={{ message: loadError, onRetry: () => void loadExperiment() }} />;
    }
    if (loading) return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载实验进度" />;
    if (redirect) return <Navigate to={redirect} replace />;
    if (!experiment) return <Navigate to="/" replace />;
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
        <ExperimentContext.Provider value={{ experiment, populationSize: experiment.populationSize, isSaving, refreshRequired, requireRefresh, completeStage }}>
            <div className="pb-4" data-testid="student-experiment-layout">
                <div className="sticky top-16 z-40 -mt-2 border-b border-border bg-background" data-testid="student-experiment-navigation">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                        <div className="flex min-w-[12rem] flex-1 items-center gap-2"><Button asChild variant="ghost" size="sm" className="gap-2 shrink-0"><Link to={`/task/${numericTaskId}`}><ArrowLeft className="h-4 w-4" />返回任务</Link></Button><h1 tabIndex={-1} title={taskName} className="min-w-0 line-clamp-1 text-label font-medium outline-none">{taskName}</h1></div>
                    <div className="flex shrink-0 items-center gap-2" data-testid="student-experiment-stages">
                        {stages.map((stage, index) => {
                            const number = index + 1;
                            const isCurrent = number === currentStage;
                            const isCompleted = completed[index] !== null;
                            const Icon = stage.icon;
                            return <div key={stage.name} className="flex items-center gap-2">{index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}<button aria-current={isCurrent ? "step" : undefined} aria-label={`${isCurrent ? "当前阶段" : isCompleted ? "查看已完成阶段" : "未完成阶段"} ${number}：${stage.name}`} disabled={number >= currentStage || !isCompleted} onClick={() => setInspectStage(number)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-surface px-2.5 py-1 text-meta font-medium ${isCurrent ? "border border-primary-border bg-primary-muted text-primary" : isCompleted ? "text-success hover:bg-success-muted" : "text-muted-foreground"}`}>{isCompleted && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}<span>{stage.name}</span></button></div>;
                        })}
                    </div>
                        {deadlineInfo && <span className={`flex shrink-0 items-center gap-1 text-meta ${deadlineInfo.urgent ? "text-destructive" : "text-muted-foreground"}`}>{deadlineInfo.urgent ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{deadlineInfo.text}</span>}
                    </div>
                    {saveError && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-surface border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive"><span>{saveError.message}</span>{saveError.refresh && <Button type="button" size="sm" variant="outline" data-testid="student-refresh-experiment" onClick={reloadPage} className="border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新页面</Button>}</div>}
                </div>
                <PageHeader border={false} className="my-4 flex-wrap items-baseline">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
                        <h2 className="text-page-title font-bold text-foreground">{stages[currentStage - 1]!.name}</h2>
                        <p className="text-label text-muted-foreground">{stages[currentStage - 1]!.description}。</p>
                    </div>
                    <span className="shrink-0 text-meta text-muted-foreground">阶段 {currentStage} / 4</span>
                </PageHeader>
                <details className="mb-5 border-l-2 border-border pl-4 py-1" data-testid="student-study-context">
                    <summary className="cursor-pointer text-label text-foreground">研究目标：{experiment.studyContract?.contract.researchQuestion ?? "查看本次实验的目标与约定"}</summary>
                    <p className="mt-3 text-label leading-relaxed text-muted-foreground" data-testid="student-analysis-target-summary">
                    {formatStudyContractSummary(experiment.studyContract ?? null, experiment.samplePlan
                        ? { marginLabel: formatMarginOfError(experiment.samplePlan.marginOfError, experiment.studyContract?.contract.target.kind ?? experiment.samplePlan.estimationType) }
                        : undefined)}
                    </p>
                    <p className="mt-2 text-meta leading-relaxed text-muted-foreground">编辑草稿保存在当前浏览器，最后编辑后保留 7 天。完成阶段时同步到服务器；抽样结果每次执行后立即保存。问卷试填用于检查题目，不进入后续统计分析。</p>
                </details>
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
                <div className="min-h-[500px]">{renderStage()}</div>
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
            <AlertDialog open={reopenStage !== null} onOpenChange={(open) => !open && setReopenStage(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重新编辑“{reopenStage ? stages[reopenStage - 1]!.name : ""}”</AlertDialogTitle><AlertDialogDescription>{reopenImpact} 此操作不可撤销，确认后才能重新编辑。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={refreshRequired} onClick={() => void applyReopen()}>确认重新编辑</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
