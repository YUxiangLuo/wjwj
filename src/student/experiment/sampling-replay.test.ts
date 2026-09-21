import { expect, test } from "bun:test";
import { executeSamplingAction } from "./sampling-service";
import { replaySamplingSection, verifySamplingReplay } from "./sampling-replay";

const population = [
    { id: 1, y: 2, size: 1, group: "A" },
    { id: 2, y: 4, size: 2, group: "A" },
    { id: 3, y: 8, size: 3, group: "A" },
    { id: 4, y: 20, size: 4, group: "B" },
    { id: 5, y: 30, size: 5, group: "B" },
];
const fieldMapping = { numeric: ["y", "size"], stratified: ["group"], analysisTarget: { kind: "mean", field: "y" } };

async function section(method: "simple" | "systematic" | "pps" | "stratified") {
    const executed = await executeSamplingAction({
        method,
        population,
        fieldMapping,
        targetSampleSize: 2,
        rawParams: {
            seed: 713,
            sampleSize: 2,
            sizeField: "size",
            stratifyBy: "group",
            layers: [{ name: "A", sampleCount: 1, ratio: 999 }, { name: "B", sampleCount: 1, ratio: -1 }],
        },
    });
    if (!executed.ok) throw new Error(executed.errorMessage);
    return { ...executed.result, serverGenerated: true } as Record<string, unknown>;
}

test("all compact server designs replay from their seed and authoritative population", async () => {
    const results: Record<string, unknown> = {};
    for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
        results[method] = await section(method);
        expect((await replaySamplingSection({ method, section: results[method] as Record<string, unknown>, population, fieldMapping })).ok).toBe(true);
    }
    expect(await verifySamplingReplay({ samplingResults: results, population, fieldMapping })).toBe(true);
});

test("replay rejects changed systematic and PPS execution evidence even when indices stay unchanged", async () => {
    const systematic = await section("systematic");
    const pps = await section("pps");

    expect((await replaySamplingSection({ method: "systematic", section: { ...systematic, interval: Number(systematic.interval) + 0.25 }, population, fieldMapping })).ok).toBe(false);
    expect((await replaySamplingSection({ method: "systematic", section: { ...systematic, randomStart: Number(systematic.randomStart) + 0.01 }, population, fieldMapping })).ok).toBe(false);
    expect((await replaySamplingSection({ method: "pps", section: { ...pps, randomStart: Number(pps.randomStart) + 0.01 }, population, fieldMapping })).ok).toBe(false);
    expect((await replaySamplingSection({
        method: "pps",
        section: { ...pps, probabilitySummary: { ...(pps.probabilitySummary as Record<string, unknown>), probabilitySum: 1 } },
        population,
        fieldMapping,
    })).ok).toBe(false);
});

test("stratum counts and ratios are server-derived and changed metadata fails replay", async () => {
    const stratified = await section("stratified");
    expect(stratified.layers).toEqual([
        { name: "A", count: 3, ratio: 60, sampleCount: 1 },
        { name: "B", count: 2, ratio: 40, sampleCount: 1 },
    ]);
    const reordered = (stratified.layers as Array<{ name: string; count: number; ratio: number; sampleCount: number }>).map(layer => ({
        sampleCount: layer.sampleCount,
        ratio: layer.ratio,
        count: layer.count,
        name: layer.name,
    }));
    expect((await replaySamplingSection({ method: "stratified", section: { ...stratified, layers: reordered }, population, fieldMapping })).ok).toBe(true);
    const layers = (stratified.layers as Array<Record<string, unknown>>).map((layer, index) => index === 0 ? { ...layer, ratio: 99 } : layer);
    expect((await replaySamplingSection({ method: "stratified", section: { ...stratified, layers }, population, fieldMapping })).ok).toBe(false);
});
