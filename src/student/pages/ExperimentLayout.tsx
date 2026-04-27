import { useState, useEffect, useCallback, createContext, useContext, useMemo, useRef } from "react";
import { ArrowLeft, Save, Loader2, FileText, Ruler, Play, BarChart3, CheckCircle2, ChevronRight, Home, Clock, AlertCircle } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

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
import {
    experimentApi,
    tasksApi,
    type ExperimentData,
    type QuestionnaireData,
    type SamplePlanData,
    type SamplingResultsData,
} from "../api-client";
import { getExperimentRouteRedirect } from "../experiment/page-access";
import { clearLegacyTaskReportDraft, clearReportDraft } from "../draft-sync";
import { cn } from "@/lib/utils";

// Stage components
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";
import { AnalysisReport } from "./stages/AnalysisReport";
import { TopicDeletedState } from "../components/TopicDeletedState";

const stages = [
    { name: "问卷设计", description: "第一步：围绕调研目标，设计包含判断题、单选题、多选题和量表题的调查问卷，设置标题、欢迎语和结束语", icon: FileText },
    { name: "样本量规划", description: "第二步：根据置信水平、允许误差、设计效应和预期无回答率等参数，利用公式计算并确定最终调查样本量", icon: Ruler },
    { name: "抽样执行", description: "第三步：在确定的样本量基础上，分别使用简单随机抽样、系统抽样、PPS抽样和分层抽样四种方法从总体中抽取样本", icon: Play },
    { name: "分析与报告", description: "第四步：对比各抽样方法的结果差异，分析样本代表性，撰写调查研究报告", icon: BarChart3 },
] as const;

function getDeadlineClass(level: "urgent" | "warning" | "expired" | "normal") {
    if (level === "urgent") return "text-destructive";
    if (level === "expired") return "text-muted-foreground";
    return "text-primary";
}

// Context for experiment data
interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    lastSavedAt: string | null;
    registerStageSave: (saveHandler: (() => Promise<boolean>) | null) => void;
    saveExperiment: (data: Partial<{
        currentStage: number;
        questionnaire: QuestionnaireData;
        samplePlan: SamplePlanData;
        samplingResults: SamplingResultsData;
        reportContent: string;
    }>) => Promise<boolean>;
}

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function useExperiment() {
    const context = useContext(ExperimentContext);
    if (!context) {
        throw new Error("useExperiment must be used within ExperimentLayout");
    }
    return context;
}

