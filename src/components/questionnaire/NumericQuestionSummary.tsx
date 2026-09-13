import type { Question } from "@/lib/questionnaire-types";
import { numericQuestionDescription, parseNumericQuestionRule } from "@/lib/numeric-question";
export function NumericQuestionSummary({ question }: { question: Question }) {
    if (question.type !== "numeric") return null;
    const valid = parseNumericQuestionRule(question.numberRule).ok;
    return <p role={valid ? undefined : "alert"} className={valid ? "mt-2 text-meta text-muted-foreground" : "mt-2 text-meta text-destructive"}>{numericQuestionDescription(question.numberRule)}</p>;
}
