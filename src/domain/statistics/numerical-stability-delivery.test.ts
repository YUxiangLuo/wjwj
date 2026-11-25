import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { buildPopulationNumericStats, buildStratifiedNumericStats } from "./population";
import { sampleVariance, scaledMean } from "./values";
import { buildPpsStandardErrorContext, estimateWeightedMean } from "./pps";
import { performPPSSampling, performSystematicSampling } from "./sampling";
import { StableSum } from "./stable-sum";
import { computeSystematicExactMeanSe, computeSystematicExactValueSe } from "./systematic";
import { calculateUnivariate } from "../variables/analysis";

test("PPS and saved weighted means preserve subnormal observations with unequal design weights", () => {
    const tiny = Number.MIN_VALUE;
    // Weights [1,1,1,2]: constant mean=tiny; varying mean=11*tiny/5,
    // which rounds to 2*tiny. The latter catches nonzero product rounding too.
    for (const [values, expected] of [
        [[tiny, tiny, tiny, tiny, tiny], tiny],
        [[3 * tiny, 3 * tiny, 3 * tiny, tiny, tiny], 2 * tiny],
        [[-tiny, -tiny, -tiny, -tiny, -tiny], -tiny],
    ] as const) {
        const population = [2, 2, 2, 1, 1].map((size, i) => ({ size, x: values[i]! }));
        const sample = performPPSSampling(population, "size", 4, () => .25);
        expect(sample.inclusionProbabilities).toEqual([1, 1, 1, .5]);
        expect(estimateWeightedMean(sample.data, "x", sample.inclusionProbabilities)).toBe(expected);
        const result = calculateUnivariate({ population, indices: sample.indices,
            variable: { field: "x", label: "数值", unit: "", kind: "continuous", categories: [], missing: [] },
            weighted: true, weights: sample.inclusionProbabilities.map(p => 1 / p) });
        expect(result).toMatchObject({ kind: "numeric", mean: expected });
    }
});

test("population and census estimates retain a tiny signed-cancellation residual", () => {
    const population = [1e150, 1e-180, -1e150].map(y => ({ y }));
    const metrics = buildAnalysisMetrics({ population,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 3, data: population } },
    });
    const expected = 1e-180 / 3;
    expect(metrics.target!.populationValue! / expected).toBeCloseTo(1, 14);
    expect(metrics.target!.methods.simple.estimate! / expected).toBeCloseTo(1, 14);
    expect(estimateWeightedMean(population, "y", [1, 1, 1])! / expected).toBeCloseTo(1, 14);
    const unequal = [1e150, -2e150, 1e-180].map(y => ({ y }));
    expect(estimateWeightedMean(unequal, "y", [.5, 1, .25])! / (4e-180 / 7)).toBeCloseTo(1, 14);
});

test("ST-N03 subnormal variances do not collapse representable design SEs", () => {
    for (const scale of [1, 1e-155, 1e-160]) {
        const population = Array.from({ length: 1000 }, (_, i) => ({ y: i % 2 * scale }));
        for (const n of [1, 100, 499, 999, 1000]) {
            const sample = performSystematicSampling(population, n, () => .12345);
            const metrics = buildAnalysisMetrics({ population,
                fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
                samplingResults: { simple: { completed: true, sampleCount: n, data: sample.data }, systematic: { ...sample, completed: true, sampleCount: n } },
            });
            const simple = metrics.target!.methods.simple;
            // Exact balanced binary population: sigma²=1/4. Compare in original units
            // so an incorrect zero cannot pass an absolute tiny-number tolerance.
            expect(simple.standardError! / scale).toBeCloseTo(Math.sqrt(.25 * (1000 - n) / (999 * n)), 12);
            expect(simple.effectiveSampleSize!).toBeCloseTo(n, 8);
            const systematicSe = n === 1000 ? 0 : n % 2 ? .5 / n : .5;
            expect(metrics.target!.methods.systematic.standardError! / scale).toBeCloseTo(systematicSe, 12);
        }
        expect(computeSystematicExactMeanSe(population, "y", { completed: true, kValue: 2, sampleCount: 500 })! / scale).toBeCloseTo(.5, 12);
    }
});

