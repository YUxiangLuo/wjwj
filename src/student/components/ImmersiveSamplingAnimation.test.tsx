import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
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
