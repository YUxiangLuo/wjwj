import { expect, test } from "bun:test";
import {
    previewSamplingMethodResult,
    previewSamplingResults,
    SAMPLING_PREVIEW_ROWS,
} from "./sampling-results-preview";

test("sampling preview bounds rows and removes replay-only arrays", () => {
    const rows = Array.from({ length: 80 }, (_, id) => ({ id }));
    const result = previewSamplingResults({
        simple: {
            completed: true,
            sampleCount: rows.length,
            indices: rows.map((row) => row.id),
            data: rows,
        },
        pps: {
            completed: true,
            sampleCount: rows.length,
            indices: rows.map((row) => row.id),
            inclusionProbabilities: rows.map(() => 0.5),
            data: rows,
        },
    }) as Record<string, Record<string, unknown>>;

    expect(result.simple?.data).toHaveLength(SAMPLING_PREVIEW_ROWS);
    expect(result.simple).not.toHaveProperty("indices");
    expect(result.pps).not.toHaveProperty("indices");
    expect(result.pps).not.toHaveProperty("inclusionProbabilities");
    expect(result.pps?.sampleCount).toBe(80);
});

test("single-method preview also sanitizes small results", () => {
    expect(previewSamplingMethodResult({
        completed: true,
        sampleCount: 1,
        indices: [4],
        data: [{ id: 5 }],
    })).toEqual({ completed: true, sampleCount: 1, data: [{ id: 5 }] });
});
