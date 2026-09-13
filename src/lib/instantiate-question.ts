import type { Question } from "./questionnaire-types";
import { generateOptionIdentity } from "./questionnaire-options";

/** Create a new questionnaire item from a template/copy. Never upgrade a stored item during reads. */
export function instantiateQuestion(source: Question, id: string): Question {
    const { optionIds: _ids, variableBinding: _binding, recommendSourceId: _source, ...question } = structuredClone(source);
    return { ...question, id, ...((source.type === "single" || source.type === "multiple")
        ? { optionIds: (source.options ?? []).map(() => generateOptionIdentity()) } : {}) };
}
