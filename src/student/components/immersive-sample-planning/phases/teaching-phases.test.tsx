import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { SampleParams } from "../types";
import { PrecisionPhase } from "./PrecisionPhase";
import { FactorsPhase } from "./FactorsPhase";
import { QuizPhase } from "./QuizPhase";

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

test("PrecisionPhase 在均值估计下展示均值公式而非比例公式", () => {
    const view = render(<PrecisionPhase params={meanParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("SE(ȳ) = √[σ²/n × (N−n)/(N−1)]");
    expect(text).toContain("σ²=100");
    expect(text).not.toContain("CV = SE / p");
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

test("FactorsPhase 区分初始 n0 的 25 倍与有限总体实际倍数", () => {
    const view = render(<FactorsPhase step="error_tolerance" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("初始公式 n₀");
    expect(text).toContain("n₀ 会增加 25 倍");
    expect(text).toContain("有限总体校正后的样本量由 132 增至 196");
    expect(text).toContain("实际约为 1.48 倍");
});

test("QuizPhase 不把三个域的样本量写成固定 2–3 倍", () => {
    const view = render(<QuizPhase questionIndex={4} onNext={() => {}} onSkip={() => {}} />);
    const text = view.container.textContent ?? "";
    expect(text).toContain("共同计算");
    expect(text).not.toContain("约 2-3 倍");
});

test("QuizPhase 将 25 倍结论限定在未校正的 n0 公式", () => {
    const view = render(<QuizPhase questionIndex={6} onNext={() => {}} onSkip={() => {}} />);
    expect(view.container.textContent).toContain("未考虑有限总体校正的初始样本量 n₀ 公式");
});
