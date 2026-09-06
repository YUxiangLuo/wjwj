/** Preserve nonzero measurements that fixed decimals would hide. */
export function formatStatistic(value: number, digits = 4): string {
    if (!Number.isFinite(value)) return "—";
    if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toExponential(3);
    return value.toFixed(digits);
}
