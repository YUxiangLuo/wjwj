import { getRichTextPlainText } from "@/utils/rich-text";
import type { Question } from "../../api-client";

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
    optionCount: boolean;
}

function normalizeOptionText(value: string) {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sentenceCount(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const matches = trimmed.match(/[。！？；.!?]+/g);
    return matches?.length ?? 1;
}

function buildIntroOutroItem(label: "欢迎语质量" | "结束语质量", plainText: string, valid: boolean): ScoreItem {
    if (!valid) {
        return {
            label,
            points: 0,
            status: "fail",
            message: `${label.slice(0, 3)}需在20-1000字之间`,
        };
    }

    const length = plainText.length;
    const sentences = sentenceCount(plainText);

    if (length >= 60 && length <= 220 && sentences >= 2) {
        return {
            label,
            points: 10,
            status: "pass",
            message: `${label.slice(0, 3)}信息完整、节奏合适`,
        };
    }

    if (length > 220) {
        return {
            label,
            points: 8,
            status: "warning",
            message: `${label.slice(0, 3)}较完整，建议适当精简`,
        };
    }

    if (length >= 35) {
        return {
            label,
            points: 8,
            status: "pass",
            message: `${label.slice(0, 3)}内容较完整`,
        };
    }

    return {
        label,
        points: 6,
        status: "warning",
        message: `建议丰富${label.slice(0, 3)}内容`,
    };
}

export function getInvalidOptionQuestionIndexes(questions: Question[]) {
    const invalidIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type !== "single" && question.type !== "multiple") return;

        const options = Array.isArray(question.options)
            ? question.options.map((option) => option.trim()).filter((option) => option.length > 0)
            : [];

        if (options.length < 2 || options.length > 10 || options.some((option) => option.length > 200)) {
            invalidIndexes.push(index + 1);
            return;
        }

        if (question.type === "multiple") {
            const minSelect = question.minSelect ?? 1;
            const maxSelect = question.maxSelect ?? options.length;
            if (minSelect < 1 || maxSelect < minSelect || maxSelect > options.length) {
                invalidIndexes.push(index + 1);
            }
        }
    });

    return invalidIndexes;
}

function getDuplicateOptionQuestionIndexes(questions: Question[]) {
    const duplicateIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type !== "single" && question.type !== "multiple") return;
        const options = Array.isArray(question.options)
            ? question.options.map(normalizeOptionText).filter((option) => option.length > 0)
            : [];
        if (options.length === 0) return;
        if (new Set(options).size !== options.length) {
            duplicateIndexes.push(index + 1);
        }
    });

    return duplicateIndexes;
}

function buildValidationState(input: QuestionnaireScoreInput, invalidOptionQuestions: number[]): ValidationState {
    const title = input.title.trim();
    const welcomeText = getRichTextPlainText(input.welcomeText);
    const endingText = getRichTextPlainText(input.endingText);

    return {
        title: title.length >= 1 && title.length <= 100,
        welcomeText: welcomeText.length >= 20 && welcomeText.length <= 1000,
        endingText: endingText.length >= 20 && endingText.length <= 1000,
        questionCount: input.questions.length >= 5 && input.questions.length <= 50,
        optionCount: invalidOptionQuestions.length === 0,
    };
}

