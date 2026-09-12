import {
    createSeededRandom,
    performPPSSampling,
    performSimpleSamplingWithIndices,
    performStratifiedSamplingWithIndices,
    performSystematicSampling,
    stratumKey,
} from "@/domain/statistics/sampling";
import { parseNumericText } from "../../lib/numeric-text";
import { analysisTargetConflictsWithSizeField, parseFieldKey, resolveAnalysisTarget } from "../../lib/analysis-target";
import { parseTopicFieldMapping } from "@/domain/statistics/population";
import { getSamplingAcceptedRange } from "./sampling-tolerance";
import type { MethodKey as SamplingMethod } from "@/domain/experiment/types";
export type { SamplingMethod };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function toSafeInteger(value: unknown) {
    return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export function parseSamplingSeed(rawSeed: unknown) {
    let seed: number | undefined;

    if (!(rawSeed === undefined || rawSeed === null || rawSeed === "")) {
        if (typeof rawSeed === "number") {
            if (!Number.isSafeInteger(rawSeed)) {
                return { seed: undefined, errorMessage: rawSeed !== Math.floor(rawSeed) ? "seed 需为整数" : "seed 值超出安全整数范围" };
            }
            seed = rawSeed;
        } else if (typeof rawSeed === "string") {
            const trimmedSeed = rawSeed.trim();
            if (!trimmedSeed) {
                seed = undefined;
            } else if (!/^-?\d+$/.test(trimmedSeed)) {
                return { seed: undefined, errorMessage: "seed 需为整数" };
            } else {
                seed = Number.parseInt(trimmedSeed, 10);
                if (!Number.isSafeInteger(seed)) {
                    return { seed: undefined, errorMessage: "seed 值超出安全整数范围" };
                }
            }
        } else {
            return { seed: undefined, errorMessage: "seed 需为整数" };
        }
    }

    return { seed, errorMessage: null };
}

export async function executeSamplingAction(params: {
    method: SamplingMethod;
    rawParams: unknown;
    targetSampleSize: number | null;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
}) {
    const parsedParams = isPlainObject(params.rawParams) ? params.rawParams : {};
    const { seed, errorMessage } = parseSamplingSeed(parsedParams.seed);

    if (errorMessage) {
        return { ok: false as const, errorMessage };
    }

    const effectiveSeed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
    const random = createSeededRandom(effectiveSeed);

    switch (params.method) {
        case "simple": {
            const sampleSize = toSafeInteger(parsedParams.sampleSize);
            if (sampleSize === null || sampleSize < 1 || sampleSize > params.population.length) {
                return {
                    ok: false as const,
                    errorMessage: `样本量需为 1-${params.population.length} 之间的整数`,
                };
            }
            if (params.targetSampleSize !== null && sampleSize !== params.targetSampleSize) {
                return {
                    ok: false as const,
                    errorMessage: `简单随机抽样样本量需等于目标样本量（${params.targetSampleSize}）`,
                };
            }

            const selection = performSimpleSamplingWithIndices(params.population, sampleSize, random);
            return {
                ok: true as const,
                result: {
                    completed: true,
                    sampleCount: selection.data.length,
                    seed: effectiveSeed,
                    indices: selection.indices,
                    data: selection.data,
                },
            };
        }
        case "systematic": {
            const sampleSize = params.targetSampleSize;
            if (
                sampleSize === null
                || !Number.isInteger(sampleSize)
                || sampleSize < 1
                || sampleSize > params.population.length
            ) {
                return {
                    ok: false as const,
                    errorMessage: `请先保存 1-${params.population.length} 之间的最终样本量`,
                };
            }

            const selection = performSystematicSampling(params.population, sampleSize, random);
            return {
                ok: true as const,
                result: {
                    completed: true,
                    interval: selection.interval,
                    randomStart: selection.randomStart,
                    sampleCount: selection.data.length,
                    seed: effectiveSeed,
                    indices: selection.indices,
                    data: selection.data,
                },
            };
        }
        case "pps": {
            const sizeField = parseFieldKey(parsedParams.sizeField);
            if (!sizeField) {
                return { ok: false as const, errorMessage: "请选择规模变量" };
            }

            const mapping = parseTopicFieldMapping(params.fieldMapping);
            if (!mapping?.numeric?.includes(sizeField)) {
                return { ok: false as const, errorMessage: "规模变量需为包含正数的数值字段" };
            }
            const resolvedTarget = resolveAnalysisTarget(params.fieldMapping);
            if (resolvedTarget && !resolvedTarget.inferred && analysisTargetConflictsWithSizeField(resolvedTarget.target, sizeField)) {
                return { ok: false as const, errorMessage: "PPS 规模变量不能与研究目标变量相同，请改用抽样前已知的辅助变量" };
            }

            const hasField = params.population.some((row) => Object.prototype.hasOwnProperty.call(row, sizeField));
            if (!hasField) {
                return { ok: false as const, errorMessage: "规模变量不存在于总体数据中" };
            }

            const hasInvalidSizeValue = params.population.some((row) => {
                const value = parseNumericText(row[sizeField]);
                return value === null || value <= 0;
            });
            if (hasInvalidSizeValue) {
                return { ok: false as const, errorMessage: "规模变量需在总体中对每个单位都为正数" };
            }

            const sampleSize = toSafeInteger(parsedParams.sampleSize);
            if (sampleSize === null || sampleSize < 1 || sampleSize > params.population.length) {
                return {
                    ok: false as const,
                    errorMessage: `样本量需为 1-${params.population.length} 之间的整数`,
                };
            }
            const ppsAcceptedRange = getSamplingAcceptedRange(params.targetSampleSize, params.population.length);
            if (ppsAcceptedRange && (sampleSize < ppsAcceptedRange.min || sampleSize > ppsAcceptedRange.max)) {
                return {
                    ok: false as const,
                    errorMessage: `本实验要求PPS抽样样本量在目标样本量的80%-120%之间（${ppsAcceptedRange.min}-${ppsAcceptedRange.max}）`,
                };
            }

            const selection = await performPPSSampling(params.population, sizeField, sampleSize, random);
            if (selection.data.length !== sampleSize) {
                return { ok: false as const, errorMessage: "当前规模变量与样本量无法可靠计算 PPS 入样概率。请改用其他规模变量或规划样本量；仍失败时请返回样本量规划调整，普查可避免此概率精度问题" };
            }
            return {
                ok: true as const,
                result: {
                    completed: true,
                    sizeField,
                    sampleCount: selection.data.length,
                    seed: effectiveSeed,
                    randomStart: selection.randomStart,
                    inclusionProbabilities: selection.inclusionProbabilities,
                    probabilitySummary: selection.probabilitySummary,
                    indices: selection.indices,
                    data: selection.data,
                },
            };
        }
        case "stratified": {
            const stratifyBy = parseFieldKey(parsedParams.stratifyBy);
            if (!stratifyBy) {
                return { ok: false as const, errorMessage: "请选择分层变量" };
            }

            const mapping = parseTopicFieldMapping(params.fieldMapping);
            if (mapping?.stratified?.length && !mapping.stratified.includes(stratifyBy)) {
                return { ok: false as const, errorMessage: "分层变量无效" };
            }

            const hasField = params.population.some((row) => Object.prototype.hasOwnProperty.call(row, stratifyBy));
            if (!hasField) {
                return { ok: false as const, errorMessage: "分层变量不存在于总体数据中" };
            }

            const layersInput = Array.isArray(parsedParams.layers) ? parsedParams.layers : [];
            if (layersInput.length === 0) {
                return { ok: false as const, errorMessage: "请先配置各层样本数" };
            }

            const layerPopulationCount = new Map<string, number>();
            for (const row of params.population) {
                const key = stratumKey(row[stratifyBy]);
                if (!key) continue;
                layerPopulationCount.set(key, (layerPopulationCount.get(key) ?? 0) + 1);
            }
            const coveredPopulation = [...layerPopulationCount.values()].reduce((sum, count) => sum + count, 0);
            if (coveredPopulation !== params.population.length) {
                return { ok: false as const, errorMessage: "分层变量在总体中存在空值，无法执行分层抽样" };
            }

            const layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }> = [];
            const seenLayerNames = new Set<string>();
            let totalAssigned = 0;

            for (let index = 0; index < layersInput.length; index += 1) {
                const input = layersInput[index] as Record<string, unknown>;
                const name = toTrimmedString(input?.name);
                const sampleCount = Number(input?.sampleCount);
                if (!name) {
                    return { ok: false as const, errorMessage: `第 ${index + 1} 层名称无效` };
                }
                if (seenLayerNames.has(name)) {
                    return { ok: false as const, errorMessage: `分层“${name}”不能重复配置` };
                }
                seenLayerNames.add(name);
                if (!Number.isInteger(sampleCount) || sampleCount < 1) {
                    return { ok: false as const, errorMessage: `第 ${index + 1} 层样本数需为正整数` };
                }

                const groupCount = layerPopulationCount.get(name) ?? 0;
                if (groupCount <= 0) {
                    return { ok: false as const, errorMessage: `分层“${name}”在总体中不存在` };
                }
                if (sampleCount > groupCount) {
                    return {
                        ok: false as const,
                        errorMessage: `分层“${name}”样本数不能超过该层总体单位数（${groupCount}）`,
                    };
                }

                const ratio = Number.isFinite(Number(input?.ratio)) ? Number(input?.ratio) : 0;
                layers.push({ name, count: groupCount, ratio, sampleCount });
                totalAssigned += sampleCount;
            }

            const missingLayers = [...layerPopulationCount.keys()].filter((name) => !seenLayerNames.has(name));
            if (missingLayers.length > 0) {
                return {
                    ok: false as const,
                    errorMessage: `请为全部总体分层配置样本数，缺少：${missingLayers.join("、")}`,
                };
            }

            if (totalAssigned <= 0) {
                return { ok: false as const, errorMessage: "分层样本总数必须大于 0" };
            }
            if (params.targetSampleSize !== null && totalAssigned !== params.targetSampleSize) {
                return {
                    ok: false as const,
                    errorMessage: `各层样本数总和需等于目标样本量（${params.targetSampleSize}）`,
                };
            }

            const selection = performStratifiedSamplingWithIndices(
                params.population,
                stratifyBy,
                layers,
                random,
            );
            return {
                ok: true as const,
                result: {
                    completed: true,
                    stratifyBy,
                    layers,
                    sampleCount: selection.data.length,
                    seed: effectiveSeed,
                    indices: selection.indices,
                    data: selection.data,
                },
            };
        }
    }
}
