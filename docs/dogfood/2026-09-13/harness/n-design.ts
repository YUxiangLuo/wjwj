/**
 * DG-N-03（简单随机设计属性）与 DG-N-04（系统抽样设计属性），
 * 兼做 DG-S-08/S-09（两种抽样方法的行为约束）。
 *
 * 期望值全部来自独立 oracle：闭式无偏方差估计 + 对全部随机起点的完全枚举。
 * 不导入 src/ 下任何计算模块。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const [EMP1] = manifest.employees as string[];
const suites: Suite[] = [];
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** 总体：N=8，取值已选定便于手工核对。 */
const Y = [3, 7, 11, 15, 19, 23, 27, 31];
const N = Y.length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const popVar = (xs: number[]) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; };
const sampleVar = (xs: number[]) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1); };

/**
 * SRSWOR 的**设计层**标准误：使用已知总体方差 σ²（完整虚拟总体场景），
 * 即 V(ȳ) = (σ²/n)·(N-n)/(N-1)。与样本估计方差 s² 的口径不同。
 */
function srsDesignOracle(n: number) {
  const sigma2 = popVar(Y);
  return { estimate: null as number | null, se: Math.sqrt((sigma2 / n) * ((N - n) / (N - 1))), sigma2 };
}
/** 样本估计口径（仅用于对照，不作为期望值）。 */
function srsSampleOracle(sample: number[]) {
  const n = sample.length;
  return { estimate: mean(sample), se: Math.sqrt((1 - n / N) * sampleVar(sample) / n) };
}

/** 系统抽样：对全部 K 个随机起点完全枚举，给出估计量分布与设计标准误。 */
function systematicOracle(n: number) {
  const K = N / n;
  const samples: number[][] = [];
  for (let start = 0; start < K; start += 1) {
    const picked: number[] = [];
    for (let j = 0; j < n; j += 1) picked.push(Y[(start + j * K) % N]!);
    samples.push(picked);
  }
  const estimates = samples.map(mean);
  const E = mean(estimates);
  const variance = mean(estimates.map((e) => (e - E) ** 2));
  return { K, samples, estimates, expectation: E, variance, se: Math.sqrt(variance) };
}

function questionnaire(title: string) {
  const para = (s: string) => `<p>${s.repeat(3)}</p>`;
  return {
    title,
    welcomeText: para("欢迎参加本次调查，请根据实际情况作答。"),
    endingText: para("感谢您的参与，提交后教师会进行复核。"),
    questions: [
      { id: "q1", type: "boolean", content: "您是否使用过该服务？" },
      { id: "q2", type: "single", content: "您的年级是？", options: ["大一", "大二", "大三"] },
      { id: "q3", type: "multiple", content: "您使用过哪些功能？", options: ["查询", "预约", "评价"], minSelect: 1, maxSelect: 3 },
      { id: "q4", type: "scale", content: "总体满意度如何？", scaleMin: 1, scaleMax: 10 },
      { id: "q5", type: "single", content: "您是否愿意再次使用？", options: ["愿意", "不愿意"] },
    ],
  };
}

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}

/** 建一个小总体任务（N=8）。 */
async function buildSmallTask(t: Client, name: string) {
  const rows = Y.map((y, i) => ({ 记录编号: String(i + 1), y: String(y) }));
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const csv = ["记录编号,y", ...rows.map((r) => `${r["记录编号"]},${r.y}`)].join("\n") + "\n";
  const form = new FormData();
  form.append("file", new File([csv], "population.csv", { type: "text/csv" }));
  assert((await t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form })).status === 200, "上传失败");
  const mp = await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [], studyContract: {
      version: 1, researchQuestion: "小总体的 y 均值", targetPopulation: "8 个单位", unitOfAnalysis: "单位",
      target: { kind: "mean", field: "y" } } } },
  });
  assert(mp.status === 200, `映射失败：${excerpt(mp.body)}`);
  const pol = await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } } },
  });
  assert(pol.status === 200, `策略失败：${excerpt(pol.body)}`);
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } })).status === 200, "权重失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } })).status === 200, "发布失败");
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [manifest.class1] } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId);
  assert(created, "未找到任务");
  return { topicId, taskId: Number(created.id) };
}

