import { expect, test } from "bun:test";
import {
    DEFAULT_PPS_MONTE_CARLO_REPLICATES,
    buildAnalysisMetrics,
    resolvePpsMonteCarloReplicates,
} from "./analysis-metrics";
import {
    createSeededRandom,
    drawPreparedPPSSample,
    performPPSSampling,
    performSystematicSampling,
    preparePPSSampling,
} from "../sampling";

test("PPS Monte Carlo replicate configuration is bounded and defaults safely", () => {
    expect(DEFAULT_PPS_MONTE_CARLO_REPLICATES).toBe(512);
    expect(resolvePpsMonteCarloReplicates(undefined)).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("512")).toBe(512);
    expect(resolvePpsMonteCarloReplicates("31")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("1025")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("not-a-number")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
});

test("analysis metrics use the true population mean as the numeric comparison baseline", () => {
    const population = [
        { stratum: "A", category: "低", x: 10, size: 1 },
        { stratum: "A", category: "低", x: 20, size: 2 },
        { stratum: "B", category: "高", x: 30, size: 3 },
        { stratum: "B", category: "高", x: 40, size: 4 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["x", "size"],
            others: ["category"],
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 1, data: [{ stratum: "A", category: "低", x: 10, size: 1 }] },
            systematic: { completed: true, kValue: 2, sampleCount: 2, data: [{ stratum: "A", category: "低", x: 10, size: 1 }, { stratum: "B", category: "高", x: 30, size: 3 }] },
            pps: { unavailable: true, unavailableReason: "no valid field" },
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 2, ratio: 0.5, sampleCount: 1 },
                    { name: "B", count: 2, ratio: 0.5, sampleCount: 1 },
                ],
                data: [{ stratum: "A", category: "低", x: 10, size: 1 }, { stratum: "B", category: "高", x: 40, size: 4 }],
            },
        },
    });

    const numericX = metrics.numeric.x;
    expect(numericX).toBeDefined();
    if (!numericX) throw new Error("expected numeric field x to exist");

    expect(numericX.populationMean).toBe(25);
    expect(numericX.methods.simple.estimate).toBe(10);
    expect(numericX.methods.systematic.estimate).toBe(20);
    expect(numericX.methods.systematic.standardError).toBe(5);
    expect(numericX.methods.stratified.estimate).toBe(25);
});

test("analysis metrics fail closed for historical numeric columns with missing values", () => {
    const metrics = buildAnalysisMetrics({
        population: [{ x: 10 }, { x: "" }, { x: 30 }],
        fieldMapping: { numeric: ["x"], stratified: [], others: [] },
        samplingResults: {
            simple: { completed: true, sampleCount: 2, data: [{ x: 10 }, { x: 30 }] },
        },
    });

    expect(metrics.numericFields).toEqual([]);
    expect(metrics.excludedNumericFields).toEqual(["x"]);
    expect(metrics.numeric.x).toBeUndefined();
});

test("analysis metrics retain an exact standard error for fractional systematic intervals", () => {
    const population = Array.from({ length: 5 }, (_, index) => ({ x: index * 10 }));
    const systematicSample = performSystematicSampling(population, 3, () => 0);

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["x"],
            others: [],
        },
        samplingResults: {
            systematic: {
                completed: true,
                interval: systematicSample.interval,
                randomStart: systematicSample.randomStart,
                sampleCount: systematicSample.data.length,
                data: systematicSample.data,
            },
        },
    });

    expect(metrics.numeric.x?.methods.systematic.estimate).toBeCloseTo(40 / 3);
    expect(metrics.numeric.x?.methods.systematic.standardError).toBeCloseTo(
        Math.sqrt(200 / 9),
    );
});

