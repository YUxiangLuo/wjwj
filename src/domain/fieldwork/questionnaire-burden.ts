import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { AnalysisTarget } from "../../lib/analysis-target";
import type { VariableDefinition, VariableDictionary } from "../variables/types";
import { bindingCategories, questionSignature } from "../variables/question-binding";

export interface QuestionnaireBurdenProfile {
    questionCount: number;
    estimatedDurationSec: number;
    estimatedMinutes: number;
    burdenLevel: "low" | "moderate" | "high";
    welcomeHasPurposeAndPrivacy: boolean;
    funnelOrderClean: boolean;
    boundFields: string[];
    unboundVariables: string[];
    primaryTargetBound: boolean;
    primaryTargetQuestionIndex: number | null;
    scaleOrSingleQuestionCount: number;
    /** 附加在初始单元无回答率上的惩罚项（0..0.15） */
    refusalPenalty: number;
    /** 题量过长引发的中途弃答基准概率（0..0.28） */
    totalBreakoffProbability: number;
    /** 闪电敷衍卷附加风险（0..0.12） */
    speederPenalty: number;
}

const SECTION_RANK: Record<string, number> = {
    screening: 0,
    main: 1,
    background: 2,
};

function stripHtmlPlain(text: string | undefined | null): string {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveQuestionBoundFields(question: Question): string[] {
    if (!question.variableBinding?.mappings?.length) return [];
    return [...new Set(question.variableBinding.mappings.map((m) => m.field).filter(Boolean))];
}

/**
 * 判断题目是否覆盖某个总体字段：优先严格使用显式 variableBinding；
 * 若当前课题无变量字典，回退按题目文本包含字段名作宽松匹配。
 */
export function findQuestionIndexForField(
    questionnaire: QuestionnaireData | null | undefined,
    field: string,
    hasDictionary: boolean,
): number | null {
    if (!questionnaire?.questions?.length || !field) return null;
    for (let index = 0; index < questionnaire.questions.length; index += 1) {
        const q = questionnaire.questions[index]!;
        if (resolveQuestionBoundFields(q).includes(field)) return index;
    }
    if (!hasDictionary) {
        for (let index = 0; index < questionnaire.questions.length; index += 1) {
            if (questionnaire.questions[index]!.content.includes(field)) return index;
        }
    }
    return null;
}

export function evaluateQuestionnaireBurden(
    questionnaire: QuestionnaireData | null | undefined,
    dictionary: VariableDictionary | null | undefined,
    target?: AnalysisTarget | null,
): QuestionnaireBurdenProfile {
    const questions = questionnaire?.questions ?? [];
    const questionCount = questions.length;

    let estimatedDurationSec = 18;
    let scaleOrSingleQuestionCount = 0;
    let funnelOrderClean = true;
    let maxRankSeen = 0;
    const boundFieldSet = new Set<string>();

    for (const q of questions) {
        const rank = SECTION_RANK[q.section ?? "main"] ?? 1;
        if (rank < maxRankSeen) funnelOrderClean = false;
        if (rank > maxRankSeen) maxRankSeen = rank;

        if (q.type === "multiple") estimatedDurationSec += 24;
        else if (q.type === "numeric") estimatedDurationSec += 20;
        else if (q.type === "scale") {
            estimatedDurationSec += 16;
            scaleOrSingleQuestionCount += 1;
        } else if (q.type === "single") {
            estimatedDurationSec += 15;
            scaleOrSingleQuestionCount += 1;
        } else {
            estimatedDurationSec += 12;
        }

        for (const field of resolveQuestionBoundFields(q)) {
            boundFieldSet.add(field);
        }
    }

    const welcomePlain = stripHtmlPlain(questionnaire?.welcomeText);
    const welcomeHasPurposeAndPrivacy =
        welcomePlain.length >= 30
        && /(匿名|保密|隐私|自愿|仅用于|仅作|不记名|脱敏)/.test(welcomePlain);

    const refusalPenalty =
        (welcomePlain.length < 25 ? 0.06 : 0)
        + (!welcomeHasPurposeAndPrivacy ? 0.04 : 0)
        + (!funnelOrderClean ? 0.02 : 0);

    const excessQuestions = Math.max(0, questionCount - 12);
    const totalBreakoffProbability = Math.min(0.28, excessQuestions * 0.018 + (funnelOrderClean ? 0 : 0.03));
    const speederPenalty = Math.min(0.12, Math.max(0, questionCount - 14) * 0.01 + (!welcomeHasPurposeAndPrivacy ? 0.02 : 0));

    const burdenLevel: "low" | "moderate" | "high" =
        questionCount <= 10 && totalBreakoffProbability <= 0.03
            ? "low"
            : questionCount <= 16 && totalBreakoffProbability <= 0.1
                ? "moderate"
                : "high";

    const substantiveVars = (dictionary?.variables ?? []).filter((v) => v.kind !== "identifier");
    const boundFields = [...boundFieldSet];
    const unboundVariables = substantiveVars
        .map((v) => v.field)
        .filter((field) => !boundFieldSet.has(field));

    const hasDictionary = Boolean(dictionary && substantiveVars.length > 0);
    const primaryTargetQuestionIndex = target
        ? findQuestionIndexForField(questionnaire, target.field, hasDictionary)
        : (questionCount > 0 ? 0 : null);
    const primaryTargetBound = target ? primaryTargetQuestionIndex !== null : true;

    return {
        questionCount,
        estimatedDurationSec,
        estimatedMinutes: Math.max(1, Math.ceil(estimatedDurationSec / 60)),
        burdenLevel,
        welcomeHasPurposeAndPrivacy,
        funnelOrderClean,
        boundFields,
        unboundVariables,
        primaryTargetBound,
        primaryTargetQuestionIndex,
        scaleOrSingleQuestionCount,
        refusalPenalty: Math.min(0.15, refusalPenalty),
        totalBreakoffProbability,
        speederPenalty,
    };
}

export function checkNumericQuestionRangeConflict(question: Question, numericValue: number): boolean {
    if (question.type !== "numeric") return false;
    if (question.numericMin !== undefined && numericValue < question.numericMin) return true;
    if (question.numericMax !== undefined && numericValue > question.numericMax) return true;
    return false;
}

/**
 * 为与变量字典题型/量纲/选项匹配的题目自动构建合规 variableBinding，
 * 支撑学生端“一键智能匹配并绑定推荐题”及内置种子初始化。
 */
export function buildAutoVariableBindingForQuestion(params: {
    question: Question;
    dictionary: VariableDictionary;
    taskId: number;
    preferredField?: string;
}): Question["variableBinding"] | null {
    const { question, dictionary, taskId, preferredField } = params;
    const candidates = preferredField
        ? dictionary.variables.filter((v) => v.field === preferredField)
        : dictionary.variables.filter((v) => v.kind !== "identifier");

    for (const variable of candidates) {
        if (variable.kind === "identifier") continue;
        if (!preferredField && !question.content.includes(variable.label) && !question.content.includes(variable.field)) {
            continue;
        }

        if (question.type === "numeric" && variable.kind === "continuous") {
            if ((question.unit ?? "") !== variable.unit) continue;
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{ field: variable.field, answers: [] }],
            };
        }

        if (question.type === "scale" && variable.kind === "ordinal") {
            const min = question.scaleMin ?? 1;
            const max = question.scaleMax ?? 10;
            const validCats = bindingCategories(variable);
            if (validCats.length !== max - min + 1) continue;
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{
                    field: variable.field,
                    answers: validCats.map((cat, idx) => ({
                        answer: String(min + idx),
                        value: cat.value,
                    })),
                }],
            };
        }

        if (question.type === "boolean" && variable.kind === "nominal") {
            const validCats = bindingCategories(variable);
            if (validCats.length !== 2) continue;
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{
                    field: variable.field,
                    answers: [
                        { answer: "是", value: validCats[0]!.value },
                        { answer: "否", value: validCats[1]!.value },
                    ],
                }],
            };
        }

        if (question.type === "single" && (variable.kind === "nominal" || variable.kind === "ordinal")) {
            const options = question.options ?? [];
            const validCats = bindingCategories(variable);
            if (options.length === validCats.length) {
                return {
                    taskId,
                    source: dictionary.source,
                    revision: dictionary.revision,
                    signature: questionSignature(question),
                    mappings: [{
                        field: variable.field,
                        answers: options.map((opt, idx) => ({
                            answer: opt,
                            value: validCats[idx]!.value,
                        })),
                    }],
                };
            }
            if (options.length === validCats.length + 1 && variable.missing.length > 0) {
                return {
                    taskId,
                    source: dictionary.source,
                    revision: dictionary.revision,
                    signature: questionSignature(question),
                    mappings: [{
                        field: variable.field,
                        answers: [
                            ...validCats.map((cat, idx) => ({
                                answer: options[idx]!,
                                value: cat.value,
                            })),
                            {
                                answer: options[validCats.length]!,
                                value: variable.missing[0] ?? null,
                            },
                        ],
                    }],
                };
            }
        }
    }
    return null;
}

