import { expect, test } from "bun:test";
import type { Question } from "../../api-client";
import { calculateQuestionnaireScoreSummary } from "./questionnaire-scoring";

function createQuestion(id: string, overrides: Partial<Question>): Question {
    return {
        id,
        type: "single",
        content: `题目${id}的描述较完整，方便受访者准确理解`,
        options: ["非常同意", "比较同意", "一般", "不同意"],
        ...overrides,
    };
}

test("balanced questionnaire gets a high preliminary score", () => {
    const questions: Question[] = [
        createQuestion("q1", { type: "boolean", content: "您是否参加过相关课程学习？" }),
        createQuestion("q2", { type: "single", content: "您通常通过哪种渠道获取课程资料？" }),
        createQuestion("q3", { type: "multiple", content: "您认为课程中最有帮助的环节有哪些？", minSelect: 1, maxSelect: 3 }),
        createQuestion("q4", { type: "scale", content: "我能清晰理解课程安排与学习目标", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" }),
        createQuestion("q5", { type: "single", content: "您更偏好哪种课堂互动方式？" }),
        createQuestion("q6", { type: "multiple", content: "您希望增加哪些支持资源？", minSelect: 1, maxSelect: 3 }),
        createQuestion("q7", { type: "scale", content: "课程案例对我理解知识点很有帮助", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" }),
        createQuestion("q8", { type: "boolean", content: "您愿意继续参与同类课程调研吗？" }),
    ];

    const summary = calculateQuestionnaireScoreSummary({
        title: "大学生课程体验调查",
        welcomeText: "<p>感谢参与本次问卷。本问卷用于了解课程体验与学习需求，预计耗时约3分钟，所有结果仅用于课堂教学分析。</p>",
        endingText: "<p>问卷填写完毕，感谢您的认真作答。您的反馈将帮助我们优化课程设计与教学支持方式。</p>",
        questions,
    });

    expect(summary.preliminaryScore).toBeGreaterThanOrEqual(85);
    expect(summary.scoreItems.find((item) => item.label === "题型多样性")?.points).toBeGreaterThanOrEqual(13);
    expect(summary.scoreItems.find((item) => item.label === "量表题使用")?.points).toBe(10);
});

test("question count score no longer rewards overly long questionnaires", () => {
    const questions = Array.from({ length: 40 }, (_, index) => createQuestion(`q${index + 1}`, {
        type: index % 4 === 0 ? "boolean" : index % 4 === 1 ? "single" : index % 4 === 2 ? "multiple" : "scale",
        minSelect: 1,
        maxSelect: 3,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: "低",
        scaleMaxLabel: "高",
    }));

    const summary = calculateQuestionnaireScoreSummary({
        title: "课程体验长问卷",
        welcomeText: "<p>感谢参与本次调查。本问卷用于收集课程改进建议，预计耗时约8分钟，所有数据仅用于教学研究。</p>",
        endingText: "<p>感谢完成整份问卷。我们会结合您的反馈优化课堂结构、材料设计与互动形式。</p>",
        questions,
    });

    expect(summary.scoreItems.find((item) => item.label === "题目数量")).toEqual({
        label: "题目数量",
        points: 8,
        status: "warning",
        message: "题量偏多，注意答题疲劳",
    });
});

test("choice-free questionnaires no longer receive full option scores", () => {
    const questions: Question[] = [
        createQuestion("q1", { type: "boolean", content: "您是否了解课程目标？" }),
        createQuestion("q2", { type: "scale", content: "我能跟上课堂节奏", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" }),
        createQuestion("q3", { type: "boolean", content: "您是否按时完成作业？" }),
        createQuestion("q4", { type: "scale", content: "课程难度设置是否合适", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不合适", scaleMaxLabel: "非常合适" }),
        createQuestion("q5", { type: "boolean", content: "您是否参加过讨论活动？" }),
    ];

    const summary = calculateQuestionnaireScoreSummary({
        title: "课堂反馈问卷",
        welcomeText: "<p>感谢填写问卷。本问卷用于快速了解课程反馈，预计耗时约2分钟，结果仅用于课堂改进。</p>",
        endingText: "<p>感谢支持。本次反馈将帮助我们继续调整教学安排与资源准备。</p>",
        questions,
    });

    expect(summary.scoreItems.find((item) => item.label === "选项配置")).toEqual({
        label: "选项配置",
        points: 6,
        status: "warning",
        message: "当前没有单选/多选题",
    });
    expect(summary.scoreItems.find((item) => item.label === "选项丰富度")).toEqual({
        label: "选项丰富度",
        points: 4,
        status: "warning",
        message: "缺少可展开区分的选择题",
    });
});

test("blocking intro validation caps the overall score", () => {
    const questions = Array.from({ length: 8 }, (_, index) => createQuestion(`q${index + 1}`, {
        type: index % 4 === 0 ? "boolean" : index % 4 === 1 ? "single" : index % 4 === 2 ? "multiple" : "scale",
        minSelect: 1,
        maxSelect: 3,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: "低",
        scaleMaxLabel: "高",
    }));

    const summary = calculateQuestionnaireScoreSummary({
        title: "课程反馈调查",
        welcomeText: "<p>太短了</p>",
        endingText: "<p>谢谢</p>",
        questions,
    });

    expect(summary.preliminaryScore).toBe(69);
});
