// SUT adapter + comparisons. Expected values come from the independent oracle,
// exhaustive enumeration, or explicit textbook formulae, never production helpers.
import { ppsOracle, combinations, allocations } from '../docs/dogfood/2026-09-10/oracles';
import { preparePPSSampling, drawPreparedPPSSample, performSystematicSampling } from '../src/domain/statistics/sampling';
import { buildPpsStandardErrorContext, estimateWeightedMean } from '../src/domain/statistics/pps';
import { computeSimpleRandomValueSe } from '../src/domain/statistics/srs';
import { computeSystematicExactMeanSe } from '../src/domain/statistics/systematic';
import { allocateNeymanSampleCounts, allocateStratifiedSampleCounts } from '../src/student/components/stratified-allocation';
import { applyDesignAdjustments, calculateSampleSizeMetrics } from '../src/student/experiment/sample-plan';
import { executeSamplingAction } from '../src/student/experiment/sampling-service';

const output = Bun.argv[2] ?? 'test-results/dogfood-boundaries/results.json';
const checks: Array<{ id: string; pass: boolean; actual: unknown; expected: unknown }> = [];
const close = (a: unknown, b: number) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= Math.max(1e-10, 1e-8 * Math.abs(b));
function check(id: string, pass: boolean, actual: unknown, expected: unknown) { checks.push({ id, pass, actual, expected }); }
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0), mean = (a: number[]) => sum(a) / a.length;
const ppsDetails: unknown[] = [];
const fixtures = [
    { id: 'equal', sizes: [1n, 1n, 1n, 1n], n: 2 },
    { id: 'certainty', sizes: [1000n, 10n, 5n, 2n, 1n], n: 2 },
    { id: 'cascading-certainty', sizes: [1000n, 300n, 20n, 10n, 5n], n: 3 },
    { id: 'census', sizes: [1000n, 10n, 5n, 2n], n: 4 },
    { id: 'single', sizes: [1n, 2n, 3n, 4n], n: 1 },
    { id: 'lost-residual', sizes: [10000000000000000n, 1n, 1n, 1n], n: 2 },
    { id: 'huge-equal', sizes: [1n, 1n, 1n, 1n], n: 2, scale: 1e308 },
    { id: 'tiny-equal', sizes: [1n, 1n, 1n, 1n], n: 2, scale: 1e-300 },
    { id: 'near-certainty', sizes: [10000000000n, 1n, 1n], values: [0n, 10000000000n, -10000000000n], n: 1 },
];
for (const fixture of fixtures) {
    const values = fixture.values ?? fixture.sizes.map((_, i) => BigInt([3, -7, 19, 5, -2][i]!));
    const oracle = ppsOracle(fixture.sizes, values, fixture.n);
    const population = fixture.sizes.map((s, i) => ({ id: i, mos: Number(s) * (fixture.scale ?? 1), y: Number(values[i]) }));
    const prepared = preparePPSSampling(population, 'mos', fixture.n);
    const context = buildPpsStandardErrorContext(population, 'mos', fixture.n, [{ key: 'y', accessor: row => Number(row.y) }], 0);
    const service = await executeSamplingAction({ method: 'pps', population, targetSampleSize: fixture.n, rawParams: { sampleSize: fixture.n, sizeField: 'mos', seed: 7 }, fieldMapping: { numeric: ['y', 'mos'], analysisTarget: { kind: 'mean', field: 'y' } } });
    check(`R2-05/${fixture.id}/service-cardinality`, service.ok && service.result.sampleCount === fixture.n, service, { ok: true, sampleCount: fixture.n });
    check(`R2-06/${fixture.id}/design-SE`, close(context?.standardErrors.y, oracle.se), context?.standardErrors.y ?? null, oracle.se);
    const outcomes: unknown[] = [];
    if (prepared) for (const outcome of oracle.outcomes) {
        const draw = drawPreparedPPSSample(prepared, () => outcome.start.number());
        const actual = { ids: draw.indices, pi: draw.inclusionProbabilities, estimate: estimateWeightedMean(draw.data, 'y', draw.inclusionProbabilities) };
        const expected = { ids: outcome.selected, pi: outcome.selected.map(i => oracle.pi[i]!.number()), estimate: outcome.estimate.number() };
        const pass = JSON.stringify(actual.ids) === JSON.stringify(expected.ids) && actual.pi.every((p, i) => close(p, expected.pi[i]!)) && close(actual.estimate, expected.estimate);
        outcomes.push({ start: outcome.start.toString(), width: outcome.width.toString(), actual, expected, pass });
    }
    check(`R2-05/${fixture.id}/all-start-intervals`, !!prepared && outcomes.every((o: any) => o.pass), outcomes, 'Exact sample IDs, pi and Hajek mean in every independently derived interval');
    ppsDetails.push({ fixture, exactPi: oracle.pi.map(p => p.toString()), expectation: oracle.expectation.toString(), variance: oracle.variance.toString(), standardError: oracle.se, certainty: oracle.certainty, prepared: prepared?.designFrame, service, outcomes });
}
for (const invalid of [0, -1, null, '', NaN, Infinity]) {
    const result = await executeSamplingAction({ method: 'pps', targetSampleSize: 2, rawParams: { sizeField: 'mos', sampleSize: 2 }, population: [{ mos: 1, y: 2 }, { mos: invalid, y: 3 }, { mos: 2, y: 4 }], fieldMapping: { numeric: ['y', 'mos'] } });
    check(`R2-08/invalid-MOS/${String(invalid)}`, !result.ok, result, 'reject invalid scale');
}
for (let N = 2; N <= 9; N++) for (let n = 1; n <= N; n++) {
    const values = Array.from({ length: N }, (_, i) => (i % 3 === 0 ? 15 : -3) + i), population = values.map(y => ({ y }));
    const estimates = combinations(N, n).map(ids => mean(ids.map(i => values[i]!)));
    const expectation = mean(estimates), se = Math.sqrt(mean(estimates.map(y => (y - expectation) ** 2)));
    const variance = sum(values.map(v => (v - mean(values)) ** 2)) / (N - 1);
    check(`R2-03/SRS/${N}/${n}`, close(expectation, mean(values)) && close(computeSimpleRandomValueSe(variance, N, n), se), { expectation, se: computeSimpleRandomValueSe(variance, N, n) }, { expectation: mean(values), se });
    const boundaries = new Set([0, N]); for (let j = 0; j < n; j++) for (let k = 0; k <= N; k++) { const b = k * n - j * N; if (b > 0 && b < N) boundaries.add(b); }
    const points = [...boundaries].sort((a, b) => a - b);
    const intervals = points.slice(1).map((hi, i) => { const lo = points[i]!, t = (lo + hi) / 2; const ids = Array.from({ length: n }, (_, j) => Math.floor((t + j * N) / n)); const draw = performSystematicSampling(population, n, () => t / N); return { weight: (hi - lo) / N, estimate: mean(ids.map(k => values[k]!)), valid: JSON.stringify(ids) === JSON.stringify(draw.indices) && new Set(draw.indices).size === n }; });
    const expected = sum(intervals.map(o => o.weight * o.estimate)); const exactSe = Math.sqrt(sum(intervals.map(o => o.weight * (o.estimate - expected) ** 2)));
    const actual = computeSystematicExactMeanSe(population, 'y', { completed: true, sampleCount: n, interval: N / n } as any);
    check(`R2-04/systematic/${N}/${n}`, intervals.every(o => o.valid) && close(actual, exactSe) && close(expected, mean(values)), actual, exactSe);
}
for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 4; c++) {
    const caps = [a, b, c];
    for (const std of [[0, 0, 0], [1, 2, 3], [0, 3, 1], [5, 1, 0]]) for (let n = 3; n <= sum(caps); n++) {
        const possibilities = allocations(caps, n), objective = (x: number[]) => sum(x.map((v, i) => caps[i]! ** 2 * std[i]! ** 2 / v));
        const optimum = Math.min(...possibilities.map(objective)); const actual = allocateNeymanSampleCounts({ targetSampleSize: n, populationCounts: caps, stdDevs: std });
        check(`R2-07/neyman/${caps}/${std}/${n}`, !!actual && sum(actual) === n && actual.every((v, i) => v >= 1 && v <= caps[i]! && Number.isInteger(v)) && close(objective(actual), optimum), actual, { optimum });
    }
}
for (const f of [
    { name: 'proportional', caps: [1, 9, 90], weights: [1, 9, 90], n: 20, expected: [1, 2, 17] },
    { name: 'equal-capacity-spill', caps: [1, 4, 95], weights: [1, 1, 1], n: 10, expected: [1, 4, 5] },
    { name: 'zero-weight', caps: [3, 4, 20], weights: [0, 1, 3], n: 15, expected: [1, 3, 11] },
    { name: 'census', caps: [1, 4, 95], weights: [1, 1, 1], n: 100, expected: [1, 4, 95] },
    { name: 'minimum-contract', caps: [1, 4, 95], weights: [1, 1, 1], n: 2, expected: [1, 1, 1] },
]) { const actual = allocateStratifiedSampleCounts({ targetSampleSize: f.n, rawCounts: f.weights, caps: f.caps }); check(`R2-07/${f.name}`, JSON.stringify(actual) === JSON.stringify(f.expected), actual, f.expected); }
for (const N of [10, 1000, 100000]) for (const deff of [.5, 1, 2, 5]) for (const nrr of [0, .2, .8]) for (const n0 of [.1, 25, 384.16, 10000]) {
    const d = n0 * deff, f = N / (1 + (N - 1) / d), invitation = f / (1 - nrr), n = Math.min(N, Math.ceil(invitation));
    const actual = applyDesignAdjustments(n0, N, deff, nrr);
    check(`R2-01/adjust/${N}/${deff}/${nrr}/${n0}`, actual.nInvite === n && close(actual.nFpcRaw, f) && close(actual.expectedCompleted, n * (1 - nrr)) && actual.cappedAtPopulation === (invitation > N), actual, { invitation: n, completed: n * (1 - nrr), corrected: f });
}
for (const [confidenceLevel, z] of [['90', 1.645], ['95', 1.96], ['99', 2.576]] as const) for (const p of [.01, .5, .99]) for (const nrr of [0, .8]) {
    const N = 100, deff = 2, e = .05, d = z ** 2 * p * (1 - p) / e ** 2 * deff, completed = Math.min(N, Math.ceil((N / (1 + (N - 1) / d)) / (1 - nrr))) * (1 - nrr);
    const se = Math.sqrt(deff * p * (1 - p) / completed * (N - completed) / (N - 1));
    const actual = calculateSampleSizeMetrics({ confidenceLevel, marginOfError: e, populationSize: N, designEffect: deff, nonResponseRate: nrr, p });
    check(`R2-01/proportion/${confidenceLevel}/${p}/${nrr}`, close(actual?.standardError, se) && close(actual?.marginOfError, z * se) && close(actual?.expectedCompleted, completed), actual, { se, margin: z * se, completed });
}
const sourceDiff = Bun.spawnSync(['git', 'diff', 'HEAD', '--', 'src']).stdout;
const result = { commit: Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(), sourceState: sourceDiff.length ? 'uncommitted source changes on base commit' : 'committed source', sourceDiffSha256: sourceDiff.length ? new Bun.CryptoHasher('sha256').update(sourceDiff).digest('hex') : null, testedAt: new Date().toISOString(), scope: 'Pure calculation and sampling service boundary; no HTTP/UI/persistence claims', independentOracle: 'Exact BigInt rationals for PPS; exhaustive SRS and systematic intervals; exhaustive integer Neyman optimization; textbook planning equations', passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass), ppsDetails, checks };
await Bun.write(output, JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? value.toString() : typeof value === 'number' && !Number.isFinite(value) ? String(value) : value, 2) + '\n');
console.log(JSON.stringify({ output, passed: result.passed, failed: result.failed.map(c => c.id) }, null, 2));
if (result.failed.length) process.exitCode = 1;