test("ST-N01 shared large translations preserve sample variance and design standard error", () => {
    const original = [0, 0.003, 0.009, 0.019];
    const offset = 1e12;
    const translated = original.map(value => offset + value);
    // The independently derived reference uses the actual representable deltas after translation.
    const representedDeltas = translated.map(value => value - offset);

    expect(sampleVariance(translated)).toBeCloseTo(sampleVariance(representedDeltas), 12);

    const originalPopulation = [0, 3, 9, 19, 27, 41].map(y => ({ y }));
    const translatedPopulation = originalPopulation.map(row => ({ y: offset + row.y }));
    const originalSample = originalPopulation.slice(0, 4);
    const translatedSample = translatedPopulation.slice(0, 4);
    const originalMetrics = buildAnalysisMetrics({
        population: originalPopulation,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 4, data: originalSample } },
    });
    const translatedMetrics = buildAnalysisMetrics({
        population: translatedPopulation,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 4, data: translatedSample } },
    });

    expect(translatedMetrics.target!.methods.simple.standardError).toBeCloseTo(originalMetrics.target!.methods.simple.standardError!, 12);
    expect(JSON.stringify(translatedMetrics)).not.toMatch(/NaN|Infinity/);
});

test("ST-N02 unrepresentable finite-input dispersion is excluded before serialization", () => {
    const population = [{ y: Number.MAX_VALUE }, { y: -Number.MAX_VALUE }];
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 1, data: [population[0]!] } },
    });

    expect(metrics.numericFields).toEqual([]);
    expect(metrics.excludedNumericFields).toEqual(["y"]);
    expect(metrics.target).toBeNull();
    expect(JSON.stringify(metrics)).not.toMatch(/NaN|Infinity/);
});

test("QA-S0-01 subnormal dispersion never emits underflowed fake variance 0 alongside nonzero stdDev", () => {
    const subnormal = [{ g: "A", y: 1e-320 }, { g: "A", y: 2e-320 }, { g: "A", y: 3e-320 }];
    expect(buildPopulationNumericStats(subnormal, ["y"])).toEqual({});
    expect(buildStratifiedNumericStats(subnormal, { stratified: ["g"], numeric: ["y"] }).g?.A?.y).toBeUndefined();

    const metrics = buildAnalysisMetrics({
        population: subnormal,
        fieldMapping: { numeric: ["y"] },
        samplingResults: { simple: { completed: true, sampleCount: 2, data: subnormal.slice(0, 2) } },
    });
    expect(metrics.numericFields).toEqual([]);
    expect(metrics.excludedNumericFields).toEqual(["y"]);
    expect(metrics.numeric.y).toBeUndefined();

    // True zero dispersion (constant subnormal column) remains valid with variance === 0 and stdDev === 0.
    const constantSubnormal = [{ g: "A", y: 1e-320 }, { g: "A", y: 1e-320 }, { g: "A", y: 1e-320 }];
    expect(buildPopulationNumericStats(constantSubnormal, ["y"]).y).toEqual({
        mean: 1e-320,
        variance: 0,
        stdDev: 0,
        count: 3,
    });
    expect(buildStratifiedNumericStats(constantSubnormal, { stratified: ["g"], numeric: ["y"] }).g?.A?.y).toEqual({
        mean: 1e-320,
        stdDev: 0,
    });
});

