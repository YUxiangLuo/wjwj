import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { PlanningHeading } from "../PlanningShared";
import { LearningCheck } from "../LearningCheck";
import { QUIZ_CHECKS, type LearningCheckId } from "../learning";

interface Props {
    questionIndex: number;
    completed: boolean;
    onComplete: (id: LearningCheckId) => void;
    onNext: () => void;
}

export const QUIZ_QUESTION_COUNT = QUIZ_CHECKS.length;

export function QuizPhase({ questionIndex, completed, onComplete, onNext }: Props) {
    const id = QUIZ_CHECKS[questionIndex];
    if (!id) return null;
    return <div className="space-y-6">
        <PlanningHeading title={`快速自检 · ${questionIndex + 1} / ${QUIZ_QUESTION_COUNT}`} description="用三个问题串起精度、总体规模与抽样设计。每题理解正确后继续，不计分，可以重试。"/>
        <LearningCheck key={id} id={id} completed={completed} onComplete={onComplete} title="检查你的理解"/>
        <div className="flex justify-end">
            <Button type="button" onClick={onNext} disabled={!completed} data-testid="immersive-sp-quiz-next" className="min-h-11">
                {questionIndex === QUIZ_QUESTION_COUNT - 1 ? "完成自检，去确认" : "下一题"}<ChevronRight className="ml-2 h-4 w-4"/>
            </Button>
        </div>
    </div>;
}
