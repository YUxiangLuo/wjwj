import { expect, test } from "bun:test";
import { limitCategoricalAnalysis } from "./analysis-categorical";
import type { CategoricalFieldAnalysis } from "./analysis-metrics-types";

test("category limiting preserves a genuine target category named 其他", () => {
    const population = Object.fromEntries([
        ["其他", 4],
        ...Array.from({ length: 20 }, (_, index) => [`类别${index + 1}`, 4.8] as const),
    ]);
    const methods = {
        simple: { ...population },
        systematic: { ...population },
        pps: { ...population },
        stratified: { ...population },
    };
    const analysis: CategoricalFieldAnalysis = {
        population,
        methods,
        representativeness: { simple: 0, systematic: 0, pps: 0, stratified: 0 },
    };

    const limited = limitCategoricalAnalysis(analysis, "其他");

    expect(limited.population["其他"]).toBe(4);
    expect(limited.aggregatedCategoryLabel).toBe("其余类别");
    expect(limited.population["其余类别"]).toBeGreaterThan(0);
    expect(Object.values(limited.population).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
    expect(Object.values(limited.methods.simple).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
});