test("QA-S1-02 systematic and PPS exact SE remain finite and accurate on opposite-sign 1e308 extremes", () => {
    // Independent exact oracle: two start clusters [1e308, 1e308] (mean +1e308) and [-1e308, -1e308] (mean -1e308)
    // with equal probability 1/2 each => E = 0, SE = 1e308 exactly.
    const population = [1e308, -1e308, 1e308, -1e308].map((y) => ({ y, size: 1 }));
    const accessor = (row: Record<string, unknown>) => Number(row.y);

    const fractionalSe = computeSystematicExactValueSe(population, accessor, {
        completed: true,
        interval: 2,
        sampleCount: 2,
    });
    expect(fractionalSe).not.toBeNull();
    expect(Number.isFinite(fractionalSe)).toBe(true);
    expect(Math.abs(fractionalSe! / 1e308 - 1)).toBeLessThan(1e-12);

    const legacySe = computeSystematicExactValueSe(population, accessor, {
        completed: true,
        kValue: 2,
        sampleCount: 2,
    });
    expect(legacySe).not.toBeNull();
    expect(Number.isFinite(legacySe)).toBe(true);
    expect(Math.abs(legacySe! / 1e308 - 1)).toBeLessThan(1e-12);

    // Equal-size PPS n=2 selects {0,2} or {1,3} each with probability 1/2 => exact SE = 1e308.
    // Equal-size PPS n=1 selects each unit with probability 1/4 => exact SE = 1e308.
    for (const sampleSize of [1, 2]) {
        const ppsSe = buildPpsStandardErrorContext(population, "size", sampleSize, [{ key: "y", accessor }], 0)?.standardErrors.y;
        expect(ppsSe).not.toBeNull();
        expect(Number.isFinite(ppsSe)).toBe(true);
        expect(Math.abs(ppsSe! / 1e308 - 1)).toBeLessThan(1e-12);
    }
});

test("QA-S2-04 StableSum adaptive expansion retains multi-tier nested cancellation and handles overflow/non-finite", () => {
    // Two-tier nested cancellation: exact sum = 1, mean = 0.2.
    const nested = [1e300, 1e200, 1, -1e300, -1e200];
    const nestedSum = new StableSum();
    for (const value of nested) nestedSum.add(value);
    expect(nestedSum.value).toBe(1);
    expect(scaledMean(nested)).toBe(0.2);

    // Three-tier nested cancellation: exact sum = 1.
    const threeTier = [1e300, 1e200, 1e100, 1, -1e300, -1e200, -1e100];
    const threeTierSum = new StableSum();
    for (const value of threeTier) threeTierSum.add(value);
    expect(threeTierSum.value).toBe(1);

    // Intermediate overflow followed by cancellation returns exact residual 1.
    const overflowCancel = new StableSum();
    for (const value of [1e308, 1e308, -1e308, -1e308, 1]) overflowCancel.add(value);
    expect(overflowCancel.value).toBe(1);

    // Uncancelled overflow and non-finite propagation.
    const posOverflow = new StableSum();
    posOverflow.add(1e308);
    posOverflow.add(1e308);
    expect(posOverflow.value).toBe(Number.POSITIVE_INFINITY);

    const negOverflow = new StableSum();
    negOverflow.add(-1e308);
    negOverflow.add(-1e308);
    expect(negOverflow.value).toBe(Number.NEGATIVE_INFINITY);

    const infCancel = new StableSum();
    infCancel.add(Number.POSITIVE_INFINITY);
    infCancel.add(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(infCancel.value)).toBe(true);

    const nanSum = new StableSum();
    nanSum.add(1);
    nanSum.add(Number.NaN);
    expect(Number.isNaN(nanSum.value)).toBe(true);

    // Exact round-to-nearest-even tie breaking at 1 + 2^-53 +/- tiny.
    const tieUp = new StableSum();
    for (const value of [1, 2 ** -53, 2 ** -100]) tieUp.add(value);
    expect(tieUp.value).toBe(1 + 2 ** -52);

    const tieDown = new StableSum();
    for (const value of [1, 2 ** -53, -(2 ** -100)]) tieDown.add(value);
    expect(tieDown.value).toBe(1);
});
