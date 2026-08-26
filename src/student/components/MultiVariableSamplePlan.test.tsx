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

test("传入 onApplyToPlan 时不自动调用 onRecommendedSampleSizeChange", async () => {
    const onRecommendedSampleSizeChange = mock((_n: number) => {});
    const onApplyToPlan = mock(() => {});

    render(
        <MultiVariableSamplePlan
            populationSize={2000}
            initialVariables={[proportionVar()]}
            onVariablesChange={() => {}}
            onRecommendedSampleSizeChange={onRecommendedSampleSizeChange}
            onApplyToPlan={onApplyToPlan}
        />,
    );

    await new Promise((r) => setTimeout(r, 150));
    expect(onRecommendedSampleSizeChange).not.toHaveBeenCalled();
});
