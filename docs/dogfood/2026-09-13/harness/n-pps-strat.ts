/**
 * DG-N 剩余：N-05/N-06 PPS 包含概率与设计标准误；N-07/N-08 分层分配最优性与溢出回灌。
 *
 * 期望值全部来自独立 oracle：
 *  - PPS：独立解 π=min(1,λ·规模)，并用精确区间积分独立计算 Hájek 估计的设计方差；
 *  - 分层：对小整数穷举全部可行分配，取目标函数最优值作为基准。
 * 生产实现仅作为“被测对象”导入（分层分配在前端模块中，服务端只做校验）。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";
import { allocateNeymanSampleCounts, allocateStratifiedSampleCounts, resolveStratumOverflow } from "@/student/components/stratified-allocation";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const EMP1: string = (manifest.employees as string[])[0]!;
const PREFIX: string = manifest.class1StudentPrefix;
const suites: Suite[] = [];
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---------------------------------------------------------------- 独立 oracle：PPS
/** 解 π=min(1,λ·规模) 使 Σπ=n；返回 π 向量与必入集合。 */
function ppsPi(sizes: number[], n: number) {
  const order = sizes.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  const pi = new Array<number>(sizes.length).fill(0);
  let remaining = n;
  let cut = 0;
  while (cut < order.length) {
    const mass = order.slice(cut).reduce((sum, x) => sum + x.s, 0);
    if (remaining * order[cut]!.s < mass) break;
    pi[order[cut]!.i] = 1;
    remaining -= 1;
    cut += 1;
  }
  const mass = order.slice(cut).reduce((sum, x) => sum + x.s, 0);
  for (const item of order.slice(cut)) pi[item.i] = (remaining * item.s) / mass;
  return { pi, certainty: pi.flatMap((p, i) => (p === 1 ? [i] : [])) };
}

/** 固定 π 系统抽样 + Hájek 估计：对全部随机起点区间精确积分设计方差。 */
function ppsDesignSe(sizes: number[], values: number[], n: number) {
  const { pi, certainty } = ppsPi(sizes, n);
  const active = pi.flatMap((p, i) => (p === 1 ? [] : [i]));
  const prefix: number[] = [0];
  for (const i of active) prefix.push(prefix.at(-1)! + pi[i]!);
  const boundaries = [...new Set([0, ...prefix.map((v) => v % 1), 1])].sort((a, b) => a - b);
  const outcomes: Array<{ width: number; estimate: number }> = [];
  for (let b = 1; b < boundaries.length; b += 1) {
    const lo = boundaries[b - 1]!; const hi = boundaries[b]!;
    const mid = (lo + hi) / 2;
    const selected = [...certainty];
    for (let j = 0; j < n - certainty.length; j += 1) {
      const threshold = mid + j;
      const k = active.findIndex((_, pos) => prefix[pos]! <= threshold && prefix[pos + 1]! > threshold);
      if (k < 0) throw new Error("区间选择失败");
      selected.push(active[k]!);
    }
    const num = selected.reduce((sum, i) => sum + values[i]! / pi[i]!, 0);
    const den = selected.reduce((sum, i) => sum + 1 / pi[i]!, 0);
    outcomes.push({ width: hi - lo, estimate: num / den });
  }
  const totalWidth = outcomes.reduce((s, o) => s + o.width, 0);
  const expectation = outcomes.reduce((s, o) => s + (o.width / totalWidth) * o.estimate, 0);
  const variance = outcomes.reduce((s, o) => s + (o.width / totalWidth) * (o.estimate - expectation) ** 2, 0);
  return { pi, certainty, expectation, variance, se: Math.sqrt(variance) };
}

