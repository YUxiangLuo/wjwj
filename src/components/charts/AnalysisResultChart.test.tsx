import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import type { SavedAnalysisView } from "@/domain/variables/types";
import { AnalysisResultChart } from "./AnalysisResultChart";

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

const baseRecord: Omit<SavedAnalysisView, "result"> = {
    id: 101,
    waveNumber: 2,
    config: {
        question: "黑金与普通会员最高支付意愿及分布差异如何？",
        method: "stratified",
        field: "wtp",
        weighted: false,
        datasetMode: "cleaned_respondents",
    },
    variable: {
        field: "wtp",
        label: "最高支付意愿",
        unit: "元",
        kind: "continuous",
        categories: [],
        missing: [null],
    },
    source: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    dictionaryRevision: 1,
    samplingGeneration: 2,
    algorithmVersion: "v2",
    createdAt: "2026-11-23T06:00:00Z",
    stale: false,
};

describe("AnalysisResultChart statistical visualizations & accessibility", () => {
    test("renders horizontal 5-number statistical boxplot + mean diamond marker (including degenerate min=max) and passes axe-core", async () => {
        const normalRecord: SavedAnalysisView = {
            ...baseRecord,
            id: 1,
            result: {
                kind: "numeric",
                sampleCount: 120,
                validCount: 116,
                missingCount: 4,
                weighted: false,
                mean: 88.4,
                sampleStandardDeviation: 16.2,
                min: 45,
                q1: 76,
                median: 86.5,
                q3: 101,
                max: 138,
            },
        };

        const degenerateRecord: SavedAnalysisView = {
            ...baseRecord,
            id: 2,
            result: {
                kind: "numeric",
                sampleCount: 10,
                validCount: 10,
                missingCount: 0,
                weighted: false,
                mean: 50,
                sampleStandardDeviation: 0,
                min: 50,
                q1: 50,
                median: 50,
                q3: 50,
                max: 50,
            },
        };

        const view = render(
            <div>
                <AnalysisResultChart record={normalRecord} testId="numeric-box-normal" />
                <AnalysisResultChart record={degenerateRecord} testId="numeric-box-degenerate" />
            </div>,
        );

        for (const id of ["numeric-box-normal", "numeric-box-degenerate"]) {
            const card = view.getByTestId(id);
            expect(card !== null).toBe(true);
            const svg = card.querySelector("svg");
            expect(svg !== null).toBe(true);
            expect(svg?.getAttribute("aria-hidden")).toBe("true");
            expect(card.querySelectorAll("svg path").length).toBeGreaterThan(1);
            expect(card.innerHTML).not.toContain("NaN");
        }
        expect(view.getByTestId("numeric-box-normal").textContent).toContain("五数分位箱线与均值分布图");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("renders weighted-only numeric mean callout indicator chart when quantiles are unavailable", async () => {
        const weightedNumeric: SavedAnalysisView = {
            ...baseRecord,
            id: 3,
            config: { ...baseRecord.config, weighted: true },
            result: {
                kind: "numeric",
                sampleCount: 150,
                validCount: 142,
                missingCount: 8,
                weighted: true,
                mean: 92.65,
                sampleStandardDeviation: null,
                min: null,
                q1: null,
                median: null,
                q3: null,
                max: null,
            },
        };

        const view = render(<AnalysisResultChart record={weightedNumeric} testId="numeric-weighted" />);
        const card = view.getByTestId("numeric-weighted");
        expect(card.textContent).toContain("设计加权均值指示图");
        expect(card.textContent).toContain("92.65");
        expect(card.querySelector("svg") !== null).toBe(true);
        expect(card.innerHTML).not.toContain("NaN");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("renders categorical dual-view horizontal ranked bar + share donut and handles duplicate labels and >8 categories", async () => {
        const categoricalRecord: SavedAnalysisView = {
            ...baseRecord,
            id: 4,
            variable: {
                field: "channel",
                label: "主要复购渠道",
                unit: "",
                kind: "nominal",
                categories: [],
                missing: [null],
            },
            result: {
                kind: "categorical",
                sampleCount: 200,
                validCount: 195,
                missingCount: 5,
                weighted: false,
                categories: [
                    { value: "小程序", label: "小程序", count: 65, proportion: 65 / 195 },
                    { value: "APP", label: "APP", count: 48, proportion: 48 / 195 },
                    { value: "1", label: "1", count: 22, proportion: 22 / 195 },
                    { value: 1, label: "1", count: 16, proportion: 16 / 195 },
                    { value: "门店自提", label: "门店自提", count: 14, proportion: 14 / 195 },
                    { value: "外卖平台", label: "外卖平台", count: 10, proportion: 10 / 195 },
                    { value: "企业团购", label: "企业团购", count: 8, proportion: 8 / 195 },
                    { value: "社群接龙", label: "社群接龙", count: 7, proportion: 7 / 195 },
                    { value: "电话订购", label: "电话订购", count: 5, proportion: 5 / 195 },
                ],
            },
        };

        const view = render(<AnalysisResultChart record={categoricalRecord} testId="cat-dual" />);
        const card = view.getByTestId("cat-dual");
        expect(card.textContent).toContain("类别排序占比与构成双视图");
        expect(card.querySelector("svg") !== null).toBe(true);
        expect(card.querySelectorAll("svg path").length).toBeGreaterThan(8);
        expect(card.innerHTML).toContain("其余 2 类");
        expect(card.innerHTML).not.toContain("NaN");
        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("renders subgroup crosstab continuous mean + ±1 SD whiskers and categorical 100% stacked/grouped toggle", async () => {
        const crosstabNumeric: SavedAnalysisView = {
            ...baseRecord,
            id: 5,
            config: { ...baseRecord.config, groupByField: "tier" },
            result: {
                kind: "crosstab",
                groupField: "tier",
                groupLabel: "会员等级",
                targetKind: "numeric",
                sampleCount: 120,
                validCount: 118,
                missingCount: 2,
                weighted: false,
                groups: [
                    { groupValue: "黑金", groupLabel: "黑金会员", validCount: 38, mean: 126.4, sampleStandardDeviation: 18.5 },
                    { groupValue: "成长", groupLabel: "成长会员", validCount: 45, mean: 89.2, sampleStandardDeviation: 14.1 },
                    { groupValue: "普通", groupLabel: "普通会员", validCount: 35, mean: 62.8, sampleStandardDeviation: 11.3 },
                ],
            },
        };

        const crosstabCategorical: SavedAnalysisView = {
            ...baseRecord,
            id: 6,
            config: { ...baseRecord.config, field: "pref", groupByField: "tier", weighted: true },
            variable: {
                field: "pref",
                label: "配送偏好",
                unit: "",
                kind: "nominal",
                categories: [],
                missing: [null],
            },
            result: {
                kind: "crosstab",
                groupField: "tier",
                groupLabel: "会员等级",
                targetKind: "categorical",
                sampleCount: 120,
                validCount: 120,
                missingCount: 0,
                weighted: true,
                groups: [
                    {
                        groupValue: "黑金",
                        groupLabel: "黑金会员",
                        validCount: 40,
                        categories: [
                            { value: "即时达", label: "即时达", count: 28, proportion: 0.7 },
                            { value: "预约送", label: "预约送", count: 12, proportion: 0.3 },
                        ],
                    },
                    {
                        groupValue: "普通",
                        groupLabel: "普通会员",
                        validCount: 80,
                        categories: [
                            { value: "即时达", label: "即时达", count: 24, proportion: 0.3 },
                            { value: "预约送", label: "预约送", count: 56, proportion: 0.7 },
                        ],
                    },
                ],
            },
        };

        const view = render(
            <div>
                <AnalysisResultChart record={crosstabNumeric} testId="crosstab-num" />
                <AnalysisResultChart record={crosstabCategorical} testId="crosstab-cat" />
            </div>,
        );

        const numCard = view.getByTestId("crosstab-num");
        expect(numCard.textContent).toContain("±1 SD 样本离散区间");
        expect(numCard.querySelector("svg") !== null).toBe(true);

        const catCard = view.getByTestId("crosstab-cat");
        expect(catCard.textContent).toContain("100% 堆叠视图");
        const groupedBtn = view.getByRole("button", { name: "分组柱状" });
        expect(groupedBtn.getAttribute("aria-pressed")).toBe("false");

        fireEvent.click(groupedBtn);
        expect(groupedBtn.getAttribute("aria-pressed")).toBe("true");
        expect(catCard.textContent).toContain("分组柱状视图");
        expect(catCard.querySelector("svg") !== null).toBe(true);

        expect(await getAccessibilityViolations(view.container)).toEqual([]);
    });

    test("returns null cleanly on zero valid observations and renders safely under renderToStaticMarkup", () => {
        const emptyRecord: SavedAnalysisView = {
            ...baseRecord,
            id: 7,
            result: {
                kind: "numeric",
                sampleCount: 20,
                validCount: 0,
                missingCount: 20,
                weighted: false,
                mean: null,
                sampleStandardDeviation: null,
                min: null,
                q1: null,
                median: null,
                q3: null,
                max: null,
            },
        };
        const emptyView = render(<AnalysisResultChart record={emptyRecord} testId="empty-chart" />);
        expect(emptyView.queryByTestId("empty-chart") === null).toBe(true);

        const validRecord: SavedAnalysisView = {
            ...baseRecord,
            id: 8,
            result: {
                kind: "numeric",
                sampleCount: 10,
                validCount: 10,
                missingCount: 0,
                weighted: false,
                mean: 20,
                sampleStandardDeviation: 3,
                min: 15,
                q1: 18,
                median: 20,
                q3: 22,
                max: 25,
            },
        };
        const ssrHtml = renderToStaticMarkup(<AnalysisResultChart record={validRecord} />);
        expect(ssrHtml).toContain("五数分位箱线与均值分布图");
    });
});
