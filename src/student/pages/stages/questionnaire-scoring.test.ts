import { expect, test } from "bun:test";
import type { Question } from "../../api-client";
import { calculateQuestionnaireScoreSummary } from "./questionnaire-scoring";

function createQuestion(id: string, overrides: Partial<Question> = {}): Question {
    return {
        id,
        type: "single",
        content: `题目${id}`,
        options: ["是", "否"],
        ...overrides,
    };
}

const validBase = {
    title: "课程体验调查",
    welcomeText: "<p>感谢参与本次问卷。本问卷用于了解课程体验，回答仅用于课堂教学分析。</p>",
    endingText: "<p>问卷填写完毕，感谢您的认真作答和对本次课堂调查的支持。</p>",
};

test("结构完整度不再奖励题型数量、题干长度或量表题", () => {
    const questions = Array.from({ length: 5 }, (_, index) => createQuestion(`q${index + 1}`));

    const summary = calculateQuestionnaireScoreSummary({ ...validBase, questions });

    expect(summary.structureScore).toBe(100);
    expect(summary.scoreItems.map((item) => item.label)).toEqual([
        "标题格式",
        "欢迎语格式",
        "结束语格式",
        "题目数量",
        "题目结构",
        "作答配置",
    ]);
    expect(summary.scoreItems.some((item) => item.label.includes("题型") || item.label.includes("量表"))).toBe(false);
});

test("本实验允许范围内的长问卷不会因题量被启发式扣分", () => {
    const questions = Array.from({ length: 40 }, (_, index) => createQuestion(`q${index + 1}`));

    const summary = calculateQuestionnaireScoreSummary({ ...validBase, questions });

    expect(summary.scoreItems.find((item) => item.label === "题目数量")).toEqual({
        label: "题目数量",
        points: 20,
        status: "pass",
        message: "符合本实验5-50题的要求",
    });
    expect(summary.structureScore).toBe(100);
});

test("没有单选或多选题不是结构缺陷", () => {
    const questions: Question[] = Array.from({ length: 5 }, (_, index) => createQuestion(`q${index + 1}`, {
        type: "boolean",
        options: undefined,
    }));

    const summary = calculateQuestionnaireScoreSummary({ ...validBase, questions });

    expect(summary.scoreItems.find((item) => item.label === "作答配置")).toEqual({
        label: "作答配置",
        points: 20,
        status: "pass",
        message: "选项、多选上下限和评分范围有效",
    });
});

test("基础格式不合格只扣对应的结构分", () => {
    const questions = Array.from({ length: 5 }, (_, index) => createQuestion(`q${index + 1}`));

    const summary = calculateQuestionnaireScoreSummary({
        ...validBase,
        welcomeText: "<p>太短</p>",
        endingText: "<p>谢谢</p>",
        questions,
    });

    expect(summary.structureScore).toBe(70);
    expect(summary.scoreItems.filter((item) => item.status === "fail").map((item) => item.label)).toEqual([
        "欢迎语格式",
        "结束语格式",
    ]);
});

test("重复选项产生人工复核警告但不冒充效度评分", () => {
    const questions = Array.from({ length: 5 }, (_, index) => createQuestion(`q${index + 1}`));
    questions[1] = createQuestion("q2", { options: ["同意", " 同意 "] });

    const summary = calculateQuestionnaireScoreSummary({ ...validBase, questions });
    const answerItem = summary.scoreItems.find((item) => item.label === "作答配置");

    expect(summary.structureScore).toBe(100);
    expect(answerItem?.status).toBe("warning");
    expect(answerItem?.message).toContain("重复选项");
});

test("无效量表范围和重复题目ID会被结构检查发现", () => {
    const questions = [
        createQuestion("q1"),
        createQuestion("q1"),
        createQuestion("q3"),
        createQuestion("q4"),
        createQuestion("q5", { type: "scale", options: undefined, scaleMin: 5, scaleMax: 5 }),
    ];

    const summary = calculateQuestionnaireScoreSummary({ ...validBase, questions });

    expect(summary.scoreItems.find((item) => item.label === "题目结构")?.status).toBe("fail");
    expect(summary.scoreItems.find((item) => item.label === "作答配置")?.status).toBe("fail");
    expect(summary.structureScore).toBe(65);
});