/** 推进到阶段 2 完成，返回可抽样的客户端。 */
async function readyToSample(taskId: number, prefix: string, index: number, finalSampleSize: number) {
  const studentId = `${prefix}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const v0 = Number(exp.body.data.version);
  const s1 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: v0, questionnaire: questionnaire(`DG设计-${studentId}`) } });
  assert(s1.status === 200, `阶段1失败：${excerpt(s1.body)}`);
  const v1 = Number(s1.body.data.version);
  const sigma2 = popVar(Y);
  // 让服务端告诉我们推荐样本量（用 N-01 已验证过的闭式解直接给值）
  const z = 1.959963984540054;
  const e = 2;
  const n0 = (z * z * sigma2) / (e * e);
  const nde = n0 * 1;
  const recommendedSize = Math.min(N, Math.ceil((nde * N) / (N - 1 + nde)));
  const s2 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
    json: { observedVersion: v1, samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize } },
  });
  assert(s2.status === 200, `阶段2失败：${excerpt(s2.body)}`);
  return { client: c, studentId, version: Number(s2.body.data.version), experimentId: Number(exp.body.data.id) };
}

const t = await teacher();

// ================================================================ DG-N-03 / DG-S-08
{
  const s = new Suite("DG-N-03");
  const built = await buildSmallTask(t, `DG小总体SRS-${Date.now()}`);
  const ready = await readyToSample(built.taskId, manifest.class1StudentPrefix, 20, 3);

  // 样本量必须等于目标量
  const wrongSize = await ready.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 2, seed: 11 } } });
  s.check("S-08 简单随机样本量不等于目标量时被拒", wrongSize.status >= 400, `HTTP ${wrongSize.status} ${excerpt(wrongSize.body?.error)}`);

  const overSize = await ready.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: N + 1, seed: 11 } } });
  s.check("S-08 样本量超过总体规模时被拒", overSize.status >= 400, `HTTP ${overSize.status} ${excerpt(overSize.body?.error)}`);

  const ok = await ready.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 3, seed: 20260910 } } });
  assert(ok.status === 200, `抽样失败：${excerpt(ok.body)}`);
  const rows = ok.body.data.result.data as Array<Record<string, unknown>>;
  const ids = rows.map((r) => Number(r["记录编号"]));
  s.check("S-08 抽样返回的行数等于样本量", rows.length === 3, `rows=${rows.length}`);
  s.check("S-08 入样单位互不重复", new Set(ids).size === ids.length, JSON.stringify(ids));
  s.check("S-08 入样单位均来自总体范围 1..8", ids.every((v) => v >= 1 && v <= N), JSON.stringify(ids));

  const values = rows.map((r) => Number(r.y));
  const design = srsDesignOracle(3);
  const sampleBased = srsSampleOracle(values);
  const analysis = await ready.client.call("GET", `/api/student/tasks/${built.taskId}/analysis-metrics`);
  assert(analysis.status === 200, `分析失败：${excerpt(analysis.body)}`);
  const simpleMethod = analysis.body.data?.target?.methods?.simple ?? {};
  s.check("N-03 简单随机的估计等于样本均值（独立计算）",
    near(Number(simpleMethod.estimate), sampleBased.estimate, 1e-12), `product=${simpleMethod.estimate} oracle=${sampleBased.estimate} sample=${JSON.stringify(values)}`);
  s.check("N-03 简单随机标准误等于设计层闭式解 sqrt((σ²/n)·(N-n)/(N-1))（使用已知总体方差）",
    near(Number(simpleMethod.standardError), design.se, 1e-9),
    `product=${simpleMethod.standardError} designOracle=${design.se} sigma2=${design.sigma2}`);
  s.check("N-03 该标准误不是样本估计口径（两类口径在本样本下应当不同）",
    !near(design.se, sampleBased.se, 1e-6), `design=${design.se} sampleBased=${sampleBased.se}`);
  s.check("N-03 样本量回显为实际入样量", Number(simpleMethod.sampleSize) === 3, String(simpleMethod.sampleSize));

  // 重新抽样替换而非追加
  const again = await ready.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 3, seed: 777 } } });
  assert(again.status === 200, `重抽失败：${excerpt(again.body)}`);
  const expAfter = await ready.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  const storedSimple = expAfter.body.data.samplingResults?.simple;
  s.check("S-08 重新抽样替换既有结果而非追加", Number(storedSimple?.seed) === 777, `seed=${storedSimple?.seed}`);
  s.check("S-08 替换后仍只有一个 simple 结果", Array.isArray(storedSimple?.data) && storedSimple.data.length === 3, `rows=${storedSimple?.data?.length}`);

  // 判别设计层 vs 样本估计口径：换一个样本后
  const analysis2 = await ready.client.call("GET", `/api/student/tasks/${built.taskId}/analysis-metrics`);
  const simple2 = analysis2.body.data?.target?.methods?.simple ?? {};
  const rows2 = (again.body.data.result.data as Array<Record<string, unknown>>).map((r) => Number(r.y));
  s.check("N-03 设计层标准误在不同样本间保持不变", near(Number(simple2.standardError), design.se, 1e-9),
    `se1=${simpleMethod.standardError} se2=${simple2.standardError} rows2=${JSON.stringify(rows2)} oracle=${design.se}`);
  s.check("N-03 估计量随样本变化（与标准误口径不同）", !near(Number(simple2.estimate), Number(simpleMethod.estimate), 1e-9) || JSON.stringify(rows2) === JSON.stringify(values),
    `est1=${simpleMethod.estimate} est2=${simple2.estimate}`);
  s.check("N-03 新样本的估计量等于新样本均值", near(Number(simple2.estimate), mean(rows2), 1e-12), `product=${simple2.estimate} oracle=${mean(rows2)}`);
  suites.push(s);
}

// ================================================================ DG-N-04 / DG-S-09
{
  const s = new Suite("DG-N-04");
  const built = await buildSmallTask(t, `DG小总体SYS-${Date.now()}`);
  const ready = await readyToSample(built.taskId, manifest.class1StudentPrefix, 24, 4);

  const oracle = systematicOracle(4);
  s.check("oracle 自检：K=2 且恰有 2 个随机起点", oracle.K === 2 && oracle.samples.length === 2, JSON.stringify({ K: oracle.K, n: oracle.samples.length }));
  s.check("oracle 自检：起点枚举的样本均值集合为 {15,19}", JSON.stringify([...oracle.estimates].sort((a, b) => a - b)) === JSON.stringify([15, 19]), JSON.stringify(oracle.estimates));

  const ok = await ready.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "systematic", params: { seed: 20260910 } } });
  assert(ok.status === 200, `系统抽样失败：${excerpt(ok.body)}`);
  const rows = ok.body.data.result.data as Array<Record<string, unknown>>;
  const ids = rows.map((r) => Number(r["记录编号"]));
  const values = rows.map((r) => Number(r.y));
  s.check("S-09 系统抽样恰好抽满 n 个且不重复", rows.length === 4 && new Set(ids).size === 4, JSON.stringify(ids));
  s.check("S-09 分数/整数间隔下所选单位与某一个随机起点一致",
    oracle.samples.some((sample) => JSON.stringify(sample) === JSON.stringify(values)), `selected=${JSON.stringify(values)} possible=${JSON.stringify(oracle.samples)}`);
  s.check("S-09 间隔 K 回显为 N/n", Number(ok.body.data.result.interval) === oracle.K, `interval=${ok.body.data.result.interval}`);

  const analysis = await ready.client.call("GET", `/api/student/tasks/${built.taskId}/analysis-metrics`);
  assert(analysis.status === 200, `分析失败：${excerpt(analysis.body)}`);
  const sysMethod = analysis.body.data?.target?.methods?.systematic ?? {};
  s.check("N-04 系统抽样的估计等于所选样本均值", near(Number(sysMethod.estimate), mean(values), 1e-12), `product=${sysMethod.estimate} oracle=${mean(values)}`);
  s.check("N-04 系统抽样设计标准误等于对全部随机起点枚举得到的设计标准差",
    near(Number(sysMethod.standardError), oracle.se, 1e-9), `product=${sysMethod.standardError} oracle=${oracle.se} (Var=${oracle.variance})`);
  suites.push(s);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/N-design.json", suites);
