import {
    createSeededRandom,
    performSimpleSampling,
    performStratifiedSampling,
    performSystematicSampling,
} from "../sampling";
import { parseTopicFieldMapping } from "./population-data";

export type SamplingMethod = "simple" | "systematic" | "stratified";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function parseSamplingSeed(rawSeed: unknown) {
    let seed: number | undefined;

    if (!(rawSeed === undefined || rawSeed === null || rawSeed === "")) {
        if (typeof rawSeed === "number") {
            if (!Number.isInteger(rawSeed)) {
                return { seed: undefined, errorMessage: "seed 需为整数" };
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

    const random = createSeededRandom(seed);

    switch (params.method) {
        case "simple": {
            const sampleSize = Number.parseInt(String(parsedParams.sampleSize ?? ""), 10);
            if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > params.population.length) {
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

            const data = await performSimpleSampling(params.population, sampleSize, random);
            return {
                ok: true as const,
                result: { completed: true, sampleCount: data.length, seed, data },
            };
        }
        case "systematic": {
            const kValue = Number.parseInt(String(parsedParams.kValue ?? ""), 10);
            if (!Number.isInteger(kValue) || kValue < 1 || kValue > params.population.length) {
                return {
                    ok: false as const,
                    errorMessage: `K 值需为 1-${params.population.length} 之间的整数`,
                };
            }

            const expectedCount = Math.ceil(params.population.length / kValue);
            if (params.targetSampleSize !== null) {
                const minExpected = Math.floor(params.targetSampleSize * 0.8);
                const maxExpected = Math.ceil(params.targetSampleSize * 1.2);
                if (expectedCount < minExpected || expectedCount > maxExpected) {
                    return {
                        ok: false as const,
                        errorMessage: `K 值导致样本量超出范围，需在 ${minExpected}-${maxExpected} 之间`,
                    };
                }
            }

            const data = await performSystematicSampling(params.population, kValue, random);
            return {
                ok: true as const,
                result: { completed: true, kValue, sampleCount: data.length, seed, data },
            };
        }
        case "stratified": {
            const stratifyBy = toTrimmedString(parsedParams.stratifyBy);
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
                const key = String(row[stratifyBy] ?? "");
                layerPopulationCount.set(key, (layerPopulationCount.get(key) ?? 0) + 1);
            }

            const layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }> = [];
            let totalAssigned = 0;

            for (let index = 0; index < layersInput.length; index += 1) {
                const input = layersInput[index] as Record<string, unknown>;
                const name = toTrimmedString(input?.name);
                const sampleCount = Number(input?.sampleCount);
                if (!name) {
                    return { ok: false as const, errorMessage: `第 ${index + 1} 层名称无效` };
                }
                if (!Number.isInteger(sampleCount) || sampleCount < 0) {
                    return { ok: false as const, errorMessage: `第 ${index + 1} 层样本数需为非负整数` };
                }

                const groupCount = layerPopulationCount.get(name) ?? 0;
                if (groupCount <= 0) {
                    return { ok: false as const, errorMessage: `分层“${name}”在总体中不存在` };
                }
                if (sampleCount > groupCount) {
                    return {
                        ok: false as const,
                        errorMessage: `分层“${name}”样本数不能超过该层总体人数（${groupCount}）`,
                    };
                }

                const ratio = Number.isFinite(Number(input?.ratio)) ? Number(input?.ratio) : 0;
                layers.push({ name, count: groupCount, ratio, sampleCount });
                totalAssigned += sampleCount;
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

            const data = await performStratifiedSampling(params.population, stratifyBy, layers, random);
            return {
                ok: true as const,
                result: { completed: true, stratifyBy, layers, stratifiedData: [], seed, data },
            };
        }
    }
}
