import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
let ImmersiveSamplingAnimation: typeof import("./ImmersiveSamplingAnimation").ImmersiveSamplingAnimation;
let getSamplingAnimationDurationUpperBound: typeof import("./ImmersiveSamplingAnimation").getSamplingAnimationDurationUpperBound;
let getSystematicPopulationDotClass: typeof import("./ImmersiveSamplingAnimation").getSystematicPopulationDotClass;

beforeAll(async () => {
    const dom = installDomGlobals("http://localhost/student/task/1/experiment");
    restoreDom = dom.restore;
    ({
        ImmersiveSamplingAnimation,
        getSamplingAnimationDurationUpperBound,
        getSystematicPopulationDotClass,
    } = await import("./ImmersiveSamplingAnimation"));
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("sampling animation can be skipped immediately without invoking close", async () => {
    const onClose = mock(() => undefined);
    const view = render(
        <ImmersiveSamplingAnimation
            method="systematic"
            populationSize={200}
            sampleSize={132}
            interval={200 / 132}
            sampledData={[{ id: "S001" }]}
            sampledTotal={132}
            onClose={onClose}
        />,
    );

    expect(view.getByText(/分数间隔 K=1\.5152/)).toBeTruthy();
    expect(view.getByText(/检查排序与周期结构/)).toBeTruthy();
    fireEvent.click(view.getByTestId("immersive-sampling-skip"));
    await waitFor(() => expect(view.getByText("系统抽样完成")).toBeTruthy());
    expect(onClose).toHaveBeenCalledTimes(0);

    fireEvent.click(view.getByTestId("immersive-sampling-return"));
    expect(onClose).toHaveBeenCalledTimes(1);
});

test("stratified animation describes configured layer counts rather than assuming proportional allocation", () => {
    const view = render(
        <ImmersiveSamplingAnimation
            method="stratified"
            populationSize={200}
            sampleSize={80}
            stratifyBy="gender"
            layers={[{ name: "A", count: 20, ratio: 0.1, sampleCount: 20 }, { name: "B", count: 180, ratio: 0.9, sampleCount: 60 }]}
            sampledData={[]}
            onClose={() => undefined}
        />,
    );

    expect(view.getByText(/按已配置的各层样本量分别抽取/)).toBeTruthy();
    expect(view.queryByText(/按比例抽取样本/)).toBeNull();
});

test("sampling animation respects reduced-motion preference", async () => {
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
                method="pps"
                populationSize={200}
                sampleSize={132}
                sizeField="spending"
                sampledData={[{ id: "S001" }]}
                onClose={() => undefined}
            />,
        );
        await waitFor(() => expect(view.getByText("PPS抽样完成")).toBeTruthy());
        expect(view.queryByTestId("immersive-sampling-skip")).toBeNull();
    } finally {
        window.matchMedia = originalMatchMedia;
    }
});

test("all animation methods have a deterministic upper bound below six seconds", () => {
    for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
        expect(getSamplingAnimationDurationUpperBound(method)).toBeLessThan(6_000);
    }
});

test("systematic sampling distinguishes scan progress and animates marker coordinates", async () => {
    expect(getSystematicPopulationDotClass(12, 11)).toBe("bg-muted");
    expect(getSystematicPopulationDotClass(11, 11)).toBe("bg-info-muted");

    const source = await Bun.file("src/student/components/ImmersiveSamplingAnimation.tsx").text();
    expect(source).toContain("transition-[top] duration-[80ms]");
    expect(source).toContain("transition-[left,top] duration-[80ms]");
    expect(source).not.toContain("bg-info-muted transition-[transform]");
});
