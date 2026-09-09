import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { buildPpsStandardErrorContext } from "./pps";
import { computeSystematicExactMeanSe } from "./systematic";
import { createSeededRandom, performSystematicSampling, preparePPSSampling, drawPreparedPPSSample, performPPSSampling } from "./sampling";
import { computeFinitePopulationEquivalentSampleSize } from "./srs";

test("NFKC categories match population, sample and target during a census", () => {
    const population = ["Ａ", "Ａ", "B", "B"].map(category => ({ category }));
    const metrics = buildAnalysisMetrics({ population, fieldMapping: { others: ["category"], analysisTarget: { kind: "proportion", field: "category", value: "A" } },
        samplingResults: { simple: { data: population, completed: true, sampleCount: 4 } } });
    expect(metrics.categorical.category!.representativeness.simple).toBe(0);
    expect(metrics.categorical.category!.methods.simple).toEqual({ A: 50, B: 50 });
    expect(metrics.target!.methods.simple.estimate).toBe(.5);
});

test("chart aggregation cannot erase full-category differences and preserves the primary target", () => {
    const population = Array.from({ length: 420 }, (_, i) => ({ category: i < 380 ? `c${Math.floor(i / 20) + 1}` : i % 2 ? "c21" : "c20" }));
    const sample = performSystematicSampling(population, 210, createSeededRandom(0));
    for (const value of [undefined, "c21"]) {
        const metrics = buildAnalysisMetrics({ population, fieldMapping: { others: ["category"], ...(value ? { analysisTarget: { kind: "proportion" as const, field: "category", value } } : {}) },
            samplingResults: { systematic: { ...sample, completed: true, sampleCount: 210, interval: 2 } } });
        expect(metrics.categorical.category!.representativeness.systematic).toBeCloseTo(200 / 441, 10);
        expect(Object.keys(metrics.categorical.category!.population)).toHaveLength(20);
        if (value) expect(metrics.categorical.category!.population.c21).toBeCloseTo(100 / 21, 10);
    }
});

test("systematic SE is invariant to a large translation of stored values in both design versions", () => {
    const population = Array.from({ length: 1000 }, (_, i) => ({ y: 1e12 + (i * 17 % 31) / 1000 }));
    const centered = population.map(row => ({ y: row.y - 1e12 }));
    for (const design of [{ completed: true, interval: 1000 / 37, sampleCount: 37 }, { completed: true, sampleCount: 38, kValue: 27 }]) {
        const se = computeSystematicExactMeanSe(population, "y", design);
        const reference = computeSystematicExactMeanSe(centered, "y", design);
        expect(se).not.toBeNull();
        expect(se!).toBeGreaterThan(0);
        expect(se!).toBeCloseTo(reference!, 14);
    }
});

test("PPS exact integration captures a rare influential unit even with nonzero background variation", () => {
    const population = Array.from({ length: 1000 }, (_, i) => ({ y: i === 0 ? 1000 : (i % 2) * .01, size: i === 0 ? .001 : 1 }));
    // Independent rational probability enumeration. No production sampler or estimator.
    const D = 999001, numerators = [40, ...Array<number>(999).fill(40000)];
    const cuts = new Set([0, D]);
    let cumulative = 0;
    for (const probability of numerators) { cumulative += probability; cuts.add(cumulative % D); }
    const sorted = [...cuts].sort((a, b) => a - b);
    let mean = 0, second = 0;
    for (let k = 1; k < sorted.length; k++) {
        const weight = (sorted[k]! - sorted[k - 1]!) / D;
        const start = (sorted[k]! + sorted[k - 1]!) / 2;
        let end = numerators[0]!, index = 0, numerator = 0, denominator = 0;
        for (let j = 0; j < 40; j++) {
            while (end <= start + j * D) end += numerators[++index]!;
            numerator += population[index]!.y / numerators[index]!;
            denominator += 1 / numerators[index]!;
        }
        const estimate = numerator / denominator;
        mean += weight * estimate;
        second += weight * estimate ** 2;
    }
    const se = buildPpsStandardErrorContext(population, "size", 40, [{ key: "y", accessor: row => Number(row.y) }], 512)!.standardErrors.y;
    expect(se!).toBeCloseTo(Math.sqrt(second - mean ** 2), 9);
    expect(se!).toBeCloseTo(6.090046666003953, 9);
});

