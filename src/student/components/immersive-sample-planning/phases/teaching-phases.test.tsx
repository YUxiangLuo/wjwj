import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { SampleParams } from "../types";
import { PrecisionPhase } from "./PrecisionPhase";
import { FactorsPhase } from "./FactorsPhase";

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

test("PrecisionPhase 在均值估计下展示均值公式而非比例公式", () => {
    const view = render(<PrecisionPhase params={meanParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("SE(ȳ) = √(σ²/n × FPC)");
    expect(text).toContain("σ²=100");
    expect(text).not.toContain("CV = SE / p̂");
    expect(text).not.toContain("p=0.5");
});

test("FactorsPhase 的均值误差页使用绝对误差与均值样本量文案", () => {
    const view = render(<FactorsPhase step="error_tolerance" params={meanParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("绝对误差限 e 越小");
    expect(text).toContain("σ²=100");
    expect(text).toContain("减半，样本量大约增加 4 倍");
    expect(text).not.toContain("±1%");
    expect(text).not.toContain("25 倍");
});

test("FactorsPhase 的均值子总体页说明沿用共同方差假设", () => {
    const view = render(<FactorsPhase step="subpopulation" params={meanParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("分别估计均值");
    expect(text).toContain("统一使用 σ²=100");
    expect(text).not.toContain("±5%");
});
