import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { buildCostPrecisionCurve } from "../experiment/cost-precision-curve";
import { CostPrecisionChart } from "./CostPrecisionChart";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/student").restore;
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

describe("CostPrecisionChart ECharts frontier, markLines, feasible region, and edge cases", () => {
    test("returns null gracefully when points are empty or all non-finite", () => {
        const emptyView = render(
            <CostPrecisionChart points={[]} referencePoints={[]} targetMarginOfError={5} budget={50000} />,
        );
        expect(emptyView.container.firstElementChild === null).toBe(true);
        cleanup();

        const nanView = render(
            <CostPrecisionChart
                points={[{ sampleSize: Number.NaN, totalCost: -10, marginOfError: Number.POSITIVE_INFINITY }]}
                referencePoints={[]}
                targetMarginOfError={5}
                budget={50000}
            />,
        );
        expect(nanView.container.firstElementChild === null).toBe(true);
    });

    test("renders Cost–Precision Frontier SVG, target/budget MarkLines, feasible MarkArea, and reference table", async () => {
        const curve = buildCostPrecisionCurve({
            populationSize: 100000,
            confidenceLevel: "95",
            designEffect: 1,
            nonResponseRate: 0,
            fixedCost: 5000,
            variableCostPerUnit: 15,
            referenceSampleSizes: [383, 3000],
        });

        const view = render(
            <CostPrecisionChart
                points={curve.points}
                referencePoints={curve.referencePoints}
                targetMarginOfError={5}
                budget={50000}
            />,
        );

        expect(view.container.innerHTML).not.toContain("NaN");
        expect(view.container.innerHTML).not.toContain("Infinity");

        const chartFigure = view.getByRole("img", { name: /横轴为总成本，纵轴为预期误差限/ });
        expect(chartFigure !== null).toBe(true);
        const svg = chartFigure.querySelector("svg");
        expect(svg !== null).toBe(true);
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(chartFigure.querySelectorAll("svg path").length).toBeGreaterThan(3);

        expect(chartFigure.textContent).toContain("目标 ±5.0 pp");
        expect(chartFigure.textContent).toContain("预算 ¥50,000");
        expect(chartFigure.textContent).toContain("预算·精度可行域");
        expect(view.container.textContent).toContain("参考预算：¥50,000（竖直虚线）");

        const rows = [...view.container.querySelectorAll("tbody tr")].map((row) => row.textContent);
        expect(rows).toContain("38310,745±5.00");
        expect(rows).toContain("300050,000±1.76");

        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("handles free-survey zero cost (minCost === maxCost === 0), single-unit N=1, and out-of-range budget without NaN", async () => {
        const freeCurve = buildCostPrecisionCurve({
            populationSize: 1,
            confidenceLevel: "95",
            designEffect: 1,
            nonResponseRate: 0,
            fixedCost: 0,
            variableCostPerUnit: 0,
            referenceSampleSizes: [1],
        });

        const view = render(
            <CostPrecisionChart
                points={freeCurve.points}
                referencePoints={freeCurve.referencePoints}
                targetMarginOfError={0}
                budget={500}
            />,
        );

        expect(view.container.innerHTML).not.toContain("NaN");
        expect(view.container.innerHTML).not.toContain("Infinity");
        expect(view.getByTestId("cost-precision-echart").querySelector("svg") !== null).toBe(true);
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
        cleanup();

        const outOfRangeCurve = buildCostPrecisionCurve({
            populationSize: 100,
            confidenceLevel: "95",
            designEffect: 1,
            nonResponseRate: 0,
            fixedCost: 5000,
            variableCostPerUnit: 20,
            referenceSampleSizes: [50],
        });
        const outView = render(
            <CostPrecisionChart
                points={outOfRangeCurve.points}
                referencePoints={outOfRangeCurve.referencePoints}
                targetMarginOfError={5}
                budget={2000}
            />,
        );
        expect(outView.container.textContent).toContain("（在横轴范围之外）");
        expect(await getAccessibilityViolations(outView.container)).toEqual([]);
    });
});
