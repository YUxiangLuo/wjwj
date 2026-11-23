import { calculateCrossTab, calculateUnivariate } from "../../domain/variables/analysis";
import { calculateDesignWeights, type SamplingDesign } from "../../domain/variables/design-weights";
import { validateDictionary } from "../../domain/variables/dictionary";
import type { AnalysisConfig, AnalysisResult, VariableDictionary } from "../../domain/variables/types";
import { materializeFieldworkSample, verifyMethodFieldworkReplay, type CleaningConfig, type MethodFieldworkResult } from "../../domain/fieldwork";
import { stratumKey } from "../../domain/statistics/sampling";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod } from "../../lib/sampling-policy";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import { readVariableSource } from "../../server/variable-source";
import { getFrameFieldsFromMapping } from "./fieldwork-wave-service";
import { replaySamplingSection } from "./sampling-replay";
import { hydrateSamplingResults } from "./sampling-storage";

export const UNIVARIATE_ALGORITHM_VERSION = "business-analytics-v4";

export interface UnivariateJob {
    populationPath: string;
    fieldMapping: unknown;
    fieldworkConfig?: unknown;
    dictionary: VariableDictionary;
    config: AnalysisConfig;
    samplingResult: Record<string, unknown>;
    fieldworkResult?: MethodFieldworkResult | null;
    cleaningConfig?: CleaningConfig | null;
    questionnaire?: QuestionnaireData | null;
}

