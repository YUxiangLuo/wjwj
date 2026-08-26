import { expect, test } from "bun:test";
import { join } from "node:path";
import { ADVANCED_TAB_CONFIG } from "./components/sample-planning/advancedTabs";
import {
    calculateFinitePopulationSampleSize,
    calculateMeanEstimationSampleSize,
    calculateOptimalAllocationWithCost,
    finitePopulationVarianceFactor,
} from "./experiment/sample-plan";

// Authority anchors used by TEACHING_REVIEW.md: Statistics Canada / UN for SRS and FPC,
// Penn State STAT 506 for stratified allocation, and NIST for normal-approximation planning.
test("authority benchmark: SRS proportion and mean formulas match documented finite-population values", () => {
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: 95,
        marginOfError: 5,
        populationSize: 1000,
        p: 0.5,
    })).toBe(278);

    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: 95,
        marginOfError: 2,
        populationSize: 1000,
        populationVariance: 100,
    })).toBe(88);

    expect(finitePopulationVarianceFactor(60, 53)).toBeCloseTo(7 / 59, 14);
});

test("authority benchmark: equal-cost optimum reduces to Neyman allocation", () => {
    const result = calculateOptimalAllocationWithCost([
        { name: "A", populationSize: 100, stdDev: 10, unitCost: 1 },
        { name: "B", populationSize: 200, stdDev: 5, unitCost: 1 },
    ], 100);

    expect(result?.allocation.map((layer) => layer.sampleSize)).toEqual([50, 50]);
    expect(result?.totalSampleSize).toBe(100);
    expect(result?.totalCost).toBe(100);
});

test("property gate: precision, population cap, symmetry, and nonresponse remain coherent", () => {
    for (const populationSize of [2, 3, 10, 60, 1000, 10_000]) {
        const loose = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 10,
            populationSize,
            p: 0.5,
        });
        const strict = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 3,
            populationSize,
            p: 0.5,
        });
        const withNonresponse = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 3,
            populationSize,
            p: 0.5,
            nonResponseRate: 0.4,
        });

        expect(loose).toBeGreaterThanOrEqual(1);
        expect(strict).toBeGreaterThanOrEqual(loose!);
        expect(withNonresponse).toBeGreaterThanOrEqual(strict!);
        expect(withNonresponse).toBeLessThanOrEqual(populationSize);
    }

    const rareLow = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.001 });
    const rareHigh = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.999 });
    const conservative = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.5 });
    expect(rareLow).toBe(rareHigh);
    expect(conservative).toBeGreaterThan(rareLow!);
});

test("every advanced planning tool declares estimand, assumptions/source, scope, and limitations", () => {
    expect(ADVANCED_TAB_CONFIG.length).toBeGreaterThan(0);
    for (const tool of ADVANCED_TAB_CONFIG) {
        expect(tool.targetEstimand.trim().length).toBeGreaterThan(10);
        expect(tool.assumptionsAndSource.trim().length).toBeGreaterThan(10);
        expect(tool.scopeAndLimitations.trim().length).toBeGreaterThan(10);
    }
});

test("copy gate rejects previously identified unconditional statistical claims", async () => {
    const sourceRoot = join(import.meta.dir, "..");
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const productionSources: string[] = [];

    for await (const relativePath of glob.scan({ cwd: sourceRoot })) {
        if (/\.(?:test|spec)\.[^.]+$/.test(relativePath)) continue;
        productionSources.push(await Bun.file(join(sourceRoot, relativePath)).text());
    }
    const text = productionSources.join("\n");
    const forbiddenClaims = [
        /成本.{0,8}指数增长/,
        /1000.{0,12}(?:显著|明显).{0,8}(?:下降|递减)/,
        /题型.{0,8}(?:越多越好|越丰富.{0,4}越好)/,
        /全体发放.{0,12}(?:零误差|误差为零)/,
    ];

    for (const claim of forbiddenClaims) {
        expect(text).not.toMatch(claim);
    }
});
