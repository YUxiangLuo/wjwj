import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { QuestionnaireSnapshot } from "./QuestionnaireSnapshot";
import { SamplePlanSnapshot } from "./SamplePlanSnapshot";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("questionnaire snapshot renders question types, options, constraints, and copy", () => {
    const view = render(
        <QuestionnaireSnapshot questionnaire={{
            title: "校园体验问卷",
            welcomeText: "<p>欢迎参与</p>",
            endingText: "<p>感谢作答</p>",
            questions: [
                { id: "q1", type: "single", content: "你的年级？", options: ["大一", "大二"] },
                { id: "q2", type: "multiple", content: "常用设施？", options: ["图书馆", "食堂", "操场"], minSelect: 1, maxSelect: 2 },
                { id: "q3", type: "scale", content: "总体满意度", scaleMin: 1, scaleMax: 5, scaleMinLabel: "不满意", scaleMaxLabel: "满意" },
                { id: "q4", type: "boolean", content: "是否愿意推荐？" },
            ],
        }} />,
    );

    expect(view.getByText("校园体验问卷")).toBeTruthy();
    expect(view.getByText(/多选题/)).toBeTruthy();
    expect(view.getByText("选择数量：1–2 项")).toBeTruthy();
    expect(view.getByText(/评分题/)).toBeTruthy();
    expect(view.getByText("评分范围：1–5（不满意 ～ 满意）")).toBeTruthy();
    expect(view.getByText(/是\/否题/)).toBeTruthy();
    expect(view.getByText("选项：是 / 否")).toBeTruthy();
    expect(view.container.textContent).not.toContain('"questions"');
});

test("sample plan snapshot presents proportion units and advanced source", () => {
    const view = render(
        <SamplePlanSnapshot
            populationSize={200}
            value={{
                estimationType: "proportion",
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1.2,
                nonResponseRate: 0.1,
                recommendedSize: 145,
                finalSampleSize: 150,
                advancedPlanSource: "cost",
            }}
        />,
    );

    expect(view.getByText("比例估计")).toBeTruthy();
    expect(view.getByText("±5%")).toBeTruthy();
    expect(view.getByText("成本权衡（高级工具）")).toBeTruthy();
    expect(view.getByText("总体规模 N = 200")).toBeTruthy();
    expect(view.getByText(/最终采用 150 个样本/)).toBeTruthy();
});

test("sample plan snapshot presents mean error in the measured unit", () => {
    const view = render(
        <SamplePlanSnapshot value={{
            estimationType: "mean",
            confidenceLevel: "99",
            marginOfError: 2.5,
            populationVariance: 100,
            designEffect: 1,
            nonResponseRate: 0,
            recommendedSize: 80,
            finalSampleSize: 80,
        }} />,
    );

    expect(view.getByText("均值估计")).toBeTruthy();
    expect(view.getByText("绝对误差限")).toBeTruthy();
    expect(view.getByText("±2.5（与均值同单位）")).toBeTruthy();
    expect(view.getByText("总体方差 σ²")).toBeTruthy();
});

test("sample plan snapshot supports legacy plans and handles invalid values", () => {
    const legacy = render(
        <SamplePlanSnapshot value={{
            confidenceLevel: 95,
            marginOfError: 5,
            calculatedSampleSize: 132,
            finalSampleSize: 132,
        }} />,
    );

    expect(legacy.getByText("比例估计")).toBeTruthy();
    expect(legacy.getAllByText("132").length).toBeGreaterThanOrEqual(2);
    legacy.unmount();

    const invalid = render(<SamplePlanSnapshot value="not-an-object" />);
    expect(invalid.getByText("暂无抽样方案")).toBeTruthy();
});
