import { expect, test } from "bun:test";
import { DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE, getSamplingPreviewState } from "./grading-detail-utils";

test("getSamplingPreviewState returns data rows when sampling data exists", () => {
    const state = getSamplingPreviewState({
        completed: true,
        sampleCount: 2,
        data: [{ id: 1 }, { id: 2 }],
    });

    expect(state.kind).toBe("data");
    expect(state.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(state.reason).toBeNull();
});

test("getSamplingPreviewState returns unavailable reason for skipped PPS sections", () => {
    const state = getSamplingPreviewState({
        unavailable: true,
        unavailableReason: "当前总体不存在对每个单位都为正数的规模变量",
    });

    expect(state.kind).toBe("unavailable");
    expect(state.rows).toEqual([]);
    expect(state.reason).toBe("当前总体不存在对每个单位都为正数的规模变量");
});

test("getSamplingPreviewState falls back to the default unavailable message", () => {
    const state = getSamplingPreviewState({
        unavailable: true,
    });

    expect(state.kind).toBe("unavailable");
    expect(state.reason).toBe(DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE);
});

test("getSamplingPreviewState returns empty for missing sampling sections", () => {
    const state = getSamplingPreviewState(null);

    expect(state.kind).toBe("empty");
    expect(state.rows).toEqual([]);
    expect(state.reason).toBeNull();
});