test("PPS integration handles certainty units and floating endpoints across small complete design spaces", () => {
    for (let N = 2; N <= 25; N++) for (let n = 1; n <= N; n++) {
        const population = Array.from({ length: N }, (_, i) => ({ size: i * 17 % 13 + 1, y: i * 23 % 11 }));
        const prepared = preparePPSSampling(population, "size", n)!;
        const boundaries = [0, 1];
        let sum = 0;
        for (const probability of prepared.designFrame.systematicProbabilities) { sum += probability; boundaries.push(sum % 1); }
        boundaries.sort((a, b) => a - b);
        let mean = 0, second = 0;
        for (let i = 1; i < boundaries.length; i++) {
            const width = boundaries[i]! - boundaries[i - 1]!;
            if (width < 1e-12) continue;
            const draw = drawPreparedPPSSample(prepared, () => (boundaries[i]! + boundaries[i - 1]!) / 2);
            expect(draw.data).toHaveLength(n);
            const estimate = draw.data.reduce((s, row, j) => s + row.y / draw.inclusionProbabilities[j]!, 0)
                / draw.inclusionProbabilities.reduce((s, probability) => s + 1 / probability, 0);
            mean += width * estimate; second += width * estimate ** 2;
        }
        const se = buildPpsStandardErrorContext(population, "size", n, [{ key: "y", accessor: row => Number(row.y) }], 32)!.standardErrors.y;
        expect(se).not.toBeNull();
        expect(se!).toBeCloseTo(Math.sqrt(Math.max(0, second - mean ** 2)), 5);
    }
});

test("PPS variance does not round a representable extremely rare event to zero", () => {
    for (const size of [1e-12, 1e-16, 1e-20]) {
        const population = Array.from({ length: 1000 }, (_, i) => ({ y: i === 0 ? 1000 : 0, size: i === 0 ? size : 1 }));
        const probability = 40 * size / (999 + size);
        const highEstimate = 1000 / (1 + 39 * size);
        const expected = highEstimate * Math.sqrt(probability * (1 - probability));
        const actual = buildPpsStandardErrorContext(population, "size", 40, [{ key: "y", accessor: row => Number(row.y) }], 0)!.standardErrors.y!;
        expect(actual).toBeGreaterThan(0);
        expect(Math.abs(actual / expected - 1)).toBeLessThan(1e-6);
    }
});

test("PPS SE remains nonzero across measurement scales even when its square underflows", () => {
    // Independent integer-probability enumeration of 947 start intervals,
    // evaluated with 70-digit Decimal arithmetic during the second review.
    const referenceSe = 0.0157357234252005905238542446856348193;
    for (const scale of [1, 1e-150, 1e-160, 1e-161, 1e150]) {
        const population = Array.from({ length: 1000 }, (_, i) => ({ y: (i % 2) * scale, size: 1 + i % 19 }));
        const sample = performPPSSampling(population, "size", 500, createSeededRandom(7));
        const metrics = buildAnalysisMetrics({ population, fieldMapping: { numeric: ["y", "size"], analysisTarget: { kind: "mean", field: "y" } },
            samplingResults: { pps: { ...sample, completed: true, sampleCount: 500, sizeField: "size" } } });
        const target = metrics.target!.methods.pps;
        expect(target.standardError).not.toBeNull();
        expect(target.standardError!).toBeGreaterThan(0);
        expect(Math.abs(target.standardError! / (referenceSe * scale) - 1)).toBeLessThan(1e-9);
        expect(target.marginOfError!).toBeGreaterThan(0);
        expect(target.effectiveSampleSize).not.toBeNull();
        expect(target.effectiveSampleSize!).toBeGreaterThan(490);
        expect(target.effectiveSampleSize!).toBeLessThan(510);
        expect(target.reliability.status).toBe("caution");
    }
});

