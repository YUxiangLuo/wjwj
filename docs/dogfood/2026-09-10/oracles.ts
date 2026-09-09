// Independent mathematical oracle. Do not import application calculations here.
function gcd(a: bigint, b: bigint): bigint { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a || 1n; }
export class Q {
    n: bigint; d: bigint;
    constructor(n: bigint | number, d: bigint | number = 1n) {
        n = BigInt(n); d = BigInt(d); if (!d) throw Error('zero denominator');
        if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); this.n = n / g; this.d = d / g;
    }
    add(b: Q) { return new Q(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b: Q) { return this.add(new Q(-b.n, b.d)); }
    mul(b: Q) { return new Q(this.n * b.n, this.d * b.d); }
    div(b: Q) { return new Q(this.n * b.d, this.d * b.n); }
    cmp(b: Q) { const delta = this.n * b.d - b.n * this.d; return delta < 0n ? -1 : delta > 0n ? 1 : 0; }
    frac() { return new Q(this.n % this.d, this.d); }
    number() { return Number(this.n) / Number(this.d); }
    toString() { return `${this.n}/${this.d}`; }
}
const zero = new Q(0), one = new Q(1);
const total = (xs: Q[]) => xs.reduce((a, b) => a.add(b), zero);

export function ppsOracle(sizes: bigint[], values: bigint[], n: number) {
    if (sizes.length !== values.length || sizes.some(x => x <= 0n) || n < 1 || n > sizes.length) throw Error('bad oracle fixture');
    // Solve pi=min(1,lambda*size) using exact sorted breakpoints. Re-sum
    // remaining masses exactly rather than subtracting rounded floating totals.
    const sorted = sizes.map((mass, id) => ({ mass, id })).sort((a, b) => a.mass > b.mass ? -1 : a.mass < b.mass ? 1 : 0);
    const pi = sizes.map(() => zero); let remaining = n, cut = 0;
    while (cut < sorted.length) {
        const mass = sorted.slice(cut).reduce((s, x) => s + x.mass, 0n);
        if (BigInt(remaining) * sorted[cut]!.mass < mass) break;
        pi[sorted[cut]!.id] = one; remaining--; cut++;
    }
    const mass = sorted.slice(cut).reduce((s, x) => s + x.mass, 0n);
    for (const item of sorted.slice(cut)) pi[item.id] = new Q(BigInt(remaining) * item.mass, mass);
    if (total(pi).cmp(new Q(n))) throw Error('oracle pi sum');
    const certainty = pi.flatMap((p, i) => p.cmp(one) === 0 ? [i] : []);
    const active = pi.flatMap((p, i) => p.cmp(one) < 0 ? [i] : []);
    const prefix = [zero]; for (const id of active) prefix.push(prefix.at(-1)!.add(pi[id]!));
    const boundaries = [...new Map([zero, one, ...prefix.map(p => p.frac())].map(p => [p.toString(), p])).values()].sort((a, b) => a.cmp(b));
    const outcomes = boundaries.slice(1).map((hi, i) => {
        const lo = boundaries[i]!, start = lo.add(hi).div(new Q(2)), selected = [...certainty];
        for (let j = 0; j < remaining; j++) {
            const threshold = start.add(new Q(j));
            const k = active.findIndex((_, pos) => prefix[pos]!.cmp(threshold) <= 0 && prefix[pos + 1]!.cmp(threshold) > 0);
            if (k < 0) throw Error('oracle interval selection'); selected.push(active[k]!);
        }
        selected.sort((a, b) => a - b);
        if (selected.length !== n || new Set(selected).size !== n) throw Error('oracle sample cardinality');
        const estimate = total(selected.map(id => new Q(values[id]!).div(pi[id]!))).div(total(selected.map(id => one.div(pi[id]!))));
        return { start, width: hi.sub(lo), selected, estimate };
    });
    const expectation = total(outcomes.map(o => o.width.mul(o.estimate)));
    const variance = total(outcomes.map(o => { const d = o.estimate.sub(expectation); return o.width.mul(d.mul(d)); }));
    // Independently verify the distribution really yields the derived pi.
    for (let id = 0; id < pi.length; id++) if (total(outcomes.filter(o => o.selected.includes(id)).map(o => o.width)).cmp(pi[id]!)) throw Error('oracle marginal mismatch');
    return { pi, outcomes, expectation, variance, se: Math.sqrt(variance.number()), certainty };
}

export function combinations(N: number, n: number): number[][] {
    const all: number[][] = [];
    function visit(from: number, picked: number[]) { if (picked.length === n) { all.push(picked); return; } for (let i = from; i <= N - n + picked.length; i++) visit(i + 1, [...picked, i]); }
    visit(0, []); return all;
}
export function allocations(caps: number[], n: number): number[][] {
    const all: number[][] = [];
    function visit(i: number, rest: number, picked: number[]) { if (i === caps.length) { if (!rest) all.push(picked); return; } for (let k = caps[i]! > 0 ? 1 : 0; k <= Math.min(rest, caps[i]!); k++) visit(i + 1, rest - k, [...picked, k]); }
    visit(0, n, []); return all;
}
