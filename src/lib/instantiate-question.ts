import type { Question } from "./questionnaire-types";
import { validateQuestionAtIndex } from "./validate-question";
import { generateOptionIdentity } from "./questionnaire-options";

/** Create a new questionnaire item from a template/copy. Never upgrade a stored item during reads. */
export function instantiateQuestion(source: Question, id: string): Question {
    const error = validateQuestionAtIndex(source, 1);
    if (error) throw new Error(`无法复制题目：${error}`);
    const { variableBinding: _binding, recommendSourceId: _source, ...question } = structuredClone(source);
    return { ...question, id, ...((source.type === "single" || source.type === "multiple")
        ? { options: (source.options ?? []).map(option => ({ id: generateOptionIdentity(), label: option.label })) } : {}) };
}
