import { interpretNumeric, valueKey } from "./dictionary";
import type { AnalysisResult, CrossTabAnalysisResult, VariableDefinition } from "./types";
import { scaledMean, sampleStandardDeviation as computeSampleStandardDeviation } from "../statistics/values";

class Sum {
    private total = 0;
    private correction = 0;
    add(value: number) {
        const next = this.total + value;
        this.correction += Math.abs(this.total) >= Math.abs(value)
            ? (this.total - next) + value
            : (value - next) + this.total;
        this.total = next;
    }
    get value() { return this.total + this.correction; }
}

function normalizeZero(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

function finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error("统计计算发生数值溢出或尺度不可靠");
    return normalizeZero(value);
}

function weightedMean(values: number[], weights: number[]): number | null {
    if (!values.length) return null;
    const weightScale = weights.reduce((maximum, weight) => Math.max(maximum, weight), 0);
    if (!(weightScale > 0)) return null;

    let minimum = Infinity;
    let maximum = -Infinity;
    let valueScale = 0;
    for (const value of values) {
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
        const abs = Math.abs(value);
        if (abs > valueScale) valueScale = abs;
    }
    if (valueScale === 0) return 0;

    // By Sterbenz's lemma, when all values share the same sign within a factor of 2,
    // subtracting `minimum` is 100% bit-exact and prevents large-offset cancellation.
    const sterbenzCenter =
        (minimum > 0 && maximum <= 2 * minimum) || (maximum < 0 && minimum >= 2 * maximum)
            ? minimum
            : 0;

    let shiftedScale = 0;
    for (const value of values) {
        shiftedScale = Math.max(shiftedScale, Math.abs(value - sterbenzCenter));
    }
    if (shiftedScale === 0) return normalizeZero(sterbenzCenter);

    const numerator = new Sum(), denominator = new Sum();
    const unscaledNumerator = new Sum();
    let productUnderflow = false;
    for (let i = 0; i < values.length; i++) {
        const shifted = values[i]! - sterbenzCenter;
        const weight = weights[i]! / weightScale;
        if (weights[i]! > 0 && weight === 0 && shifted !== 0) {
            // Weight dynamic range exceeds 10^324; fail closed if weighted contribution could be non-negligible
            if (Math.log2(weights[i]!) + Math.log2(Math.abs(shifted)) - Math.log2(weightScale) > -1074) {
                throw new Error("统计计算发生数值溢出或尺度不可靠");
            }
        }
        const product = weight * shifted;
        if (shifted !== 0 && weight > 0 && Math.abs(product) < 2 ** -1022) productUnderflow = true;
        unscaledNumerator.add(product);
        numerator.add(weight * (shifted / shiftedScale));
        denominator.add(weight);
    }
    if (!(denominator.value > 0)) return null;
    const offset = !productUnderflow && Number.isFinite(unscaledNumerator.value)
        ? unscaledNumerator.value / denominator.value
        : (numerator.value / denominator.value) * shiftedScale;
    return finite(sterbenzCenter + offset);
}

function quantileR7(sorted: number[], probability: number): number | null {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position), fraction = position - lower;
    const a = sorted[lower]!, b = sorted[Math.min(lower + 1, sorted.length - 1)]!;
    return finite(a < 0 && b > 0 ? a * (1 - fraction) + b * fraction : a + (b - a) * fraction);
}

