import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import {
    parseAdvancedPlans,
    validateAdvancedPlanConsistency,
    type AdvancedPlanSnapshot,
} from "../experiment/advanced-plan";

let restoreDom: (() => void) | null = null;

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

type Emitted = { inputs: Record<string, unknown>; result: Record<string, unknown> };

function buildSnapshot(kind: AdvancedPlanSnapshot["kind"], emitted: Emitted): AdvancedPlanSnapshot {
    return {
        version: 1,
        kind,
        appliedAt: "2026-09-01T08:00:00.000Z",
        ...emitted,
    } as AdvancedPlanSnapshot;
}

function expectSnapshotRecomputes<K extends AdvancedPlanSnapshot["kind"]>(kind: K, emitted: Emitted | null, populationSize: number): Extract<AdvancedPlanSnapshot, { kind: K }> {
    expect(emitted).not.toBeNull();
    const snapshot = buildSnapshot(kind, emitted!) as Extract<AdvancedPlanSnapshot, { kind: K }>;
    const parsed = parseAdvancedPlans([snapshot]);
    expect(parsed).not.toBeNull();
    expect(validateAdvancedPlanConsistency(parsed![0]!, populationSize, null)).toBeNull();
    return snapshot;
}

test("CV calculator emits a snapshot that passes server-side recomputation", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { CVBasedSampleSizeCalculator } = await import("./CVBasedSampleSizeCalculator");

    let emitted: Emitted | null = null;
    const view = render(
        <CVBasedSampleSizeCalculator
            populationSize={1000}
            confidenceLevel="95"
            onApplySampleSize={() => undefined}
            onSnapshot={(snapshot) => { emitted = snapshot; }}
        />,
    );
    const applyButton = await waitFor(() => view.getByRole("button", { name: /应用此样本量/ }));
    fireEvent.click(applyButton);

    const snapshot = expectSnapshotRecomputes("cv", emitted, 1000);
    // 快照输入即工具表单值（百分数单位）
    expect(snapshot.inputs).toMatchObject({ confidenceLevel: "95", targetCV: 5, estimatedCV: 30 });
});

test("cluster calculator emits a snapshot that passes server-side recomputation", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { ClusterSamplingCalculator } = await import("./ClusterSamplingCalculator");

    let emitted: Emitted | null = null;
    const view = render(
        <ClusterSamplingCalculator
            populationSize={1000}
            confidenceLevel="95"
            marginOfError={5}
            onApplyResult={() => undefined}
            onSnapshot={(snapshot) => { emitted = snapshot; }}
        />,
    );
    const applyButton = await waitFor(() => view.getByRole("button", { name: /应用整群抽样方案/ }));
    fireEvent.click(applyButton);

    const snapshot = expectSnapshotRecomputes("cluster", emitted, 1000);
    expect(snapshot.inputs).toMatchObject({ confidenceLevel: "95", marginOfError: 5, clusterSize: 50, designEffect: 2 });
});

test("cost tradeoff emits a snapshot that passes server-side recomputation", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { PrecisionCostTradeoff } = await import("./PrecisionCostTradeoff");

    let emitted: Emitted | null = null;
    const view = render(
        <PrecisionCostTradeoff
            populationSize={1000}
            confidenceLevel="95"
            designEffect={1}
            nonResponseRate={0.1}
            onApplyBudget={() => undefined}
            onSnapshot={(snapshot) => { emitted = snapshot; }}
        />,
    );
    const applyButton = await waitFor(() => view.getByRole("button", { name: /应用此样本量/ }));
    fireEvent.click(applyButton);

    const snapshot = expectSnapshotRecomputes("cost", emitted, 1000);
    // 默认预设场景：电话调查 5000 + 15/样本，预算 50000
    expect(snapshot.inputs).toMatchObject({ fixedCost: 5000, variableCostPerUnit: 15, totalBudget: 50000 });
    expect(snapshot.result.feasible).toBe(true);
});
