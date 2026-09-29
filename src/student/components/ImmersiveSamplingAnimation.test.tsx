import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { ImmersiveSamplingAnimation } from "./ImmersiveSamplingAnimation";
import { SamplingMethodExplanation } from "./SamplingMethodExplanation";

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

test("PPS illustration uses certainty-unit redistribution, not duplicate-hit advancement", async () => {
    const view = render(<ImmersiveSamplingAnimation method="pps" populationSize={10} sampleSize={7} randomStart={0.1145} sizeField="size" ppsProbabilitySummary={{ populationCount: 10, probabilitySum: 7, minInclusionProbability: .13989362870504474, maxInclusionProbability: 1, certaintyUnitCount: 3 }} sampledData={[]} onClose={() => {}} />);
    const grid = await waitFor(() => view.getByTestId("sampling-animation-dot-grid"), { timeout: 1500 });
    // Fixed synthetic frame: certainty units 0,3,6; residual u+j hits 1,2,5,9.
    // The duplicate-hit design incorrectly selected unit 8 instead of 9.
    await waitFor(() => expect([...grid.children].flatMap((dot, i) => dot.getAttribute("data-selected") === "true" ? [i] : [])).toEqual([0, 1, 2, 3, 5, 6, 9]), { timeout: 2000 });
    expect(view.queryByText(/正在核对结果/)).toBeNull();
});

