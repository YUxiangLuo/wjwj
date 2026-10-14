import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { calculateMeanEstimationSampleSize } from "../experiment/sample-plan";
import { DomainEstimationManager, type Domain } from "./DomainEstimationManager";
import { MultiVariableSamplePlan, type SurveyVariable } from "./MultiVariableSamplePlan";
import { CVBasedSampleSizeCalculator } from "./CVBasedSampleSizeCalculator";

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

test("DomainEstimationManager 在均值估计下使用绝对误差与均值样本量公式", async () => {
    const onDomainsChange = mock((_domains: Domain[]) => {});
    const domain: Domain = {
        id: "d-1",
        name: "18-30岁",
        populationSize: 2000,
        confidenceLevel: "95",
        marginOfError: 2,
        requiredSampleSize: 0,
    };

    const view = render(
        <DomainEstimationManager
            totalPopulationSize={8000}
            stratifiedFields={[]}
            onDomainsChange={onDomainsChange}
            initialDomains={[domain]}
            estimationType="mean"
            populationVariance={100}
            defaultConfidenceLevel="95"
            defaultMarginOfError={2}
        />,
    );

    const expected = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 2000,
        populationVariance: 100,
        designEffect: 1,
        nonResponseRate: 0,
    });

    await waitFor(() => {
        const text = view.container.textContent ?? "";
        expect(text).toContain("绝对误差限");
        expect(text).toContain("σ²=100");
        expect(text).toContain(`需 n ≥ ${expected}`);
        expect(text).toContain("±2 / 95%");
    });
});

test("MultiVariableSamplePlan 在均值主流程下新增变量默认使用均值类型与相对误差默认值", async () => {
    const onVariablesChange = mock((_variables: SurveyVariable[]) => {});

    const view = render(
        <MultiVariableSamplePlan
            populationSize={8000}
            onVariablesChange={onVariablesChange}
            defaultConfidenceLevel="95"
            defaultMarginOfError={5}
            defaultMeanRelativeMargin={5}
            defaultVariableType="mean"
        />,
    );

    fireEvent.click(view.getByRole("button", { name: "添加调查变量" }));

    await waitFor(() => {
        expect(onVariablesChange).toHaveBeenCalled();
    });

    const addedVariables = onVariablesChange.mock.calls.at(-1)?.[0] as SurveyVariable[];
    expect(addedVariables).toHaveLength(1);
    expect(addedVariables[0]?.type).toBe("mean");
    expect(addedVariables[0]?.marginOfError).toBe(5);
    expect(addedVariables[0]?.estimatedValue).toBe(0);
});

test("CVBasedSampleSizeCalculator 在均值估计下不再把左侧主流程描述成比例估计", () => {
    const view = render(
        <CVBasedSampleSizeCalculator
            populationSize={8000}
            confidenceLevel="95"
            estimationType="mean"
            initialDesignEffect={1}
            initialNonResponseRate={0}
        />,
    );
    const text = view.container.textContent ?? "";

    expect(text).toContain("左侧常规面板的均值误差限公式");
    expect(text).not.toContain("左侧决策面板的比例估计法则");
});
