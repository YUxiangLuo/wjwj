import { expect, test } from "bun:test";
import { readVariableSource } from "../../server/variable-source";
import { suggestDictionary } from "../../domain/variables/dictionary";
import { simulateMethodFieldwork } from "../../domain/fieldwork";
import { buildWaveDiagnosticsMap } from "./fieldwork-wave-service";
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
        expect(await runUnivariateJob(jobFor("simple", { ...simple, seed: undefined }))).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
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
        expect(await runUnivariateJob(jobFor("pps", { ...pps, randomStart: Number(pps.randomStart) + 0.01 })))
            .toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });

        const systematic = await replay("systematic");
        expect((await runUnivariateJob(jobFor("systematic", systematic))).ok).toBe(true);
        expect(await runUnivariateJob(jobFor("systematic", { ...systematic, interval: Number(systematic.interval) + 0.25 })))
            .toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
        expect(await runUnivariateJob(jobFor("systematic", { ...systematic, randomStart: Number(systematic.randomStart) + 0.01 })))
            .toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });

        // 同一路径换字节：字典 source 不再对应当前来源，必须在重演前拒绝
        await Bun.write(fixture.absolute, fixture.csv.replace("05,30,5,B", "05,31,5,B"));
        expect(await runUnivariateJob(jobFor("simple", simple))).toMatchObject({ ok: false, code: "SOURCE_MISMATCH" });
    } finally {
        await Bun.file(fixture.absolute).delete();
    }
});

test("worker rejects cleaned_respondents mode when fieldwork or questionnaire is missing", async () => {
    const fixture = await buildTrustedFixture();
    try {
        const replay = await executeSamplingAction({
            method: "simple",
            population: fixture.source.designRows,
            fieldMapping: fixture.fieldMapping,
            targetSampleSize: 2,
            rawParams: { seed: 713, sampleSize: 2 },
        });
        expect(replay.ok).toBe(true);
        if (!replay.ok) return;
        const section = { ...replay.result, serverGenerated: true };
        const res = await runUnivariateJob({
            populationPath: fixture.path,
            fieldMapping: fixture.fieldMapping,
            dictionary: fixture.dictionary,
            samplingResult: section,
            fieldworkResult: null,
            questionnaire: null,
            config: { method: "simple", field: "y", question: "有效答卷均值是多少？", weighted: false, datasetMode: "cleaned_respondents" },
        });
        expect(res).toMatchObject({ ok: false, code: "MISSING_FIELDWORK" });
    } finally {
        await Bun.file(fixture.absolute).delete();
    }
});

test("worker normalizes NFKC stratified layer names when recomputing cleaned_respondents weights", async () => {
    const path = `/storage/test/univariate-nfkc-${crypto.randomUUID()}.csv`;
    const absolute = `${process.cwd()}${path}`;
    await Bun.write(absolute, "id,y,g\n01,10,Ａ\n02,20,A\n03,30,Ｂ\n04,40,B\n");
    try {
        const fieldMapping = { identifier: "id", numeric: ["y"], stratified: ["g"] };
        const source = await readVariableSource(path, fieldMapping);
        const dictionary = suggestDictionary(source.rows, source.source, 1);
        dictionary.variables = dictionary.variables.map((v) => v.field === "y" ? { ...v, kind: "continuous", categories: [] } : v);
        const replay = await executeSamplingAction({
            method: "stratified",
            population: source.designRows,
            fieldMapping,
            targetSampleSize: 4,
            rawParams: { seed: 42, stratifyBy: "g", layers: [{ name: "Ａ", sampleCount: 2 }, { name: "Ｂ", sampleCount: 2 }] },
        });
        expect(replay.ok).toBe(true);
        if (!replay.ok) return;
        const indices = replay.result.indices!;
        // Drop one respondent so activeIndices.length < indices.length, exercising adjustedLayers
        const fieldworkResult = {
            method: "stratified" as const,
            dispatchSeed: 100,
            dispatchedAt: "2026-01-01T00:00:00Z",
            invitedCount: 4,
            records: indices.map((popIdx, pos) => ({
                populationIndex: popIdx,
                disposition: pos === 0 ? ("refused" as const) : ("valid_complete" as const),
                durationSec: 120,
                answeredQuestionCount: 5,
            })),
        };
        const res = await runUnivariateJob({
            populationPath: path,
            fieldMapping,
            dictionary,
            samplingResult: { ...replay.result, serverGenerated: true },
            fieldworkResult,
            questionnaire: {
                title: "问卷",
                welcomeText: "欢迎参与本次调查研究",
                endingText: "感谢您的配合与支持",
                questions: [{
                    id: "q1",
                    type: "numeric",
                    content: "数值",
                    variableBinding: {
                        taskId: 1,
                        source: dictionary.source,
                        revision: dictionary.revision,
                        signature: "sig",
                        mappings: [{ field: "y", answers: [] }],
                    },
                }],
            },
            config: { method: "stratified", field: "y", question: "清洗后加权均值是多少？", weighted: true, datasetMode: "cleaned_respondents" },
        });
        expect(res.ok).toBe(true);
    } finally {
        await Bun.file(absolute).delete().catch(() => undefined);
    }
});

