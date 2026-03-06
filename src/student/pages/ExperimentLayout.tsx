import { useState, useEffect, useCallback, createContext, useContext, useMemo } from "react";
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

// Stage components
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";
import { AnalysisReport } from "./stages/AnalysisReport";
import { TopicDeletedState } from "../components/TopicDeletedState";

const stages = [
    { name: "问卷设计", description: "设计调查问卷，包括标题、欢迎语、问题和结束语", icon: FileText },
    { name: "样本量规划", description: "设置抽样参数，计算最优样本量", icon: Ruler },
    { name: "抽样执行", description: "使用三种抽样方法从总体中抽取样本", icon: Play },
    { name: "分析与报告", description: "分析抽样结果，撰写研究报告", icon: BarChart3 },
] as const;

// Context for experiment data
interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    lastSavedAt: string | null;
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
    const [topicDeleted, setTopicDeleted] = useState(false);
    const [currentStage, setCurrentStage] = useState(1);
    const [taskName, setTaskName] = useState("");
    const [deadline, setDeadline] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [confirmRollbackOpen, setConfirmRollbackOpen] = useState(false);
    const [targetStage, setTargetStage] = useState<number | null>(null);

    // Load experiment data
    useEffect(() => {
        async function loadExperiment() {
            if (!taskId) {
                setNotFound(true);
                return;
            }

            setLoading(true);
            setNotFound(false);
            setTopicDeleted(false);
            try {
                const res = await experimentApi.get(parseInt(taskId));
                if (res.success && res.data) {
                    const normalizedStage = Math.min(4, Math.max(res.data.currentStage || 1, 1));
                    setExperiment(res.data);
                    setCurrentStage(normalizedStage);
                    setLastSavedAt(res.data.lastSavedAt);

                    // Fetch task details for name and deadline
                    tasksApi.get(parseInt(taskId)).then(taskRes => {
                        if (taskRes.success && taskRes.data) {
                            setTaskName(taskRes.data.name);
                            setDeadline(taskRes.data.deadline ?? null);
                        } else if (taskRes.error?.code === "TOPIC_DELETED") {
                            setTopicDeleted(true);
                            setExperiment(null);
                        }
                    });
                } else if (res.error?.code === "TOPIC_DELETED") {
                    setExperiment(null);
                    setTopicDeleted(true);
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

    // Save experiment data
    const saveExperiment = useCallback(async (data: Partial<{
        currentStage: number;
        questionnaire: QuestionnaireData;
        samplePlan: SamplePlanData;
        samplingResults: SamplingResultsData;
        reportContent: string;
    }>) => {
        if (!taskId) return false;

        setIsSaving(true);
        try {
            const res = await experimentApi.save(parseInt(taskId), data);
            if (res.success && res.data) {
                setLastSavedAt(res.data.lastSavedAt);

                // Update local experiment state
                setExperiment((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        ...data,
                        lastSavedAt: res.data!.lastSavedAt,
                    };
                });

                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to save experiment:", error);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [taskId]);

    // Manual save button handler
    const handleSave = useCallback(async () => {
        await saveExperiment({ currentStage });
    }, [saveExperiment, currentStage]);

    const handleNextStage = useCallback(async () => {
        if (currentStage < 4) {
            const newStage = currentStage + 1;
            const success = await saveExperiment({ currentStage: newStage });
            if (success) {
                setCurrentStage(newStage);
            }
        }
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
        if (res.success) {
            setExperiment((prev) => {
                if (!prev) return prev;
                const next = { ...prev, currentStage: targetStage };
                if (targetStage <= 1) {
                    next.samplePlan = null;
                    next.samplingResults = null;
                    next.reportContent = null;
                }
                if (targetStage <= 2) {
                    next.samplingResults = null;
                    next.reportContent = null;
                }
                if (targetStage <= 3) {
                    next.reportContent = null;
                }
                return next;
            });
            setCurrentStage(targetStage);
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
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (topicDeleted) {
        return <TopicDeletedState />;
    }

    if (notFound || !experiment) {
        return <Navigate to="/" replace />;
    }

    const renderStage = () => {
        const stageToRender = Math.min(4, Math.max(currentStage, 1));

        switch (stageToRender) {
            case 1:
                return <QuestionnaireDesign onNext={handleNextStage} />;
            case 2:
                return <SamplePlanning onNext={handleNextStage} onPrev={handlePrevStage} />;
            case 3:
                return <SamplingExecution onNext={handleNextStage} onPrev={handlePrevStage} />;
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
        saveExperiment,
    };


    return (
        <ExperimentContext.Provider value={contextValue}>
            <div className="pb-12 animate-in fade-in duration-500">
                {/* Sticky header: top bar + compact stage navigation */}
                <div className="sticky top-[4rem] z-40 bg-slate-950/90 backdrop-blur -mt-2 border-b border-slate-800/50">
                    {/* Row 1: Title + actions */}
                    <div className="flex justify-between items-center pt-2 pb-2 px-0">
                        <div className="flex items-center gap-2">
                            <Link to="/">
                                <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-100 hover:bg-slate-800" title="返回首页">
                                    <Home className="w-4 h-4" />
                                </Button>
                            </Link>
                            <Link to={`/task/${taskId}`}>
                                <Button variant="ghost" className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 hidden sm:flex">
                                    <ArrowLeft className="w-4 h-4" />
                                    退出实验
                                </Button>
                            </Link>
                            <h1 className="text-sm font-semibold text-slate-200 border-l border-slate-700 pl-4 ml-2 line-clamp-1 max-w-[200px] sm:max-w-md">
                                {taskName || `Experiment #${experiment.taskId}`}
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            {deadlineInfo && (
                                <span className={`text-xs font-medium flex items-center gap-1 hidden sm:flex ${
                                    deadlineInfo.level === "urgent" ? "text-rose-400" :
                                    deadlineInfo.level === "warning" ? "text-amber-400" :
                                    deadlineInfo.level === "expired" ? "text-slate-500" :
                                    "text-slate-400"
                                }`}>
                                    {deadlineInfo.level === "urgent" ? (
                                        <AlertCircle className="w-3.5 h-3.5" />
                                    ) : (
                                        <Clock className="w-3.5 h-3.5" />
                                    )}
                                    {deadlineInfo.text}
                                </span>
                            )}
                            {lastSavedAt && (
                                <span className="text-xs text-slate-500 font-mono hidden sm:inline-block">
                                    已自动保存于 {new Date(lastSavedAt).toLocaleTimeString("zh-CN")}
                                </span>
                            )}
                            <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100">
                                {isSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                ) : (
                                    <Save className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                保存
                            </Button>
                        </div>
                    </div>

                    {/* Row 2: Compact stage progress (always visible) */}
                    <div className="flex items-center gap-3 pb-2.5 px-1 overflow-x-auto scrollbar-hide">
                        {stages.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = stageNum < currentStage;
                            const isCurrent = stageNum === currentStage;
                            const Icon = stage.icon;

                            return (
                                <div key={stage.name} className="flex items-center gap-2">
                                    {index > 0 && (
                                        <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isCompleted || isCurrent ? "text-slate-500" : "text-slate-700"}`} />
                                    )}
                                    <button
                                        onClick={() => {
                                            if (stageNum < currentStage) {
                                                setTargetStage(stageNum);
                                                setConfirmRollbackOpen(true);
                                            }
                                        }}
                                        disabled={stageNum >= currentStage}
                                        aria-label={`阶段 ${stageNum}: ${stage.name}`}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 disabled:cursor-default ${
                                            isCurrent
                                                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                                                : isCompleted
                                                    ? "text-emerald-400/80 hover:bg-emerald-500/10 cursor-pointer"
                                                    : "text-slate-600"
                                        }`}
                                    >
                                        <span className="relative flex-shrink-0">
                                            {isCompleted ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            ) : (
                                                <Icon className={`w-3.5 h-3.5 ${isCurrent ? "text-indigo-400" : "text-slate-600"}`} />
                                            )}
                                        </span>
                                        <span className="hidden sm:inline">{stage.name}</span>
                                        <span className="sm:hidden">{stageNum}</span>
                                    </button>
                                </div>
                            );
                        })}
                        <div className="ml-auto text-xs font-bold text-indigo-400 font-mono flex-shrink-0">
                            {Math.round((currentStage / stages.length) * 100)}%
                        </div>
                    </div>
                </div>

                {/* Stage description card */}
                <div className="mt-6 mb-6">
                    {(() => {
                        const currentStageConfig = stages[currentStage - 1] ?? stages[0];
                        const StageIcon = currentStageConfig.icon;
                        return (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-800/50">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex-shrink-0">
                                    <StageIcon className="w-4 h-4 text-indigo-400" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-200">
                                        阶段 {currentStage}: {currentStageConfig.name}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {currentStageConfig.description}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Stage Content */}
                <div className="min-h-[500px] animate-in slide-in-from-bottom-4 duration-500">
                    {renderStage()}
                </div>
            </div>

            <AlertDialog open={confirmRollbackOpen} onOpenChange={setConfirmRollbackOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认返回阶段</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 text-base leading-relaxed">
                            返回到“<span className="text-indigo-400 font-medium">{targetStage ? stages[targetStage - 1]!.name : ""}</span>”将导致以下后续阶段的数据被<strong className="text-rose-400">永久清空</strong>：
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-slate-400">
                                {targetStage !== null && targetStage <= 1 && <li>样本量规划数据</li>}
                                {targetStage !== null && targetStage <= 2 && <li>抽样执行结果</li>}
                                {targetStage !== null && targetStage <= 3 && <li>分析报告内容</li>}
                            </ul>
                            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                ⚠️ 警告：此操作不可撤销。
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRollback} className="bg-rose-600 hover:bg-rose-700 text-white">确认返回</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
