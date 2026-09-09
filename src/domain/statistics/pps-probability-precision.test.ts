import { expect, test } from 'bun:test';
import { preparePPSSampling } from './sampling';
import { buildPpsStandardErrorContext } from './pps';
import { executeSamplingAction } from '../../student/experiment/sampling-service';

const fields = [{ key: 'y', accessor: (row: Record<string, unknown>) => Number(row.y) }];
for (const position of [0, 1, 2]) {
    test(`rejects severe normalization error in positive subnormal pi at position ${position}`, async () => {
        const population = Array.from({ length: 3 }, (_, i) => ({ size: i === position ? 8e-16 : 1e308, y: i === position ? 1e154 : 0 }));
        // True pi is approximately 4e-324 and SE 2e-8. Rounding pi to
        // Number.MIN_VALUE would produce SE 2.222758749e-8 (11.14% error).
        expect(preparePPSSampling(population, 'size', 1)).toBeNull();
        expect(buildPpsStandardErrorContext(population, 'size', 1, fields, 0)).toBeNull();
        const result = await executeSamplingAction({ method: 'pps', population, targetSampleSize: 1, rawParams: { sizeField: 'size', sampleSize: 1, seed: 7 }, fieldMapping: { numeric: ['y', 'size'] } });
        expect(result.ok).toBe(false);
    });
}

test('checks probability multiplication separately from exact size normalization', () => {
    // Dividing by max=1 is exact, but multiplying 3*MIN_VALUE by .5
    // incurs a one-third relative error despite returning a positive value.
    const population = [3 * Number.MIN_VALUE, 1, 1].map(size => ({ size, y: 1 }));
    expect(preparePPSSampling(population, 'size', 1)).toBeNull();
});

test('retains accurately representable subnormal probabilities', () => {
    const population = [4 * Number.MIN_VALUE, 1, 1].map((size, i) => ({ size, y: i === 0 ? 1 : 0 }));
    const prepared = preparePPSSampling(population, 'size', 1)!;
    expect(prepared.designFrame.systematicProbabilities[0]).toBe(2 * Number.MIN_VALUE);
    const se = buildPpsStandardErrorContext(population, 'size', 1, fields, 0)!.standardErrors.y!;
    expect(Math.abs(se / Math.sqrt(2 * Number.MIN_VALUE) - 1)).toBeLessThan(1e-10);
});
