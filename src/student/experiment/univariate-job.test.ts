import { expect, test } from "bun:test";
import { readVariableSource } from "../../server/variable-source";
import { suggestDictionary } from "../../domain/variables/dictionary";
import { executeSamplingAction } from "./sampling-service";
import { runUnivariateJob, type UnivariateJob } from "./univariate-job";

test("worker replays all four designs and refuses forged indices, probabilities and changed sources", async () => {
    const path = `/storage/test/univariate-${crypto.randomUUID()}.csv`;
    const absolute = `${process.cwd()}${path}`;
    const values = [2, 4, 8, 20, 30];
    await Bun.write(absolute, "id,y,size,g\n01,2,1,A\n02,4,2,A\n03,8,3,A\n04,20,4,B\n05,30,5,B\n");
    try {
        const fieldMapping = { identifier: "id", numeric: ["y", "size"], stratified: ["g"] };
        const source = await readVariableSource(path, fieldMapping);
        const dictionary = suggestDictionary(source.rows, source.source, 1);
        dictionary.variables = dictionary.variables.map(variable => variable.field === "y" ? { ...variable, kind: "continuous", categories: [] } : variable);
        for (const method of ["simple", "systematic", "stratified", "pps"] as const) {
            const replay = await executeSamplingAction({ method, population: source.designRows, fieldMapping, targetSampleSize: 2,
                rawParams: { seed: 713, sampleSize: 2, sizeField: "size", stratifyBy: "g", layers: [{ name: "A", sampleCount: 1 }, { name: "B", sampleCount: 1 }] } });
            expect(replay.ok).toBe(true);
            if (!replay.ok) throw new Error(replay.errorMessage);
            const section = { ...replay.result, serverGenerated: true };
            const indices = section.indices!;
            const job: UnivariateJob = { populationPath: path, fieldMapping, dictionary, samplingResult: section,
                config: { method, field: "y", question: "样本均值是多少？", weighted: false } };
            const unweighted = await runUnivariateJob(job);
            expect(unweighted.ok).toBe(true);
            if (!unweighted.ok) throw new Error(unweighted.message);
            expect(unweighted.data.result).toMatchObject({ kind: "numeric", mean: (values[indices[0]!]! + values[indices[1]!]!) / 2 });
            const weighted = await runUnivariateJob({ ...job, config: { ...job.config, weighted: true } });
            expect(weighted.ok).toBe(true);
            if (!weighted.ok || weighted.data.result.kind !== "numeric") throw new Error("Expected weighted numeric result");
            const weights = indices.map((index, i) => method === "pps" ? 1 / section.inclusionProbabilities![i]! : method === "stratified" ? index < 3 ? 3 : 2 : 2.5);
            expect(weighted.data.result.mean!).toBeCloseTo((values[indices[0]!]! * weights[0]! + values[indices[1]!]! * weights[1]!) / (weights[0]! + weights[1]!), 12);
            expect(weighted.data.result.sampleStandardDeviation).toBeNull();
            expect(await runUnivariateJob({ ...job, samplingResult: { ...section, indices: [...indices].reverse() } })).toMatchObject({ ok: false });
            if (method === "pps") expect(await runUnivariateJob({ ...job, samplingResult: { ...section, inclusionProbabilities: [1, 1] } })).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
            expect(await runUnivariateJob({ ...job, dictionary: { ...dictionary, source: "stale" } })).toMatchObject({ ok: false, code: "SOURCE_MISMATCH" });
        }
    } finally { await Bun.file(absolute).delete(); }
});
