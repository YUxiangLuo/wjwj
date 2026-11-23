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

function finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error("统计计算发生数值溢出或尺度不可靠");
    return value;
}

function weightedMean(values: number[], weights: number[]): number | null {
    if (!values.length) return null;
    const valueScale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
    if (valueScale === 0) return 0;
    const weightScale = weights.reduce((maximum, weight) => Math.max(maximum, weight), 0);
    const numerator = new Sum(), denominator = new Sum();
    const unscaledNumerator = new Sum();
    let productUnderflow = false;
    for (let i = 0; i < values.length; i++) {
        const weight = weights[i]! / weightScale;
        const product = weight * values[i]!;
        if (values[i] !== 0 && weight > 0 && Math.abs(product) < 2 ** -1022) productUnderflow = true;
        unscaledNumerator.add(product);
        numerator.add(weight * (values[i]! / valueScale));
        denominator.add(weight);
    }
    if (!(denominator.value > 0)) throw new Error("权重总和无效");
    if (!productUnderflow && Number.isFinite(unscaledNumerator.value)) return finite(unscaledNumerator.value / denominator.value);
    return finite((numerator.value / denominator.value) * valueScale);
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
    if (weighted && (!weights || weights.length !== indices.length)) throw new Error("权重必须与样本索引一一对齐");
    if (!weighted && weights !== undefined) throw new Error("未加权分析不能传入权重");
    if (weights?.some(weight => !Number.isFinite(weight) || weight <= 0)) throw new Error("权重必须是有限正数");
    if (new Set(indices).size !== indices.length) throw new Error("样本索引不能重复");
    const rows = indices.map(index => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= population.length) throw new Error("样本索引无效");
        return population[index]!;
    });
    const missingKeys = new Set(variable.missing.map(valueKey));
    const categoryIndex = new Map(variable.categories.map((category, index) => [valueKey(category.value), index]));

    const read = (row: Record<string, unknown>) => {
        if (!Object.prototype.hasOwnProperty.call(row, variable.field)) throw new Error(`总体缺少字段“${variable.field}”`);
        const value = row[variable.field];
        const key = valueKey(value);
        if (missingKeys.has(key)) return null;
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
            mean, sampleStandardDeviation, min: sorted[0] ?? null, max: sorted.at(-1) ?? null,
            q1: quantileR7(sorted, .25), median: quantileR7(sorted, .5), q3: quantileR7(sorted, .75) };
    }

    const counts = Array(variable.categories.length).fill(0) as number[];
    const weightedCounts = Array(variable.categories.length).fill(0).map(() => new Sum());
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
    const categories = variable.categories.map((category, index) => ({ ...category, count: counts[index]!,
        proportion: weighted ? (validCount ? finite(weightedCounts[index]!.value / totalWeight.value) : null) : (validCount ? counts[index]! / validCount : null) }));
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
    if (groupVariable.kind !== "nominal" && groupVariable.kind !== "ordinal") {
        throw new Error("分组交叉对比的分组变量须为名义或有序分类变量");
    }
    if (weighted && (!weights || weights.length !== indices.length)) {
        throw new Error("权重必须与样本索引一一对齐");
    }

    const groupMissing = new Set(groupVariable.missing.map(valueKey));
    const groupCatIndex = new Map(groupVariable.categories.map((cat, idx) => [valueKey(cat.value), idx]));
    const targetMissing = new Set(variable.missing.map(valueKey));
    const targetCatIndex = new Map(variable.categories.map((cat, idx) => [valueKey(cat.value), idx]));

    const buckets = groupVariable.categories.map(() => ({
        numValues: [] as number[],
        numWeights: [] as number[],
        catCounts: Array(variable.categories.length).fill(0) as number[],
        catWeightedCounts: Array(variable.categories.length).fill(0).map(() => new Sum()),
        totalWeight: new Sum(),
        validCount: 0,
    }));

    let totalValid = 0;
    const weightScale = weighted && weights && weights.length
        ? weights.reduce((m, w) => Math.max(m, w), 0)
        : 1;

    indices.forEach((rowIndex, pos) => {
        const row = rows[rowIndex];
        if (!row) return;
        const gRaw = row[groupVariable.field];
        const gKey = valueKey(gRaw);
        if (groupMissing.has(gKey)) return;
        const gIdx = groupCatIndex.get(gKey);
        if (gIdx === undefined) return;

        const tRaw = row[variable.field];
        const tKey = valueKey(tRaw);
        if (tRaw === null || tRaw === undefined || targetMissing.has(tKey)) return;

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
            if (tIdx === undefined) return;
            bucket.catCounts[tIdx] = bucket.catCounts[tIdx]! + 1;
            if (weighted) {
                bucket.catWeightedCounts[tIdx]!.add(w / weightScale);
                bucket.totalWeight.add(w / weightScale);
            }
            bucket.validCount += 1;
            totalValid += 1;
        }
    });

    const groups = groupVariable.categories.map((gCat, gIdx) => {
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
        const categories = variable.categories.map((tCat, tIdx) => ({
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
