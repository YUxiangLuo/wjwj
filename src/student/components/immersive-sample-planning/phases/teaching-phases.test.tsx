import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

test("ST-B2 four-step teaching keeps raw intermediates and rounds only the 458 invitations", () => {
    const view = render(
        <FourStepPhase
            scenario="summary"
            params={proportionParams({
                populationSize: 1000,
                designEffect: 1.5,
                nonResponseRate: 0.2,
                recommendedSize: 458,
                finalSampleSize: 458,
            })}
            estimationType="proportion"
            populationVariance={0}
            onDesignEffectChange={() => {}}
            onNonResponseRateChange={() => {}}
            onNext={() => {}}
        />,
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("458 个单位，是这样算出来的");
    expect(text).toContain("384.16");
    expect(text).toContain("576.24");
    expect(text).toContain("365.811");
    expect(text).toContain("只在最后向上取整");
});

test("FactorsPhase nonresponse inflates invites by 1/(1-r) and caps at N", () => {
    const view = render(<FactorsPhase step="non_response" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    // Raw FPC target ≈131.751: ceil(raw/.8)=165, expected completions=132.
    expect(text).toContain("发 165 / 完成约 132");
    // 0%: invite equals completions.
    expect(text).toContain("发 132 / 完成约 132");
    // 50%: invitations cap at 200, below the required completion target.
    expect(text).toContain("发 200 / 完成约 100");
    fireEvent.click(view.getByRole("button", { name: "50%" }));
    expect(view.container.textContent).toContain("预计完成量仍不足，无法达到规划精度");
    fireEvent.click(view.getByRole("button", { name: "0%" }));
    expect(view.container.textContent).not.toContain("预计完成量仍不足");
});

test("FactorsPhase design effect explains the variance-ratio definition", () => {
    const view = render(<FactorsPhase step="design_effect" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("deff = 复杂设计的方差 ÷ 简单随机抽样的方差");
    expect(text).toContain("按 95% 置信水平规划");
    expect(text).not.toContain("95% CI");
    expect(text).toContain("分层抽样");
});

test("nonresponse teaching starts from raw completions, not already inflated invitations", () => {
    const view = render(<FactorsPhase step="non_response" params={proportionParams({ populationSize: 1000, nonResponseRate: 0.2, recommendedSize: 348 })} onNext={() => {}} />);
    // 384.16 * 1000 / (999 + 384.16) = 277.740825...; ceil(raw / .8) = 348.
    expect(view.container.textContent).toContain("发 348 / 完成约 278.4");
    expect(view.container.textContent).toContain("发 278 / 完成约 278");
    expect(view.container.textContent).not.toContain("发 435");
    // Neither changing the selected response assumption nor capping the stored
    // recommendation may change the completion target of this comparison.
    view.rerender(<FactorsPhase step="non_response" params={proportionParams({ populationSize: 1000, nonResponseRate: 0.9, recommendedSize: 1000 })} onNext={() => {}} />);
    expect(view.container.textContent).toContain("发 348 / 完成约 278.4");
});

test("mean nonresponse teaching keeps raw FPC and design effect before rounding", () => {
    // n0=96.04; deff=1.5; nFpc=144060/1143.06=126.03...;
    // at 20% nonresponse ceil(nFpc/.8)=158, not ceil(127/.8)=159.
    const view = render(<FactorsPhase step="non_response" params={meanParams({ populationSize: 1000, designEffect: 1.5, nonResponseRate: 0.2, recommendedSize: 158 })} onNext={() => {}} />);
    expect(view.container.textContent).toContain("发 158 / 完成约 126.4");
    expect(view.container.textContent).not.toContain("发 159");
});