test("analysis metrics use stratified weights instead of pooled sample shares for categorical distributions", () => {
    const population = [
        ...Array.from({ length: 8 }, (_, index) => ({ id: index + 1, stratum: "A", choice: "否", size: index + 1 })),
        ...Array.from({ length: 2 }, (_, index) => ({ id: index + 9, stratum: "B", choice: "是", size: index + 9 })),
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["size"],
            others: ["choice"],
        },
        samplingResults: {
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 8, ratio: 0.8, sampleCount: 1 },
                    { name: "B", count: 2, ratio: 0.2, sampleCount: 1 },
                ],
                data: [
                    { id: 1, stratum: "A", choice: "否", size: 1 },
                    { id: 9, stratum: "B", choice: "是", size: 9 },
                ],
            },
        },
    });

    const categoricalChoice = metrics.categorical.choice;
    expect(categoricalChoice).toBeDefined();
    if (!categoricalChoice) throw new Error("expected categorical field choice to exist");

    expect(categoricalChoice.population["是"]).toBe(20);
    expect(categoricalChoice.methods.stratified["是"]).toBe(20);
    expect(categoricalChoice.methods.stratified["否"]).toBe(80);
    expect(categoricalChoice.representativeness.stratified).toBe(0);
});

test("analysis metrics match padded stratum names after trimming", () => {
    const population = [
        { stratum: " A ", x: 10 },
        { stratum: "A", x: 20 },
        { stratum: "B", x: 30 },
        { stratum: " B", x: 40 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["x"],
            others: [],
        },
        samplingResults: {
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 2, ratio: 0.5, sampleCount: 1 },
                    { name: " B ", count: 2, ratio: 0.5, sampleCount: 1 },
                ],
                data: [{ stratum: " A ", x: 10 }, { stratum: "B", x: 40 }],
            },
        },
    });

    expect(metrics.numeric.x?.methods.stratified.estimate).toBe(25);
});

test("analysis metrics use PPS inclusion probabilities for weighted mean estimation", () => {
    const population = [
        { id: 1, value: 10, size: 1 },
        { id: 2, value: 20, size: 2 },
        { id: 3, value: 200, size: 20 },
        { id: 4, value: 400, size: 40 },
        { id: 5, value: 800, size: 80 },
    ];

    const ppsSample = performPPSSampling(population, "size", 2, createSeededRandom("analysis-pps"));

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["value", "size"],
            others: [],
        },
        samplingResults: {
            pps: {
                completed: true,
                sizeField: "size",
                sampleCount: ppsSample.data.length,
                randomStart: ppsSample.randomStart,
                inclusionProbabilities: ppsSample.inclusionProbabilities,
                data: ppsSample.data,
            },
        },
    });

    const numericValue = metrics.numeric.value;
    expect(numericValue).toBeDefined();
    if (!numericValue) throw new Error("expected numeric field value to exist");

    const weightedEstimate = numericValue.methods.pps.estimate;
    const rawMean = ppsSample.data.reduce((sum, row) => sum + row.value, 0) / ppsSample.data.length;

    expect(weightedEstimate).not.toBeNull();
    expect(weightedEstimate).not.toBe(rawMean);

    const prepared = preparePPSSampling(population, "size", 2);
    if (!prepared) throw new Error("expected a valid PPS design");
    expect(metrics.ppsStandardErrorMode).toBe("monte_carlo");
    expect(metrics.ppsMonteCarloReplicates).toBeGreaterThanOrEqual(32);
    expect(metrics.ppsMonteCarloReplicates).toBeLessThanOrEqual(1024);
    const replicateEstimates = Array.from({ length: metrics.ppsMonteCarloReplicates }, (_, iteration) => {
        const replicate = drawPreparedPPSSample(prepared, createSeededRandom(`analysis-pps-${iteration}`));
        let weightedSum = 0;
        let totalWeight = 0;
        for (let index = 0; index < replicate.data.length; index += 1) {
            const weight = 1 / replicate.inclusionProbabilities[index]!;
            weightedSum += replicate.data[index]!.value * weight;
            totalWeight += weight;
        }
        return weightedSum / totalWeight;
    });
    const replicateMean = replicateEstimates.reduce((sum, value) => sum + value, 0) / replicateEstimates.length;
    const expectedSe = Math.sqrt(replicateEstimates.reduce(
        (sum, value) => sum + (value - replicateMean) ** 2,
        0,
    ) / (replicateEstimates.length - 1));
    expect(numericValue.methods.pps.standardError).toBeCloseTo(expectedSe, 10);
});