export function ExperimentLayout() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accessDeniedVariant, setAccessDeniedVariant] = useState<"topic_deleted" | "task_revoked" | null>(null);
    const [taskName, setTaskName] = useState("");
    const [deadline, setDeadline] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [confirmRollbackOpen, setConfirmRollbackOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<number | null>(null);
    const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
    const stageSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
    const currentStage = Math.min(4, Math.max(experiment?.currentStage || 1, 1));
    const lastSavedAt = experiment?.lastSavedAt ?? null;

    const registerStageSave = useCallback((saveHandler: (() => Promise<boolean>) | null) => {
        stageSaveHandlerRef.current = saveHandler;
    }, []);

    // Load experiment data
    useEffect(() => {
        async function loadExperiment() {
            if (!taskId) {
                setNotFound(true);
                return;
            }

            setLoading(true);
            setNotFound(false);
            setAccessDeniedVariant(null);
            setRedirectTarget(null);
            try {
                const numericTaskId = parseInt(taskId);
                const [experimentRes, taskRes] = await Promise.all([
                    experimentApi.get(numericTaskId),
                    tasksApi.get(numericTaskId),
                ]);

                if (taskRes.success && taskRes.data) {
                    setTaskName(taskRes.data.name);
                    setDeadline(taskRes.data.deadline ?? null);
                    const nextRedirect = getExperimentRouteRedirect({
                        taskId: numericTaskId,
                        publishedAt: taskRes.data.publishedAt,
                        deadline: taskRes.data.deadline,
                        status: taskRes.data.status,
                    });
                    if (nextRedirect) {
                        setRedirectTarget(nextRedirect);
                    }
                } else if (taskRes.error?.code === "TOPIC_DELETED" || taskRes.error?.code === "TASK_REVOKED") {
                    setExperiment(null);
                    setAccessDeniedVariant(taskRes.error?.code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                    return;
                } else {
                    setExperiment(null);
                    setNotFound(true);
                    return;
                }

                if (experimentRes.success && experimentRes.data) {
                    const normalizedExperiment = {
                        ...experimentRes.data,
                        currentStage: Math.min(4, Math.max(experimentRes.data.currentStage || 1, 1)),
                    };
                    clearLegacyTaskReportDraft(normalizedExperiment.taskId);
                    if (normalizedExperiment.currentStage < 4) {
                        clearReportDraft(normalizedExperiment.id);
                    }
                    setExperiment(normalizedExperiment);
                } else if (experimentRes.error?.code === "TOPIC_DELETED" || experimentRes.error?.code === "TASK_REVOKED") {
                    setExperiment(null);
                    setAccessDeniedVariant(
                        experimentRes.error?.code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted"
                    );
                } else {
                    setExperiment(null);
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load experiment:", error);
                setExperiment(null);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        }
        loadExperiment();
    }, [taskId]);

    // Save experiment data（samplePlan 仅含核心决策参数；高级工具完整中间状态不入库，仅保留最小来源标签）
    const saveExperiment = useCallback(async (data: Partial<{
        currentStage: number;
        questionnaire: QuestionnaireData;
        samplePlan: SamplePlanData;
        samplingResults: SamplingResultsData;
        reportContent: string;
    }>) => {
        if (!taskId) return false;

        setIsSaving(true);
        setSaveError(null);
        try {
            const res = await experimentApi.save(parseInt(taskId), data);
            if (res.success && res.data) {
                const normalizedExperiment = {
                    ...res.data,
                    currentStage: Math.min(4, Math.max(res.data.currentStage || 1, 1)),
                };
                clearLegacyTaskReportDraft(normalizedExperiment.taskId);
                if (normalizedExperiment.currentStage < 4) {
                    clearReportDraft(normalizedExperiment.id);
                }
                setExperiment(normalizedExperiment);
                return true;
            }
            setSaveError(res.error?.message ?? "保存失败，请稍后重试");
            return false;
        } catch (error) {
            console.error("Failed to save experiment:", error);
            setSaveError("保存失败，请稍后重试");
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [taskId]);

    // Manual save button handler
    const handleSave = useCallback(async () => {
        if (stageSaveHandlerRef.current) {
            await stageSaveHandlerRef.current();
            return;
        }
        await saveExperiment({ currentStage });
    }, [currentStage, saveExperiment]);

    const handlePrevStage = useCallback(() => {
        if (currentStage > 1) {
            setTargetStage(currentStage - 1);
            setConfirmRollbackOpen(true);
        }
    }, [currentStage]);

    const applyRollback = useCallback(async () => {
        if (!taskId || targetStage === null) return;
        const res = await experimentApi.reset(Number(taskId), { resetToStage: targetStage });
        if (res.success && res.data) {
            clearLegacyTaskReportDraft(res.data.taskId);
            if (res.data.currentStage <= 3) {
                clearReportDraft(res.data.id);
            }
            setExperiment(res.data);
        }
        setConfirmRollbackOpen(false);
    }, [taskId, targetStage]);

    // Deadline countdown timer - updates every minute
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!deadline) return;
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, [deadline]);

    const deadlineInfo = useMemo(() => {
        if (!deadline) return null;
        const deadlineMs = new Date(deadline).getTime();
        const diff = deadlineMs - now;
        if (diff <= 0) return { passed: true, text: "已截止", level: "expired" as const };
        const hours = diff / (1000 * 60 * 60);
        const days = Math.floor(hours / 24);
        const remainHours = Math.floor(hours % 24);
        const remainMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (hours <= 24) return { passed: false, text: `剩余 ${Math.floor(hours)} 小时 ${remainMinutes} 分钟`, level: "urgent" as const };
        if (days <= 7) return { passed: false, text: `剩余 ${days} 天 ${remainHours} 小时`, level: "warning" as const };
        return { passed: false, text: `剩余 ${days} 天`, level: "normal" as const };
    }, [deadline, now]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="size-10 animate-spin text-primary" />
            </div>
        );
    }

    if (accessDeniedVariant) {
        return <TopicDeletedState variant={accessDeniedVariant} />;
    }

    if (redirectTarget) {
        return <Navigate to={redirectTarget} replace />;
    }

    if (notFound || !experiment) {
        return <Navigate to="/" replace />;
    }

    const renderStage = () => {
        const stageToRender = Math.min(4, Math.max(currentStage, 1));

        switch (stageToRender) {
            case 1:
                return <QuestionnaireDesign />;
            case 2:
                return <SamplePlanning onPrev={handlePrevStage} />;
            case 3:
                return <SamplingExecution onPrev={handlePrevStage} />;
            case 4:
                return <AnalysisReport onPrev={handlePrevStage} onSubmit={() => {
                    if (taskId) {
                        navigate(`/task/${taskId}/preview`);
                    }
                }} />;
            default:
                return null;
        }
    };

    const contextValue: ExperimentContextValue = {
        experiment,
        populationSize: experiment.populationSize,
        isSaving,
        lastSavedAt,
        registerStageSave,
        saveExperiment,
    };


    return (
        <ExperimentContext.Provider value={contextValue}>
            <div className="pb-12" data-testid="student-experiment-layout">
                <div className="sticky top-[4rem] z-40 -mt-2 border-b border-border bg-background/90 backdrop-blur">
                    <div className="flex items-center justify-between px-0 py-2">
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" title="返回首页" asChild>
                                <Link to="/">
                                    <Home />
                                </Link>
                            </Button>
                            <Button variant="ghost" className="hidden sm:flex" asChild>
                                <Link to={`/task/${taskId}`}>
                                    <ArrowLeft data-icon="inline-start" />
                                    退出实验
                                </Link>
                            </Button>
                            <h1 className="ml-2 line-clamp-1 max-w-[200px] border-l border-border pl-4 text-sm font-semibold text-foreground sm:max-w-md">
                                {taskName || `Experiment #${experiment.taskId}`}
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            {deadlineInfo && (
                                <span className={cn("hidden items-center gap-1 text-xs font-medium sm:flex", getDeadlineClass(deadlineInfo.level))}>
                                    {deadlineInfo.level === "urgent" ? (
                                        <AlertCircle className="size-3.5" />
                                    ) : (
                                        <Clock className="size-3.5" />
                                    )}
                                    {deadlineInfo.text}
                                </span>
                            )}
                            {lastSavedAt && (
                                <span className="hidden font-mono text-xs text-muted-foreground sm:inline-block">
                                    已保存于 {new Date(lastSavedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                </span>
                            )}
                            <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving} data-testid="student-experiment-save">
                                {isSaving ? (
                                    <Loader2 data-icon="inline-start" className="animate-spin" />
                                ) : (
                                    <Save data-icon="inline-start" />
                                )}
                                保存
                            </Button>
                        </div>
                    </div>

                    {saveError && (
                        <div
                            className="mb-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                            data-testid="student-experiment-save-error"
                        >
                            {saveError}
                        </div>
                    )}

                    <div className="scrollbar-hide flex items-center gap-3 overflow-x-auto px-1 pb-2.5" data-testid="student-experiment-stages">
                        {stages.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = stageNum < currentStage;
                            const isCurrent = stageNum === currentStage;
                            const Icon = stage.icon;

                            return (
                                <div key={stage.name} className="flex items-center gap-2">
                                    {index > 0 && (
                                        <ChevronRight className={cn("size-3 shrink-0", isCompleted || isCurrent ? "text-muted-foreground" : "text-muted-foreground/50")} />
                                    )}
                                    <button
                                        onClick={() => {
                                            if (stageNum < currentStage) {
                                                setTargetStage(stageNum);
                                                setConfirmRollbackOpen(true);
                                            }
                                        }}
                                        disabled={stageNum >= currentStage}
                                        data-testid={`student-experiment-stage-${stageNum}`}
                                        aria-label={`阶段 ${stageNum}: ${stage.name}`}
                                        className={cn(
                                            "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-200 disabled:cursor-default",
                                            isCurrent
                                                ? "border border-primary/30 bg-primary/10 text-primary"
                                                : isCompleted
                                                    ? "cursor-pointer text-primary hover:bg-primary/10"
                                                    : "text-muted-foreground"
                                        )}
                                    >
                                        <span className="relative shrink-0">
                                            {isCompleted ? (
                                                <CheckCircle2 className="size-3.5 text-primary" />
                                            ) : (
                                                <Icon className={cn("size-3.5", isCurrent ? "text-primary" : "text-muted-foreground")} />
                                            )}
                                        </span>
                                        <span className="hidden sm:inline">{stage.name}</span>
                                        <span className="sm:hidden">{stageNum}</span>
                                    </button>
                                </div>
                            );
                        })}
                        <div className="ml-auto shrink-0 font-mono text-xs font-bold text-primary">
                            {Math.round((currentStage / stages.length) * 100)}%
                        </div>
                    </div>
                </div>

                <div className="mt-6 mb-6">
                    {(() => {
                        const currentStageConfig = stages[currentStage - 1] ?? stages[0];
                        const StageIcon = currentStageConfig.icon;
                        return (
                            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                                    <StageIcon className="size-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground">
                                        阶段 {currentStage}: {currentStageConfig.name}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        {currentStageConfig.description}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                <div className="min-h-[500px] animate-in slide-in-from-bottom-4 duration-500">
                    {renderStage()}
                </div>
            </div>

            <AlertDialog open={confirmRollbackOpen} onOpenChange={setConfirmRollbackOpen}>
                <AlertDialogContent data-testid="student-experiment-rollback-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认返回阶段</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-base leading-relaxed text-muted-foreground">
                                返回到“<span className="font-medium text-primary">{targetStage ? stages[targetStage - 1]!.name : ""}</span>”将导致以下后续阶段的数据被<strong className="text-destructive">永久清空</strong>：
                                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                                    {targetStage !== null && targetStage <= 1 && <li>样本量规划数据</li>}
                                    {targetStage !== null && targetStage <= 2 && <li>抽样执行结果</li>}
                                    {targetStage !== null && targetStage <= 3 && <li>分析报告内容</li>}
                                </ul>
                                <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                                    警告：此操作不可撤销。
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRollback} data-testid="student-experiment-rollback-confirm" variant="destructive">确认返回</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
