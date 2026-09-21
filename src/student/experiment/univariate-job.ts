import { calculateUnivariate } from "../../domain/variables/analysis";
import { calculateDesignWeights, type SamplingDesign } from "../../domain/variables/design-weights";
import { validateDictionary } from "../../domain/variables/dictionary";
import type { AnalysisConfig, AnalysisResult, VariableDictionary } from "../../domain/variables/types";
import { readVariableSource } from "../../server/variable-source";
import { replaySamplingSection } from "./sampling-replay";
import { hydrateSamplingResults } from "./sampling-storage";

export const UNIVARIATE_ALGORITHM_VERSION = "univariate-design-v1";

export interface UnivariateJob {
    populationPath: string;
    fieldMapping: unknown;
    dictionary: VariableDictionary;
    config: AnalysisConfig;
    samplingResult: Record<string, unknown>;
}
export type UnivariateJobResult = { ok: true; data: { result: AnalysisResult; evidence: Record<string, unknown>; algorithmVersion: string } }
    | { ok: false; code: string; message: string };

const fail = (code: string, message: string): UnivariateJobResult => ({ ok: false, code, message });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export async function runUnivariateJob(job: UnivariateJob): Promise<UnivariateJobResult> {
    try {
        if (!record(job.dictionary) || !record(job.config) || !record(job.samplingResult)) return fail("INVALID_JOB", "分析任务无效");
        const source = await readVariableSource(job.populationPath, job.fieldMapping);
        if (job.dictionary.source !== source.source) return fail("SOURCE_MISMATCH", "变量字典对应的总体来源已变更");
        const dictionary = validateDictionary(job.dictionary, source.rows, source.source);
        if (!["simple", "systematic", "pps", "stratified"].includes(job.config.method)
            || typeof job.config.field !== "string" || typeof job.config.weighted !== "boolean") return fail("INVALID_CONFIG", "分析配置无效");
        const matching = dictionary.variables.filter((variable) => variable.field === job.config.field);
        if (matching.length !== 1 || matching[0]?.kind === "identifier") return fail("INVALID_VARIABLE", "所选变量不在当前字典中或不用于分析");
        const section = job.samplingResult;
        if (section.completed !== true || section.serverGenerated !== true || section.unavailable === true) {
            return fail("INVALID_SAMPLE", "必须使用已完成的服务器抽样结果");
        }
        // Both interpretations come from the same bytes and physical row numbers.
        const current = source.designRows;
        const wrapped = { [job.config.method]: section };
        const hydrated = hydrateSamplingResults(wrapped, current);
        if (!hydrated.ok) return fail("INVALID_SAMPLE", "抽样结果存储无效");
        const indices = section.indices;
        const sampleCount = section.sampleCount;
        if (!Array.isArray(indices) || !Number.isSafeInteger(sampleCount) || sampleCount !== indices.length || sampleCount < 1) {
            return fail("INVALID_SAMPLE", "样本索引或样本量无效");
        }
        const replay = await replaySamplingSection({
            method: job.config.method,
            section,
            population: current,
            fieldMapping: job.fieldMapping,
        });
        if (!replay.ok) {
            return fail("REPLAY_MISMATCH", "抽样结果无法由可信设计重演");
        }
        let design: SamplingDesign;
        if (job.config.method === "pps") {
            if (!replay.result.inclusionProbabilities) return fail("REPLAY_MISMATCH", "PPS 设计信息不完整");
            design = { method: "pps", inclusionProbabilities: replay.result.inclusionProbabilities };
        } else if (job.config.method === "stratified") {
            if (!replay.result.stratifyBy || !replay.result.layers) return fail("REPLAY_MISMATCH", "分层设计信息不完整");
            design = { method: "stratified", stratifyBy: replay.result.stratifyBy, layers: replay.result.layers };
        }
        else design = { method: job.config.method, populationSize: current.length, sampleCount: sampleCount as number };
        const weights = job.config.weighted ? calculateDesignWeights(design, current, indices as number[]) : undefined;
        const result = calculateUnivariate({ population: source.rows, indices: indices as number[], variable: matching[0]!, weighted: job.config.weighted, weights });
        const evidence = { source: source.source, fileHash: source.fileHash, parserVersion: source.parserVersion,
            method: job.config.method, seed: section.seed, sampleCount, indices: [...indices], design };
        return { ok: true, data: { result, evidence, algorithmVersion: UNIVARIATE_ALGORITHM_VERSION } };
    } catch (cause) {
        return fail("ANALYSIS_FAILED", cause instanceof Error ? cause.message : "单变量分析失败");
    }
}
