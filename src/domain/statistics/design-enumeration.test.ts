import { expect, test } from "bun:test";
import { computeSimpleRandomValueSe } from "./srs";
import { computeStratifiedValueSe } from "./stratified";
import { computeSystematicExactValueSe } from "./systematic";

function combinations<T>(values: T[], count: number): T[][] {
    if (count === 0) return [[]];
    const result: T[][] = [];
    const visit = (start: number, selected: T[]) => {
        if (selected.length === count) {
            result.push([...selected]);
            return;
        }
        for (let index = start; index <= values.length - (count - selected.length); index += 1) {
            selected.push(values[index]!);
            visit(index + 1, selected);
            selected.pop();
        }
    };
    visit(0, []);
    return result;
}

function mean(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function designStandardDeviation(outcomes: Array<{ probability: number; estimate: number }>) {
    const expected = outcomes.reduce(
        (sum, outcome) => sum + outcome.probability * outcome.estimate,
        0,
    );
    return Math.sqrt(outcomes.reduce(
        (sum, outcome) => sum + outcome.probability * (outcome.estimate - expected) ** 2,
        0,
    ));
}

function populationVariance(values: number[]) {
    const center = mean(values);
    return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
}

function enumerateSrsStandardError(values: number[], sampleSize: number) {
    const samples = combinations(values, sampleSize);
    return designStandardDeviation(samples.map(sample => ({
        probability: 1 / samples.length,
        estimate: mean(sample),
    })));
}

function cartesianProduct<T>(groups: T[][][]): T[][] {
    return groups.reduce<T[][]>(
        (products, group) => products.flatMap(product => group.map(item => [...product, ...item])),
        [[]],
    );
}

function enumerateStratifiedStandardError(
    strata: Array<{ values: number[]; sampleSize: number }>,
) {
    const samplesByStratum = strata.map(stratum => combinations(stratum.values, stratum.sampleSize));
    const jointSamples = cartesianProduct(samplesByStratum);
    const populationSize = strata.reduce((sum, stratum) => sum + stratum.values.length, 0);
    return designStandardDeviation(jointSamples.map(sample => {
        let offset = 0;
        let estimate = 0;
        for (const stratum of strata) {
            const stratumSample = sample.slice(offset, offset + stratum.sampleSize);
            estimate += stratum.values.length / populationSize * mean(stratumSample);
            offset += stratum.sampleSize;
        }
        return { probability: 1 / jointSamples.length, estimate };
    }));
}

/**
 * Enumerate the exact rational start intervals for u in [0, 1), where
 * r = uN/n and selected index j is floor((u+j)N/n). This intentionally does
 * not reuse the production boundary sweep.
 */
function enumerateSystematicStandardError(values: number[], sampleSize: number) {
    const populationSize = values.length;
    const boundaries = new Set([0, populationSize]);
    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex += 1) {
        for (let integer = 1; integer < populationSize; integer += 1) {
            const numerator = integer * sampleSize - sampleIndex * populationSize;
            if (numerator > 0 && numerator < populationSize) boundaries.add(numerator);
        }
    }
    const sorted = [...boundaries].sort((left, right) => left - right);
    const outcomes: Array<{ probability: number; estimate: number }> = [];
    for (let index = 1; index < sorted.length; index += 1) {
        const lower = sorted[index - 1]!;
        const upper = sorted[index]!;
        const u = (lower + upper) / (2 * populationSize);
        const sample = Array.from({ length: sampleSize }, (_, sampleIndex) => (
            values[Math.floor((u + sampleIndex) * populationSize / sampleSize)]!
        ));
        outcomes.push({ probability: (upper - lower) / populationSize, estimate: mean(sample) });
    }
    return designStandardDeviation(outcomes);
}

test("SRS finite-population SE matches complete sample enumeration", () => {
    for (let populationSize = 2; populationSize <= 8; populationSize += 1) {
        const values = Array.from(
            { length: populationSize },
            (_, index) => ((index * 17 + populationSize * 5) % 23) - index / 7,
        );
        const variance = populationVariance(values);
        for (let sampleSize = 1; sampleSize <= populationSize; sampleSize += 1) {
            const expected = enumerateSrsStandardError(values, sampleSize);
            const actual = computeSimpleRandomValueSe(variance, populationSize, sampleSize);
            expect(actual, `N=${populationSize}, n=${sampleSize}`).toBeCloseTo(expected, 12);
        }
    }
});

test("stratified SE matches the Cartesian product of all within-stratum samples", () => {
    const population = [
        { stratum: "A", y: -7 },
        { stratum: "A", y: 2 },
        { stratum: "A", y: 19 },
        { stratum: "B", y: 3 },
        { stratum: "B", y: 8 },
        { stratum: "B", y: 12 },
        { stratum: "B", y: 31 },
    ];
    for (let sampleA = 1; sampleA <= 3; sampleA += 1) {
        for (let sampleB = 1; sampleB <= 4; sampleB += 1) {
            const strata = [
                { values: [-7, 2, 19], sampleSize: sampleA },
                { values: [3, 8, 12, 31], sampleSize: sampleB },
            ];
            const expected = enumerateStratifiedStandardError(strata);
            const actual = computeStratifiedValueSe(
                population,
                "stratum",
                [
                    { name: "A", count: 3, sampleCount: sampleA },
                    { name: "B", count: 4, sampleCount: sampleB },
                ],
                population.length,
                row => Number(row.y),
            );
            expect(actual, `nA=${sampleA}, nB=${sampleB}`).toBeCloseTo(expected, 12);
        }
    }
});

test("fractional systematic SE matches every exact random-start interval", () => {
    for (let populationSize = 2; populationSize <= 16; populationSize += 1) {
        const values = Array.from(
            { length: populationSize },
            (_, index) => ((index * 29 + populationSize * 11) % 37) - index / 5,
        );
        const population = values.map(y => ({ y }));
        for (let sampleSize = 1; sampleSize <= populationSize; sampleSize += 1) {
            const expected = enumerateSystematicStandardError(values, sampleSize);
            const actual = computeSystematicExactValueSe(
                population,
                row => Number(row.y),
                { completed: true, sampleCount: sampleSize, interval: populationSize / sampleSize },
            );
            expect(actual, `N=${populationSize}, n=${sampleSize}`).toBeCloseTo(expected, 11);
        }
    }
});
