import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import {
    calculateSurveyVariableRequiredSampleSize,
    MultiVariableSamplePlan,
    type SurveyVariable,
} from "./MultiVariableSamplePlan";

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

function proportionVar(overrides: Partial<SurveyVariable> = {}): SurveyVariable {
    return {
        id: "v-test-1",
        name: "测试变量",
        type: "proportion",
        estimatedValue: 0.5,
        importance: "primary",
        confidenceLevel: "95",
        marginOfError: 5,
        requiredSampleSize: 0,
        ...overrides,
    };
}

test("populationSize 变化时推荐样本量会重算并再次通知父级", async () => {
    const onVariablesChange = mock((_v: SurveyVariable[]) => {});
    const onRecommendedSampleSizeChange = mock((_n: number) => {});

    const { rerender } = render(
        <MultiVariableSamplePlan
            populationSize={1000}
            initialVariables={[proportionVar()]}
            onVariablesChange={onVariablesChange}
            onRecommendedSampleSizeChange={onRecommendedSampleSizeChange}
        />,
    );

    await waitFor(() => expect(onRecommendedSampleSizeChange.mock.calls.length).toBeGreaterThan(0));
    const nAt1k = onRecommendedSampleSizeChange.mock.calls.at(-1)![0] as number;
    expect(nAt1k).toBeGreaterThan(0);

    rerender(
        <MultiVariableSamplePlan
            populationSize={8000}
            initialVariables={[proportionVar()]}
            onVariablesChange={onVariablesChange}
            onRecommendedSampleSizeChange={onRecommendedSampleSizeChange}
        />,
    );

    await waitFor(() => {
        const last = onRecommendedSampleSizeChange.mock.calls.at(-1)![0] as number;
        expect(last).not.toBe(nAt1k);
    });
});

test("次要和参考变量的已配置精度同样参与最大样本量约束", async () => {
    const onRecommendedSampleSizeChange = mock((_n: number) => {});
    const primary = proportionVar({ id: "primary", importance: "primary", marginOfError: 10 });
    const secondary = proportionVar({ id: "secondary", importance: "secondary", marginOfError: 2 });
    const expected = calculateSurveyVariableRequiredSampleSize(secondary, 5000);

    render(
        <MultiVariableSamplePlan
            populationSize={5000}
            initialVariables={[primary, secondary]}
            onVariablesChange={() => {}}
            onRecommendedSampleSizeChange={onRecommendedSampleSizeChange}
        />,
    );

    await waitFor(() => {
        expect(onRecommendedSampleSizeChange.mock.calls.at(-1)?.[0]).toBe(expected);
    });
});

test("均值相对误差拒绝零均值，并对负均值使用绝对值", () => {
    const base = proportionVar({
        type: "mean",
        estimatedValue: 100,
        estimatedStdDev: 20,
        marginOfError: 5,
    });
    const positive = calculateSurveyVariableRequiredSampleSize(base, 2000);
    const negative = calculateSurveyVariableRequiredSampleSize({ ...base, estimatedValue: -100 }, 2000);
    const zero = calculateSurveyVariableRequiredSampleSize({ ...base, estimatedValue: 0 }, 2000);

    expect(positive).toBeGreaterThan(0);
    expect(negative).toBe(positive);
    expect(zero).toBe(0);
});

test("比例变量把 UI 中小于 1% 的误差限按百分数换算", () => {
    const variable = proportionVar({ marginOfError: 0.5, estimatedValue: 0.5 });

    expect(calculateSurveyVariableRequiredSampleSize(variable, 10_000)).toBe(7935);
});

test("非法比例、置信水平和误差限不能回退为可应用的样本量", () => {
    for (const overrides of [
        { estimatedValue: 2 }, { estimatedValue: -1 }, { estimatedValue: Infinity },
        { confidenceLevel: "80" }, { marginOfError: 100 }, { marginOfError: Infinity },
    ]) {
        expect(calculateSurveyVariableRequiredSampleSize(proportionVar(overrides), 1000)).toBe(0);
    }
    for (const p of [0, .5, 1]) {
        expect(calculateSurveyVariableRequiredSampleSize(proportionVar({ estimatedValue: p }), 1000)).toBe(278);
    }
});
