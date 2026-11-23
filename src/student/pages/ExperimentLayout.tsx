import { StudentStatusPage } from "../components/StudentStatusPage";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ChevronRight,
    ClipboardCheck, Clock, FileText, Layers, RefreshCw, Send, SlidersHorizontal
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
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
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { PilotWaveStage } from "./stages/PilotWaveStage";
import { FieldworkDiagnosticsStage } from "./stages/FieldworkDiagnosticsStage";
import { AdaptiveRefinementStage } from "./stages/AdaptiveRefinementStage";
import { AnalysisReport } from "./stages/AnalysisReport";
import { QuestionnaireSnapshot } from "@/components/QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "@/components/SamplePlanSnapshot";
import { SamplingResultsSnapshot } from "@/components/SamplingResultsSnapshot";
import { WaveLoopSnapshot } from "@/components/WaveLoopSnapshot";

const stages = [
    { name: "商业问卷设计", description: "围绕商业问题设计问卷、关联变量字典并完成受访者视角预试", icon: FileText },
    { name: "首轮试投发放", description: "制定首轮试投方案，抽取名单并向虚拟受访者发放回收问卷", icon: Send },
    { name: "回收质检与诊断", description: "清洗闪电卷与直线卷，诊断客群拒访偏倚与逐题异常，立项调优单", icon: ClipboardCheck },
    { name: "调整思路与二轮投放", description: "修订问卷、代入实测参数重算样本量，升级抽样策略并完成正式投放", icon: SlidersHorizontal },
    { name: "商务分析与决策报告", description: "对比多轮改进、置信区间与细分客群交叉洞察，输出商业管理决策报告", icon: BarChart3 },
] as const;

interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    refreshRequired: boolean;
    requireRefresh: () => void;
    updateExperiment: (next: ExperimentData) => void;
    reloadExperiment: () => Promise<void>;
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
    const [isReopening, setIsReopening] = useState(false);
    const [saveError, setSaveError] = useState<{ message: string; refresh: boolean } | null>(null);
    const [reopenStage, setReopenStage] = useState<number | null>(null);
    const [inspectStage, setInspectStage] = useState<number | null>(null);
    const refreshRequired = saveError?.refresh === true;

    const requireRefresh = useCallback(() => {
        setSaveError({ message: "实验进度已更新，请刷新页面后继续。", refresh: true });
    }, []);

    const updateExperiment = useCallback((next: ExperimentData) => {
        if (!mounted.current) return;
        setExperiment(next);
        setSaveError(null);
    }, []);

    const reloadExperiment = useCallback(async () => {
        if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return;
        const res = await experimentApi.get(numericTaskId);
        if (!mounted.current) return;
        if (res.success && res.data) {
            setExperiment(res.data);
            setSaveError(null);
        }
    }, [numericTaskId]);

    const loadExperiment = useCallback(() => run(async () => {
        const [experimentResponse, taskResponse] = await Promise.all([
            experimentApi.get(numericTaskId),
            tasksApi.get(numericTaskId),
        ]);
        return {
            experiment: requireApiData(experimentResponse, "实验加载失败，请重试"),
            task: requireApiData(taskResponse, "任务加载失败，请重试"),
        };
    }, ({ experiment: loaded, task }) => {
        setExperiment(loaded);
        setTaskName(task.name);
        setDeadline(task.deadline);
        setRedirect(getExperimentRouteRedirect({
            taskId: numericTaskId,
            publishedAt: task.publishedAt,
            deadline: task.deadline,
            status: task.status,
        }));
        setSaveError(null);
    }), [numericTaskId, run]);

    useEffect(() => {
        if (Number.isInteger(numericTaskId) && numericTaskId > 0) void loadExperiment();
        return cancel;
    }, [numericTaskId, loadExperiment, cancel]);

    const completeStage = useCallback(async (stage: number, data: Record<string, unknown>) => {
        if (!mounted.current || !experiment || refreshRequired) return false;
        setIsSaving(true);
        setSaveError(null);
        const response = await experimentApi.completeStage(numericTaskId, stage, experiment.version, data);
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
        if (!mounted.current || reopenStage === null || !experiment || refreshRequired || isReopening) return;
        setIsReopening(true);
        try {
            const response = await experimentApi.reopenStage(numericTaskId, reopenStage, experiment.version);
            if (!mounted.current) return;
            if (response.success && response.data) {
                setSaveError(null);
                setExperiment(response.data);
            } else {
                const refresh = response.error?.code === "VERSION_CONFLICT";
                if (refresh) requireRefresh();
                else setSaveError({ message: response.error?.message ?? "无法重新编辑该阶段", refresh: false });
            }
            setReopenStage(null);
        } finally {
            if (mounted.current) setIsReopening(false);
        }
    };

    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!deadline) return;
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, [deadline]);

    const deadlineInfo = useMemo(() => {
        const remaining = getRemainingDeadlineSummary(deadline, now);
        if (!remaining) return null;
        if (remaining.passed) return { text: "已截止", urgent: true };
        if (remaining.wholeHours < 24) return { text: `剩余 ${remaining.wholeHours} 小时`, urgent: true };
        return { text: `剩余 ${remaining.calendarDays} 天`, urgent: false };
    }, [deadline, now]);

    const currentStage = experiment ? Math.max(1, Math.min(5, experiment.currentStage)) : 1;

    useEffect(() => {
        if (!experiment) return;
        window.scrollTo({ top: 0, behavior: "auto" });
        const heading = document.querySelector("[data-testid=student-experiment-layout] h1, [data-testid=student-analysis-target-summary]");
        if (heading instanceof HTMLElement) heading.focus?.();
    }, [currentStage, experiment?.id]);

    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return <Navigate to="/" replace />;
    if (loadError) {
        return <StudentStatusPage title="实验过程" message="实验进度加载失败，请重试或返回任务。" error={{ message: loadError, onRetry: () => void loadExperiment() }} />;
    }
    if (loading) return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载商务统计实验工作台" />;
    if (redirect) return <Navigate to={redirect} replace />;
    if (!experiment) return <Navigate to="/" replace />;

    const completed = [
        experiment.stage1CompletedAt,
        experiment.stage2CompletedAt,
        experiment.stage3CompletedAt,
        experiment.stage4CompletedAt,
        experiment.stage5CompletedAt ?? null,
    ];

    const renderStage = () => {
        if (currentStage === 1) return <QuestionnaireDesign />;
        if (currentStage === 2) return <PilotWaveStage onPrev={() => setInspectStage(1)} />;
        if (currentStage === 3) return <FieldworkDiagnosticsStage onPrev={() => setInspectStage(2)} />;
        if (currentStage === 4) return <AdaptiveRefinementStage onPrev={() => setInspectStage(3)} />;
        return <AnalysisReport onPrev={() => setInspectStage(4)} onSubmit={() => navigate(`/task/${numericTaskId}/preview`)} />;
    };

    const reopenImpact =
        reopenStage === 1
            ? "问卷内容会保留；后续首轮试投、质检诊断、正式轮投放及商业报告将被重置，已保存分析卡片将过期且附录引用将清空。"
            : reopenStage === 2
                ? "阶段一问卷与首轮试投草稿会保留；调优决策单、二轮正式投放及商业报告将被清空，已保存分析卡片将过期且附录引用将清空。"
                : reopenStage === 3
                    ? "首轮试投回收数据与调优决策单会保留；二轮正式投放及商业报告将被清空，已保存分析卡片将过期且附录引用将清空。"
                    : reopenStage === 4
                        ? "首轮与当前正式轮抽样投放数据会保留；服务端已保存的商业报告正文与附录引用将被清空，历史分析卡片将标记为过期，可继续微调正式轮或追加波次。"
                        : "商业决策报告内容与附录引用会保留，但需要重新确认本阶段。";

    const wave1Snapshot = (experiment.waves ?? []).find((w) => w.waveNumber === 1) ?? null;
    const formalWaveSnapshot =
        (experiment.waves ?? []).find((w) => w.waveNumber === experiment.activeWaveNumber && w.waveNumber >= 2)
        ?? (experiment.waves ?? []).filter((w) => w.waveNumber >= 2).at(-1)
        ?? null;

    const waveBadgeLabel = experiment.activeWaveNumber && experiment.activeWaveNumber >= 2
        ? `Wave ${experiment.activeWaveNumber} · 正式调优轮`
        : "Wave 1 · 首轮试投轮";

    return (
        <ExperimentContext.Provider value={{
            experiment,
            populationSize: experiment.populationSize,
            isSaving,
            refreshRequired,
            requireRefresh,
            updateExperiment,
            reloadExperiment,
            completeStage,
        }}>
            <div className="pb-6" data-testid="student-experiment-layout">
                <div className="sticky top-16 z-40 -mt-2 border-b border-border bg-background" data-testid="student-experiment-navigation">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
                        <div className="flex min-w-[20rem] flex-1 items-center gap-2">
                            <Button asChild variant="ghost" size="sm" className="gap-1.5 shrink-0">
                                <Link to={`/task/${numericTaskId}`}>
                                    <ArrowLeft className="h-4 w-4" />
                                    课题书
                                </Link>
                            </Button>
                            <h1 tabIndex={-1} title={taskName} className="min-w-0 truncate text-label font-semibold text-foreground outline-none">
                                {taskName}
                            </h1>
                            <StatusBadge intent={experiment.activeWaveNumber && experiment.activeWaveNumber >= 2 ? "primary" : "info"} className="shrink-0">
                                <Layers className="h-3 w-3" />
                                {waveBadgeLabel}
                            </StatusBadge>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5" data-testid="student-experiment-stages">
                            {stages.map((stage, index) => {
                                const number = index + 1;
                                const isCurrent = number === currentStage;
                                const isCompleted = completed[index] !== null && completed[index] !== undefined;
                                const Icon = stage.icon;
                                return (
                                    <div key={stage.name} className="flex items-center gap-1.5">
                                        {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                        <button
                                            type="button"
                                            aria-current={isCurrent ? "step" : undefined}
                                            aria-label={`${isCurrent ? "当前阶段" : isCompleted ? "查看已完成阶段" : "未完成阶段"} ${number}：${stage.name}`}
                                            disabled={number >= currentStage || !isCompleted}
                                            onClick={() => setInspectStage(number)}
                                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 py-1 text-meta font-medium ${
                                                isCurrent
                                                    ? "border border-primary-border bg-primary-muted text-primary"
                                                    : isCompleted
                                                        ? "text-success hover:bg-success-muted"
                                                        : "text-muted-foreground"
                                            }`}
                                        >
                                            {isCompleted && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                                            <span>{stage.name}</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {deadlineInfo && (
                            <span className={`flex shrink-0 items-center gap-1 text-meta ${deadlineInfo.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                                {deadlineInfo.urgent ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                                {deadlineInfo.text}
                            </span>
                        )}
                    </div>

                    {saveError && (
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-surface border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive">
                            <span>{saveError.message}</span>
                            {saveError.refresh && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    data-testid="student-refresh-experiment"
                                    onClick={reloadPage}
                                    className="border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"
                                >
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    刷新页面
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                <PageHeader border={false} className="my-4 flex-wrap items-baseline">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
                        <h2 className="text-page-title font-bold text-foreground">{stages[currentStage - 1]!.name}</h2>
                        <p className="text-label text-muted-foreground">{stages[currentStage - 1]!.description}。</p>
                    </div>
                    <span className="shrink-0 rounded-control border border-border bg-card px-2.5 py-1 text-meta font-medium tabular-nums text-muted-foreground">
                        阶段 {currentStage} / 5
                    </span>
                </PageHeader>

                <details className="mb-5 rounded-surface border border-border bg-card px-4 py-3" data-testid="student-study-context">
                    <summary className="cursor-pointer text-label font-medium text-foreground">
                        商业研究立项书：{experiment.studyContract?.contract.businessDecision ?? experiment.studyContract?.contract.researchQuestion ?? "查看本次实验的研究目标与约定"}
                    </summary>
                    <p className="mt-3 text-label leading-relaxed text-muted-foreground" data-testid="student-analysis-target-summary">
                        {formatStudyContractSummary(experiment.studyContract ?? null, experiment.samplePlan
                            ? { marginLabel: formatMarginOfError(experiment.samplePlan.marginOfError, experiment.studyContract?.contract.target.kind ?? experiment.samplePlan.estimationType) }
                            : undefined)}
                    </p>
                    <p className="mt-2 text-meta leading-relaxed text-muted-foreground">
                        编辑草稿保存在当前浏览器（保留 7 天）；抽样抽取、虚拟问卷发放与质检规则变更立即持久化至服务端，确保首轮试投至正式投放的多波次演进轨迹完整可追溯。
                    </p>
                </details>

                {experiment.status === "rejected" && experiment.rejectReason?.trim() && (
                    <div
                        role="alert"
                        className="mb-6 flex items-start gap-3 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-destructive"
                        data-testid="student-experiment-rejection-notice"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-label font-semibold">本次提交已被驳回，请按教师意见重新调整后提交</p>
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
                        <DialogDescription>这是已完成阶段的只读快照。关闭查看后会返回当前阶段，不会清空或修改任何数据。</DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-4">
                        {inspectStage === 1 && (
                            <QuestionnaireSnapshot questionnaire={wave1Snapshot?.questionnaire ?? experiment.questionnaire} />
                        )}
                        {inspectStage === 2 && (
                            <div className="space-y-4">
                                <WaveLoopSnapshot
                                    waves={wave1Snapshot ? [wave1Snapshot] : []}
                                    analysisTarget={experiment.analysisTarget}
                                />
                                <SamplePlanSnapshot
                                    value={wave1Snapshot?.samplePlan ?? (currentStage <= 3 ? experiment.samplePlan : null)}
                                    populationSize={experiment.populationSize}
                                />
                                <SamplingResultsSnapshot
                                    value={wave1Snapshot?.samplingResults ?? (currentStage <= 3 ? experiment.samplingResults : null)}
                                    samplingPolicy={experiment.samplingPolicy}
                                />
                            </div>
                        )}
                        {inspectStage === 3 && (
                            <WaveLoopSnapshot
                                waves={wave1Snapshot ? [wave1Snapshot] : []}
                                adjustmentPlan={experiment.adjustmentPlan}
                                analysisTarget={experiment.analysisTarget}
                            />
                        )}
                        {inspectStage === 4 && (
                            <div className="space-y-4">
                                <WaveLoopSnapshot
                                    waves={experiment.waves ?? []}
                                    adjustmentPlan={experiment.adjustmentPlan}
                                    analysisTarget={experiment.analysisTarget}
                                />
                                <SamplePlanSnapshot
                                    value={formalWaveSnapshot?.samplePlan ?? experiment.samplePlan}
                                    populationSize={experiment.populationSize}
                                />
                                <SamplingResultsSnapshot
                                    value={formalWaveSnapshot?.samplingResults ?? experiment.samplingResults}
                                    samplingPolicy={experiment.samplingPolicy}
                                />
                            </div>
                        )}
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

            <AlertDialog open={reopenStage !== null} onOpenChange={(open) => { if (!open && !isReopening) setReopenStage(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重新编辑“{reopenStage ? stages[reopenStage - 1]!.name : ""}”</AlertDialogTitle>
                        <AlertDialogDescription>{reopenImpact} 此操作不可撤销，确认后才能重新编辑。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isReopening}>取消</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={refreshRequired || isReopening} onClick={() => void applyReopen()}>
                            {isReopening ? "正在重置…" : "确认重新编辑"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
