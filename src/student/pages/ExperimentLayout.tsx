import { useState } from "react";
import { ArrowLeft, Save, CheckCircle } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mockTasks } from "./TaskHall";

// Stage components (simplified placeholders)
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";
import { AnalysisReport } from "./stages/AnalysisReport";

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

export function ExperimentLayout() {
    const { taskId } = useParams();
    const task = mockTasks.find(t => t.id === Number(taskId));
    const [currentStage, setCurrentStage] = useState(Math.max(task?.currentStage || 1, 1));
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    const handleSave = () => {
        setLastSaved(new Date().toLocaleTimeString("zh-CN"));
    };

    const handleNextStage = () => {
        if (currentStage < 4) {
            setCurrentStage(currentStage + 1);
        }
    };

    const handlePrevStage = () => {
        if (currentStage > 1) {
            setCurrentStage(currentStage - 1);
        }
    };

    if (!task) {
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
                return <AnalysisReport onPrev={handlePrevStage} onSubmit={() => { }} />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Top bar */}
            <div className="flex justify-between items-center">
                <Link to={`/task/${task.id}`}>
                    <Button variant="ghost" className="gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        退出实验
                    </Button>
                </Link>
                <div className="flex items-center gap-4">
                    {lastSaved && (
                        <span className="text-sm text-muted-foreground">
                            已自动保存于 {lastSaved}
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={handleSave}>
                        <Save className="w-4 h-4 mr-1" />
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
                                        onClick={() => stageNum <= currentStage && setCurrentStage(stageNum)}
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
    );
}

export default ExperimentLayout;
