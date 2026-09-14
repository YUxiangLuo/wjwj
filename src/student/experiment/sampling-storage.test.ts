import { expect, test } from "bun:test";
import {
    compactSamplingMethodResult,
    compactSamplingResults,
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    samplingResultsNeedPopulation,
} from "./sampling-storage";

const population = [{ id: 1 }, { id: 2 }, { id: 3 }];

test("compact sampling storage drops repeated row payloads but keeps replay indices", () => {
    const compact = compactSamplingMethodResult({
        completed: true,
        sampleCount: 2,
        indices: [2, 0],
        data: [population[2], population[0]],
    });

    expect(compact).toEqual({ completed: true, sampleCount: 2, indices: [2, 0] });
    expect(compact).not.toHaveProperty("data");
});

test("compact and hydrate sampling results round-trip every method", () => {
    const stored = compactSamplingResults({
        simple: { completed: true, sampleCount: 2, indices: [2, 0], data: [population[2], population[0]] },
        pps: { unavailable: true },
    });

    expect(inspectSamplingResultsStorage(stored)).toEqual({ ok: true, needsPopulation: true });
    expect(samplingResultsNeedPopulation(stored)).toBe(true);
    expect(hydrateSamplingResults(stored, population)).toEqual({
        ok: true,
        value: {
            simple: { completed: true, sampleCount: 2, indices: [2, 0], data: [population[2], population[0]] },
            pps: { unavailable: true },
        },
    });
});

test("hydration and compaction preserve legacy embedded rows without replay indices", () => {
    const legacy = { simple: { completed: true, data: [{ id: 9 }] } };
    expect(compactSamplingResults(legacy)).toEqual(legacy);
    expect(samplingResultsNeedPopulation(legacy)).toBe(false);
    expect(hydrateSamplingResults(legacy, population)).toEqual({ ok: true, value: legacy });
});

test("hydration fails closed for invalid, duplicate, or inconsistent replay indices", () => {
    expect(hydrateSamplingResults({ simple: { sampleCount: 2, indices: [0, 99] } }, population)).toMatchObject({
        ok: false,
        method: "simple",
        reason: "indices contain an out-of-range value",
    });
    expect(hydrateSamplingResults({ systematic: { sampleCount: 2, indices: [1, 1] } }, population)).toMatchObject({
        ok: false,
        method: "systematic",
        reason: "indices contain duplicates",
    });
    expect(hydrateSamplingResults({ stratified: { sampleCount: 2, indices: [0] } }, population)).toMatchObject({
        ok: false,
        method: "stratified",
        reason: "sampleCount does not match sampled items",
    });
    expect(hydrateSamplingResults({ pps: { sampleCount: 1, indices: [0], inclusionProbabilities: [] } }, population)).toMatchObject({
        ok: false,
        method: "pps",
        reason: "PPS inclusion probabilities do not match sampled items",
    });
});

test("embedded data cannot bypass compact replay validation", () => {
    const corrupted = {
        simple: {
            completed: true,
            serverGenerated: true,
            sampleCount: 2,
            indices: [0, 0],
            data: [],
        },
    };

    expect(inspectSamplingResultsStorage(corrupted)).toEqual({ ok: true, needsPopulation: true });
    expect(hydrateSamplingResults(corrupted, population)).toMatchObject({
        ok: false,
        method: "simple",
        reason: "indices contain duplicates",
    });
});

test("completed compact PPS results require valid inclusion probabilities", () => {
    expect(inspectSamplingResultsStorage({
        pps: { completed: true, serverGenerated: true, sampleCount: 1, indices: [0] },
    })).toMatchObject({
        ok: false,
        method: "pps",
        reason: "PPS inclusion probabilities do not match sampled items",
    });
});

test("storage inspection rejects malformed compact sections before population lookup", () => {
    expect(inspectSamplingResultsStorage({ simple: { completed: true, serverGenerated: true } })).toMatchObject({
        ok: false,
        method: "simple",
    });
    expect(inspectSamplingResultsStorage({ simple: { indices: "0,1" } })).toMatchObject({
        ok: false,
        method: "simple",
    });
    expect(inspectSamplingResultsStorage({ systematic: { unavailable: true } })).toMatchObject({
        ok: false,
        method: "systematic",
    });
});

test("stratified compact replay preserves exact whitespace field keys", () => {
    const rows = [{ "g ": "A" }, { "g ": "A" }, { "g ": "B" }, { "g ": "B" }];
    const section = { completed: true, serverGenerated: true, stratifyBy: "g ", sampleCount: 2, indices: [0, 2],
        layers: [{ name: "A", count: 2, sampleCount: 1 }, { name: "B", count: 2, sampleCount: 1 }],
    };
    expect(hydrateSamplingResults({ stratified: section }, rows)).toEqual({
        ok: true, value: { stratified: { ...section, data: [rows[0], rows[2]] } },
    });
});

test("stratified hydration rejects missing population coverage and mismatched Nh", () => {
    const stratifiedPopulation = [
        { id: 1, group: "A" },
        { id: 2, group: "A" },
        { id: 3, group: "B" },
    ];
    const base = {
        completed: true,
        serverGenerated: true,
        stratifyBy: "group",
        sampleCount: 2,
        indices: [0, 2],
    };
    expect(hydrateSamplingResults({
        stratified: { ...base, layers: [{ name: "A", count: 1, sampleCount: 1 }, { name: "B", count: 2, sampleCount: 1 }] },
    }, stratifiedPopulation)).toMatchObject({ ok: false, method: "stratified" });
    expect(hydrateSamplingResults({
        stratified: { ...base, layers: [{ name: "A", count: 2, sampleCount: 1 }, { name: "B", count: 1, sampleCount: 1 }] },
    }, stratifiedPopulation)).toMatchObject({ ok: true });
    expect(hydrateSamplingResults({
        stratified: { ...base, layers: [{ name: "A", count: 2, sampleCount: 1 }] },
    }, [...stratifiedPopulation, { id: 4, group: "" }])).toMatchObject({ ok: false, method: "stratified" });
});

test("a completed section without indices or embedded rows is invalid storage", () => {
    const corrupted = { simple: { completed: true, serverCount: 1 } };
    const inspection = inspectSamplingResultsStorage(corrupted);
    expect(inspection).toMatchObject({ ok: false, method: "simple" });
    expect(inspection.ok ? "" : inspection.reason).toBe("completed result has no sampled rows");
    // 旧格式（带 data）与服务器结果（带 indices）仍然有效
    expect(inspectSamplingResultsStorage({ simple: { completed: true, data: [] } })).toMatchObject({ ok: true });
    expect(inspectSamplingResultsStorage({ simple: { completed: true, serverGenerated: true, sampleCount: 1, seed: 1, indices: [0], data: [{}] } })).toMatchObject({ ok: true });
});