export function calculateUnivariate({
    population,
    indices,
    variable,
    weighted,
    weights,
}: {
    population: Record<string, unknown>[];
    indices: number[];
    variable: VariableDefinition;
    weighted: boolean;
    weights?: number[];
}): AnalysisResult {
    if (variable.kind === "identifier") throw new Error("标识符变量不用于统计分析");
    if (weighted && (!weights || weights.length !== indices.length)) throw new Error("权重必须与样本索引一一对齐");
    if (!weighted && weights !== undefined) throw new Error("未加权分析不能传入权重");
    if (weights?.some(weight => !Number.isFinite(weight) || weight <= 0)) throw new Error("权重必须是有限正数");
    if (new Set(indices).size !== indices.length) throw new Error("样本索引不能重复");
    const rows = indices.map(index => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= population.length) throw new Error("样本索引无效");
        return population[index]!;
    });
    const missingKeys = new Set(variable.missing.map(valueKey));
    const activeCategories = variable.categories.filter(category => !missingKeys.has(valueKey(category.value)));
    const categoryIndex = new Map(activeCategories.map((category, index) => [valueKey(category.value), index]));

    const read = (row: Record<string, unknown>) => {
        if (!Object.prototype.hasOwnProperty.call(row, variable.field)) throw new Error(`总体缺少字段“${variable.field}”`);
        const value = row[variable.field];
        const key = valueKey(value);
        if (missingKeys.has(key)) return null;
        if (value === null && (variable.kind === "continuous" || !categoryIndex.has(key))) return null;
        if (variable.kind === "continuous") return interpretNumeric(value, variable);
        const index = categoryIndex.get(key);
        if (index === undefined) throw new Error(`字段“${variable.field}”含字典外类别`);
        return index;
    };
    if (weighted) for (const row of population) if (read(row) === null) throw new Error("加权分析要求完整总体目标字段无缺失");

    if (variable.kind === "continuous") {
        const values: number[] = [], validWeights: number[] = [];
        for (let i = 0; i < rows.length; i++) {
            const value = read(rows[i]!);
            if (value !== null) { values.push(value); if (weighted) validWeights.push(weights![i]!); }
        }
        const mean = weighted ? weightedMean(values, validWeights) : scaledMean(values);
        if (weighted) return { kind: "numeric", weighted, sampleCount: rows.length, validCount: values.length, missingCount: rows.length - values.length,
            mean, sampleStandardDeviation: null, min: null, max: null, q1: null, median: null, q3: null };
        const sorted = [...values].sort((a, b) => a - b);
        let sampleStandardDeviation: number | null = null;
        if (values.length > 1) {
            sampleStandardDeviation = finite(computeSampleStandardDeviation(values));
        }
        return { kind: "numeric", weighted, sampleCount: rows.length, validCount: values.length, missingCount: rows.length - values.length,
            mean, sampleStandardDeviation, min: sorted[0] !== undefined ? normalizeZero(sorted[0]) : null, max: sorted.at(-1) !== undefined ? normalizeZero(sorted.at(-1)!) : null,
            q1: quantileR7(sorted, .25), median: quantileR7(sorted, .5), q3: quantileR7(sorted, .75) };
    }

    const counts = Array(activeCategories.length).fill(0) as number[];
    const weightedCounts = Array(activeCategories.length).fill(0).map(() => new Sum());
    let validCount = 0;
    const weightScale = weighted && weights!.length
        ? weights!.reduce((maximum, weight) => Math.max(maximum, weight), 0)
        : 1;
    const totalWeight = new Sum();
    for (let i = 0; i < rows.length; i++) {
        const category = read(rows[i]!);
        if (category === null) continue;
        validCount++;
        counts[category] = counts[category]! + 1;
        if (weighted) { const weight = weights![i]! / weightScale; weightedCounts[category]!.add(weight); totalWeight.add(weight); }
    }
    const categories = activeCategories.map((category, index) => ({ ...category, count: counts[index]!,
        proportion: weighted ? (validCount && totalWeight.value > 0 ? finite(weightedCounts[index]!.value / totalWeight.value) : null) : (validCount ? counts[index]! / validCount : null) }));
    return { kind: "categorical", weighted, sampleCount: rows.length, validCount, missingCount: rows.length - validCount, categories };
}

