import type { Question, QuestionnaireData, QuestionType, RecommendQuestion } from "../api-client";
import { getRichTextPlainText } from "../../utils/rich-text";

export type ScoreStatus = "pass" | "warning" | "fail";

export interface QuestionnaireScoreItem {
    label: string;
    points: number;
    status: ScoreStatus;
    message: string;
}

export interface QuestionnaireScoreSummary {
    items: QuestionnaireScoreItem[];
    preliminaryScore: number;
    warningCount: number;
    scaleQuestionCount: number;
}

export interface ScaleQuestionTemplate {
    id: string;
    title: string;
    description: string;
    question: Question;
}

const recommendTypeMap: Record<number, QuestionType> = {
    1: "boolean",
    2: "single",
    3: "multiple",
    4: "scale",
};

export const COMMON_SCALE_QUESTION_TEMPLATES: ScaleQuestionTemplate[] = [
    {
        id: "satisfaction",
        title: "总体满意度量表",
        description: "适合满意度、体验评价等主题，直接使用 1-5 分的经典 Likert 量表。",
        question: {
            id: "template_satisfaction",
            type: "scale",
            content: "请评价您对本次服务/产品的总体满意程度。",
            scaleMin: 1,
            scaleMax: 5,
            scaleMinLabel: "非常不满意",
            scaleMaxLabel: "非常满意",
        },
    },
    {
        id: "agreement",
        title: "态度认同量表",
        description: "用于测量受访者对陈述句的认同程度，适合态度和观点研究。",
        question: {
            id: "template_agreement",
            type: "scale",
            content: "我愿意继续使用/推荐该服务。",
            scaleMin: 1,
            scaleMax: 5,
            scaleMinLabel: "非常不同意",
            scaleMaxLabel: "非常同意",
        },
    },
    {
        id: "importance",
        title: "重要性量表",
        description: "适合衡量因素权重，例如功能、价格、服务等要素的重要程度。",
        question: {
            id: "template_importance",
            type: "scale",
            content: "请评价“服务响应速度”对您的重要程度。",
            scaleMin: 1,
            scaleMax: 5,
            scaleMinLabel: "完全不重要",
            scaleMaxLabel: "非常重要",
        },
    },
    {
        id: "frequency",
        title: "频率量表",
        description: "适合行为习惯调查，例如购买、使用、参与频率等题目。",
        question: {
            id: "template_frequency",
            type: "scale",
            content: "您在过去一个月中使用该服务的频率如何？",
            scaleMin: 1,
            scaleMax: 5,
            scaleMinLabel: "从不",
            scaleMaxLabel: "总是",
        },
    },
];

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function normalizeRecommendOptions(options: unknown): string[] {
    if (Array.isArray(options)) {
        return options.map((option) => String(option ?? "").trim()).filter(Boolean);
    }

    if (typeof options === "string") {
        try {
            const parsed = JSON.parse(options);
            if (Array.isArray(parsed)) {
                return parsed.map((option) => String(option ?? "").trim()).filter(Boolean);
            }
        } catch {
            return options.split(",").map((option) => option.trim()).filter(Boolean);
        }
    }

    return [];
}

