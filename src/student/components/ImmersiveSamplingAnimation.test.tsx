import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { ImmersiveSamplingAnimation } from "./ImmersiveSamplingAnimation";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(async () => {
    // Timer-driven commits can leave a passive-effect callback on React's host
    // queue even after unmount. Let it finish while window still exists.
    await act(async () => cleanup());
});

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

test("simple animation uses the saved seed and replays the same draw", async () => {
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
    expect(view.getByTestId("sampling-animation-legend").textContent).toContain("实色描边：已选样本");
    await waitFor(() => {
        const selectedIndices = [...grid.children]
            .map((dot, index) => dot.getAttribute("data-selected") === "true" ? index : -1)
            .filter(index => index >= 0);
        expect(selectedIndices).toEqual([2, 3, 7]);
        expect(view.getByText("已完成选取，正在核对结果... 3/3")).toBeTruthy();
    }, { timeout: 3000 });

    await waitFor(() => view.getByTestId("sampling-animation-receipt"), { timeout: 2500 });
    fireEvent.click(view.getByTestId("immersive-sampling-replay"));
    expect(view.queryByTestId("sampling-animation-receipt")).toBeNull();
    expect(view.getByText("准备中...")).toBeTruthy();
    const replayGrid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    await waitFor(() => {
        const selectedIndices = [...replayGrid.children]
            .map((dot, index) => dot.getAttribute("data-selected") === "true" ? index : -1)
            .filter(index => index >= 0);
        expect(selectedIndices).toEqual([2, 3, 7]);
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
    const strataLegend = view.getByTestId("sampling-animation-strata-legend");
    expect(strataLegend.textContent).toContain("共 20 层");
    expect(strataLegend.textContent).toContain("颜色循环仅区分相邻层");
    expect(strataLegend.textContent).not.toContain("第1层");
    const activeStratum = await waitFor(() => view.getByTestId("sampling-animation-active-stratum"), { timeout: 2500 });
    expect(activeStratum.textContent).toMatch(/层 \d+\/20：第\d+层/);
    expect(activeStratum.textContent).toContain("Nₕ 50 → nₕ 5");
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    const receipt = view.getByTestId("sampling-animation-receipt");
    expect(receipt.textContent).toContain("分层配置20 层；1,000 → 100");
    expect(view.queryByTestId("sampling-animation-strata-legend")).toBeNull();
    expect(view.getByTestId("sampling-animation-layer-details").hasAttribute("open")).toBe(false);
    expect(view.getByTestId("sampling-animation-layer-details").textContent).toContain("可滚动查看全部");
    const layerList = view.getByTestId("sampling-animation-layer-list");
    expect(layerList.className).toContain("max-h-24");
    expect(layerList.tabIndex).toBe(0);
    expect(layerList.getAttribute("aria-label")).toBe("各层总体与样本分配");
});

test("six strata retain their names while the seventh switches to a compact legend", async () => {
    const buildLayers = (count: number) => Array.from({ length: count }, (_, index) => ({
        name: `层级${index + 1}`,
        count: 10,
        ratio: 100 / count,
        sampleCount: 2,
    }));
    const sixLayerView = render(
        <ImmersiveSamplingAnimation
            method="stratified"
            populationSize={60}
            sampleSize={12}
            layers={buildLayers(6)}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );
    await waitFor(() => sixLayerView.getByTestId("sampling-animation-strata-legend"), { timeout: 1500 });
    const fullLegend = sixLayerView.getByTestId("sampling-animation-strata-legend");
    expect(fullLegend.textContent).toContain("层级1");
    expect(fullLegend.textContent).toContain("层级6");
    expect(fullLegend.textContent).not.toContain("颜色循环");
    sixLayerView.unmount();

    const sevenLayerView = render(
        <ImmersiveSamplingAnimation
            method="stratified"
            populationSize={70}
            sampleSize={14}
            layers={buildLayers(7)}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );
    await waitFor(() => sevenLayerView.getByTestId("sampling-animation-strata-legend"), { timeout: 1500 });
    const compactLegend = sevenLayerView.getByTestId("sampling-animation-strata-legend");
    expect(compactLegend.textContent).toContain("共 7 层");
    expect(compactLegend.textContent).toContain("颜色循环仅区分相邻层");
    expect(compactLegend.textContent).not.toContain("层级1");
});

test("reduced-motion users go directly to results without a replay control", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
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

        await waitFor(() => view.getByTestId("sampling-animation-receipt"));
        expect(view.queryByTestId("immersive-sampling-replay")).toBeNull();
    } finally {
        window.matchMedia = originalMatchMedia;
    }
});
