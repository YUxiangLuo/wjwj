import { expect, test } from "bun:test";
import { restoreResearchSample } from "./research-sample";
import { executeSamplingAction } from "./sampling-service";
import { RESEARCH_METHODS } from "@/domain/experiment/research-analysis";
const population = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1).padStart(3, "0"), x: i + 1, size: 20 + i, group: i < 6 ? "A" : "B" }));
async function section(method: typeof RESEARCH_METHODS[number]) {
    const response = await executeSamplingAction({ method, rawParams: { seed: -17, sampleSize: 6, sizeField: "size", stratifyBy: "group", layers: [{ name: "A", count: 6, sampleCount: 2 }, { name: "B", count: 6, sampleCount: 4 }] }, targetSampleSize: 6, population, fieldMapping: { identifier: "id", numeric: ["x", "size"], stratified: ["group"] } });
    if (!response.ok) throw new Error(response.errorMessage);
    const { data, ...stored } = response.result; return { stored, data };
}
for (const method of RESEARCH_METHODS) test(`research replays actual ${method} indices and weights, without modifying sampling policy`, async () => {
    const s = await section(method); const restored = await restoreResearchSample(method, s.stored, population);
    expect(restored.rows).toEqual(s.data); expect(restored.rows.every(r => /^\d{3}$/.test(String(r.id)))).toBe(true);
    if (method === "stratified") expect(restored.weights).toEqual([3, 3, 1.5, 1.5, 1.5, 1.5]);
    else if (method !== "pps") expect(restored.weights).toEqual(Array(6).fill(2));
    else for (const [i, row] of restored.rows.entries()) expect(restored.weights[i]).toBeCloseTo(306 / (6 * Number(row.size)), 12);
    const changed = structuredClone(s.stored); changed.indices![0] = (changed.indices![0]! + 1) % 12;
    await expect(restoreResearchSample(method, changed, population)).rejects.toThrow("不能推断");
});
for (const kind of ["string", "embedded", "mixed", "count", "seed", "weights", "layers"] as const) test(`research refuses corrupted sampling protocol: ${kind}`, async () => {
    const method = kind === "weights" ? "pps" : kind === "layers" ? "stratified" : "simple";
    const { stored } = await section(method); let bad: any = structuredClone(stored);
    if (kind === "string") bad = JSON.stringify(bad);
    if (kind === "embedded") { bad.data = [{ invented: true }]; delete bad.indices; }
    if (kind === "mixed") bad.data = [];
    if (kind === "count") bad.sampleCount = "6";
    if (kind === "seed") bad.seed = "-17";
    if (kind === "weights") bad.inclusionProbabilities[0] *= .9;
    if (kind === "layers") bad.layers[0].count = 5;
    await expect(restoreResearchSample(method, bad, population)).rejects.toThrow();
});
