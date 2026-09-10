/**
 * DG-N 统计与数值：独立 oracle 核对。
 * 本文件**不导入任何 src/ 下的计算模块**；期望值来自教科书闭式解、完全枚举、
 * 或精确区间积分。产品输出通过真实 HTTP 获取。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const ids = await Bun.file("evidence/dg/ids.json").json() as any;
const [EMP1] = manifest.employees as string[];
const suites: Suite[] = [];
const Z: Record<string, number> = { "90": 1.6448536269514722, "95": 1.959963984540054, "99": 2.5758293035489004 };

// ---------------------------------------------------------------- 独立 oracle
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** 总体方差（除以 N），与产品“总体方差”口径一致。 */
function popVar(xs: number[]) { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; }

/** 均值样本量：Cochran n0 → deff → FPC → 无回答 → N 封顶。 */
function oracleMeanSampleSize(o: { N: number; sigma2: number; e: number; deff: number; r: number; cl: string }) {
  const n0 = (Z[o.cl]! ** 2 * o.sigma2) / (o.e * o.e);
  const nde = n0 * o.deff;
  const nfpc = (nde * o.N) / (o.N - 1 + nde);
  const nfinal = nfpc / (1 - o.r);
  return Math.min(o.N, Math.ceil(nfinal));
}
/** 比例样本量：e 以百分点给出，内部转比例。 */
function oraclePropSampleSize(o: { N: number; p: number; e: number; deff: number; r: number; cl: string }) {
  const e = o.e / 100;
  const n0 = (Z[o.cl]! ** 2 * o.p * (1 - o.p)) / (e * e);
  const nde = n0 * o.deff;
  const nfpc = (nde * o.N) / (o.N - 1 + nde);
  const nfinal = nfpc / (1 - o.r);
  return Math.min(o.N, Math.ceil(nfinal));
}

// ---------------------------------------------------------------- 问卷构造
function questionnaire(title: string) {
  const long = (s: string) => `<p>${s.repeat(3)}</p>`; // 保证 >= 20 字
  return {
    title,
    welcomeText: long("欢迎参加本次调查，请根据实际情况作答。"),
    endingText: long("感谢您的参与，提交后教师会进行复核。"),
    questions: [
      { id: "q1", type: "boolean", content: "您是否使用过该服务？" },
      { id: "q2", type: "single", content: "您的年级是？", options: ["大一", "大二", "大三"] },
      { id: "q3", type: "multiple", content: "您使用过哪些功能？", options: ["查询", "预约", "评价"], minSelect: 1, maxSelect: 3 },
      { id: "q4", type: "scale", content: "总体满意度如何？", scaleMin: 1, scaleMax: 10, scaleMinLabel: "很不满意", maxScaleLabel: "很满意" },
      { id: "q5", type: "single", content: "您是否愿意再次使用？", options: ["愿意", "不愿意"] },
    ],
  };
}

async function teacherClient() {
  const c = new Client(BASE);
  const r = await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } });
  assert(r.status === 200, `教师登录失败：${excerpt(r.body)}`);
  return c;
}

/** 建一个已发布的教学任务；返回 topicId/taskId。 */
async function publishTask(t: Client, name: string, rows: Array<Record<string, string>>, policy: unknown, classId: number, mappingExtra: Record<string, unknown> = {}) {
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const cols = Object.keys(rows[0]!);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n") + "\n";
  const form = new FormData();
  form.append("file", new File([csv], "population.csv", { type: "text/csv" }));
  const up = await t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form });
  assert(up.status === 200, `上传失败：${excerpt(up.body)}`);
  const mp = await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, { json: { fieldMapping: mappingExtra } });
  assert(mp.status === 200, `映射失败：${excerpt(mp.body)}`);
  const pol = await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, { json: { samplingPolicy: policy } });
  assert(pol.status === 200, `策略失败：${excerpt(pol.body)}`);
  const w = await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } });
  assert(w.status === 200, `权重失败：${excerpt(w.body)}`);
  const pub = await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } });
  assert(pub.status === 200, `发布失败：${excerpt(pub.body)}`);
  const task = await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [classId] } });
  assert(task.status === 201, `分配失败：${excerpt(task.body)}`);
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId && Number(x.classId) === classId);
  assert(created, "未找到任务");
  return { topicId, taskId: Number(created.id) };
}

