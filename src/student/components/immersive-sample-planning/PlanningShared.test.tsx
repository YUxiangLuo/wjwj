import { afterAll, beforeAll, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { PlanningOutcome } from "./PlanningShared";
import type { SampleParams } from "./types";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
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