test("PPS census short-circuits the degenerate Monte Carlo design", () => {
    const population = [
        { id: 1, value: 10, size: 1 },
        { id: 2, value: 20, size: 2 },
        { id: 3, value: 30, size: 3 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["value"],
            others: [],
        },
        samplingResults: {
            pps: {
                completed: true,
                sizeField: "size",
                sampleCount: population.length,
                inclusionProbabilities: [1, 1, 1],
                data: population,
            },
        },
    });

    expect(metrics.numeric.value?.methods.pps.estimate).toBe(20);
    expect(metrics.numeric.value?.methods.pps.standardError).toBe(0);
    expect(metrics.ppsStandardErrorMode).toBe("census_exact");
    expect(metrics.ppsMonteCarloReplicates).toBe(0);
});

const targetContract = {
    inferred: false as const,
    contract: {
        version: 1 as const,
        researchQuestion: "该校学生 x 的平均水平是多少？",
        targetPopulation: "该校全体学生",
        unitOfAnalysis: "一名学生",
        target: { kind: "mean" as const, field: "x" },
    },
};

test("mean target analysis reuses numeric field estimates and shared PPS context", () => {
    const population = [
        { stratum: "A", category: "低", x: 10, size: 1 },
        { stratum: "A", category: "低", x: 20, size: 2 },
        { stratum: "B", category: "高", x: 30, size: 3 },
        { stratum: "B", category: "高", x: 40, size: 4 },
    ];
    const samplingResults = {
        simple: { completed: true, sampleCount: 2, data: [population[0]!, population[1]!] },
        systematic: { completed: true, interval: 2, sampleCount: 2, data: [population[0]!, population[2]!] },
        pps: { completed: true, sizeField: "size", sampleCount: 2, data: [population[1]!, population[3]!], inclusionProbabilities: [0.4, 0.8] },
        stratified: {
            completed: true,
            stratifyBy: "stratum",
            layers: [
                { name: "A", count: 2, ratio: 0.5, sampleCount: 1 },
                { name: "B", count: 2, ratio: 0.5, sampleCount: 1 },
            ],
            data: [population[0]!, population[3]!],
        },
    };
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { stratified: ["stratum"], numeric: ["x", "size"], others: ["category"] },
        samplingResults,
        studyContract: targetContract,
        samplePlan: { confidenceLevel: "95", marginOfError: 2 },
    });

    const target = metrics.target;
    expect(target).not.toBeNull();
    expect(target!.populationValue).toBe(25);
    expect(target!.confidenceLevel).toBe("95");
    expect(target!.plannedMarginOfError).toBe(2);

    // 均值目标：估计与 SE 与数值字段分析完全一致（PPS 共享上下文）
    for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
        expect(target!.methods[method].estimate).toBe(metrics.numeric.x!.methods[method].estimate);
        expect(target!.methods[method].standardError).toBe(metrics.numeric.x!.methods[method].standardError);
    }
    // 教学误差半宽 = z95 × SE
    const simpleSe = target!.methods.simple.standardError!;
    expect(target!.methods.simple.marginOfError).toBeCloseTo(1.96 * simpleSe, 10);
    // Kish 有效样本量：simple 的 deff = 1，n_eff = n
    expect(target!.methods.simple.effectiveSampleSize).toBeCloseTo(target!.methods.simple.sampleSize!, 6);
    // n_eff < 30 → caution
    expect(target!.methods.simple.reliability.status).toBe("caution");
    expect(target!.methods.simple.reliability.reasons[0]).toBe("设计有效样本量低于 30");
    // 系统抽样：估计 (10+30)/2
    expect(target!.methods.systematic.estimate).toBe(20);
});

