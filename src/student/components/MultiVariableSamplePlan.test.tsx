import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { MultiVariableSamplePlan, type SurveyVariable } from "./MultiVariableSamplePlan";

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