function getInvalidOptionQuestionIndexes(questions: Question[]) {
    const invalidIndexes: number[] = [];

    questions.forEach((question, index) => {
        if (question.type !== "single" && question.type !== "multiple") {
            return;
        }

        const options = (question.options ?? [])
            .map((option) => String(option ?? "").trim())
            .filter((option) => option.length > 0);

        if (options.length < 2) {
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

function includesAnyKeyword(text: string, keywords: string[]) {
    return keywords.some((keyword) => text.includes(keyword));
}

export function createQuestionFromRecommendQuestion(recommendQuestion: RecommendQuestion): Question {
    const mappedType = recommendTypeMap[recommendQuestion.questionType] ?? "single";
    const options = normalizeRecommendOptions(recommendQuestion.options);

    return {
        id: generateId(),
        type: mappedType,
        content: recommendQuestion.content,
        options: mappedType === "single" || mappedType === "multiple" ? options : undefined,
        minSelect: mappedType === "multiple" ? 1 : undefined,
        maxSelect: mappedType === "multiple" ? Math.min(3, Math.max(2, options.length)) : undefined,
        scaleMin: mappedType === "scale" ? 1 : undefined,
        scaleMax: mappedType === "scale" ? 5 : undefined,
        scaleMinLabel: mappedType === "scale" ? options[0] || "非常不同意" : undefined,
        scaleMaxLabel: mappedType === "scale" ? options[1] || "非常同意" : undefined,
    };
}

export function createQuestionFromScaleTemplate(template: ScaleQuestionTemplate): Question {
    return {
        ...template.question,
        id: generateId(),
    };
}

export function evaluateQuestionnaireDesign(questionnaire: QuestionnaireData): QuestionnaireScoreSummary {
    const title = questionnaire.title.trim();
    const welcomeText = getRichTextPlainText(questionnaire.welcomeText);
    const endingText = getRichTextPlainText(questionnaire.endingText);
    const questions = questionnaire.questions;
    const invalidOptionQuestions = getInvalidOptionQuestionIndexes(questions);
    const questionTypes = new Set(questions.map((question) => question.type));
    const scaleQuestions = questions.filter((question) => question.type === "scale");
    const labeledScaleQuestions = scaleQuestions.filter((question) =>
        Boolean(question.scaleMinLabel?.trim()) && Boolean(question.scaleMaxLabel?.trim())
    );
    const firstQuestion = questions[0];
    const lastQuestion = questions[questions.length - 1];

    const introKeywords = [
        includesAnyKeyword(welcomeText, ["目的", "主题", "研究", "调查"]),
        includesAnyKeyword(welcomeText, ["用时", "分钟", "耗时"]),
        includesAnyKeyword(welcomeText, ["匿名", "保密", "仅用于", "仅供"]),
    ].filter(Boolean).length;

    const scoreItems: QuestionnaireScoreItem[] = [
        {
            label: "研究说明完整性",
            points: title && welcomeText.length >= 40 ? (introKeywords >= 2 ? 15 : 11) : 0,
            status: title && welcomeText.length >= 40 ? (introKeywords >= 2 ? "pass" : "warning") : "fail",
            message: title && welcomeText.length >= 40
                ? introKeywords >= 2
                    ? "欢迎语已交代调查目的、预计耗时或保密说明。"
                    : "欢迎语建议补充调查目的、预计耗时与保密说明。"
                : "请先完善问卷标题和欢迎语。",
        },
        {
            label: "结束语与回收提示",
            points: endingText.length >= 40 ? 10 : endingText.length >= 20 ? 7 : 0,
            status: endingText.length >= 40 ? "pass" : endingText.length >= 20 ? "warning" : "fail",
            message: endingText.length >= 40
                ? "结束语较完整，已具备感谢或后续提示。"
                : endingText.length >= 20
                    ? "结束语已达最低要求，建议补充感谢或后续说明。"
                    : "结束语需至少 20 字。",
        },
        {
            label: "题量与覆盖面",
            points: questions.length >= 8 && questions.length <= 20 ? 20 : questions.length >= 5 && questions.length <= 30 ? 16 : 0,
            status: questions.length >= 8 && questions.length <= 20 ? "pass" : questions.length >= 5 && questions.length <= 30 ? "warning" : "fail",
            message: questions.length >= 8 && questions.length <= 20
                ? "题量适中，便于控制答题负担。"
                : questions.length >= 5 && questions.length <= 30
                    ? "题量可用，但建议尽量集中在 8-20 题提升完成率。"
                    : "请将题量控制在 5-50 题，并优先保证核心题目。",
        },
        {
            label: "题型搭配",
            points: questionTypes.size >= 3 ? 15 : questionTypes.size >= 2 ? 11 : 4,
            status: questionTypes.size >= 3 ? "pass" : questionTypes.size >= 2 ? "warning" : "fail",
            message: questionTypes.size >= 3
                ? "同时包含筛选题、选择题和量表题，结构较均衡。"
                : questionTypes.size >= 2
                    ? "已包含多种题型，建议再补充量表题或筛选题。"
                    : "建议至少组合两种题型，避免问卷过于单一。",
        },
        {
            label: "量表题配置",
            points: scaleQuestions.length >= 2 && labeledScaleQuestions.length === scaleQuestions.length ? 25 : scaleQuestions.length >= 1 ? 16 : 6,
            status: scaleQuestions.length >= 2 && labeledScaleQuestions.length === scaleQuestions.length ? "pass" : scaleQuestions.length >= 1 ? "warning" : "warning",
            message: scaleQuestions.length >= 2 && labeledScaleQuestions.length === scaleQuestions.length
                ? "量表题数量和端点标签较完整，可支持常见态度/满意度分析。"
                : scaleQuestions.length >= 1
                    ? "已添加量表题，建议补充更多常用量表并完善两端标签。"
                    : "建议至少加入 1-2 道常用量表题，提升分析价值。",
        },
        {
            label: "题序逻辑",
            points: questions.length >= 5 && firstQuestion && firstQuestion.type !== "scale" && lastQuestion && lastQuestion.type !== "multiple" ? 15 : questions.length >= 5 ? 10 : 0,
            status: questions.length >= 5 && firstQuestion && firstQuestion.type !== "scale" && lastQuestion && lastQuestion.type !== "multiple" ? "pass" : questions.length >= 5 ? "warning" : "fail",
            message: questions.length >= 5 && firstQuestion && firstQuestion.type !== "scale" && lastQuestion && lastQuestion.type !== "multiple"
                ? "题序较清晰，先进入基本/筛选题，再过渡到核心测量题。"
                : questions.length >= 5
                    ? "建议把基础信息或筛选题放前面，背景/补充题放后面。"
                    : "请先完成基础题目设计。",
        },
    ];

    if (invalidOptionQuestions.length > 0) {
        scoreItems.push({
            label: "选项配置",
            points: 0,
            status: "fail",
            message: `Q${invalidOptionQuestions.slice(0, 5).join("、")} 的选项或多选限制需要调整。`,
        });
    }

    const preliminaryScore = Math.max(0, Math.min(100, Math.round(scoreItems.reduce((sum, item) => sum + item.points, 0))));

    return {
        items: scoreItems,
        preliminaryScore,
        warningCount: scoreItems.filter((item) => item.status === "warning").length,
        scaleQuestionCount: scaleQuestions.length,
    };
}
