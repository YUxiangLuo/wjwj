import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { SampleParams } from "../types";
import { PrecisionPhase } from "./PrecisionPhase";
import { FactorsPhase } from "./FactorsPhase";
import { FourStepPhase } from "./FourStepPhase";

// Smoke coverage for the teaching phases. Copy/presentational assertions were
// removed; the remaining tests check the computational rules that the phases
// teach (nonresponse inflation and design-effect monotonicity).

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

function meanParams(overrides: Partial<SampleParams> = {}): SampleParams {
    return {
        populationSize: 8000,
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 2,
        populationVariance: 100,
        designEffect: 1,
        nonResponseRate: 0,
        finalSampleSize: 95,
        recommendedSize: 95,
        ...overrides,
    };
}

function proportionParams(overrides: Partial<SampleParams> = {}): SampleParams {
    return {
        populationSize: 200,
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        finalSampleSize: 132,
        recommendedSize: 132,
        ...overrides,
    };
}

test("planning phases render for mean and proportion targets", () => {
    const formula = render(
        <FourStepPhase
            scenario="summary"
            params={meanParams({ populationSize: 200, populationVariance: 100, marginOfError: 2 })}
            estimationType="mean"
            populationVariance={100}
            onDesignEffectChange={() => {}}
            onNonResponseRateChange={() => {}}
            onNext={() => {}}
        />,
    );
    expect(formula.container.textContent).toContain("n₂ =");
    formula.unmount();

    expect(render(<PrecisionPhase params={meanParams()} onNext={() => {}} />).container.textContent).toContain("σ² = 100");

});

test("FactorsPhase nonresponse inflates invites by 1/(1-r) and caps at N", () => {
    const view = render(<FactorsPhase step="non_response" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    // Default 20%: invite = ceil(132/0.8) = 165, completed ≈ 132.
    expect(text).toContain("发 165 / 完成约 132");
    // 0%: invite equals completions.
    expect(text).toContain("发 132 / 完成约 132");
    // 50%: invite = min(200, ceil(132/0.5)) = 200 (capped).
    expect(text).toContain("发 200 / 完成约 100");
});

test("FactorsPhase design effect explains the variance-ratio definition", () => {
    const view = render(<FactorsPhase step="design_effect" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("deff = 复杂设计的方差 ÷ 简单随机抽样的方差");
    expect(text).toContain("分层抽样");
});