// ---------------------------------------------------------------- 学生驱动
/** 取一个班内学生并推进到阶段 2 之前（只完成阶段 1）。 */
async function studentAtStage2(index: number, taskId: number, prefix: string) {
  const studentId = `${prefix}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  const login = await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  assert(login.status === 200, `学生 ${studentId} 登录失败：${excerpt(login.body)}`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const v = Number(exp.body.data.version);
  const r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: v, questionnaire: questionnaire(`DG数值-${studentId}`) } });
  assert(r.status === 200, `阶段1失败：${excerpt(r.body)}`);
  return { client: c, studentId, version: Number(r.body.data.version), experimentId: Number(exp.body.data.id) };
}

/** 反复尝试不同 recommendedSize，找出服务端接受的那个（错误的尝试无副作用）。 */
async function probeRecommendedSize(student: { client: Client; version: number }, taskId: number, plan: Record<string, unknown>, candidates: number[]) {
  let version = student.version;
  for (const candidate of candidates) {
    const r = await student.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
      json: { observedVersion: version, samplePlan: { ...plan, recommendedSize: candidate } },
    });
    if (r.status === 200) return { accepted: candidate, version: Number(r.body.data.version) };
    if (!/建议样本量/.test(String(r.body?.error?.message ?? ""))) {
      return { accepted: null, version, error: `${r.status} ${excerpt(r.body?.error)}` };
    }
  }
  return { accepted: null, version, error: "candidates 均未被接受" };
}

// ---------------------------------------------------------------- N-01 / N-02
if (process.env.DG_ONLY !== "N02") {
  const s = new Suite("DG-N-01");
  // task1：N=120，y = ((i*37)%97)+3
  const y = Array.from({ length: 120 }, (_, i) => ((i * 37) % 97) + 3);
  const sigma2 = popVar(y);
  const N = 120;

  // 先用分析接口核对“我对总体的复现”是否正确，再拿它做 oracle 输入
  const probeStudent = await studentAtStage2(1, ids.task1, manifest.class1StudentPrefix);
  const plan0 = { estimationType: "mean", confidenceLevel: "95", marginOfError: 3, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0, finalSampleSize: 20 };
  const probe0 = await probeRecommendedSize(probeStudent, ids.task1, plan0, [
    oracleMeanSampleSize({ N, sigma2, e: 3, deff: 1, r: 0, cl: "95" }),
  ]);
  s.check("独立复现的总体方差与服务端一致（校验 oracle 输入）", probe0.accepted !== null,
    `oracle=${oracleMeanSampleSize({ N, sigma2, e: 3, deff: 1, r: 0, cl: "95" })} accepted=${probe0.accepted} ${probe0.error ?? ""}`);

  // 多组参数核对
  const combos = [
    { cl: "95", e: 3, deff: 1, r: 0 },
    { cl: "90", e: 3, deff: 1, r: 0 },
    { cl: "99", e: 3, deff: 1, r: 0 },
    { cl: "95", e: 5, deff: 1, r: 0 },
    { cl: "95", e: 3, deff: 2, r: 0 },
    { cl: "95", e: 3, deff: 1, r: 0.2 },
    { cl: "95", e: 1, deff: 1, r: 0 },
    { cl: "95", e: 3, deff: 0.5, r: 0.5 },
  ];
  let idx = 2;
  for (const c of combos) {
    const expected = oracleMeanSampleSize({ N, sigma2, e: c.e, deff: c.deff, r: c.r, cl: c.cl });
    const plan = { estimationType: "mean", confidenceLevel: c.cl, marginOfError: c.e, populationVariance: sigma2, designEffect: c.deff, nonResponseRate: c.r, finalSampleSize: 20 };
    const stu = await studentAtStage2(idx, ids.task1, manifest.class1StudentPrefix);
    idx += 1;
    const got = await probeRecommendedSize(stu, ids.task1, plan, [expected, expected + 1, expected - 1, expected + 2]);
    s.check(`均值样本量 matches 独立闭式解 cl=${c.cl} e=${c.e} deff=${c.deff} r=${c.r}`,
      got.accepted === expected, `oracle=${expected} accepted=${got.accepted} ${got.error ?? ""}`);
  }
  suites.push(s);
}

if (process.env.DG_ONLY !== "N01") {
  const s = new Suite("DG-N-02");
  const t = await teacherClient();
  // 比例总体：200 行，类别“甲”占 30%
  const rows = Array.from({ length: 200 }, (_, i) => ({ 记录编号: String(i + 1), 类别: i % 10 < 3 ? "甲" : "乙", 数值: String(((i * 7) % 50) + 1) }));
  const p = Number(process.env.DG_P ?? 0.5); const N = 200;
  const built = await publishTask(t, `DG比例-${Date.now()}`, rows,
    { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } },
    manifest.class1,
    { identifier: "记录编号", numeric: ["数值"], others: ["类别"], stratified: [], studyContract: {
      version: 1, researchQuestion: "类别为甲的比例", targetPopulation: "200 个单位", unitOfAnalysis: "单位",
      target: { kind: "proportion", field: "类别", value: "甲" } } });

  const combos = [
    { cl: "95", e: 5, deff: 1, r: 0 },
    { cl: "95", e: 3, deff: 1, r: 0 },
    { cl: "90", e: 5, deff: 1.5, r: 0.1 },
    { cl: "99", e: 2, deff: 2, r: 0.3 },
  ];
  let idx = 12;
  for (const c of combos) {
    const expected = oraclePropSampleSize({ N, p, e: c.e, deff: c.deff, r: c.r, cl: c.cl });
    const plan = { estimationType: "proportion", confidenceLevel: c.cl, marginOfError: c.e, designEffect: c.deff, nonResponseRate: c.r, finalSampleSize: 20 };
    const stu = await studentAtStage2(idx, built.taskId, manifest.class1StudentPrefix);
    idx += 1;
    const candidates = Array.from({ length: 9 }, (_, k) => expected - 4 + k).filter((v) => v >= 1 && v <= N);
    const got = await probeRecommendedSize(stu, built.taskId, plan, candidates);
    s.check(`比例样本量 matches 独立闭式解 cl=${c.cl} e=${c.e}% deff=${c.deff} r=${c.r}`,
      got.accepted === expected, `oracle=${expected} accepted=${got.accepted} ${got.error ?? ""}`);
  }
  ids.propTask = built.taskId;
  suites.push(s);
}

// 比例规划的 p 假设由下面的常量集中表达
await Bun.write("evidence/dg/ids.json", JSON.stringify(ids, null, 2));
await writeSuites(process.env.OUT ?? "evidence/dg/results/N-size.json", suites);
