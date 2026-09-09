import { expect, test } from 'bun:test';
import { preparePPSSampling, drawPreparedPPSSample } from './sampling';
import { buildPpsStandardErrorContext } from './pps';

const fields = [
    { key: 'y', accessor: (row: Record<string, unknown>) => Number(row.y) },
    { key: 'constant', accessor: () => 7 },
];

for (const position of [0, 1, 2]) {
    test(`n=1 checks rare-unit interval representability at position ${position}`, () => {
        const population = Array.from({ length: 3 }, (_, i) => ({
            size: i === position ? 1e-20 : 1,
            y: i === position ? 1e20 : 0,
        }));
        const prepared = preparePPSSampling(population, 'size', 1)!;
        expect(prepared).not.toBeNull();
        expect(prepared.designFrame.systematicProbabilities[position]).toBe(5e-21);
        const context = buildPpsStandardErrorContext(population, 'size', 1, fields, 0)!;
        if (position === 0) {
            // A tiny interval at zero is representable: do not reject all small pi.
            expect(drawPreparedPPSSample(prepared, () => 2.5e-21).indices).toEqual([0]);
            const expected = 1e20 * Math.sqrt(5e-21 * (1 - 5e-21));
            expect(Math.abs(context.standardErrors.y! / expected - 1)).toBeLessThan(1e-10);
            expect(context.standardErrors.constant).toBe(0);
        } else {
            // Adding the tiny pi to .5 or closing the last interval at 1
            // erases its width. The entire design must be unavailable, even
            // for a constant field, rather than certified as exact.
            expect(context.standardErrors).toEqual({ y: null, constant: null });
            for (const start of [0, .49999999999999994, .5, .5000000000000001, .9999999999999999]) {
                expect(drawPreparedPPSSample(prepared, () => start).indices).not.toContain(position);
            }
        }
    });
}

for (const position of [0, 1, 2]) {
    test(`near-certainty n=1 retains accurate nonzero SE with dominant unit at position ${position}`, () => {
        const population = [{ size: 1, y: 1e10 }, { size: 1, y: -1e10 }];
        population.splice(position, 0, { size: 1e10, y: 0 });
        const context = buildPpsStandardErrorContext(population, 'size', 1, fields, 0)!;
        const expected = Math.sqrt(2e20 / (1e10 + 2));
        expect(typeof context.standardErrors.y).toBe('number');
        expect(Math.abs(context.standardErrors.y! / expected - 1)).toBeLessThan(1e-10);
        expect(context.standardErrors.constant).toBe(0);
    });
}