export type UnivariateJobResult =
    | { ok: true; data: { result: AnalysisResult; evidence: Record<string, unknown>; algorithmVersion: string } }
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

        const groupByField = job.config.groupByField?.trim() || undefined;
        const groupVariable = groupByField
            ? dictionary.variables.find((variable) => variable.field === groupByField)
            : undefined;
        if (groupByField && (!groupVariable || (groupVariable.kind !== "nominal" && groupVariable.kind !== "ordinal"))) {
            return fail("INVALID_GROUP_VARIABLE", "分组维度须为字典中的名义或有序分类变量");
        }
        if (groupByField && groupByField === job.config.field) {
            return fail("INVALID_GROUP_VARIABLE", "分组维度不能与目标分析变量相同");
        }

        const section = job.samplingResult;
        if (section.completed !== true || section.serverGenerated !== true || section.unavailable === true) {
            return fail("INVALID_SAMPLE", "必须使用已完成的服务器抽样结果");
        }
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

        let activeRows = source.rows;
        let activeIndices = indices as number[];
        let activeInclusionProbs = replay.result.inclusionProbabilities;

        if (job.config.datasetMode === "cleaned_respondents") {
            if (!job.fieldworkResult || !job.questionnaire) {
                return fail("MISSING_FIELDWORK", "所选波次尚未生成问卷发放回收记录，无法按质检有效答卷口径分析");
            }
            if (
                job.fieldworkResult.method !== job.config.method
                || job.fieldworkResult.invitedCount !== (indices as number[]).length
                || !Array.isArray(job.fieldworkResult.records)
                || job.fieldworkResult.records.length !== (indices as number[]).length
            ) {
                return fail("REPLAY_MISMATCH", "问卷发放回收记录无法由可信设计重演");
            }
            const { frameFields } = getFrameFieldsFromMapping(job.fieldMapping);
            const target = resolveAnalysisTarget(job.fieldMapping)?.target ?? null;
            if (job.fieldworkConfig !== undefined) {
                const replayParams: Parameters<typeof verifyMethodFieldworkReplay>[0] & { expectedMethod?: SamplingMethod } = {
                    stored: job.fieldworkResult,
                    expectedMethod: job.config.method,
                    population: current,
                    indices: indices as number[],
                    questionnaire: job.questionnaire,
                    dictionary,
                    analysisTarget: target,
                    fieldworkConfig: job.fieldworkConfig,
                };
                if (!verifyMethodFieldworkReplay(replayParams)) {
                    return fail("REPLAY_MISMATCH", "问卷发放回收记录无法由可信设计重演");
                }
            }
            const materialized = materializeFieldworkSample({
                population: source.rows,
                samplingIndices: indices as number[],
                inclusionProbabilities: replay.result.inclusionProbabilities,
                fieldworkResult: job.fieldworkResult,
                cleaningConfig: job.cleaningConfig ?? undefined,
                questionnaire: job.questionnaire,
                dictionary,
                frameFields,
                analysisTarget: target,
            });
            if (materialized.cleanedRows.length === 0) {
                return fail("EMPTY_RESPONDENTS", "当前波次在质检清洗后无有效回收答卷，请调整清洗规则或扩充样本量");
            }
            // Project masked respondent rows back onto a copy of population rows at their population indices
            activeRows = [...source.rows];
            materialized.cleanedIndices.forEach((popIdx, pos) => {
                activeRows[popIdx] = materialized.cleanedRows[pos]!;
            });
            activeIndices = materialized.cleanedIndices;
            activeInclusionProbs = materialized.cleanedInclusionProbabilities;
        }

        let design: SamplingDesign;
        if (job.config.method === "pps") {
            if (!activeInclusionProbs) return fail("REPLAY_MISMATCH", "PPS 设计信息不完整");
            design = { method: "pps", inclusionProbabilities: activeInclusionProbs };
        } else if (job.config.method === "stratified") {
            if (!replay.result.stratifyBy || !replay.result.layers) return fail("REPLAY_MISMATCH", "分层设计信息不完整");
            if (job.config.datasetMode === "cleaned_respondents" && activeIndices.length !== (indices as number[]).length) {
                // Recompute realized respondent layer counts so design weights match Nh / nh_resp
                const sField = replay.result.stratifyBy;
                const realizedCounts = new Map<string, number>();
                for (const idx of activeIndices) {
                    const key = stratumKey(current[idx]?.[sField]);
                    realizedCounts.set(key, (realizedCounts.get(key) ?? 0) + 1);
                }
                const adjustedLayers = replay.result.layers
                    .map((l) => {
                        const normalizedName = stratumKey(l.name);
                        return { ...l, name: normalizedName, sampleCount: realizedCounts.get(normalizedName) ?? 0 };
                    })
                    .filter((l) => l.sampleCount > 0);
                if (adjustedLayers.length !== replay.result.layers.length && job.config.weighted) {
                    return fail("EMPTY_STRATUM_RESPONDENTS", "质检后存在有效回收数为 0 的分层，无法直接计算分层加权估计，请改用未加权描述或在二轮补足该层样本");
                }
                design = { method: "stratified", stratifyBy: sField, layers: adjustedLayers };
            } else {
                design = { method: "stratified", stratifyBy: replay.result.stratifyBy, layers: replay.result.layers };
            }
        } else {
            design = { method: job.config.method, populationSize: current.length, sampleCount: activeIndices.length };
        }

        const weights = job.config.weighted ? calculateDesignWeights(design, current, activeIndices) : undefined;
        const result = groupVariable
            ? calculateCrossTab({
                rows: activeRows,
                indices: activeIndices,
                variable: matching[0]!,
                groupVariable,
                weighted: job.config.weighted,
                weights,
            })
            : calculateUnivariate({
                population: activeRows,
                indices: activeIndices,
                variable: matching[0]!,
                weighted: job.config.weighted,
                weights,
            });

        const evidence = {
            source: source.source,
            fileHash: source.fileHash,
            parserVersion: source.parserVersion,
            method: job.config.method,
            waveNumber: job.config.waveNumber ?? null,
            datasetMode: job.config.datasetMode ?? "full_invited",
            groupByField: groupByField ?? null,
            seed: section.seed,
            sampleCount: activeIndices.length,
            indices: [...activeIndices],
            design,
        };
        return { ok: true, data: { result, evidence, algorithmVersion: UNIVARIATE_ALGORITHM_VERSION } };
    } catch (cause) {
        return fail("ANALYSIS_FAILED", cause instanceof Error ? cause.message : "商务统计分析执行失败");
    }
}
