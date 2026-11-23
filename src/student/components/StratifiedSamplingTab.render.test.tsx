import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, render } = await import("@testing-library/react");
const { StratifiedSamplingTab } = await import("./StratifiedSamplingTab");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student").restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

describe("StratifiedSamplingTab initialResult synchronization", () => {
    const baseProps = {
        n: 10,
        N: 60,
        taskId: 1,
        populationStats: { 会员等级: { 普通: 30, 黑金: 30 } },
        numericFields: [],
        analysisTarget: null,
        stratumNumericStats: {},
        executing: null,
        setExecuting: () => undefined,
        onResult: () => undefined,
        onAnimate: () => undefined,
        buildSavePayload: () => undefined,
        executionTime: null,
        setExecutionTime: () => undefined,
        refreshRequired: false,
        onRefreshRequired: () => undefined,
    };

    test("resets rendered completion state when initialResult transitions from completed to null", () => {
        const completedResult = {
            completed: true,
            stratifyBy: "会员等级",
            layers: [
                { name: "普通", count: 30, ratio: 50, sampleCount: 5 },
                { name: "黑金", count: 30, ratio: 50, sampleCount: 5 },
            ],
            sampleCount: 10,
            data: [{ 会员编号: "M001", 会员等级: "普通" }],
        };

        const view = render(<StratifiedSamplingTab {...baseProps} initialResult={completedResult} />);
        expect(view.queryByTestId("student-sampling-stratified-rerun") !== null).toBe(true);
        expect(view.queryByTestId("student-sampling-stratified-run") === null).toBe(true);

        view.rerender(<StratifiedSamplingTab {...baseProps} initialResult={null} />);
        expect(view.queryByTestId("student-sampling-stratified-rerun") === null).toBe(true);
        expect(view.queryByTestId("student-sampling-stratified-run") !== null).toBe(true);
    });
});
