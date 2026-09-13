import { isVariableMissing, variableValueKey, type VariableDefinition } from "../experiment/variable-dictionary";
import type { DescriptiveResult } from "../experiment/research-analysis";
import { StableSum } from "./stable-sum";

export class DescriptiveError extends Error {}
function finite(value: number) {
    if (!Number.isFinite(value)) throw new DescriptiveError("数值尺度无法可靠计算，请核对单位；不会截断或返回非有限结果");
    return Object.is(value, -0) ? 0 : value;
}
function sum(values: number[]) { const s = new StableSum(); for (const v of values) s.add(v); return finite(s.value); }
/** R type 7: h=(n−1)p. Convex interpolation avoids overflow in b−a. */
function quantile(sorted: number[], p: number) {
    const h = (sorted.length - 1) * p, i = Math.floor(h), f = h - i;
    const a = sorted[i]!, b = sorted[Math.min(i + 1, sorted.length - 1)]!;
    if (a === b || f === 0) return a;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    const normalized = (1 - f) * (a / scale) + f * (b / scale), value = finite(normalized * scale);
    if (normalized !== 0 && value === 0) throw new DescriptiveError("分位数过小，无法可靠表示；不会将其置零");
    return value;
}
/** One real variable. No coercion, imputation, guessed category order, or inference. */
export function describeVariable(variable: VariableDefinition, values: unknown[], weights: number[] | null): DescriptiveResult {
    if (values.length < 1 || values.length > 100_000) throw new DescriptiveError("实际样本量需在1–100000之间");
    const numeric = variable.measurementLevel === "continuous" && variable.storageType === "number";
    const categorical = variable.measurementLevel === "nominal" || variable.measurementLevel === "ordinal";
    if (!numeric && !categorical) throw new DescriptiveError("请选择已确认的连续或分类变量，不对标识符或未分类字段求均值");
    if (weights && (weights.length !== values.length || weights.some(w => typeof w !== "number" || !Number.isFinite(w) || w < 1))) throw new DescriptiveError("设计权重必须来自实际抽样记录");
    const valid = values.flatMap((value, index) => isVariableMissing(value, variable.missingValues) ? [] : [{ value, weight: weights?.[index] ?? 1 }]);
    const missing = values.length - valid.length;
    if (weights && missing) throw new DescriptiveError("分析字段存在缺失，不能将完整案例权重冒充总体设计估计；可改为原始样本描述");
    const total = sum(valid.map(v => v.weight));
    const result: DescriptiveResult = { kind: numeric ? "numeric" : "categorical", sampleCount: values.length, validCount: valid.length, missingCount: missing, weightSum: total,
        mean: null, sampleSD: null, min: null, q1: null, median: null, q3: null, max: null, categories: [], notes: [] };
    result.notes.push(weights ? "使用原设计权重的比率点估计；不提供标准误、置信区间或显著性检验，不宣称无偏。" : "逐变量排除声明缺失；0和false不自动算缺失，百分比以有效样本为分母。");
    if (!valid.length) result.notes.push("没有有效观测，统计量与比例不可用，不用0替代。");
    if (numeric) {
        if (valid.some(v => typeof v.value !== "number" || !Number.isFinite(v.value))) throw new DescriptiveError("连续变量含非数值观测，不自动转换");
        if (valid.length) {
            const x = valid.map(v => v.value as number);
            let magnitude = 0; for (const value of x) magnitude = Math.max(magnitude, Math.abs(value));
            const normalized = magnitude ? x.map(value => value / magnitude) : x.map(() => 0);
            if (normalized.some((value, i) => value === 0 && x[i] !== 0)) throw new DescriptiveError("数值跨度超出可靠计算范围，请核对单位");
            const terms = normalized.map((value, i) => {
                const term = value * (valid[i]!.weight / total);
                if (value !== 0 && term === 0) throw new DescriptiveError("加权项过小，无法可靠表示；不将其置零");
                return term;
            });
            const meanNormalized = sum(terms);
            result.mean = finite(meanNormalized * magnitude);
            if (meanNormalized !== 0 && result.mean === 0) throw new DescriptiveError("均值过小，无法可靠表示；不会将其置零");
            if (!weights) {
                const sorted = [...x].sort((a, b) => a - b);
                result.min = sorted[0]!; result.max = sorted.at(-1)!;
                result.q1 = quantile(sorted, .25); result.median = quantile(sorted, .5); result.q3 = quantile(sorted, .75);
                if (x.length > 1) {
                    const deviations = normalized.map(value => value - meanNormalized);
                    let deviationScale = 0; for (const value of deviations) deviationScale = Math.max(deviationScale, Math.abs(value));
                    const normalizedSD = deviationScale ? Math.sqrt(sum(deviations.map(value => (value / deviationScale) ** 2)) / (x.length - 1)) * deviationScale : 0;
                    result.sampleSD = finite(normalizedSD * magnitude);
                    if (normalizedSD !== 0 && result.sampleSD === 0) throw new DescriptiveError("标准差过小，无法可靠表示；不会视为零方差");
                } else result.notes.push("只有1个有效观测，样本标准差不可用。");
                result.notes.push("样本标准差分母为有效n−1，不是标准误；分位数采用R type 7线性插值。");
            } else result.notes.push("不把设计权重当频数权重，不计算加权标准差或加权分位数。");
        }
    } else {
        const counts = new Map(variable.categories.map(c => [variableValueKey(c.value), { ...c, count: 0, weights: new StableSum() }]));
        for (const row of valid) {
            if (!["string", "number", "boolean"].includes(typeof row.value)) throw new DescriptiveError("分类变量包含无效原值");
            const category = counts.get(variableValueKey(row.value as string | number | boolean));
            if (!category) throw new DescriptiveError("分类原值未被字典声明，不跳过或合并类别");
            category.count++; category.weights.add(row.weight);
        }
        result.categories = [...counts.values()].map(c => ({ value: c.value, label: c.label, count: c.count, proportion: total ? finite(c.weights.value / total) : null }));
        if (weights) result.notes.push("频数仍是原始入样人数；比例使用设计权重，不用频数百分比替代。");
    }
    return result;
}
