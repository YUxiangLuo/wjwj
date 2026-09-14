import { expect, test } from "bun:test";
import { readVariableSource } from "../../server/variable-source";
import { suggestDictionary } from "../../domain/variables/dictionary";
import { executeSamplingAction } from "./sampling-service";
import { runUnivariateJob, type UnivariateJob } from "./univariate-job";

async function buildTrustedFixture() {
    const path = `/storage/test/univariate-trust-${crypto.randomUUID()}.csv`;
    const absolute = `${process.cwd()}${path}`;
    const csv = "id,y,size,g\n01,2,1,A\n02,4,2,A\n03,8,3,A\n04,20,4,B\n05,30,5,B\n";
    await Bun.write(absolute, csv);
    const fieldMapping = { identifier: "id", numeric: ["y", "size"], stratified: ["g"] };
    const source = await readVariableSource(path, fieldMapping);
    const dictionary = suggestDictionary(source.rows, source.source, 1);
    dictionary.variables = dictionary.variables.map(variable => variable.field === "y" ? { ...variable, kind: "continuous", categories: [] } : variable);
    return { path, absolute, csv, fieldMapping, source, dictionary };
}

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

// 四种抽样设计的真实文件重放回归。
test("worker rejects forged seeds, indices, layer identity, probabilities and changed source bytes", async () => {
    const fixture = await buildTrustedFixture();
    try {
        const { path, fieldMapping, dictionary } = fixture;
        const replay = async (method: "simple" | "systematic" | "stratified" | "pps") => {
            const result = await executeSamplingAction({ method, population: (await readVariableSource(path, fieldMapping)).designRows, fieldMapping, targetSampleSize: 2,
                rawParams: { seed: 713, sampleSize: 2, sizeField: "size", stratifyBy: "g", layers: [{ name: "A", sampleCount: 1 }, { name: "B", sampleCount: 1 }] } });
            if (!result.ok) throw new Error(result.errorMessage);
            return { ...result.result, serverGenerated: true } as Record<string, unknown>;
        };
        const jobFor = (method: "simple" | "systematic" | "stratified" | "pps", samplingResult: Record<string, unknown>): UnivariateJob => ({
            populationPath: path, fieldMapping, dictionary, samplingResult,
            config: { method, field: "y", question: "样本均值是多少？", weighted: false },
        });

        const simple = await replay("simple");
        expect((await runUnivariateJob(jobFor("simple", simple))).ok).toBe(true);
        // 换种子：重演索引不同
        expect(await runUnivariateJob(jobFor("simple", { ...simple, seed: 714 }))).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
        // 重复索引 / 越界索引在存储水合阶段即被拒绝；样本量与索引数不符同样拒绝
        const indices = simple.indices as number[];
        expect(await runUnivariateJob(jobFor("simple", { ...simple, indices: [indices[0]!, indices[0]!] }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });
        expect(await runUnivariateJob(jobFor("simple", { ...simple, indices: [indices[0]!, 99] }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });
        expect(await runUnivariateJob(jobFor("simple", { ...simple, sampleCount: 1 }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });
        // 缺少重演种子 / 非服务器生成结果
        expect(await runUnivariateJob(jobFor("simple", { ...simple, seed: undefined }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });
        expect(await runUnivariateJob(jobFor("simple", { ...simple, serverGenerated: false }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });

        const stratified = await replay("stratified");
        expect((await runUnivariateJob(jobFor("stratified", stratified))).ok).toBe(true);
        // 层身份不在总体中：水合阶段即拒绝（比重演比较更早）
        const layers = (stratified.layers as Array<{ name: string; count: number; ratio: number; sampleCount: number }>).map(layer => layer.name === "A" ? { ...layer, name: "C" } : layer);
        expect(await runUnivariateJob(jobFor("stratified", { ...stratified, layers }))).toMatchObject({ ok: false, code: "INVALID_SAMPLE" });
        // 层覆盖合法但样本单位与重演不一致：交换两个层的入样索引必须在重演比较中拒绝
        const swapped = [...(stratified.indices as number[])].reverse();
        expect(await runUnivariateJob(jobFor("stratified", { ...stratified, indices: swapped }))).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });

        const pps = await replay("pps");
        expect((await runUnivariateJob(jobFor("pps", pps))).ok).toBe(true);
        expect(await runUnivariateJob(jobFor("pps", { ...pps, inclusionProbabilities: (pps.inclusionProbabilities as number[]).map(() => 1) })))
            .toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });

        // 同一路径换字节：字典 source 不再对应当前来源，必须在重演前拒绝
        await Bun.write(fixture.absolute, fixture.csv.replace("05,30,5,B", "05,31,5,B"));
        expect(await runUnivariateJob(jobFor("simple", simple))).toMatchObject({ ok: false, code: "SOURCE_MISMATCH" });
    } finally {
        await Bun.file(fixture.absolute).delete();
    }
});
