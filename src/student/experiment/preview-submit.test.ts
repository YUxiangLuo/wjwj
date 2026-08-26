import { expect, test } from "bun:test";
import { getPreviewSubmitBlocker, isSubmissionCompleteResponse } from "./preview-submit";

const validExperiment = {
    populationSize: 200,
    questionnaire: {
        title: "抽样调查问卷",
        welcomeText: "欢迎参加本次抽样调查实验，请根据实际情况认真填写问卷内容，谢谢配合。",
        endingText: "问卷到此结束，感谢你的参与和配合，祝你学习顺利。",
        questions: [
            { id: "q1", type: "single" as const, content: "你是否了解抽样调查？", options: ["了解", "不了解"] },
            { id: "q2", type: "multiple" as const, content: "你常用哪些数据分析工具？", options: ["Excel", "SPSS", "R"], minSelect: 1, maxSelect: 2 },
            { id: "q3", type: "scale" as const, content: "你对统计课程的兴趣程度如何？", scaleMin: 1, scaleMax: 5 },
            { id: "q4", type: "boolean" as const, content: "你是否做过问卷调查？" },
            { id: "q5", type: "single" as const, content: "你认为样本量规划是否重要？", options: ["重要", "一般"] },
        ],
    },
    samplePlan: {
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 132,
        finalSampleSize: 50,
    },
    samplingResults: {
        simple: { completed: true, sampleCount: 50, seed: 1, data: [{ id: 1 }] },
        systematic: { completed: true, interval: 4, sampleCount: 50, seed: 2, data: [{ id: 2 }] },
        pps: { completed: true, sizeField: "income", sampleCount: 50, seed: 4, data: [{ id: 4 }] },
        stratified: {
            completed: true,
            stratifyBy: "grade",
            layers: [
                { name: "A", count: 60, ratio: 0.6, sampleCount: 30 },
                { name: "B", count: 40, ratio: 0.4, sampleCount: 20 },
            ],
            seed: 3,
            data: [{ id: 3 }],
        },
    },
    reportContent: "这是实验报告正文，用于验证预览提交前校验逻辑是否和后端保持一致。".repeat(10),
};

test("preview submit blocker returns sampling error before report validation", () => {
    expect(getPreviewSubmitBlocker({
        ...validExperiment,
        samplingResults: null,
        reportContent: "<p>短报告</p>",
    })).toBe("请先完成抽样执行");
});

test("preview submit blocker returns report error when previous stages are complete", () => {
    expect(getPreviewSubmitBlocker({
        ...validExperiment,
        reportContent: "<p>短报告</p>",
    })).toBe("本实验要求报告内容不少于100字");
});

test("preview submit blocker returns null for a complete valid experiment", () => {
    expect(getPreviewSubmitBlocker(validExperiment)).toBeNull();
});

test("preview submit blocker requires exact systematic sample size", () => {
    expect(getPreviewSubmitBlocker({
        ...validExperiment,
        samplingResults: {
            ...validExperiment.samplingResults,
            systematic: {
                ...validExperiment.samplingResults.systematic,
                sampleCount: 48,
            },
        },
    })).toBe("系统抽样样本量需等于目标样本量（50）");
});

test("an already-submitted retry is treated as completed", () => {
    expect(isSubmissionCompleteResponse({ success: false, error: { code: "ALREADY_SUBMITTED" } })).toBe(true);
    expect(isSubmissionCompleteResponse({ success: false, error: { code: "INCOMPLETE" } })).toBe(false);
});
