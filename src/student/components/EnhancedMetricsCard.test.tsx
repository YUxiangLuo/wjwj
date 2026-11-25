import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { EnhancedMetricsCard } from "./EnhancedMetricsCard";
import { calculateMeanSampleSizeMetrics, calculateSampleSizeMetrics } from "../experiment/sample-plan";

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

describe("EnhancedMetricsCard expectedCompleted consistency (QA-S2-01)", () => {
    test("ST-B2 proportion plan displays 366.4 consistently in header and breakdown without Math.ceil(367)", () => {
        const metrics = calculateSampleSizeMetrics({
            confidenceLevel: "95",
            marginOfError: 5,
            populationSize: 1000,
            designEffect: 1.5,
            nonResponseRate: 0.2,
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.n).toBe(458);
        expect(metrics!.expectedCompleted).toBeCloseTo(366.4, 12);

        const view = render(<EnhancedMetricsCard metrics={metrics} estimationType="proportion" finalSampleSize={458} />);
        const breakdownLabel = view.getByText("预期完成");
        expect(breakdownLabel.nextElementSibling?.textContent).toBe("366.4");
        expect(view.container.textContent).toContain("预期完成约 366.4 个有效样本");
        expect(view.container.textContent).not.toContain("367");
    });

    test("mean plan displays fractional expectedCompleted consistently in KPI tile and breakdown", () => {
        // N=1000, CL=95, e=2, σ²=100, deff=1, nrr=0.15 -> nFpc=87.7045..., n=104, expectedCompleted=104*0.85=88.4
        const metrics = calculateMeanSampleSizeMetrics({
            confidenceLevel: "95",
            marginOfError: 2,
            populationSize: 1000,
            populationVariance: 100,
            designEffect: 1,
            nonResponseRate: 0.15,
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.n).toBe(104);
        expect(metrics!.expectedCompleted).toBeCloseTo(88.4, 12);

        const view = render(
            <EnhancedMetricsCard
                metrics={metrics}
                estimationType="mean"
                populationVariance={100}
                finalSampleSize={104}
            />,
        );
        expect(view.container.textContent).toContain("预期完成约 88.4 个有效样本");

        const kpiLabel = view.getByText("预期完成样本量");
        const kpiCard = kpiLabel.closest("div")?.parentElement;
        expect(kpiCard?.textContent).toContain("88.4");
        expect(kpiCard?.textContent).not.toContain("89");

        const breakdownLabel = view.getByText("预期完成");
        expect(breakdownLabel.nextElementSibling?.textContent).toBe("88.4");
    });
});