const questionnaire = (title: string) => ({
  title,
  welcomeText: `<p>${"欢迎参加本次调查。".repeat(3)}</p>`,
  endingText: `<p>${"感谢您的参与。".repeat(3)}</p>`,
  questions: [
    { id: "q1", type: "boolean", content: "题一" },
    { id: "q2", type: "single", content: "题二", options: ["A", "B"] },
    { id: "q3", type: "multiple", content: "题三", options: ["A", "B"], minSelect: 1, maxSelect: 2 },
    { id: "q4", type: "scale", content: "题四", scaleMin: 1, scaleMax: 10 },
    { id: "q5", type: "boolean", content: "题五" },
  ],
});
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const popVar = (xs: number[]) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; };

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}
async function publishTask(t: Client, name: string, rows: Array<Record<string, string>>, policy: unknown, mapping: Record<string, unknown>) {
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const cols = Object.keys(rows[0]!);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n") + "\n";
  const form = new FormData();
  form.append("file", new File([csv], "population.csv", { type: "text/csv" }));
  assert((await t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form })).status === 200, "上传失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, { json: { fieldMapping: mapping } })).status === 200, `映射失败：${excerpt((await t.call("GET", `/api/teacher/topics/${topicId}/detail`)).body)}`);
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, { json: { samplingPolicy: policy } })).status === 200, "策略失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } })).status === 200, "权重失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } })).status === 200, "发布失败");
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [manifest.class1] } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId);
  assert(created, "未找到任务");
  return { topicId, taskId: Number(created.id) };
}
async function readyToSample(taskId: number, index: number, finalSampleSize: number, sigma2: number) {
  const studentId = `${PREFIX}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  const s1 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: Number(exp.body.data.version), questionnaire: questionnaire(`DGN-${studentId}`) } });
  assert(s1.status === 200, `阶段1失败：${excerpt(s1.body)}`);
  const N = 8; const e = 3; const z = 1.959963984540054;
  const n0 = (z * z * sigma2) / (e * e);
  const recommendedSize = Math.min(N, Math.ceil((n0 * N) / (N - 1 + n0)));
  const s2 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
    json: { observedVersion: Number(s1.body.data.version), samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize } },
  });
  assert(s2.status === 200, `阶段2失败：${excerpt(s2.body)}`);
  return { client: c, studentId };
}

const t = await teacher();

// ================================================================ N-05 / N-06 PPS
{
  const sizes = [50, 30, 15, 5, 3, 2, 1, 1];
  const values = [10, 20, 30, 40, 50, 60, 70, 80];
  const rows = sizes.map((s, i) => ({ 记录编号: String(i + 1), y: String(values[i]), 规模: String(s) }));
  const built = await publishTask(t, `DGN05-${Date.now()}`, rows,
    { version: 1, methods: { simple: "required", pps: "required", systematic: "disabled", stratified: "disabled" } },
    { identifier: "记录编号", numeric: ["y", "规模"], others: [], stratified: [], studyContract: {
      version: 1, researchQuestion: "八个单位的 y 平均值为多少", targetPopulation: "8 个单位", unitOfAnalysis: "单位",
      target: { kind: "mean", field: "y" } } });

  const n = 3;
  const oracle = ppsPi(sizes, n);
  const design = ppsDesignSe(sizes, values, n);
  const stu = await readyToSample(built.taskId, 20, n, popVar(values));

  const s5 = new Suite("DG-N-05");
  const smp = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "pps", params: { sizeField: "规模", sampleSize: n, seed: 20260910 } } });
  assert(smp.status === 200, `PPS 抽样失败：${excerpt(smp.body)}`);
  const summary = smp.body.data.result.probabilitySummary ?? {};
  const preview = smp.body.data.result.probabilityPreview ?? [];

  const piSum = oracle.pi.reduce((a, b) => a + b, 0);
  s5.check("oracle 自检：π 之和等于 n", near(piSum, n, 1e-12), `Σπ=${piSum}`);
  s5.check("oracle 自检：本例存在必入单位", oracle.certainty.length > 0, JSON.stringify(oracle.certainty));
  s5.check("服务端报告的总体单位数正确", Number(summary.populationCount) === sizes.length, JSON.stringify(summary));
  s5.check("服务端报告的 π 之和等于 n", near(Number(summary.probabilitySum), n, 1e-9), JSON.stringify(summary));
  s5.check("服务端报告的必入单位数等于 oracle", Number(summary.certaintyUnitCount) === oracle.certainty.length, `product=${summary.certaintyUnitCount} oracle=${oracle.certainty.length}`);
  s5.check("π 上下界与 oracle 一致",
    near(Number(summary.minInclusionProbability), Math.min(...oracle.pi), 1e-9) && near(Number(summary.maxInclusionProbability), Math.max(...oracle.pi), 1e-9),
    `product=[${summary.minInclusionProbability},${summary.maxInclusionProbability}] oracle=[${Math.min(...oracle.pi)},${Math.max(...oracle.pi)}]`);
  const previewOk = preview.every((p: any) => {
    const idx = values.findIndex((v) => v === Number(p.sizeValue));
    void idx;
    const size = Number(p.sizeValue);
    const position = sizes.indexOf(size);
    if (position < 0) return false;
    return near(Number(p.inclusionProbability), oracle.pi[position]!, 1e-9) && near(Number(p.designWeight), 1 / oracle.pi[position]!, 1e-9);
  });
  s5.check("抽样返回的每个 π 与 1/π 权重均与 oracle 一致", preview.length > 0 && previewOk,
    `preview=${JSON.stringify(preview)} oracleπ=${JSON.stringify(oracle.pi.map((x) => Number(x.toFixed(6))))}`);
  suites.push(s5);

  const s6 = new Suite("DG-N-06");
  const analysis = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/analysis-metrics`);
  assert(analysis.status === 200, `分析失败：${excerpt(analysis.body)}`);
  const ppsMethod = analysis.body.data?.target?.methods?.pps ?? {};
  s6.check("PPS 估计量等于所选样本的 Hájek 估计（独立计算）",
    near(Number(ppsMethod.estimate), (() => {
      const sel = preview.map((p: any) => sizes.indexOf(Number(p.sizeValue)));
      const num = sel.reduce((sum: number, i: number) => sum + values[i]! / oracle.pi[i]!, 0);
      const den = sel.reduce((sum: number, i: number) => sum + 1 / oracle.pi[i]!, 0);
      return num / den;
    })(), 1e-9), `product=${ppsMethod.estimate}`);
  s6.check("PPS 设计标准误等于独立区间积分结果",
    near(Number(ppsMethod.standardError), design.se, 1e-9),
    `product=${ppsMethod.standardError} oracle=${design.se} (Var=${design.variance})`);
  s6.check("标准误为正且有限（不是伪零）", Number(ppsMethod.standardError) > 0 && Number.isFinite(Number(ppsMethod.standardError)), String(ppsMethod.standardError));
  suites.push(s6);
}

