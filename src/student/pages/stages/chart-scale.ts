export function chartScale(values: number[]) {
    const finite = values.filter(Number.isFinite);
    const min = Math.min(0, ...finite);
    const max = Math.max(0, ...finite);
    if (min === max) return { min: 0, max: 1, range: 1 };
    return { min, max, range: max - min };
}
