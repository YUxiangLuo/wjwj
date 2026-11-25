const HALF_OVERFLOW = 2 ** 1023;

/**
 * Shewchuk adaptive floating-point expansion summation (Hettinger / Python fsum form).
 * Retains exact residuals across arbitrary multi-tier scale cancellations and
 * handles intermediate +/-2^1024 overflow via exact Sterbenz 2^1023 reduction.
 */
export class StableSum {
    private partials: number[] = [];
    private overflowHalfUnits = 0;
    private special = 0;

    add(value: number) {
        if (!Number.isFinite(value)) {
            this.special += value;
            return;
        }
        if (value === 0) return;

        let x = value;
        const partials = this.partials;
        let writeIndex = 0;

        for (let i = 0; i < partials.length; i += 1) {
            let y = partials[i]!;
            if (Math.abs(x) < Math.abs(y)) {
                const tmp = x;
                x = y;
                y = tmp;
            }
            let hi = x + y;
            if (!Number.isFinite(hi)) {
                const sign = x > 0 ? 1 : -1;
                const half = sign * HALF_OVERFLOW;
                // |x| >= |y| and |x + y| >= 2^1024 implies |x| >= 2^1023, so
                // subtracting half is bit-exact by Sterbenz's lemma.
                x -= half;
                this.overflowHalfUnits += sign;
                if (Math.abs(y) >= HALF_OVERFLOW) {
                    y -= half;
                    this.overflowHalfUnits += sign;
                }
                if (Math.abs(x) < Math.abs(y)) {
                    const tmp = x;
                    x = y;
                    y = tmp;
                }
                hi = x + y;
            }
            const lo = y - (hi - x);
            if (lo !== 0) {
                partials[writeIndex] = lo;
                writeIndex += 1;
            }
            x = hi;
        }

        if (x !== 0) {
            partials[writeIndex] = x;
            writeIndex += 1;
        }
        partials.length = writeIndex;
    }

    get value(): number {
        if (this.special !== 0 || Number.isNaN(this.special)) {
            return this.special;
        }

        let partials = this.partials;
        if (this.overflowHalfUnits !== 0) {
            if (Math.abs(this.overflowHalfUnits) >= 4) {
                return this.overflowHalfUnits > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
            }
            partials = [...partials];
            const sign = this.overflowHalfUnits > 0 ? 1 : -1;
            const half = sign * HALF_OVERFLOW;
            const steps = Math.abs(this.overflowHalfUnits);
            for (let step = 0; step < steps; step += 1) {
                let x = half;
                let writeIndex = 0;
                for (let i = 0; i < partials.length; i += 1) {
                    let y = partials[i]!;
                    if (Math.abs(x) < Math.abs(y)) {
                        const tmp = x;
                        x = y;
                        y = tmp;
                    }
                    const hi = x + y;
                    if (!Number.isFinite(hi)) return hi;
                    const lo = y - (hi - x);
                    if (lo !== 0) {
                        partials[writeIndex] = lo;
                        writeIndex += 1;
                    }
                    x = hi;
                }
                if (x !== 0) {
                    partials[writeIndex] = x;
                    writeIndex += 1;
                }
                partials.length = writeIndex;
            }
        }

        let n = partials.length;
        if (n === 0) return 0;

        // Exact round-to-nearest-even summation of non-overlapping partials.
        let hi = partials[n - 1]!;
        let lo = 0;
        while (n > 1) {
            n -= 1;
            let x = hi;
            let y = partials[n - 1]!;
            if (Math.abs(x) < Math.abs(y)) {
                const tmp = x;
                x = y;
                y = tmp;
            }
            hi = x + y;
            lo = y - (hi - x);
            if (lo !== 0) break;
        }
        if (n > 1 && ((lo < 0 && partials[n - 2]! < 0) || (lo > 0 && partials[n - 2]! > 0))) {
            const y = lo * 2;
            const x = hi + y;
            if (y === x - hi) {
                hi = x;
            }
        }
        return hi;
    }
}
