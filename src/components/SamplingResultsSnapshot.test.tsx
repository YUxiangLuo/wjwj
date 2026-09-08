import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { SamplingResultsSnapshot } from "./SamplingResultsSnapshot";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("renders sampling metadata and a paginated preview instead of raw JSON", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ 样本ID: `S${index + 1}`, 年级: "大一" }));
    const view = render(
        <SamplingResultsSnapshot value={{
            simple: { completed: true, sampleCount: 25, seed: 20260723, data: rows },
            stratified: {
                completed: true,
                stratifyBy: "年级",
                seed: 20260723,
                layers: [{ name: "大一", count: 100, ratio: 100, sampleCount: 25 }],
                data: rows,
            },
        }} />,
    );

    await waitFor(() => expect(view.getByTestId("sampling-results-snapshot")).toBeTruthy());
    expect(view.getByText("简单随机")).toBeTruthy();
    expect(view.getAllByText("25 条").length).toBeGreaterThan(0);
    expect(view.getByText("随机种子")).toBeTruthy();
    expect(view.getByText("20260723")).toBeTruthy();
    expect(view.getByText("显示第 1–20 条，共 25 条")).toBeTruthy();
    expect(view.container.textContent).not.toContain('"sampleCount"');
});

test("renders the bounded PPS probability explanation", async () => {
    const view = render(<SamplingResultsSnapshot value={{
        pps: {
            completed: true,
            sizeField: "规模",
            sampleCount: 1,
            data: [{ id: 1, 规模: 20 }],
            probabilitySummary: { populationCount: 10, probabilitySum: 2, minInclusionProbability: 0.1, maxInclusionProbability: 1, certaintyUnitCount: 1 },
            probabilityPreview: [{ samplePosition: 1, sizeValue: 20, inclusionProbability: 0.5, designWeight: 2 }],
        },
    }} />);
    expect(await waitFor(() => view.getByTestId("pps-probability-explanation"))).toBeTruthy();
    expect(view.getByText("规模值如何转成抽中概率")).toBeTruthy();
    expect(view.getByText("0.5")).toBeTruthy();
});

test("omits result sections disabled by the immutable sampling policy", () => {
    const view = render(<SamplingResultsSnapshot
        value={{
            simple: { completed: true, sampleCount: 1, data: [{ id: 1 }] },
            pps: { unavailable: true, unavailableReason: "没有合格规模变量" },
        }}
        samplingPolicy={{
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" },
        }}
    />);

    expect(view.getByText("简单随机")).toBeTruthy();
    expect(view.queryByText("PPS 抽样")).toBeNull();
    expect(view.container.textContent).not.toContain("没有合格规模变量");
});