export function calculateQuestionnaireScoreSummary(input: QuestionnaireScoreInput) {
    const invalidOptionQuestions = input.invalidOptionQuestions ?? getInvalidOptionQuestionIndexes(input.questions);
    const duplicateOptionQuestions = getDuplicateOptionQuestionIndexes(input.questions);
    const validation = buildValidationState(input, invalidOptionQuestions);
    const title = input.title.trim();
    const titleLength = title.length;
    const welcomeText = getRichTextPlainText(input.welcomeText);
    const endingText = getRichTextPlainText(input.endingText);
    const questionCount = input.questions.length;
    const choiceQuestions = input.questions.filter((q) => q.type === "single" || q.type === "multiple");
    const scaleQuestions = input.questions.filter((q) => q.type === "scale");
    const usedTypes = new Set(input.questions.map((q) => q.type));
    const typeCount = usedTypes.size;
    const typeHistogram = new Map<string, number>();
    input.questions.forEach((question) => {
        typeHistogram.set(question.type, (typeHistogram.get(question.type) ?? 0) + 1);
    });
    const dominantTypeShare = questionCount === 0
        ? 0
        : Math.max(...Array.from(typeHistogram.values(), (count) => count / questionCount));

    const scoreItems: ScoreItem[] = [];

    scoreItems.push({
        label: "标题完整性",
        points: !validation.title ? 0 : titleLength >= 4 && titleLength <= 24 ? 10 : titleLength <= 40 ? 8 : 6,
        status: !validation.title ? "fail" : titleLength <= 40 ? "pass" : "warning",
        message: !validation.title
            ? "标题需为1-100字"
            : titleLength >= 4 && titleLength <= 24
                ? "标题简洁明确"
                : titleLength <= 40
                    ? "标题基本清晰"
                    : "标题偏长，建议更聚焦调查主题",
    });

    scoreItems.push(buildIntroOutroItem("欢迎语质量", welcomeText, validation.welcomeText));
    scoreItems.push(buildIntroOutroItem("结束语质量", endingText, validation.endingText));

    let questionCountItem: ScoreItem;
    if (!validation.questionCount) {
        questionCountItem = {
            label: "题目数量",
            points: 0,
            status: "fail",
            message: "题目数量需在5-50题",
        };
    } else if (questionCount >= 8 && questionCount <= 20) {
        questionCountItem = {
            label: "题目数量",
            points: 15,
            status: "pass",
            message: "题量适中，完成负担较合理",
        };
    } else if (questionCount <= 30) {
        questionCountItem = {
            label: "题目数量",
            points: 12,
            status: "pass",
            message: "题量较充分",
        };
    } else if (questionCount <= 40) {
        questionCountItem = {
            label: "题目数量",
            points: 8,
            status: "warning",
            message: "题量偏多，注意答题疲劳",
        };
    } else {
        questionCountItem = {
            label: "题目数量",
            points: 5,
            status: "warning",
            message: "题量较重，建议压缩到30题以内",
        };
    }
    scoreItems.push(questionCountItem);

    let optionConfigItem: ScoreItem;
    if (!validation.optionCount) {
        optionConfigItem = {
            label: "选项配置",
            points: 0,
            status: "fail",
            message: `Q${invalidOptionQuestions.slice(0, 5).join("、")} 配置无效`,
        };
    } else if (choiceQuestions.length === 0) {
        optionConfigItem = {
            label: "选项配置",
            points: 6,
            status: "warning",
            message: "当前没有单选/多选题",
        };
    } else if (duplicateOptionQuestions.length > 0) {
        optionConfigItem = {
            label: "选项配置",
            points: 4,
            status: "warning",
            message: `Q${duplicateOptionQuestions.slice(0, 5).join("、")} 存在重复选项`,
        };
    } else {
        optionConfigItem = {
            label: "选项配置",
            points: 10,
            status: "pass",
            message: "单选/多选题选项配置有效",
        };
    }
    scoreItems.push(optionConfigItem);

    let typeDiversityItem: ScoreItem;
    if (!validation.questionCount) {
        typeDiversityItem = {
            label: "题型多样性",
            points: 0,
            status: "fail",
            message: "请先满足题目数量要求",
        };
    } else if (typeCount >= 4) {
        typeDiversityItem = {
            label: "题型多样性",
            points: dominantTypeShare <= 0.6 ? 15 : 13,
            status: "pass",
            message: dominantTypeShare <= 0.6 ? "4种题型覆盖均衡" : "已覆盖4种题型，建议再平衡占比",
        };
    } else if (typeCount === 3) {
        typeDiversityItem = {
            label: "题型多样性",
            points: 12,
            status: "pass",
            message: "已使用3种题型，结构较完整",
        };
    } else if (typeCount === 2) {
        typeDiversityItem = {
            label: "题型多样性",
            points: 8,
            status: "warning",
            message: "建议补充到至少3种题型",
        };
    } else {
        typeDiversityItem = {
            label: "题型多样性",
            points: 3,
            status: "warning",
            message: "题型偏单一，区分度有限",
        };
    }
    scoreItems.push(typeDiversityItem);

    const labeledScaleCount = scaleQuestions.filter((question) => {
        const minLabel = question.scaleMinLabel?.trim() ?? "";
        const maxLabel = question.scaleMaxLabel?.trim() ?? "";
        return minLabel.length > 0 && maxLabel.length > 0;
    }).length;
    const scaleRatio = questionCount === 0 ? 0 : scaleQuestions.length / questionCount;
    let scaleUsageItem: ScoreItem;
    if (!validation.questionCount) {
        scaleUsageItem = {
            label: "量表题使用",
            points: 0,
            status: "fail",
            message: "请先满足题目数量要求",
        };
    } else if (scaleQuestions.length === 0) {
        scaleUsageItem = {
            label: "量表题使用",
            points: 0,
            status: "fail",
            message: "建议添加量表题（如 Likert 量表）",
        };
    } else if (scaleQuestions.length >= 2 && scaleRatio <= 0.5 && labeledScaleCount === scaleQuestions.length) {
        scaleUsageItem = {
            label: "量表题使用",
            points: 10,
            status: "pass",
            message: `已包含${scaleQuestions.length}道量表题，标签清晰`,
        };
    } else if (scaleQuestions.length >= 2 && scaleRatio <= 0.5) {
        scaleUsageItem = {
            label: "量表题使用",
            points: 9,
            status: "pass",
            message: `已包含${scaleQuestions.length}道量表题`,
        };
    } else if (scaleQuestions.length >= 2) {
        scaleUsageItem = {
            label: "量表题使用",
            points: 7,
            status: "warning",
            message: "量表题占比较高，建议搭配更多其他题型",
        };
    } else {
        scaleUsageItem = {
            label: "量表题使用",
            points: 6,
            status: "warning",
            message: "建议补充到2道以上量表题",
        };
    }
    scoreItems.push(scaleUsageItem);

    const questionLengths = input.questions.map((question) => question.content.trim().length);
    const averageQuestionLength = questionLengths.length === 0
        ? 0
        : questionLengths.reduce((sum, length) => sum + length, 0) / questionLengths.length;
    const shortQuestionCount = questionLengths.filter((length) => length < 8).length;
    let questionContentItem: ScoreItem;
    if (!validation.questionCount) {
        questionContentItem = {
            label: "题目表述质量",
            points: 0,
            status: "fail",
            message: "请先满足题目数量要求",
        };
    } else if (averageQuestionLength >= 14 && shortQuestionCount <= Math.max(1, Math.floor(questionCount * 0.1))) {
        questionContentItem = {
            label: "题目表述质量",
            points: 10,
            status: "pass",
            message: "题目表述清晰完整",
        };
    } else if (averageQuestionLength >= 10 && shortQuestionCount <= Math.ceil(questionCount * 0.25)) {
        questionContentItem = {
            label: "题目表述质量",
            points: 8,
            status: "pass",
            message: "大部分题目表述清楚",
        };
    } else if (averageQuestionLength >= 6) {
        questionContentItem = {
            label: "题目表述质量",
            points: 6,
            status: "warning",
            message: "部分题目表述偏短，建议补充背景或限定条件",
        };
    } else {
        questionContentItem = {
            label: "题目表述质量",
            points: 3,
            status: "warning",
            message: "题目表述过于简略",
        };
    }
    scoreItems.push(questionContentItem);

    const optionCounts = choiceQuestions.map((question) => question.options?.length ?? 0);
    const averageOptionCount = optionCounts.length === 0
        ? 0
        : optionCounts.reduce((sum, count) => sum + count, 0) / optionCounts.length;
    const richChoiceCount = optionCounts.filter((count) => count >= 4).length;
    let optionRichnessItem: ScoreItem;
    if (!validation.questionCount) {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 0,
            status: "fail",
            message: "请先满足题目数量要求",
        };
    } else if (choiceQuestions.length === 0) {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 4,
            status: "warning",
            message: "缺少可展开区分的选择题",
        };
    } else if (averageOptionCount >= 4 && richChoiceCount >= Math.ceil(choiceQuestions.length / 2)) {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 10,
            status: "pass",
            message: "选项设置丰富，区分度较好",
        };
    } else if (averageOptionCount >= 3.5) {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 8,
            status: "pass",
            message: "选项数量较充足",
        };
    } else if (averageOptionCount >= 3) {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 6,
            status: "warning",
            message: "可适当增加区分度更高的选项",
        };
    } else {
        optionRichnessItem = {
            label: "选项丰富度",
            points: 4,
            status: "warning",
            message: "建议每题设置4个以上选项",
        };
    }
    scoreItems.push(optionRichnessItem);

    const rawTotal = scoreItems.reduce((sum, item) => sum + item.points, 0);
    const hasStructureBlockingIssue = !validation.questionCount || !validation.optionCount;
    const hasBaseBlockingIssue = !validation.title || !validation.welcomeText || !validation.endingText;
    const cappedTotal = hasStructureBlockingIssue
        ? Math.min(rawTotal, 59)
        : hasBaseBlockingIssue
            ? Math.min(rawTotal, 69)
            : rawTotal;

    return {
        scoreItems,
        preliminaryScore: Math.max(0, Math.min(100, Math.round(cappedTotal))),
    };
}
