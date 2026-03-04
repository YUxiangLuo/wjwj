import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { ArrowLeft, Save, Loader2, FileText, Ruler, Play, BarChart3, CheckCircle2, ChevronRight, ChevronLeft, Home } from "lucide-react";
import { Link, Navigate, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

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

                    // Fetch task details for name
                    tasksApi.get(parseInt(taskId)).then(taskRes => {
                        if (taskRes.success && taskRes.data) {
                            setTaskName(taskRes.data.name);
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
            <div className="space-y-6 pb-12 animate-in fade-in duration-500">
                {/* Top bar */}
                <div className="sticky top-[4rem] z-40 bg-slate-950/90 backdrop-blur pb-4 pt-2 -mt-2 border-b border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Link to="/">
                            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white hover:bg-slate-800" title="返回首页">
                                <Home className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Link to={`/task/${taskId}`}>
                            <Button variant="ghost" className="gap-2 text-slate-400 hover:text-white hover:bg-slate-800 hidden sm:flex">
                                <ArrowLeft className="w-4 h-4" />
                                退出实验
                            </Button>
                        </Link>
                        <h1 className="text-sm font-semibold text-slate-200 border-l border-slate-700 pl-4 ml-2 line-clamp-1 max-w-[200px] sm:max-w-md">
                            {taskName || `Experiment #${experiment.taskId}`}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {lastSavedAt && (
                            <span className="text-xs text-slate-500 font-mono hidden sm:inline-block">
                                已自动保存于 {new Date(lastSavedAt).toLocaleTimeString("zh-CN")}
                            </span>
                        )}
                        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white">
                            {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            保存
                        </Button>
                    </div>
                </div>

                {/* Overall Progress */}
                <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-lg">
                    <CardContent className="py-6 px-4 sm:px-8">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">实验总进度</div>
                                    <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                        阶段 {currentStage}: {stageNames[currentStage - 1]}
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-indigo-400 font-mono">
                                    {Math.round((currentStage / stageNames.length) * 100)}%
                                </div>
                            </div>

                            <div className="relative h-2 w-full rounded-full bg-slate-800">
                                <div
                                    className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500 ease-out"
                                    style={{ width: `${(currentStage / stageNames.length) * 100}%` }}
                                >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg shadow-purple-500/50"></div>
                                </div>
                            </div>

                            <div className="flex items-start justify-between gap-1 overflow-x-auto pb-2 scrollbar-hide">
                                {stageNames.map((stage, index) => {
                                    const stageNum = index + 1;
                                    const isCompleted = stageNum < currentStage;
                                    const isCurrent = stageNum === currentStage;
                                    const Icon = [FileText, Ruler, Play, BarChart3, CheckCircle2][index] ?? FileText;

                                    return (
                                        <button
                                            key={stage}
                                            onClick={() => {
                                                if (stageNum < currentStage) {
                                                    setTargetStage(stageNum);
                                                    setConfirmRollbackOpen(true);
                                                }
                                            }}
                                            disabled={stageNum >= currentStage}
                                            className="flex flex-col items-center gap-3 min-w-[70px] disabled:cursor-default group"
                                        >
                                            <span
                                                className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300 ${isCurrent
                                                    ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110"
                                                    : isCompleted
                                                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20"
                                                        : "border-slate-800 bg-slate-900 text-slate-600"
                                                    }`}
                                            >
                                                <Icon className="w-5 h-5" />
                                                {isCompleted && (
                                                    <span className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 border-2 border-slate-950 p-[2px] text-white">
                                                        <CheckCircle2 className="h-2.5 w-2.5" />
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`text-[10px] font-medium uppercase tracking-tight whitespace-nowrap px-2 py-1 rounded-md transition-colors ${isCurrent ? "text-indigo-300 bg-indigo-500/10" :
                                                isCompleted ? "text-emerald-500/70" :
                                                    "text-slate-600"
                                                }`}>
                                                {stage}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

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
                            返回到“<span className="text-indigo-400 font-medium">{targetStage ? stageNames[targetStage - 1] : ""}</span>”将导致以下后续阶段的数据被<strong className="text-rose-400">永久清空</strong>：
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-slate-400">
                                <li>样本量规划数据</li>
                                <li>抽样执行结果</li>
                                <li>分析报告内容</li>
                            </ul>
                            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs">
                                ⚠️ 警告：此操作不可撤销。
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRollback} className="bg-rose-600 hover:bg-rose-700 text-white">确认返回</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
