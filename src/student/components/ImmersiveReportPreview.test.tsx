import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { ImmersiveReportPreview } from "./ImmersiveReportPreview";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("ImmersiveReportPreview shows persisted sample plan semantics in overview", async () => {
    const view = render(
        <ImmersiveReportPreview
            taskName="抽样调查"
            onClose={() => undefined}
            experiment={{
                id: 88,
                taskId: 2,
                currentStage: 4,
                status: "in_progress",
                questionnaire: {
                    title: "问卷",
                    welcomeText: "<p>欢迎</p>",
                    endingText: "<p>结束</p>",
                    questions: [{ id: "q1", type: "single", content: "题目", options: ["A", "B"] }],
                },
                samplePlan: {
                    estimationType: "mean",
                    advancedPlanSource: "cv",
                    confidenceLevel: "95",
                    marginOfError: 2,
                    populationVariance: 100,
                    designEffect: 1.2,
                    nonResponseRate: 0.1,
                    recommendedSize: 95,
                    finalSampleSize: 110,
                },
                samplingResults: null,
                reportContent: "<p>报告</p>",
                stage1CompletedAt: null,
                stage2CompletedAt: null,
                stage3CompletedAt: null,
                stage4CompletedAt: null,
                populationSize: 8000,
            }}
        />,
    );

    await waitFor(() => {
        expect(view.getByText("样本量规划摘要")).toBeTruthy();
    });

    const text = view.container.textContent ?? "";
    expect(text).toContain("估计类型");
    expect(text).toContain("均值估计");
    expect(text).toContain("最终样本量来源");
    expect(text).toContain("CV-based计算（高级工具）");
    expect(text).toContain("绝对误差限");
    expect(text).toContain("±2（与均值同单位）");
    expect(text).toContain("总体方差 σ²");
    expect(text).toContain("100");
});
