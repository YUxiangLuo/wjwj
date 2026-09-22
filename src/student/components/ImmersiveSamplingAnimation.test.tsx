import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { ImmersiveSamplingAnimation } from "./ImmersiveSamplingAnimation";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("a small frame renders exactly its actual number of population dots", async () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="simple"
            populationSize={3}
            sampleSize={2}
            seed={42}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    const grid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    expect(grid.dataset.visualPopulation).toBe("3");
    expect(grid.children).toHaveLength(3);
    expect(view.getByTestId("sampling-animation-scale-note").textContent).toContain("按实际数量绘制：3 个点");
    await waitFor(() => expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(2), { timeout: 2000 });
    expect(grid.querySelectorAll(".scale-125")).toHaveLength(0);
    expect(grid.querySelectorAll('[data-selected="true"].ring-inset')).toHaveLength(2);
    const receipt = await waitFor(() => view.getByTestId("sampling-animation-receipt"), { timeout: 2500 });
    expect(receipt.textContent).toContain("抽样结果凭证");
    expect(receipt.textContent).toContain("3 → 2");
    expect(receipt.textContent).toContain("66.67%");
    expect(receipt.textContent).toContain("随机种子42");
});

test("a large frame labels its capped dot grid as a proportional illustration", async () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="simple"
            populationSize={10_000}
            sampleSize={2_000}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    const grid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    expect(grid.dataset.visualPopulation).toBe("1000");
    expect(grid.children).toHaveLength(1000);
    expect(view.getByTestId("sampling-animation-scale-note").textContent).toContain("比例示意：用 1,000 个点代表实际总体 10,000");
    await waitFor(() => expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(200), { timeout: 4500 });
    expect(grid.querySelectorAll(".scale-125")).toHaveLength(0);
    expect(grid.querySelectorAll('[data-selected="true"].ring-inset')).toHaveLength(200);
});

test("simple animation replays the saved seed instead of a fixed visual draw", async () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="simple"
            populationSize={8}
            sampleSize={3}
            seed={43}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    const grid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    await waitFor(() => {
        const selectedIndices = [...grid.children]
            .map((dot, index) => dot.getAttribute("data-selected") === "true" ? index : -1)
            .filter(index => index >= 0);
        expect(selectedIndices).toEqual([2, 3, 7]);
        expect(view.getByText("已完成选取，正在核对结果... 3/3")).toBeTruthy();
    }, { timeout: 3000 });
});

test("systematic animation maps the saved random start onto the visible frame", async () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="systematic"
            populationSize={10}
            sampleSize={4}
            interval={2.5}
            randomStart={1.25}
            seed={99}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    const grid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    await waitFor(() => {
        const selectedIndices = [...grid.children]
            .map((dot, index) => dot.getAttribute("data-selected") === "true" ? index : -1)
            .filter(index => index >= 0);
        expect(selectedIndices).toEqual([1, 3, 6, 8]);
    }, { timeout: 3000 });
});

test("PPS receipt includes its saved systematic start and copyable seed", async () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="pps"
            populationSize={100}
            sampleSize={20}
            sizeField="monthly_expense"
            seed={161_513_600}
            randomStart={0.125}
            ppsProbabilitySummary={{
                populationCount: 100,
                probabilitySum: 20,
                minInclusionProbability: 0.05,
                maxInclusionProbability: 1,
                certaintyUnitCount: 1,
            }}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    const receipt = view.getByTestId("sampling-animation-receipt");
    expect(receipt.textContent).toContain("PPS 系统随机起点 u0.125");
    expect(receipt.textContent).toContain("纳入概率之和 Σπᵢ20");
    expect(receipt.textContent).toContain("随机种子161513600");
    expect(receipt.textContent).not.toContain("161,513,600");
});

test("a twenty-layer receipt keeps the full allocation in bounded disclosure", async () => {
    const layers = Array.from({ length: 20 }, (_, index) => ({
        name: `第${index + 1}层`,
        count: 50,
        ratio: 5,
        sampleCount: 5,
    }));
    const view = render(
        <ImmersiveSamplingAnimation
            method="stratified"
            populationSize={1000}
            sampleSize={100}
            layers={layers}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    const receipt = view.getByTestId("sampling-animation-receipt");
    expect(receipt.textContent).toContain("分层配置20 层；1,000 → 100");
    expect(view.getByTestId("sampling-animation-layer-details").hasAttribute("open")).toBe(false);
    expect(view.getByTestId("sampling-animation-layer-details").textContent).toContain("可滚动查看全部");
    const layerList = view.getByTestId("sampling-animation-layer-list");
    expect(layerList.className).toContain("max-h-24");
    expect(layerList.tabIndex).toBe(0);
    expect(layerList.getAttribute("aria-label")).toBe("各层总体与样本分配");
});
