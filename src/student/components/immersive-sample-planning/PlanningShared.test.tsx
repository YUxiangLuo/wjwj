import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { PlanningOutcome } from "./PlanningShared";
import type { SampleParams } from "./types";
import { EnhancedMetricsCard } from "../EnhancedMetricsCard";
import { calculateSampleSizeMetrics } from "../../experiment/sample-plan";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function params(overrides: Partial<SampleParams> = {}): SampleParams {
    return {
        populationSize: 30,
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 2,
        populationVariance: 502421.264,
        designEffect: 1,
        nonResponseRate: 0,
        finalSampleSize: 30,
        recommendedSize: 30,
        ...overrides,
    };
}

test("PlanningOutcome warns that a full census cannot compare sampling methods", () => {
    const view = render(<PlanningOutcome params={params()} />);
    const text = view.getByTestId("planning-outcome").textContent ?? "";
    expect(text).toContain("完整普查");
    expect(text).toContain("无法进行方法间比较");
    expect(text).toContain("±0");
});

test("PlanningOutcome omits the census warning for a genuine sample", () => {
    const view = render(<PlanningOutcome params={params({ populationSize: 1000, finalSampleSize: 100, recommendedSize: 100 })} />);
    const text = view.getByTestId("planning-outcome").textContent ?? "";
    expect(text).not.toContain("完整普查");
});

test("singleton nonresponse announces unavailable precision rather than zero error or success", () => {
    const plan = params({ populationSize: 1, estimationType: "proportion", marginOfError: 5, finalSampleSize: 1, recommendedSize: 1, nonResponseRate: 0.5 });
    const view = render(<PlanningOutcome params={plan} />);
    expect(view.getByRole("alert").textContent).toContain("无法评估规划精度或判断是否达标");
    expect(view.container.textContent).not.toContain("预计达到目标");
    expect(view.container.textContent).not.toContain("±0");
    view.unmount();
    const card = render(<EnhancedMetricsCard metrics={calculateSampleSizeMetrics(plan)} />);
    expect(card.container.textContent).toBe("");
});

test("ST-B2 planning views distinguish 458 invitations from 366.4 expected completions", () => {
    const plan = params({
        populationSize: 1000,
        estimationType: "proportion",
        marginOfError: 5,
        populationVariance: undefined,
        designEffect: 1.5,
        nonResponseRate: 0.2,
        finalSampleSize: 458,
        recommendedSize: 458,
    });
    const outcome = render(<PlanningOutcome params={plan} />);
    expect(outcome.getByTestId("planning-outcome").textContent).toContain("计划邀请 458 个单位，预期完成约 366.4 个有效样本");
    outcome.unmount();

    const metrics = calculateSampleSizeMetrics(plan);
    const card = render(<EnhancedMetricsCard metrics={metrics} finalSampleSize={458} />);
    expect(card.container.textContent).toContain("推荐邀请数 n = 458");
    expect(card.container.textContent).toContain("预期完成约 366.4 个有效样本");
    expect(card.container.textContent).not.toContain("预期完成约 367 个有效样本");
});