test("proportion target analysis maps to indicator values with hand-computed SE", () => {
    const population = [
        { grp: "A" }, { grp: "A" }, { grp: "B" }, { grp: "B" },
    ];
    const proportionContract = {
        inferred: false as const,
        contract: {
            version: 1 as const,
            researchQuestion: "总体中 grp 为「A」的单位占比是多少？",
            targetPopulation: "全部单位",
            unitOfAnalysis: "一行记录",
            target: { kind: "proportion" as const, field: "grp", value: "A" },
        },
    };
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { stratified: ["grp"], numeric: [], others: [] },
        samplingResults: {
            simple: { completed: true, sampleCount: 2, data: [population[0]!, population[2]!] },
            systematic: { completed: true, interval: 2, sampleCount: 2, data: [population[0]!, population[2]!] },
            pps: { unavailable: true, unavailableReason: "no valid field" },
            stratified: { completed: false, stratifyBy: "grp", layers: [], data: [] },
        },
        studyContract: proportionContract,
        samplePlan: { confidenceLevel: "95", marginOfError: 5 },
    });

    const target = metrics.target!;
    expect(target.populationValue).toBe(0.5);
    // 规划误差限：比例按百分数存储，5 → 0.05
    expect(target.plannedMarginOfError).toBeCloseTo(0.05, 12);

    const simple = target.methods.simple;
    expect(simple.estimate).toBe(0.5);
    // 指示变量总体方差 = Σ(v−p)²/(N−1) = (4×0.25)/3 = 1/3；SE = √((1−n/N)·s²/n)
    expect(simple.standardError).toBeCloseTo(Math.sqrt((1 - 2 / 4) * (1 / 3) / 2), 10);
    expect(simple.marginOfError).toBeCloseTo(1.96 * simple.standardError!, 10);
    // 教学半宽远超规划 5% → caution 原因
    expect(simple.reliability.status).toBe("caution");
    expect(simple.reliability.reasons).toContain("教学误差半宽超过规划误差限");

    // 分数间隔系统抽样：两种起点均值都是 0.5 → 精确设计 SE 为 0
    expect(target.methods.systematic.standardError).toBe(0);
    expect(target.methods.systematic.reliability.status).toBe("ok");

    // PPS 不可用 → unavailable
    expect(target.methods.pps.reliability.status).toBe("unavailable");
});

test("target analysis marks full-population methods as census", () => {
    const population = [{ grp: "A" }, { grp: "B" }];
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { stratified: ["grp"], numeric: [], others: [] },
        samplingResults: {
            simple: { completed: true, sampleCount: 2, data: [population[0]!, population[1]!] },
        },
        studyContract: {
            inferred: false,
            contract: {
                version: 1,
                researchQuestion: "总体中 grp 为「A」的占比是多少？",
                targetPopulation: "全部单位",
                unitOfAnalysis: "一行记录",
                target: { kind: "proportion", field: "grp", value: "A" },
            },
        },
        samplePlan: { confidenceLevel: "99", marginOfError: 10 },
    });

    const simple = metrics.target!.methods.simple;
    expect(simple.estimate).toBe(0.5);
    expect(simple.standardError).toBe(0);
    expect(simple.reliability.status).toBe("census");
    expect(simple.reliability.reasons[0]).toBe("当前方法覆盖完整虚拟总体");
    expect(simple.effectiveSampleSize).toBe(2);
    // 99% 置信水平
    expect(metrics.target!.confidenceLevel).toBe("99");
});

test("categorical analysis truncates beyond 20 categories without hiding a real 其他", () => {
    const categories = ["其他", ...Array.from({ length: 24 }, (_, index) => `类别${index + 1}`)];
    // 真实「其他」占一半（必保留在头部），其余 24 类各占 2%
    const population = [
        ...Array.from({ length: 50 }, () => ({ c: "其他" })),
        ...categories.slice(1).flatMap((category) => [{ c: category }, { c: category }]),
    ];
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { stratified: [], numeric: [], others: ["c"] },
        samplingResults: {
            simple: { completed: true, sampleCount: 4, data: population.slice(0, 4) },
        },
    });

    const analysis = metrics.categorical.c!;
    expect(analysis.truncated).toBe(true);
    expect(analysis.totalCategoryCount).toBe(25);
    // 聚合标签避开真实「其他」
    expect(analysis.aggregatedCategoryLabel).toBe("其余类别");
    // 真实「其他」占 50/98（必保留在头部）
    expect(analysis.population["其他"]).toBeCloseTo(50 / 98 * 100, 6);
    const aggregated = analysis.population["其余类别"] ?? 0;
    expect(aggregated).toBeGreaterThan(0);
    expect(Object.keys(analysis.population).length).toBe(20);
    // 截断后的总体分布仍是 100%
    expect(Object.values(analysis.population).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
    // 方法分布共用同一头部映射
    expect(Object.keys(analysis.methods.simple).every((key) => key in analysis.population)).toBe(true);
});