// ================================================================ N-07 / N-08 分层分配
{
  const s7 = new Suite("DG-N-07");
  // 比例分配：rawCounts 传层规模，caps 传容量，独立最大余数解作为 oracle
  const counts = [50, 30, 20];
  const caps = [50, 30, 20];
  const total = 17;
  const proportional = allocateStratifiedSampleCounts({ targetSampleSize: total, rawCounts: counts, caps });
  const expectedProportional = (() => {
    const N = counts.reduce((a, b) => a + b, 0);
    const raw = counts.map((c) => (c / N) * total);
    const base = raw.map((v) => Math.floor(v));
    let rest = total - base.reduce((a, b) => a + b, 0);
    const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    const out = [...base];
    for (const o of order) { if (rest <= 0) break; out[o.i] = (out[o.i] ?? 0) + 1; rest -= 1; }
    return out;
  })();
  s7.check("比例分配：总和等于 n", proportional.reduce((a, b) => a + b, 0) === total, JSON.stringify(proportional));
  s7.check("比例分配：与按层规模的独立最大余数解一致",
    JSON.stringify(proportional) === JSON.stringify(expectedProportional),
    `product=${JSON.stringify(proportional)} oracle=${JSON.stringify(expectedProportional)}`);
  s7.check("比例分配：每层不超过容量", proportional.every((v, i) => v <= caps[i]!), JSON.stringify(proportional));

  // 奈曼分配：对全部可行整数解穷举，取目标函数最优
  const pops = [6, 5, 4];
  const sd = [3, 2, 1];
  const neymanTotal = 9;
  const neyman = allocateNeymanSampleCounts({ targetSampleSize: neymanTotal, populationCounts: pops, stdDevs: sd });
  s7.check("奈曼分配返回结果", Array.isArray(neyman), JSON.stringify(neyman));
  const objective = (alloc: number[]) => pops.reduce((sum, n, i) => sum + (n ** 2 * sd[i]! ** 2) / alloc[i]!, 0);
  let best = Number.POSITIVE_INFINITY; let bestAlloc: number[] = [];
  const enumerate = (i: number, left: number, acc: number[]) => {
    if (i === pops.length - 1) {
      if (left < 1 || left > pops[i]!) return;
      const alloc = [...acc, left];
      const value = objective(alloc);
      if (value < best) { best = value; bestAlloc = alloc; }
      return;
    }
    const minimumRest = pops.length - 1 - i;
    for (let take = 1; take <= Math.min(left - minimumRest, pops[i]!); take += 1) enumerate(i + 1, left - take, [...acc, take]);
  };
  enumerate(0, neymanTotal, []);
  s7.check("oracle 自检：穷举找到可行最优解", Number.isFinite(best) && bestAlloc.length === pops.length, JSON.stringify(bestAlloc));
  if (neyman) {
    s7.check("奈曼分配：总和等于 n 且每层不超过层容量",
      neyman.reduce((a, b) => a + b, 0) === neymanTotal && neyman.every((v, i) => v >= 0 && v <= pops[i]!),
      JSON.stringify(neyman));
    const neymanValue = objective(neyman);
    s7.check("奈曼分配的目标函数等于穷举最优（整数最优性）",
      Math.abs(neymanValue - best) <= 1e-9 * Math.max(1, best),
      `product=${neymanValue.toFixed(4)} exhaustiveBest=${best.toFixed(4)} alloc=${JSON.stringify(neyman)} bestAlloc=${JSON.stringify(bestAlloc)}`);
  }
  // 零方差层仍保留一个观测；未知方差应被拒
  const withZeroVar = allocateNeymanSampleCounts({ targetSampleSize: 5, populationCounts: [5, 5], stdDevs: [0, 2] });
  s7.check("零方差层保留 1 个观测、剩余名额按方差分配", Array.isArray(withZeroVar) && withZeroVar[0] === 1 && (withZeroVar[0]! + withZeroVar[1]!) === 5, JSON.stringify(withZeroVar));
  const unknownVar = allocateNeymanSampleCounts({ targetSampleSize: 5, populationCounts: [5, 5], stdDevs: [Number.NaN, 2] });
  s7.check("标准差不可用时拒绝奈曼分配", unknownVar === null, JSON.stringify(unknownVar));
  s7.check("目标超过总容量时拒绝", allocateNeymanSampleCounts({ targetSampleSize: 99, populationCounts: [3, 4], stdDevs: [1, 1] }) === null, "over capacity");
  suites.push(s7);

  const s8 = new Suite("DG-N-08");
  // 溢出回灌：A 层请求 5 但只有 2 个单位 → 锁为 2，多余名额分给未满层
  const resolved = resolveStratumOverflow([
    { name: "A", populationSize: 2, sampleSize: 5 },
    { name: "B", populationSize: 10, sampleSize: 3 },
    { name: "C", populationSize: 10, sampleSize: 2 },
  ]);
  const alloc = resolved.allocation;
  s8.check("溢出层被识别", resolved.hasOverAllocation === true && resolved.overAllocatedLayers.includes("A"), JSON.stringify(resolved.overAllocatedLayers));
  s8.check("溢出层被锁为总体容量", alloc.find((x) => x.name === "A")!.sampleCount === 2, JSON.stringify(alloc));
  s8.check("回灌后每层不超过层容量", alloc.every((x) => x.sampleCount <= x.count), JSON.stringify(alloc));
  s8.check("总量能保住时总样本量仍为 10", resolved.adjustedTotalSampleSize === 10, String(resolved.adjustedTotalSampleSize));
  s8.check("各层之和等于 adjustedTotalSampleSize", alloc.reduce((a, b) => a + b.sampleCount, 0) === resolved.adjustedTotalSampleSize, JSON.stringify(alloc));
  // 全部层都满时允许小于原计划
  const allFull = resolveStratumOverflow([
    { name: "A", populationSize: 1, sampleSize: 3 },
    { name: "B", populationSize: 1, sampleSize: 3 },
  ]);
  s8.check("全部层溢出时总量降为容量之和", allFull.adjustedTotalSampleSize === 2, String(allFull.adjustedTotalSampleSize));
  suites.push(s8);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/N-pps-strat.json", suites);