export function calculateCrossTab({
    rows,
    indices,
    variable,
    groupVariable,
    weighted,
    weights,
}: {
    rows: Record<string, unknown>[];
    indices: number[];
    variable: VariableDefinition;
    groupVariable: VariableDefinition;
    weighted: boolean;
    weights?: number[];
}): CrossTabAnalysisResult {
    if (variable.kind === "identifier") {
        throw new Error("标识符变量不用于统计分析");
    }
    if (groupVariable.kind !== "nominal" && groupVariable.kind !== "ordinal") {
        throw new Error("分组交叉对比的分组变量须为名义或有序分类变量");
    }
    if (variable.field === groupVariable.field) {
        throw new Error("分组维度不能与目标分析变量相同");
    }
    if (weighted && (!weights || weights.length !== indices.length)) {
        throw new Error("权重必须与样本索引一一对齐");
    }
    if (!weighted && weights !== undefined) {
        throw new Error("未加权分析不能传入权重");
    }
    if (weights?.some((w) => !Number.isFinite(w) || w < 0)) {
        throw new Error("权重必须为非负有限数");
    }
    if (new Set(indices).size !== indices.length) {
        throw new Error("样本索引不能重复");
    }
    for (const index of indices) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= rows.length) {
            throw new Error("样本索引无效");
        }
    }

    const groupMissing = new Set(groupVariable.missing.map(valueKey));
    const activeGroupCategories = groupVariable.categories.filter((cat) => !groupMissing.has(valueKey(cat.value)));
    const groupCatIndex = new Map(activeGroupCategories.map((cat, idx) => [valueKey(cat.value), idx]));

    const targetMissing = new Set(variable.missing.map(valueKey));
    const activeTargetCategories = variable.categories.filter((cat) => !targetMissing.has(valueKey(cat.value)));
    const targetCatIndex = new Map(activeTargetCategories.map((cat, idx) => [valueKey(cat.value), idx]));

    const buckets = activeGroupCategories.map(() => ({
        numValues: [] as number[],
        numWeights: [] as number[],
        catCounts: Array(activeTargetCategories.length).fill(0) as number[],
        catWeightedCounts: Array(activeTargetCategories.length).fill(0).map(() => new Sum()),
        totalWeight: new Sum(),
        validCount: 0,
    }));

    let totalValid = 0;
    const weightScale = weighted && weights && weights.length
        ? weights.reduce((m, w) => Math.max(m, w), 0)
        : 1;

    indices.forEach((rowIndex, pos) => {
        const row = rows[rowIndex]!;
        if (!Object.prototype.hasOwnProperty.call(row, groupVariable.field)) {
            throw new Error(`总体缺少字段“${groupVariable.field}”`);
        }
        if (!Object.prototype.hasOwnProperty.call(row, variable.field)) {
            throw new Error(`总体缺少字段“${variable.field}”`);
        }

        const gRaw = row[groupVariable.field];
        const gKey = valueKey(gRaw);
        if (groupMissing.has(gKey) || (gRaw === null && !groupCatIndex.has(gKey))) return;
        const gIdx = groupCatIndex.get(gKey);
        if (gIdx === undefined) {
            throw new Error(`字段“${groupVariable.field}”含字典外类别`);
        }

        const tRaw = row[variable.field];
        const tKey = valueKey(tRaw);
        if (targetMissing.has(tKey) || (tRaw === null && (variable.kind === "continuous" || !targetCatIndex.has(tKey)))) return;

        const bucket = buckets[gIdx]!;
        const w = weighted ? weights![pos]! : 1;

        if (variable.kind === "continuous") {
            const num = interpretNumeric(tRaw, variable);
            if (num === null) return;
            bucket.numValues.push(num);
            if (weighted) bucket.numWeights.push(w);
            bucket.validCount += 1;
            totalValid += 1;
        } else {
            const tIdx = targetCatIndex.get(tKey);
            if (tIdx === undefined) {
                throw new Error(`字段“${variable.field}”含字典外类别`);
            }
            bucket.catCounts[tIdx] = bucket.catCounts[tIdx]! + 1;
            if (weighted && weightScale > 0 && w > 0) {
                const scaledW = w / weightScale;
                bucket.catWeightedCounts[tIdx]!.add(scaledW);
                bucket.totalWeight.add(scaledW);
            }
            bucket.validCount += 1;
            totalValid += 1;
        }
    });

    const groups = activeGroupCategories.map((gCat, gIdx) => {
        const bucket = buckets[gIdx]!;
        if (variable.kind === "continuous") {
            const mean = bucket.validCount > 0
                ? (weighted ? weightedMean(bucket.numValues, bucket.numWeights) : scaledMean(bucket.numValues))
                : null;
            const sd = !weighted && bucket.numValues.length > 1
                ? finite(computeSampleStandardDeviation(bucket.numValues))
                : null;
            return {
                groupValue: gCat.value,
                groupLabel: gCat.label,
                validCount: bucket.validCount,
                mean,
                sampleStandardDeviation: sd,
            };
        }
        const categories = activeTargetCategories.map((tCat, tIdx) => ({
            value: tCat.value,
            label: tCat.label,
            count: bucket.catCounts[tIdx]!,
            proportion: bucket.validCount > 0
                ? (weighted
                    ? (bucket.totalWeight.value > 0 ? finite(bucket.catWeightedCounts[tIdx]!.value / bucket.totalWeight.value) : null)
                    : bucket.catCounts[tIdx]! / bucket.validCount)
                : null,
        }));
        return {
            groupValue: gCat.value,
            groupLabel: gCat.label,
            validCount: bucket.validCount,
            categories,
        };
    });

    return {
        kind: "crosstab",
        weighted,
        sampleCount: indices.length,
        validCount: totalValid,
        missingCount: indices.length - totalValid,
        groupField: groupVariable.field,
        groupLabel: groupVariable.label,
        targetKind: variable.kind === "continuous" ? "numeric" : "categorical",
        groups,
    };
}
