import { buildAnalysisMetrics } from "../src/student/experiment/analysis-metrics";

const populationSize = Number(process.env.BENCHMARK_POPULATION_SIZE ?? 100_000);
const sampleSize = Number(process.env.BENCHMARK_SAMPLE_SIZE ?? 1_000);
const population = Array.from({ length: populationSize }, (_, index) => ({
    id: index + 1,
    size: index % 100 + 1,
    value: index % 37 + 0.25,
    category: `类别${index}`,
}));
const totalSize = population.reduce((sum, row) => sum + row.size, 0);
const sample = population.slice(0, sampleSize);
const inclusionProbabilities = sample.map((row) => Math.min(1, sampleSize * row.size / totalSize));
const fieldMapping = {
    identifier: "id",
    numeric: ["size", "value"],
    others: ["category"],
    studyContract: {
        version: 1 as const,
        researchQuestion: "总体平均值是多少？",
        targetPopulation: "基准总体",
        unitOfAnalysis: "一个单位",
        target: { kind: "mean" as const, field: "value" },
    },
};
const common = {
    population,
    fieldMapping,
    samplePlan: { confidenceLevel: "95", marginOfError: 2 },
    samplingResults: {
        pps: {
            completed: true,
            sizeField: "size",
            sampleCount: sampleSize,
            inclusionProbabilities,
            data: sample,
        },
    },
    targetOnly: true,
} as const;

const coldStartedAt = performance.now();
const cold = buildAnalysisMetrics(common);
const coldMs = performance.now() - coldStartedAt;
const warmStartedAt = performance.now();
buildAnalysisMetrics(common);
const warmMs = performance.now() - warmStartedAt;

const censusStartedAt = performance.now();
buildAnalysisMetrics({
    ...common,
    samplingResults: {
        pps: {
            completed: true,
            sizeField: "size",
            sampleCount: populationSize,
            inclusionProbabilities: Array(populationSize).fill(1),
            data: population,
        },
    },
});
const censusMs = performance.now() - censusStartedAt;

const categorical = buildAnalysisMetrics({
    population,
    fieldMapping,
    samplingResults: null,
    fieldFilter: "category",
});
const categoryCount = Object.keys(categorical.categorical.category?.population ?? {}).length;
const targetBytes = new TextEncoder().encode(JSON.stringify(cold)).byteLength;

const result = {
    populationSize,
    sampleSize,
    replicates: cold.ppsMonteCarloReplicates,
    coldMs: Math.round(coldMs),
    warmMs: Math.round(warmMs),
    censusMs: Math.round(censusMs),
    targetBytes,
    categoryCount,
};
console.log(JSON.stringify(result, null, 2));

if (populationSize === 100_000 && sampleSize === 1_000) {
    if (coldMs > 1_000) throw new Error(`cold target analysis exceeded 1000ms: ${coldMs.toFixed(1)}ms`);
    if (warmMs > 100) throw new Error(`warm target analysis exceeded 100ms: ${warmMs.toFixed(1)}ms`);
    if (censusMs > 150) throw new Error(`census target analysis exceeded 150ms: ${censusMs.toFixed(1)}ms`);
    if (targetBytes > 100 * 1024) throw new Error(`target payload exceeded 100KiB: ${targetBytes} bytes`);
    if (categoryCount > 20) throw new Error(`categorical payload exceeded 20 rows: ${categoryCount}`);
}