test("cleaned_respondents replays fieldworkResult when fieldworkConfig is provided and buildWaveDiagnosticsMap forwards PPS sizeField", async () => {
    const fixture = await buildTrustedFixture();
    try {
        const fieldMapping = { identifier: "id", numeric: ["y", "size"], stratified: ["g"], analysisTarget: { kind: "mean" as const, field: "y" } };
        const source = await readVariableSource(fixture.path, fieldMapping);
        const dictionary = { ...fixture.dictionary, source: source.source };
        const pps = await executeSamplingAction({
            method: "pps",
            population: source.designRows,
            fieldMapping,
            targetSampleSize: 2,
            rawParams: { seed: 713, sampleSize: 2, sizeField: "size" },
        });
        expect(pps.ok).toBe(true);
        if (!pps.ok) return;

        const questionnaire = {
            title: "商业统计问卷",
            welcomeText: "欢迎参与本次商业统计调研，所有填答信息匿名保密。",
            endingText: "感谢您的配合与支持，祝您生活愉快。",
            questions: [{
                id: "q1",
                type: "numeric" as const,
                content: "目标数值是多少？",
                variableBinding: {
                    taskId: 1,
                    source: dictionary.source,
                    revision: dictionary.revision,
                    signature: "sig",
                    mappings: [{ field: "y", answers: [] }],
                },
            }],
        };
        const fieldworkResult = simulateMethodFieldwork({
            method: "pps",
            population: source.designRows,
            indices: pps.result.indices!,
            questionnaire,
            dictionary,
            analysisTarget: { kind: "mean", field: "y" },
            fieldworkConfig: { version: 1, preset: "balanced", baseUnitNonResponseRate: 0, baseSpeederRate: 0, baseStraightlinerRate: 0, baseItemSkipRate: 0, contactCostPerUnit: 1, incentiveCostPerComplete: 1 },
            dispatchSeed: 2026,
            dispatchedAt: "2026-01-01T00:00:00.000Z",
        });

        const validJob: UnivariateJob = {
            populationPath: fixture.path,
            fieldMapping,
            fieldworkConfig: { version: 1, preset: "balanced", baseUnitNonResponseRate: 0, baseSpeederRate: 0, baseStraightlinerRate: 0, baseItemSkipRate: 0, contactCostPerUnit: 1, incentiveCostPerComplete: 1 },
            dictionary,
            samplingResult: { ...pps.result, serverGenerated: true },
            fieldworkResult,
            questionnaire,
            config: { method: "pps", field: "y", question: "PPS有效答卷加权均值是多少？", weighted: true, datasetMode: "cleaned_respondents" },
        };
        expect((await runUnivariateJob(validJob)).ok).toBe(true);

        // Tampered fieldwork record or wrong method or truncated records must fail with REPLAY_MISMATCH
        const tampered = structuredClone(fieldworkResult);
        tampered.records[0]!.durationSec += 500;
        expect(await runUnivariateJob({ ...validJob, fieldworkResult: tampered })).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
        expect(await runUnivariateJob({ ...validJob, fieldworkResult: { ...fieldworkResult, method: "simple" } })).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
        expect(await runUnivariateJob({ ...validJob, fieldworkResult: { ...fieldworkResult, records: fieldworkResult.records.slice(0, 1) } })).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });

        // buildWaveDiagnosticsMap forwards sizeField for PPS waves
        const diagMap = buildWaveDiagnosticsMap({
            wave: {
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire,
                samplePlan: { confidenceLevel: "95", finalSampleSize: 2 },
                samplingResults: { pps: { ...pps.result, serverGenerated: true } },
                fieldwork: { methods: { pps: fieldworkResult } },
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            },
            population: source.designRows,
            fieldMapping,
            fieldworkConfig: validJob.fieldworkConfig,
            dictionary,
        });
        expect(diagMap.pps?.method).toBe("pps");
        expect(diagMap.pps?.invitedCount).toBe(2);
        expect(diagMap.pps?.estimates.find((e) => e.key === "full_invited_benchmark")?.estimate).not.toBeNull();
    } finally {
        await Bun.file(fixture.absolute).delete().catch(() => undefined);
    }
});