test("compressed stratified illustration discloses omitted small strata", async () => {
    const layers = [{ name: "小层", count: 2, sampleCount: 2, ratio: .02 }, { name: "中层", count: 998, sampleCount: 98, ratio: 9.98 }, { name: "大层", count: 9000, sampleCount: 900, ratio: 90 }];
    const view = render(<ImmersiveSamplingAnimation method="stratified" populationSize={10000} sampleSize={1000} layers={layers} seed={42} stratifyBy="地区" sampledData={[]} onClose={() => {}} />);
    const allocation = await waitFor(() => view.getByRole("region", { name: "各层演示配额" }), { timeout: 1500 });
    expect(allocation.textContent).toContain("小层总体 2 → 样本 2规模过小，点阵未表示");
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    expect(view.getByTestId("sampling-animation-layer-list").textContent).toContain("小层2 → 2");
    expect(view.getByTestId("sampling-animation-final-diagram").textContent).toContain("规模过小，点阵未表示");
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
            seed={42}
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
        expect(view.getByText("演示选取完成 3/3")).toBeTruthy();
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
            seed={42}
            stratifyBy="地区"
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
    expect(view.getByTestId("sampling-animation-final-diagram").contains(view.getByTestId("sampling-animation-strata-legend"))).toBe(true);
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
            seed={42}
            stratifyBy="地区"
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
            seed={42}
            stratifyBy="地区"
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

test.each(["simple", "systematic", "pps", "stratified"] as const)("%s census retains every point, including zero seeds and starts", method => {
    const view = render(<ImmersiveSamplingAnimation method={method} populationSize={4} sampleSize={4} seed={0} interval={1} randomStart={0} sizeField="size" stratifyBy="g" layers={[{ name: "A", count: 1, ratio: 25, sampleCount: 1 }, { name: "B", count: 3, ratio: 75, sampleCount: 3 }]} ppsProbabilitySummary={{ populationCount: 4, probabilitySum: 4, minInclusionProbability: 1, maxInclusionProbability: 1, certaintyUnitCount: 4 }} sampledData={[]} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    expect(view.getByTestId("sampling-animation-final-diagram").querySelectorAll('[data-selected="true"]')).toHaveLength(4);
    if (method === "systematic") expect(view.getByTestId("sampling-animation-receipt").textContent).toContain("实际随机起点 r0");
});

test.each(["simple", "systematic", "pps", "stratified"] as const)("historical %s results never invent missing replay parameters", method => {
    const view = render(<ImmersiveSamplingAnimation method={method} populationSize={10} sampleSize={3} sampledData={[{ 名称: "已保存记录" }]} onClose={() => {}} />);
    expect(view.queryByTestId("sampling-animation-dot-grid")).toBeNull();
    expect(view.queryByTestId("immersive-sampling-replay")).toBeNull();
    expect(view.getByText(/该历史结果缺少/)).toBeTruthy();
    expect(view.getByText("已保存记录")).toBeTruthy();
    expect(view.getByTestId("sampling-animation-receipt").textContent).not.toContain("随机种子42");
});

test("final compressed diagram retains its scale and color key", () => {
    const view = render(<ImmersiveSamplingAnimation method="simple" populationSize={100000} sampleSize={1000} seed={42} sampledData={[]} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    const diagram = view.getByTestId("sampling-animation-final-diagram");
    expect(diagram.textContent).toContain("用 1,000 个点代表实际总体 100,000");
    expect(diagram.textContent).toContain("1,000/100,000 近似映射");
    expect(diagram.textContent).toContain("实色描边：已选样本");
    expect(diagram.querySelectorAll('[data-selected="true"]')).toHaveLength(10);
});

test.each(["simple", "stratified"] as const)("empty %s results trap focus through closed and open disclosures", method => {
    const view = render(<ImmersiveSamplingAnimation method={method} populationSize={10} sampleSize={3} seed={42} stratifyBy="g" layers={[{ name: "A", count: 10, sampleCount: 3, ratio: 100 }]} sampledData={[]} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    const dialog = view.getByRole("dialog");
    // happy-dom has no layout. Model nonempty boxes even inside closed details:
    // the focus trap must exclude hidden content explicitly, as Chromium needs.
    for (const element of dialog.querySelectorAll<HTMLElement>("*")) {
        Object.defineProperty(element, "getClientRects", { value: () => [{ width: 1, height: 1 }] });
        if (element.tagName === "SUMMARY") element.tabIndex = 0;
    }
    const first = view.getByTestId("immersive-sampling-replay");
    const last = dialog.querySelectorAll<HTMLElement>("summary").item(dialog.querySelectorAll("summary").length - 1)!;
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    if (method === "stratified") {
        view.getByTestId("sampling-animation-layer-details").setAttribute("open", "");
        const region = view.getByTestId("sampling-animation-layer-list");
        region.focus();
        fireEvent.keyDown(region, { key: "Tab" });
        expect(document.activeElement).toBe(first);
        fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(region);
    }
});

test("method examples agree with hand-calculated fractional and certainty-unit designs", () => {
    const view = render(<SamplingMethodExplanation method="systematic" />);
    expect([...view.getByRole("img").querySelectorAll(".bg-primary-muted")].map(element => element.textContent)).toEqual(["2", "5", "8"]);
    view.rerender(<SamplingMethodExplanation method="pps" />);
    const axis = view.getByRole("img");
    expect([...axis.children].map(element => element.getAttribute("data-unit"))).toEqual(["B", "C", "D"]);
    const probabilities = [...axis.children].map(element => parseFloat((element as HTMLElement).style.width) / 100);
    expect(probabilities[0]).toBeCloseTo(1 / 2, 12);
    expect(probabilities[1]).toBeCloseTo(1 / 3, 12);
    expect(probabilities[2]).toBeCloseTo(1 / 6, 12);
    expect(axis.querySelector(".bg-primary-muted")?.getAttribute("data-unit")).toBe("C");
    expect(view.container.textContent).toContain("结果为 A、C");
    expect(view.container.textContent).toContain("独立示例");
});

test("pause cancels phase timers and single stepping preserves position across speed changes", async () => {
    const view = render(<ImmersiveSamplingAnimation method="simple" populationSize={8} sampleSize={3} seed={43} sampledData={[]} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("sampling-animation-pause"));
    await act(async () => { await Bun.sleep(800); });
    expect(view.queryByTestId("sampling-animation-dot-grid")).toBeNull();
    const step = view.getByTestId("sampling-animation-step");
    step.focus();
    fireEvent.click(step);
    expect(document.activeElement).toBe(step);
    const grid = view.getByTestId("sampling-animation-dot-grid");
    expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
    fireEvent.click(step);
    expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
    fireEvent.change(view.getByLabelText("播放速度"), { target: { value: "2" } });
    await act(async () => { await Bun.sleep(100); });
    expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
    fireEvent.click(view.getByTestId("sampling-animation-pause"));
    await waitFor(() => expect(grid.querySelectorAll('[data-selected="true"]')).toHaveLength(3));
    fireEvent.click(view.getByTestId("sampling-animation-pause"));
    await act(async () => { await Bun.sleep(600); });
    expect(view.queryByTestId("sampling-animation-receipt")).toBeNull();
    fireEvent.click(step);
    expect(view.getByTestId("sampling-animation-receipt")).toBeTruthy();
    expect(view.getByTestId("sampling-animation-final-diagram").querySelectorAll('[data-selected="true"]')).toHaveLength(3);
    expect(view.getByText("方法说明")).toBeTruthy();
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
