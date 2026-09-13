import { validateQuestionAtIndex } from "@/lib/validate-question";
import { getRichTextPlainText } from "@/utils/rich-text";
import type { Question } from "@/lib/questionnaire-types";
import { getDuplicateOptionIndexes, validateOptionStructure } from "@/lib/questionnaire-options";

export type ScoreStatus = "pass" | "warning" | "fail";

export interface ScoreItem {
    label: string;
    points: number;
    status: ScoreStatus;
    message: string;
}

interface QuestionnaireScoreInput {
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Question[];
    invalidOptionQuestions?: number[];
}

interface ValidationState {
    title: boolean;
    welcomeText: boolean;
    endingText: boolean;
    questionCount: boolean;
    questionStructure: boolean;
    answerConfiguration: boolean;
}

export function getInvalidOptionQuestionIndexes(questions: Question[]) {
    const invalidIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type !== "single" && question.type !== "multiple") return;

        if (validateQuestionAtIndex(question, index + 1)) invalidIndexes.push(index + 1);
    });

    return invalidIndexes;
}

function getDuplicateOptionQuestionIndexes(questions: Question[]) {
    const duplicateIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type !== "single" && question.type !== "multiple") return;
        if (validateOptionStructure(question.options)) return;
        if (getDuplicateOptionIndexes(question.options!.map(option => option.label)).length > 0) {
            duplicateIndexes.push(index + 1);
        }
    });

    return duplicateIndexes;
}

function getInvalidQuestionStructureIndexes(questions: Question[]) {
    const seenIds = new Set<string>();
    const invalidIndexes: number[] = [];

    questions.forEach((question, index) => {
        const id = question.id?.trim() ?? "";
        const contentLength = question.content.trim().length;
        const duplicateId = id.length > 0 && seenIds.has(id);
        if (id) seenIds.add(id);

        if (!id || duplicateId || contentLength < 1 || contentLength > 500) {
            invalidIndexes.push(index + 1);
        }
    });

    return invalidIndexes;
}

function getInvalidNumericRuleQuestionIndexes(questions: Question[]) {
    const invalidIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type === "numeric") {
            if (validateQuestionAtIndex(question, index + 1)) invalidIndexes.push(index + 1);
            return;
        }
        if (question.type !== "scale") return;
        const min = question.scaleMin ?? 1;
        const max = question.scaleMax ?? 10;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min >= max) {
            invalidIndexes.push(index + 1);
        }
    });

    return invalidIndexes;
}

function item(params: {
    label: string;
    points: number;
    valid: boolean;
    passMessage: string;
    failMessage: string;
}): ScoreItem {
    return {
        label: params.label,
        points: params.valid ? params.points : 0,
        status: params.valid ? "pass" : "fail",
        message: params.valid ? params.passMessage : params.failMessage,
    };
}

/**
 * 只计算可机械验证的结构完整度，不评价问卷的效度、信度、措辞质量或题型优劣。
 */
export function calculateQuestionnaireScoreSummary(input: QuestionnaireScoreInput) {
    const invalidOptionQuestions = input.invalidOptionQuestions ?? getInvalidOptionQuestionIndexes(input.questions);
    const invalidNumericRules = getInvalidNumericRuleQuestionIndexes(input.questions);
    const invalidStructureQuestions = getInvalidQuestionStructureIndexes(input.questions);
    const duplicateOptionQuestions = getDuplicateOptionQuestionIndexes(input.questions);
    const welcomeText = getRichTextPlainText(input.welcomeText);
    const endingText = getRichTextPlainText(input.endingText);

    const validation: ValidationState = {
        title: input.title.trim().length >= 1 && input.title.trim().length <= 100,
        welcomeText: welcomeText.length >= 20 && welcomeText.length <= 1000,
        endingText: endingText.length >= 20 && endingText.length <= 1000,
        questionCount: input.questions.length >= 5 && input.questions.length <= 50,
        questionStructure: invalidStructureQuestions.length === 0,
        answerConfiguration: invalidOptionQuestions.length === 0 && invalidNumericRules.length === 0 && duplicateOptionQuestions.length === 0,
    };

    const scoreItems: ScoreItem[] = [
        item({
            label: "标题格式",
            points: 15,
            valid: validation.title,
            passMessage: "已填写且长度符合要求",
            failMessage: "标题需为1-100字",
        }),
        item({
            label: "欢迎语格式",
            points: 15,
            valid: validation.welcomeText,
            passMessage: "长度符合本实验要求",
            failMessage: "欢迎语需为20-1000字",
        }),
        item({
            label: "结束语格式",
            points: 15,
            valid: validation.endingText,
            passMessage: "长度符合本实验要求",
            failMessage: "结束语需为20-1000字",
        }),
        item({
            label: "题目数量",
            points: 20,
            valid: validation.questionCount,
            passMessage: "符合本实验5-50题的要求",
            failMessage: "本实验要求5-50题",
        }),
        item({
            label: "题目结构",
            points: 15,
            valid: validation.questionStructure,
            passMessage: "题目ID与内容格式有效",
            failMessage: `Q${invalidStructureQuestions.slice(0, 5).join("、")} 的ID或内容格式无效`,
        }),
        item({
            label: "作答配置",
            points: 20,
            valid: validation.answerConfiguration,
            passMessage: "选项、多选上下限和评分范围有效",
            failMessage: `Q${Array.from(new Set([...invalidOptionQuestions, ...invalidNumericRules, ...duplicateOptionQuestions])).slice(0, 5).join("、")} 的作答配置无效`,
        }),
    ];

    if (duplicateOptionQuestions.length > 0) {
        const answerItem = scoreItems.find((scoreItem) => scoreItem.label === "作答配置");
        if (answerItem) {
            answerItem.message += `；Q${duplicateOptionQuestions.slice(0, 5).join("、")} 存在重复选项，请修改后试填`;
        }
    }

    return {
        scoreItems,
        structureScore: scoreItems.reduce((sum, scoreItem) => sum + scoreItem.points, 0),
    };
}
