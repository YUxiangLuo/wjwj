import { interpretNumeric, valueKey } from "./dictionary";
import type { AnalysisResult, VariableDefinition } from "./types";
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
        // Subnormal products lose precision even when they do not round to zero.
        if (values[i] !== 0 && weight > 0 && Math.abs(product) < 2 ** -1022) productUnderflow = true;
        unscaledNumerator.add(product);
        numerator.add(weight * (values[i]! / valueScale));
        denominator.add(weight);
    }
    if (!(denominator.value > 0)) throw new Error("权重总和无效");
    // Preserve cancellation residuals unless original-unit products/sums lose range.
    if (!productUnderflow && Number.isFinite(unscaledNumerator.value)) return finite(unscaledNumerator.value / denominator.value);
    return finite((numerator.value / denominator.value) * valueScale);
}

function quantileR7(sorted: number[], probability: number): number | null {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position), fraction = position - lower;
    const a = sorted[lower]!, b = sorted[Math.min(lower + 1, sorted.length - 1)]!;
    // Subtraction preserves nearby values; opposite signs need an overflow-safe blend.
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
