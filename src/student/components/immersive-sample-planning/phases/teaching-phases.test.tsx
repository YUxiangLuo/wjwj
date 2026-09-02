import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { SampleParams } from "../types";
import { PrecisionPhase } from "./PrecisionPhase";
import { FactorsPhase } from "./FactorsPhase";
import { FormulaPhase } from "./FormulaPhase";
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

test("FormulaPhase 小结把有限总体校正标为 n₂，并使用 deff 后再校正的恒等式", () => {
    const view = render(
        <FormulaPhase
            step="summary"
            params={meanParams({ populationSize: 200, populationVariance: 100, marginOfError: 2 })}
            estimationType="mean"
            populationVariance={100}
            onEstimationTypeChange={() => {}}
            onPopulationVarianceChange={() => {}}
            onConfidenceLevelChange={() => {}}
            onMarginOfErrorChange={() => {}}
            onNext={() => {}}
        />,
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("n₂ =");
    expect(text).toContain("200 − 1 +");
    expect(text).not.toContain("n₁ =");
});

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

test("QuizPhase 基础路径只考已出现的 SE、FPC 与 deff", () => {
    const first = render(<QuizPhase questionIndex={0} onNext={() => {}} onSkip={() => {}} />);
    expect(first.container.textContent).toContain("标准误差");
    const second = render(<QuizPhase questionIndex={1} onNext={() => {}} onSkip={() => {}} />);
    expect(second.container.textContent).toContain("总体规模从 2,000 增加到 200,000");
    const third = render(<QuizPhase questionIndex={2} onNext={() => {}} onSkip={() => {}} />);
    expect(third.container.textContent).toContain("deff = 2");
    expect(third.container.textContent).not.toContain("奈曼");
});

test("FactorsPhase 设计效应页：deff 越大所需样本量越大，并解释 deff 来源", () => {
    const view = render(<FactorsPhase step="design_effect" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("因素 4");
    expect(text).toContain("deff = 复杂设计的方差 ÷ 简单随机抽样的方差");
    expect(text).toContain("整群抽样");
    expect(text).toContain("1 + (平均群规模 − 1) × 群内相关 ρ");
    expect(text).toContain("分层抽样");

    // 四个 deff 档位的样本量应严格递增（N=200、95%、±5%）
    const barNumbers = Array.from(view.container.querySelectorAll("span.w-16.text-right.font-medium"))
        .map((span) => Number(span.textContent?.replace(/[^\d]/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
    expect(barNumbers).toHaveLength(4);
    for (let index = 1; index < barNumbers.length; index += 1) {
        expect(barNumbers[index]!).toBeGreaterThan(barNumbers[index - 1]!);
    }
});

test("FactorsPhase 无回答率页：发放量按 1/(1−r) 放大并以 N 封顶", () => {
    const view = render(<FactorsPhase step="non_response" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("因素 5");
    expect(text).toContain("n ÷ (1 − r)");
    expect(text).toContain("目标完成 132 人");
    // 默认 20%：invite = ceil(132/0.8) = 165，完成约 floor(165×0.8) = 132
    expect(text).toContain("发 165 / 完成约 132");
    // 0%：发放与完成相同
    expect(text).toContain("发 132 / 完成约 132");
    // 50%：invite = min(200, ceil(132/0.5)) = 200（封顶），完成约 100
    expect(text).toContain("发 200 / 完成约 100");
    expect(text).toContain("降低无回答本身");
});

test("FactorsPhase 汇总页展示六因素卡片", () => {
    const view = render(<FactorsPhase step="summary" params={proportionParams()} onNext={() => {}} />);
    const text = view.container.textContent ?? "";

    expect(text).toContain("六类关键条件");
    for (const title of ["误差限", "子总体估计", "总体变异", "设计效应", "无回答率", "精度与费用"]) {
        expect(text).toContain(title);
    }
    expect(text).toContain("复杂设计的精度折扣 deff");
    expect(text).toContain("发放量按 1/(1−r) 放大");
    expect(text).toContain("继续：进入四步法小结");
    expect(text).not.toContain("下一步进入公式阶段");
});
