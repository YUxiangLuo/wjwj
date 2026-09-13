import type { Question } from "@/lib/questionnaire-types";
import { validateQuestionAtIndex } from "@/lib/validate-question";
import { variableValueKey, type VariableDictionaryV1, type VariableValue } from "./variable-dictionary";

/** Optional, versioned semantic correspondence. Never a questionnaire response or collection provenance. */
interface QuestionBindingScope {
    schemaVersion: 1;
    taskId: number;
    datasetRevision: string;
    dictionaryRevision: number;
    questionSignature: string;
}
export interface CategoricalQuestionBinding extends QuestionBindingScope {
    kind: "categorical" | "multiple-binary";
    answers: Array<{ answerId: string; variableId: string; value: VariableValue }>;
}
export interface ContinuousQuestionBinding extends QuestionBindingScope {
    kind: "continuous";
    variableId: string;
}
export type QuestionVariableBindingV1 = CategoricalQuestionBinding | ContinuousQuestionBinding;
export function questionAnswers(question: Question): Array<{ id: string; label: string }> {
    if (question.type === "numeric") return [];
    if (question.type === "boolean") return [{ id: "yes", label: "是" }, { id: "no", label: "否" }];
    if (question.type === "scale") {
        const min = question.scaleMin ?? 1, max = question.scaleMax ?? 10;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min >= max) return [];
        return Array.from({ length: max - min + 1 }, (_, index) => ({ id: `score_${min + index}`, label: String(min + index) }));
    }
    return (question.options ?? []).map(option => ({ id: option.id, label: option.label }));
}
/** Deterministic semantic snapshot: reordering questions does not invalidate a link; editing its meaning does. */
export function questionBindingSignature(question: Question): string {
    if (question.type === "numeric") return JSON.stringify([question.id, question.type, question.content, question.section ?? "main",
        question.numberRule?.unit, question.numberRule?.min, question.numberRule?.max, question.numberRule?.decimalPlaces]);
    // Canonical labels/identities are independent of storage layout; existing claims need no signature rewrite.
    return JSON.stringify([question.id, question.type, question.content, question.section ?? "main",
        question.options?.map(option => option.label) ?? null, question.options?.map(option => option.id) ?? null, question.minSelect ?? null, question.maxSelect ?? null,
        question.scaleMin ?? null, question.scaleMax ?? null, question.scaleMinLabel ?? null, question.scaleMaxLabel ?? null]);
}
function identity(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !value.includes("\0");
}
export function parseQuestionVariableBinding(raw: unknown, question: Question, dictionary: VariableDictionaryV1 | null, taskId?: number):
    { ok: true; value: QuestionVariableBindingV1 } | { ok: false; error: string } {
    const fail = (error: string) => ({ ok: false as const, error });
    if (!dictionary || dictionary.revision < 1) return fail("教师尚未确认变量字典，请保持仅认知预试或联系教师");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("题目变量关联格式无效");
    const value = raw as Record<string, unknown>;
    if (value.schemaVersion !== 1) return fail("题目变量关联版本暂不支持");
    if (!Number.isSafeInteger(value.taskId) || Number(value.taskId) < 1 || (taskId !== undefined && value.taskId !== taskId)) return fail("关联不属于当前实验任务，请重新核对");
    if (value.datasetRevision !== dictionary.datasetRevision || value.dictionaryRevision !== dictionary.revision) return fail("关联所用变量字典已改变，请重新核对关联");
    if (!identity(question.id) || validateQuestionAtIndex(question, 1)) return fail("关联题目或选项身份无效，请先修正题目");
    if (value.questionSignature !== questionBindingSignature(question)) return fail("题目含义或作答规则已改变，请重新核对关联");
    if (question.type === "numeric") {
        if (value.kind !== "continuous" || value.answers !== undefined) return fail("数值题须直接关联连续变量，不能附带选项编码或作答数据");
        const variable = dictionary.variables.find(v => v.id === value.variableId);
        if (!variable || variable.measurementLevel !== "continuous" || variable.storageType !== "number") return fail("数值题只能关联已确认的连续数值变量，不能将分类编码或标识符当作数值量");
        if (variable.unit !== question.numberRule!.unit) return fail("题目单位与变量字典不一致，请核对后修改；不会自动换算");
        return { ok: true, value: { schemaVersion: 1, taskId: value.taskId as number, datasetRevision: dictionary.datasetRevision,
            dictionaryRevision: dictionary.revision, questionSignature: value.questionSignature as string, kind: "continuous", variableId: variable.id } };
    }
    const answers = questionAnswers(question);
    if (answers.length < 2 || answers.some(answer => !identity(answer.id))) return fail("题目的可选答案身份无效，不能确认关联");
    const expectedKind = question.type === "multiple" ? "multiple-binary" : "categorical";
    if (value.kind !== expectedKind || !Array.isArray(value.answers) || value.answers.length !== answers.length) return fail("每个选项都需明确对应真实编码；多选需独立二值字段");
    const result: CategoricalQuestionBinding["answers"] = [];
    for (let index = 0; index < answers.length; index++) {
        const entry = value.answers[index];
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.answerId !== answers[index]!.id) return fail("关联选项身份或顺序不一致");
        const variable = dictionary.variables.find(v => v.id === entry.variableId);
        if (!variable || !["nominal", "ordinal"].includes(variable.measurementLevel)) return fail("只能关联字典中已确认的分类变量，不能把连续数据强行当作选项");
        if (!variable.categories.some(c => variableValueKey(c.value) === variableValueKey(entry.value))) return fail("关联原值不在有效类别中；缺失编码不能充当答案");
        if (expectedKind === "multiple-binary" && variable.categories.length !== 2) return fail("多选的每个选项必须对应一个真实二值字段");
        if (question.type === "scale" && (variable.measurementLevel !== "ordinal" || variableValueKey(variable.categories[index]?.value as VariableValue) !== variableValueKey(entry.value))) return fail("评分题需按字典的有序类别顺序逐级关联");
        result.push({ answerId: entry.answerId, variableId: variable.id, value: entry.value });
    }
    const variableIds = new Set(result.map(entry => entry.variableId));
    if (expectedKind === "multiple-binary") {
        if (variableIds.size !== result.length) return fail("多选不能把同一分类列当作多个选项的响应列");
    } else {
        if (variableIds.size !== 1) return fail("单值题目必须对应同一个变量");
        const variable = dictionary.variables.find(v => v.id === result[0]!.variableId)!;
        if (variable.categories.length !== result.length || new Set(result.map(entry => variableValueKey(entry.value))).size !== result.length) return fail("题目选项需与全部有效类别一一对应，不得重复或遗漏");
    }
    return { ok: true, value: { schemaVersion: 1, taskId: value.taskId as number, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision,
        questionSignature: value.questionSignature as string, kind: expectedKind, answers: result } };
}
export function hasQuestionVariableBindings(questionnaire: unknown): boolean {
    const questions = (questionnaire as { questions?: unknown } | null)?.questions;
    return Array.isArray(questions) && questions.some(q => q && typeof q === "object" && q.variableBinding !== undefined);
}
/** Associations are optional; questionnaire validation remains required whether bound or not. */
export function validateQuestionnaireBindings(questionnaire: unknown, dictionary: VariableDictionaryV1 | null, taskId?: number): string | null {
    if (!hasQuestionVariableBindings(questionnaire)) return null;
    const questions = (questionnaire as { questions: Question[] }).questions;
    if (new Set(questions.map(q => q.id)).size !== questions.length || questions.some(q => !identity(q.id))) return "关联问卷的题目身份无效或重复";
    const bytes = new TextEncoder().encode(JSON.stringify(questions.map(q => q.variableBinding ?? null))).length;
    if (bytes > 96 * 1024) return "题目变量关联超过 96 KiB，请减少关联内容";
    for (let index = 0; index < questions.length; index++) {
        const question = questions[index]!;
        if (question.variableBinding === undefined) continue;
        const parsed = parseQuestionVariableBinding(question.variableBinding, question, dictionary, taskId);
        if (!parsed.ok) return `第${index + 1}题：${parsed.error}`;
    }
    return null;
}
/** An edited/copied question must not silently inherit a claim about its former meaning. */
export function keepUnchangedQuestionBinding(previous: Question, next: Question): Question {
    if (previous.variableBinding && questionBindingSignature(previous) === questionBindingSignature(next)) return { ...next, variableBinding: previous.variableBinding };
    const { variableBinding: _discarded, ...unbound } = next;
    return unbound;
}
