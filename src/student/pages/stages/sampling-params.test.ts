import { expect, test } from "bun:test";
import {
    buildSamplingExecutionDraftFromResults,
    decideSamplingDraftRestore,
    hasCompletedSamplingResults,
    parseSamplingExecutionDraft,
    resolvePpsSizeField,
    serializeSamplingExecutionDraft,
    type SamplingExecutionDraft,
} from "./sampling-params";

test("parseSamplingExecutionDraft normalizes invalid values", () => {
    const draft = parseSamplingExecutionDraft(JSON.stringify({
        simpleSeed: " 123 ",
        systematicSeed: "abc",
        ppsSeed: 88,
        stratifiedSeed: null,
        kValue: 0,
        ppsSizeField: " income ",
        ppsSampleSize: "-3",
        stratifyBy: "",
        layerSampleCounts: [12, -4, "5", "bad"],
    }));

    expect(draft).toEqual({
        simpleSeed: "123",
        systematicSeed: "",
        ppsSeed: "88",
        stratifiedSeed: "",
        kValue: 1,
        ppsSizeField: "income",
        ppsSampleSize: 1,
        stratifyBy: "gender",
        layerSampleCounts: [12, 0, 5, 0],
    });
});

test("serializeSamplingExecutionDraft preserves roundtrip-safe drafts", () => {
    const draft: SamplingExecutionDraft = {
        simpleSeed: "101",
        systematicSeed: "",
        ppsSeed: "202",
        stratifiedSeed: "303",
        kValue: 7,
        ppsSizeField: "income",
        ppsSampleSize: 120,
        stratifyBy: "education",
        layerSampleCounts: [40, 80],
    };

    expect(parseSamplingExecutionDraft(serializeSamplingExecutionDraft(draft))).toEqual(draft);
});

test("parseSamplingExecutionDraft returns null for malformed json", () => {
    expect(parseSamplingExecutionDraft("{bad json")).toBeNull();
});

test("resolvePpsSizeField keeps an existing restored field", () => {
    expect(resolvePpsSizeField("income", ["expense", "age"])).toBe("income");
});

test("resolvePpsSizeField falls back to the first numeric field", () => {
    expect(resolvePpsSizeField("", ["expense", "age"])).toBe("expense");
});

test("hasCompletedSamplingResults detects saved server-side results", () => {
    expect(hasCompletedSamplingResults(null)).toBe(false);
    expect(hasCompletedSamplingResults({
        systematic: {
            completed: true,
            kValue: 5,
            sampleCount: 40,
        },
    })).toBe(true);
});

test("buildSamplingExecutionDraftFromResults derives the server-backed parameter snapshot", () => {
    expect(buildSamplingExecutionDraftFromResults({
        results: {
            systematic: {
                completed: true,
                kValue: 8,
                sampleCount: 48,
                seed: 101,
            },
            pps: {
                completed: true,
                sizeField: "income",
                sampleCount: 52,
                seed: 202,
            },
            stratified: {
                completed: true,
                stratifyBy: "education",
                layers: [
                    { name: "A", count: 100, ratio: 50, sampleCount: 20 },
                    { name: "B", count: 100, ratio: 50, sampleCount: 30 },
                ],
                seed: 303,
            },
        },
        populationSize: 400,
        sampleSize: 50,
    })).toEqual({
        simpleSeed: "",
        systematicSeed: "101",
        ppsSeed: "202",
        stratifiedSeed: "303",
        kValue: 8,
        ppsSizeField: "income",
        ppsSampleSize: 52,
        stratifyBy: "education",
        layerSampleCounts: [20, 30],
    });
});

test("decideSamplingDraftRestore auto-restores when no completed server results exist", () => {
    const decision = decideSamplingDraftRestore({
        rawDraft: JSON.stringify({
            simpleSeed: "",
            systematicSeed: "",
            ppsSeed: "",
            stratifiedSeed: "",
            kValue: 6,
            ppsSizeField: "income",
            ppsSampleSize: 40,
            stratifyBy: "gender",
            layerSampleCounts: [20, 20],
        }),
        serverValue: {
            simpleSeed: "",
            systematicSeed: "",
            ppsSeed: "",
            stratifiedSeed: "",
            kValue: 5,
            ppsSizeField: "",
            ppsSampleSize: 50,
            stratifyBy: "gender",
            layerSampleCounts: [],
        },
        hasCompletedResults: false,
    });

    expect(decision.type).toBe("auto_restore");
    expect(decision.draft?.ppsSizeField).toBe("income");
});

test("decideSamplingDraftRestore prompts instead of silently overriding saved server results", () => {
    const decision = decideSamplingDraftRestore({
        rawDraft: JSON.stringify({
            simpleSeed: "",
            systematicSeed: "",
            ppsSeed: "",
            stratifiedSeed: "",
            kValue: 6,
            ppsSizeField: "income",
            ppsSampleSize: 40,
            stratifyBy: "gender",
            layerSampleCounts: [20, 20],
        }),
        serverValue: {
            simpleSeed: "",
            systematicSeed: "",
            ppsSeed: "",
            stratifiedSeed: "",
            kValue: 5,
            ppsSizeField: "",
            ppsSampleSize: 50,
            stratifyBy: "gender",
            layerSampleCounts: [],
        },
        hasCompletedResults: true,
    });

    expect(decision.type).toBe("prompt_restore");
    expect(decision.draft?.kValue).toBe(6);
});
