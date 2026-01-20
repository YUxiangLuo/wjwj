import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { ArrowLeft, Save, CheckCircle, Loader2 } from "lucide-react";
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
    const [currentStage, setCurrentStage] = useState(1);
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
            try {
                const res = await experimentApi.get(parseInt(taskId));
                if (res.success && res.data) {
                    setExperiment(res.data);
                    setCurrentStage(Math.max(res.data.currentStage || 1, 1));
                    setLastSavedAt(res.data.lastSavedAt);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load experiment:", error);
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
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (notFound || !experiment) {
        return <Navigate to="/" replace />;
    }

    const renderStage = () => {
        switch (currentStage) {
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
            <div className="space-y-6">
                {/* Top bar */}
                <div className="flex justify-between items-center">
                    <Link to={`/task/${taskId}`}>
                        <Button variant="ghost" className="gap-2">
                            <ArrowLeft className="w-4 h-4" />
                            退出实验
                        </Button>
                    </Link>
                    <div className="flex items-center gap-4">
                        {lastSavedAt && (
                            <span className="text-sm text-muted-foreground">
                                已自动保存于 {new Date(lastSavedAt).toLocaleTimeString("zh-CN")}
                            </span>
                        )}
                        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </div>

                {/* Stage Stepper */}
                <Card>
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            {stageNames.map((stage, index) => {
                                const stageNum = index + 1;
                                const isCompleted = stageNum < currentStage;
                                const isCurrent = stageNum === currentStage;

                                return (
                                    <div key={stage} className="flex items-center flex-1">
                                        <button
                                            onClick={() => {
                                                if (stageNum > currentStage) return;
                                                if (stageNum === currentStage) return;
                                                setTargetStage(stageNum);
                                                setConfirmRollbackOpen(true);
                                            }}
                                            disabled={stageNum > currentStage}
                                            className="flex flex-col items-center"
                                        >
                                            <div className={`
                                                w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                                                ${isCompleted ? "bg-emerald-500 text-white" :
                                                    isCurrent ? "bg-blue-500 text-white" :
                                                        "bg-slate-200 text-slate-400"}
                                                ${stageNum <= currentStage ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"}
                                            `}>
                                                {isCompleted ? <CheckCircle className="w-5 h-5" /> : stageNum}
                                            </div>
                                            <span className={`text-xs mt-2 ${isCurrent ? "font-medium text-blue-600" :
                                                    isCompleted ? "text-emerald-600" :
                                                        "text-muted-foreground"
                                                }`}>
                                                {stage}
                                            </span>
                                        </button>
                                        {index < stageNames.length - 1 && (
                                            <div className={`flex-1 h-1 mx-2 ${stageNum < currentStage ? "bg-emerald-500" : "bg-slate-200"
                                                }`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Stage Content */}
                <div className="min-h-[400px]">
                    {renderStage()}
                </div>
            </div>

            <AlertDialog open={confirmRollbackOpen} onOpenChange={setConfirmRollbackOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认返回阶段</AlertDialogTitle>
                        <AlertDialogDescription>
                            返回到“{targetStage ? stageNames[targetStage - 1] : ""}”将清空以下数据：
                            <br />
                            - 样本量规划
                            <br />
                            - 抽样执行结果
                            <br />
                            - 分析报告内容
                            <br />
                            确认继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={applyRollback}>确认返回</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
