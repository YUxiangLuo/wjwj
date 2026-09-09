import { expect, test } from 'bun:test';
import { preparePPSSampling, drawPreparedPPSSample } from './sampling';
import { buildPpsStandardErrorContext } from './pps';
import { executeSamplingAction } from '../../student/experiment/sampling-service';

const field = [{ key: 'y', accessor: (row: Record<string, unknown>) => Number(row.y) }];

test('near certainty retains every positive-probability unit and its nonzero SE', () => {
    const population = [{ size: 1e10, y: 0 }, { size: 1, y: 1e10 }, { size: 1, y: -1e10 }];
    const prepared = preparePPSSampling(population, 'size', 1)!;
    expect(prepared.designFrame.certaintyIndices).toEqual([]);
    expect(prepared.designFrame.systematicProbabilities.every(p => p > 0 && p < 1)).toBe(true);
    for (const [start, id] of [[.5, 0], [.99999999985, 1], [.99999999995, 2]]) {
        expect(drawPreparedPPSSample(prepared, () => start!).indices).toEqual([id!]);
    }
    const expected = Math.sqrt(2e20 / (1e10 + 2));
    const se = buildPpsStandardErrorContext(population, 'size', 1, field, 0)!.standardErrors.y!;
    expect(Math.abs(se / expected - 1)).toBeLessThan(1e-10);
});

test('removing a dominant certainty unit recovers residual masses instead of subtracting rounded totals', async () => {
    const population = [1e16, 1, 1, 1].map((size, i) => ({ size, y: [3, -7, 19, 5][i]! }));
    const prepared = preparePPSSampling(population, 'size', 2)!;
    expect(prepared.designFrame.certaintyIndices).toEqual([0]);
    expect(prepared.designFrame.systematicProbabilities).toEqual([1 / 3, 1 / 3, 1 / 3]);
    for (const [start, id] of [[1 / 6, 1], [.5, 2], [5 / 6, 3]]) expect(drawPreparedPPSSample(prepared, () => start!).indices).toEqual([0, id!]);
    expect(buildPpsStandardErrorContext(population, 'size', 2, field, 0)!.standardErrors.y).toBeCloseTo(Math.sqrt(63.5), 10);
    const result = await executeSamplingAction({ method: 'pps', population, targetSampleSize: 2, rawParams: { sizeField: 'size', sampleSize: 2, seed: 7 }, fieldMapping: { numeric: ['y', 'size'] } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.sampleCount).toBe(2);
});

for (const size of [1e308, 1, 1e-300, Number.MIN_VALUE]) {
    test(`equal PPS masses remain scale invariant at ${size}`, () => {
        const population = [3, -7, 19, 5].map(y => ({ size, y }));
        const prepared = preparePPSSampling(population, 'size', 2)!;
        expect(prepared.designFrame.systematicProbabilities).toEqual([.5, .5, .5, .5]);
        expect(drawPreparedPPSSample(prepared, () => .25).indices).toEqual([0, 2]);
        expect(drawPreparedPPSSample(prepared, () => .75).indices).toEqual([1, 3]);
        expect(buildPpsStandardErrorContext(population, 'size', 2, field, 0)!.standardErrors.y).toBeCloseTo(6, 10);
    });
}

test('exact threshold comparison distinguishes a true certainty unit from positive residuals lost in rounding', () => {
    for (const scale of [1, Number.MIN_VALUE, 1e307]) {
        const exact = preparePPSSampling([2 * scale, scale, scale].map(size => ({ size })), 'size', 2)!;
        expect(exact.designFrame.certaintyIndices).toEqual([0]);
        expect(exact.designFrame.systematicProbabilities).toEqual([.5, .5]);
    }
    for (const sizes of [[3, 1, 2], [.3, .1, .2], [.6, .2, .4]]) {
        const decimal = preparePPSSampling(sizes.map(size => ({ size })), 'size', 2)!;
        expect(decimal.designFrame.certaintyIndices).toEqual([0]);
        expect(decimal.designFrame.systematicProbabilities[0]).toBeCloseTo(1 / 3, 14);
        expect(decimal.designFrame.systematicProbabilities[1]).toBeCloseTo(2 / 3, 14);
    }
    // Rounded pi would be one for the large units, but neither is truly
    // certain. Reject the unresolved probabilities rather than dropping unit 3.
    expect(preparePPSSampling([1, 1, 1e-20].map(size => ({ size })), 'size', 2)).toBeNull();
    expect(preparePPSSampling([1, 1e-20].map(size => ({ size })), 'size', 1)).toBeNull();
});

test('re-scaling after certainty recovers even masses that initially underflowed', () => {
    const prepared = preparePPSSampling([1e308, Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE].map(size => ({ size })), 'size', 2)!;
    expect(prepared.designFrame.certaintyIndices).toEqual([0]);
    expect(prepared.designFrame.systematicProbabilities).toEqual([1 / 3, 1 / 3, 1 / 3]);
});

test('100000-unit census avoids overflowing totals and variadic argument limits', () => {
    const population = Array.from({ length: 100000 }, (_, y) => ({ size: 1e308, y }));
    const prepared = preparePPSSampling(population, 'size', population.length)!;
    expect(prepared.designFrame.certaintyIndices).toHaveLength(population.length);
    expect(prepared.designFrame.systematicSampleSize).toBe(0);
    expect(buildPpsStandardErrorContext(population, 'size', population.length, field, 0)!.standardErrors.y).toBe(0);
});
