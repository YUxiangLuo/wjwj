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
            sizeField: "size",
            data: rows.map((row) => ({ ...row, size: row.id + 1 })),
        },
    }) as Record<string, Record<string, unknown>>;

    expect(result.simple?.data).toHaveLength(SAMPLING_PREVIEW_ROWS);
    expect(result.simple).not.toHaveProperty("indices");
    expect(result.pps).not.toHaveProperty("indices");
    expect(result.pps).not.toHaveProperty("inclusionProbabilities");
    expect(result.pps?.sampleCount).toBe(80);
    expect(result.pps?.probabilityPreview).toHaveLength(10);
    expect((result.pps?.probabilityPreview as any[])[0]).toEqual({
        samplePosition: 1,
        sizeValue: 1,
        inclusionProbability: 0.5,
        designWeight: 2,
    });
});

test("single-method preview also sanitizes small results", () => {
    expect(previewSamplingMethodResult({
        completed: true,
        sampleCount: 1,
        indices: [4],
        data: [{ id: 5 }],
    })).toEqual({ completed: true, sampleCount: 1, data: [{ id: 5 }] });
});

test("PPS preview never emits Infinity for a representable tiny inclusion probability", () => {
    const result = previewSamplingMethodResult({
        completed: true,
        sampleCount: 1,
        sizeField: "size",
        inclusionProbabilities: [5e-321],
        data: [{ id: 1, size: 1e-320 }],
    }) as Record<string, unknown>;
    expect((result.probabilityPreview as any[])[0]?.designWeight).toBe("1/5e-321");
    expect(JSON.stringify(result)).not.toContain("Infinity");
});