test("equivalent sample size avoids underflow after receiving a valid tiny SE", () => {
    const variance = 1e-320;
    const se = Math.sqrt(variance) / Math.sqrt(1000);
    // SE² = S² / 1000 corresponds to n = N/2 for N=1000.
    expect(computeFinitePopulationEquivalentSampleSize(variance, 1000, se)).toBeCloseTo(500, 10);
});

test("PPS weighted products preserve scale when an extremely small size accompanies common varying values", () => {
    // With n=1 the Hájek estimate is exactly the selected y. The last two rows
    // each have probability approximately 1/2, hence SE = |scale|/2 and
    // S² = scale² gives equivalent n = 1/(1/4 + 1/3) = 12/7.
    for (const size of [1e-200, 1e-320]) for (const scale of [1, 1e-125, 1e-120, 1e-10, -1e-125, 1e100]) {
        const population = [{ size, y: 0 }, { size: 1, y: scale }, { size: 1, y: 2 * scale }];
        const sample = performPPSSampling(population, "size", 1, () => .75);
        const metrics = buildAnalysisMetrics({ population,
            fieldMapping: { numeric: ["y", "size"], analysisTarget: { kind: "mean", field: "y" } },
            samplingResults: { pps: { ...sample, completed: true, sampleCount: 1, sizeField: "size" } } });
        const target = metrics.target!.methods.pps;
        expect(target.standardError).not.toBeNull();
        expect(target.standardError! / Math.abs(scale)).toBeCloseTo(.5, 10);
        expect(target.marginOfError! / Math.abs(scale)).toBeCloseTo(.98, 10);
        expect(target.effectiveSampleSize!).toBeCloseTo(12 / 7, 10);
        expect(target.reliability.status).toBe("caution");
    }
});

test("PPS rejects an unrepresentable weighted field without hiding valid fields", () => {
    const population = [
        { size: 1e-200, y: 0, constant: 7 },
        { size: 1, y: 1e-200, constant: 7 },
        { size: 1, y: 1e100, constant: 7 },
    ];
    const context = buildPpsStandardErrorContext(population, "size", 1,
        ["y", "constant"].map(key => ({ key, accessor: row => Number(row[key]) })), 0)!;
    expect(context.standardErrors.y).toBeNull();
    expect(context.standardErrors.constant).toBe(0);
});

test("PPS reports an unrepresentable positive SE as unavailable when restoring field units", () => {
    const population = [{ size: 1e-200, y: Number.MIN_VALUE }, { size: 1, y: 0 }, { size: 1, y: 0 }];
    // The selected value is positive with probability about 5e-201, so the
    // true SE is positive but smaller than the smallest representable number.
    const context = buildPpsStandardErrorContext(population, "size", 1,
        [{ key: "y", accessor: row => Number(row.y) }], 0)!;
    expect(context.standardErrors.y).toBeNull();
});

test("PPS near-certainty remains random and retains its positive design variance", () => {
    const population = [{ size: 1e-12, y: 0 }, { size: 1, y: 4 }];
    const prepared = preparePPSSampling(population, "size", 1)!;
    expect(prepared.designFrame.systematicSampleSize).toBe(1);
    expect(prepared.designFrame.certaintyIndices).toEqual([]);
    const context = buildPpsStandardErrorContext(population, "size", 1,
        [{ key: "y", accessor: row => Number(row.y) }], 0)!;
    const expected = 4 * Math.sqrt(1e-12) / (1 + 1e-12);
    expect(Math.abs(context.standardErrors.y! / expected - 1)).toBeLessThan(1e-10);
});