export function autoBindQuestionnaireVariables(params: {
    questionnaire: QuestionnaireData;
    dictionary: VariableDictionary;
    taskId: number;
    targetField?: string;
}): { questionnaire: QuestionnaireData; newlyBoundCount: number } {
    const usedFields = new Set<string>();
    for (const q of params.questionnaire.questions) {
        for (const f of resolveQuestionBoundFields(q)) usedFields.add(f);
    }

    let newlyBoundCount = 0;
    const nextQuestions = params.questionnaire.questions.map((question) => {
        if (question.variableBinding?.mappings?.length) return question;
        // Try exact label/field match first, then primary target match if compatible
        let binding = buildAutoVariableBindingForQuestion({
            question,
            dictionary: params.dictionary,
            taskId: params.taskId,
        });
        if (!binding && params.targetField && !usedFields.has(params.targetField)) {
            binding = buildAutoVariableBindingForQuestion({
                question,
                dictionary: params.dictionary,
                taskId: params.taskId,
                preferredField: params.targetField,
            });
        }
        if (!binding) return question;
        const fields = binding.mappings.map((m) => m.field);
        if (fields.some((f) => usedFields.has(f))) return question;
        for (const f of fields) usedFields.add(f);
        newlyBoundCount += 1;
        return { ...question, variableBinding: binding };
    });

    return {
        questionnaire: { ...params.questionnaire, questions: nextQuestions },
        newlyBoundCount,
    };
}

export function findCompatibleDictionaryField(question: Question, variables: VariableDefinition[]): VariableDefinition | null {
    for (const v of variables) {
        if (v.kind === "identifier") continue;
        if (question.type === "numeric" && v.kind === "continuous" && (question.unit ?? "") === v.unit) return v;
        if (question.type === "scale" && v.kind === "ordinal") return v;
        if ((question.type === "single" || question.type === "boolean") && (v.kind === "nominal" || v.kind === "ordinal")) return v;
    }
    return null;
}
