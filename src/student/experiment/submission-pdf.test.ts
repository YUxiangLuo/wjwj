import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("submission pdf job payload prefers immutable submission snapshots", async () => {
    const { db } = createMockDb({
        select: [[{
            submissionId: 501,
            studentDbId: 11,
            studentIdText: "20230001",
            currentStudentName: "当前学生名",
            teacherId: 21,
            currentTopicName: "当前课题名",
            populationSize: 8000,
            snapshotPopulationSize: 7200,
            submittedAt: new Date("2026-03-08T08:00:00.000Z"),
            snapshotQuestionnaire: {
                title: "提交时问卷",
                welcomeText: "欢迎语",
                endingText: "结束语",
                questions: [{ type: "single", content: "快照题目", options: ["A", "B"] }],
            },
            snapshotSamplePlan: {
                estimationType: "proportion",
                advancedPlanSource: "multivar",
                confidenceLevel: "90",
                marginOfError: 4,
                designEffect: 1.2,
                nonResponseRate: 0.05,
                recommendedSize: 210,
                finalSampleSize: 240,
            },
            currentSamplePlan: {
                estimationType: "mean",
                advancedPlanSource: "cv",
                confidenceLevel: "95",
                marginOfError: 2,
                populationVariance: 100,
                designEffect: 1,
                nonResponseRate: 0.1,
                recommendedSize: 95,
                finalSampleSize: 110,
            },
            snapshotReportContent: "提交时实验报告",
            snapshotTopicName: "提交时课题名",
            snapshotStudentName: "提交时学生名",
        }]],
    });

    mock.restore();
    mock.module("../../db", () => ({ db }));

    const module = await import(`./submission-pdf.ts?case=${Date.now()}`);
    const payload = await module.loadSubmissionPdfJobPayload(501);

    expect(payload).toMatchObject({
        submissionId: 501,
        studentDbId: 11,
        studentIdText: "20230001",
        studentName: "提交时学生名",
        teacherId: 21,
        topicName: "提交时课题名",
        reportContent: "提交时实验报告",
        populationSize: 7200,
        samplePlan: {
            estimationType: "proportion",
            advancedPlanSource: "multivar",
            confidenceLevel: "90",
            marginOfError: 4,
            designEffect: 1.2,
            nonResponseRate: 0.05,
            recommendedSize: 210,
            finalSampleSize: 240,
        },
        questionnaire: {
            title: "提交时问卷",
            questions: [{ type: "single", content: "快照题目", options: ["A", "B"] }],
        },
    });
});

test("buildSamplePlanSummaryLines renders estimation semantics for report PDFs", async () => {
    mock.restore();
    const { db } = createMockDb();
    mock.module("../../db", () => ({ db }));
    const module = await import(`./submission-pdf.ts?summary=${Date.now()}`);
    const lines = module.buildSamplePlanSummaryLines({
        estimationType: "mean",
        advancedPlanSource: "cv",
        confidenceLevel: "95",
        marginOfError: 2,
        populationVariance: 100,
        designEffect: 1.2,
        nonResponseRate: 0.1,
        recommendedSize: 95,
        finalSampleSize: 110,
    }, 8000);

    expect(lines).toContain("总体规模 N：8,000");
    expect(lines).toContain("估计类型：均值估计");
    expect(lines).toContain("最终样本量来源：CV-based计算（高级工具）");
    expect(lines).toContain("绝对误差限：±2（与均值同单位）");
    expect(lines).toContain("总体方差 σ²：100");
    expect(lines).toContain("推荐样本量 n：95");
    expect(lines).toContain("最终样本量 n：110");
});
