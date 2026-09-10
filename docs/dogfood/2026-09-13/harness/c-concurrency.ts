/**
 * DG-C 失败、并发与时间（C-01…C-06）。
 * 故障由独立代理注入（6501 → 6500）；并发与截止时间直连 6500。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const DIRECT = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const PROXY = process.env.PROXY_URL ?? "http://127.0.0.1:6501";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const [EMP1] = manifest.employees as string[];
const PREFIX = manifest.class1StudentPrefix as string;
const suites: Suite[] = [];

async function setRules(rules: unknown[]) {
  const r = await fetch(`${PROXY}/__fault/rules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
  assert(r.ok, `设置故障规则失败：${r.status}`);
}
async function clearRules() { await setRules([]); }
async function stats(): Promise<Record<string, number>> {
  const r = await fetch(`${PROXY}/__fault/rules`);
  return ((await r.json()) as any).stats ?? {};
}
async function teacher(base = DIRECT) {
  const c = new Client(base);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
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
const VALUES = Array.from({ length: 40 }, (_, i) => ((i * 13) % 40) + 5);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const popVar = (xs: number[]) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; };
function plan(finalSampleSize: number, e = 4) {
  const N = VALUES.length; const sigma2 = popVar(VALUES);
  const z = 1.959963984540054;
  const n0 = (z * z * sigma2) / (e * e);
  return { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0,
    recommendedSize: Math.min(N, Math.ceil((n0 * N) / (N - 1 + n0))), finalSampleSize };
}
async function buildTask(t: Client, name: string, deadline?: string) {
  const data = VALUES.map((y, i) => ({ 记录编号: String(i + 1), y: String(y) }));
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const csv = ["记录编号,y", ...data.map((r) => `${r["记录编号"]},${r.y}`)].join("\n") + "\n";
  const form = new FormData();
  form.append("file", new File([csv], "population.csv", { type: "text/csv" }));
  assert((await t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form })).status === 200, "上传失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [], studyContract: {
      version: 1, researchQuestion: "40 个单位的 y 平均值为多少", targetPopulation: "40 个单位", unitOfAnalysis: "单位",
      target: { kind: "mean", field: "y" } } } } })).status === 200, "映射失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } } } })).status === 200, "策略失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } })).status === 200, "权重失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } })).status === 200, "发布失败");
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [manifest.class1], ...(deadline ? { deadline } : {}) } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId);
  assert(created, "未找到任务");
  return { topicId, taskId: Number(created.id) };
}
/** 取一个学生并完成阶段 1，返回可继续操作的上下文。 */
async function studentAtStage2(taskId: number, index: number, base = DIRECT) {
  const studentId = `${PREFIX}${String(index).padStart(3, "0")}`;
  const c = new Client(base);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: Number(exp.body.data.version), questionnaire: questionnaire(`DGC-${studentId}`) } });
  assert(r.status === 200, `阶段1失败：${excerpt(r.body)}`);
  return { client: c, studentId, version: Number(r.body.data.version), experimentId: Number(exp.body.data.id) };
}

const t = await teacher();
// 教师侧的故障注入同样必须经过代理；会话 Cookie 绑定到 127.0.0.1，与端口无关
const tProxy = new Client(PROXY);
tProxy.jar = t.jar;
await clearRules();

// ================================================================ C-01 5xx 注入
{
  const s = new Suite("DG-C-01");
  const built = await buildTask(t, `DGC01-${Date.now()}`);

  // 阶段保存
  {
    const stu = await studentAtStage2(built.taskId, 1, PROXY);
    await setRules([{ id: "stage1", method: "POST", pathIncludes: `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, action: { type: "status", status: 500, code: "INTERNAL_ERROR", message: "注入" } }]);
    // 先推进到阶段 2 之前（阶段 1 已完成），注入阶段 2 的 500
    const failed = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: stu.version, samplePlan: plan(10) } });
    const st = await stats();
    const after = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
    s.check("阶段保存注入 500 返回失败", failed.status === 500, `HTTP ${failed.status}`);
    s.check("注入规则命中一次", st["stage1"] === 1, JSON.stringify(st));
    s.check("失败后版本未前进（无半写）", Number(after.body.data.version) === stu.version, `${stu.version} -> ${after.body.data.version}`);
    s.check("失败后 currentStage 未前进", Number(after.body.data.currentStage) === 2, String(after.body.data.currentStage));
    await clearRules();
    const retry = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: stu.version, samplePlan: plan(10) } });
    s.check("清除故障后重试成功且版本只前进一次", retry.status === 200 && Number(retry.body.data.version) === stu.version + 1, `HTTP ${retry.status} v=${retry.body?.data?.version}`);
    if (retry.status === 200) {
      // 抽样 500
      const v2 = Number(retry.body.data.version);
      await setRules([{ id: "sampling", method: "POST", pathIncludes: `/api/student/tasks/${built.taskId}/sampling`, action: { type: "status", status: 500, code: "INTERNAL_ERROR", message: "注入" } }]);
      const smpFail = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 9 } } });
      const st2 = await stats();
      const expAfter = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
      s.check("抽样注入 500 返回失败", smpFail.status === 500, `HTTP ${smpFail.status}`);
      s.check("抽样故障命中一次", st2["sampling"] === 1, JSON.stringify(st2));
      s.check("失败后未写入抽样结果", !expAfter.body.data.samplingResults?.simple, JSON.stringify(expAfter.body.data.samplingResults ?? {}).slice(0, 80));
      await clearRules();
      const smpOk = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 9 } } });
      s.check("清除故障后抽样重试成功", smpOk.status === 200, `HTTP ${smpOk.status} ${excerpt(smpOk.body?.error)}`);
      void v2;
    }
  }

  // 评分 500
  {
    const stu = await studentAtStage2(built.taskId, 2, PROXY);
    const p = plan(10);
    let r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: stu.version, samplePlan: p } });
    assert(r.status === 200, `阶段2失败：${excerpt(r.body)}`);
    let v = Number(r.body.data.version);
    assert((await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 5 } } })).status === 200, "SRS");
    assert((await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "systematic", params: { seed: 5 } } })).status === 200, "SYS");
    r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
    assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
    v = Number(r.body.data.version);
    r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/4/complete`, { json: { observedVersion: v, reportContent: `<p>${"字".repeat(150)}</p>` } });
    assert(r.status === 200, `阶段4失败：${excerpt(r.body)}`);
    v = Number(r.body.data.version);
    assert((await stu.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } })).status === 200, "提交");
    const detail = await tProxy.call("GET", `/api/teacher/grading/${stu.experimentId}`);
    const dv = Number(detail.body?.data?.version ?? detail.body?.data?.experiment?.version);
    await setRules([{ id: "grade", method: "POST", pathIncludes: `/api/teacher/grading/${stu.experimentId}`, action: { type: "status", status: 500, code: "INTERNAL_ERROR", message: "注入" } }]);
    const gradeFail = await tProxy.call("POST", `/api/teacher/grading/${stu.experimentId}`, { json: { observedVersion: dv, scoreQuestionnaire: 80, scoreProcess: 80, scoreReport: 80, comment: "注入" } });
    const st3 = await stats();
    const sub = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/submission`);
    s.check("评分注入 500 返回失败", gradeFail.status === 500, `HTTP ${gradeFail.status}`);
    s.check("评分故障命中一次", st3["grade"] === 1, JSON.stringify(st3));
    s.check("失败后未写入分数", sub.body?.data?.totalScore === null || sub.body?.data?.totalScore === undefined, `totalScore=${sub.body?.data?.totalScore}`);
    await clearRules();
    const gradeOk = await tProxy.call("POST", `/api/teacher/grading/${stu.experimentId}`, { json: { observedVersion: dv, scoreQuestionnaire: 80, scoreProcess: 80, scoreReport: 80, comment: "重试" } });
    s.check("清除故障后评分重试成功", gradeOk.status === 200, `HTTP ${gradeOk.status} ${excerpt(gradeOk.body?.error)}`);
  }
  suites.push(s);
}

// ================================================================ C-02 响应丢失
{
  const s = new Suite("DG-C-02");
  const built = await buildTask(t, `DGC02-${Date.now()}`);
  const stu = await studentAtStage2(built.taskId, 3, PROXY);
  const p = plan(10);
  let r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: stu.version, samplePlan: p } });
  assert(r.status === 200, `阶段2失败：${excerpt(r.body)}`);
  let v = Number(r.body.data.version);
  assert((await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 3 } } })).status === 200, "SRS");
  assert((await stu.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "systematic", params: { seed: 3 } } })).status === 200, "SYS");
  r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
  assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/4/complete`, { json: { observedVersion: v, reportContent: `<p>${"字".repeat(150)}</p>` } });
  assert(r.status === 200, `阶段4失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);

  // 上游真实提交，客户端只拿到 502
  await setRules([{ id: "submit-lost", method: "POST", pathIncludes: `/api/student/tasks/${built.taskId}/submit`, action: { type: "forwardThenFail", status: 502, code: "GATEWAY_ERROR", message: "网关在响应返回前中断" } }]);
  const lost = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } });
  s.check("客户端只看到 502（无法判断是否已提交）", lost.status === 502, `HTTP ${lost.status} ${excerpt(lost.body?.error)}`);
  const after = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s.check("服务端其实已提交", after.body.data.status === "submitted", String(after.body.data.status));
  const submittedAt = after.body.data.submittedAt;

  await clearRules();
  const retry = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } });
  s.check("重试幂等成功", retry.status === 200, `HTTP ${retry.status} ${excerpt(retry.body)}`);
  const after2 = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s.check("重试未改写提交时间", after2.body.data.submittedAt === submittedAt, `${submittedAt} -> ${after2.body.data.submittedAt}`);
  s.check("学生端仍只有一份提交", after2.body.data.status === "submitted", String(after2.body.data.status));
  suites.push(s);
}

// ================================================================ C-03/C-04/C-05 并发
{
  const built = await buildTask(t, `DGC03-${Date.now()}`);
  // C-04 并发阶段完成
  const a = await studentAtStage2(built.taskId, 4);
  const [r1, r2] = await Promise.all([
    a.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: a.version, samplePlan: plan(10) } }),
    a.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: a.version, samplePlan: plan(10) } }),
  ]);
  const s4 = new Suite("DG-C-04");
  const ok4 = [r1, r2].filter((r) => r.status === 200).length;
  const conflict4 = [r1, r2].filter((r) => r.status === 409).length;
  s4.check("并发阶段完成恰好一个成功、一个 409", ok4 === 1 && conflict4 === 1, `(${r1.status},${r2.status})`);
  const exp4 = await a.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s4.check("版本只前进一次", Number(exp4.body.data.version) === a.version + 1, `${a.version} -> ${exp4.body.data.version}`);
  s4.check("阶段 2 只被完成一次", Number(exp4.body.data.currentStage) === 3, String(exp4.body.data.currentStage));
  suites.push(s4);

  // C-05 并发同方法抽样
  const s5 = new Suite("DG-C-05");
  const [p1, p2] = await Promise.all([
    a.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 101 } } }),
    a.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 202 } } }),
  ]);
  const ok5 = [p1, p2].filter((r) => r.status === 200).length;
  s5.check("并发同方法抽样至少一个成功且无 5xx", ok5 >= 1 && [p1, p2].every((r) => r.status < 500), `(${p1.status},${p2.status})`);
  const exp5 = await a.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s5.check("最终只保留一个 simple 结果", Boolean(exp5.body.data.samplingResults?.simple), JSON.stringify(Object.keys(exp5.body.data.samplingResults ?? {})));
  suites.push(s5);

  // C-03 并发提交
  const b = await studentAtStage2(built.taskId, 5);
  let r = await b.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: b.version, samplePlan: plan(10) } });
  let v = Number(r.body.data.version);
  assert((await b.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 7 } } })).status === 200, "SRS");
  assert((await b.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "systematic", params: { seed: 7 } } })).status === 200, "SYS");
  r = await b.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
  assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await b.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/4/complete`, { json: { observedVersion: v, reportContent: `<p>${"字".repeat(150)}</p>` } });
  assert(r.status === 200, `阶段4失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  const s3 = new Suite("DG-C-03");
  const [c1, c2] = await Promise.all([
    b.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } }),
    b.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } }),
  ]);
  const ok3 = [c1, c2].filter((x) => x.status === 200 || x.status === 201).length;
  s3.check("并发提交恰好一个成功且无 5xx", ok3 === 1 && [c1, c2].every((x) => x.status < 500), `(${c1.status},${c2.status})`);
  const exp3 = await b.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s3.check("提交后状态为 submitted", exp3.body.data.status === "submitted", String(exp3.body.data.status));
  suites.push(s3);
}

// ================================================================ C-06 截止时间
{
  const s = new Suite("DG-C-06");
  // 短窗口任务：1.5 秒后截止
  const built = await buildTask(t, `DGC06-${Date.now()}`, new Date(Date.now() + 1500).toISOString());
  const stu = await studentAtStage2(built.taskId, 6);
  await Bun.sleep(2600);
  const lateWrite = await stu.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: stu.version, samplePlan: plan(10) } });
  s.check("截止后新发起的写入被拒", lateWrite.status === 409 || lateWrite.status === 400, `HTTP ${lateWrite.status} ${excerpt(lateWrite.body?.error?.code, 40)}`);
  s.check("拒绝原因指向截止", /DEADLINE|截止/.test(JSON.stringify(lateWrite.body?.error ?? {})), excerpt(lateWrite.body?.error, 80));
  const after = await stu.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  s.check("被拒写入未修改实验", Number(after.body.data.version) === stu.version, `${stu.version} -> ${after.body.data.version}`);

  // 并发延长不退步
  const later1 = new Date(Date.now() + 3600_000).toISOString();
  const later2 = new Date(Date.now() + 7200_000).toISOString();
  const [e1, e2] = await Promise.all([
    t.call("PUT", `/api/teacher/tasks/${built.taskId}/extend`, { json: { deadline: later1 } }),
    t.call("PUT", `/api/teacher/tasks/${built.taskId}/extend`, { json: { deadline: later2 } }),
  ]);
  const exOk = [e1, e2].filter((r) => r.status === 200).length;
  s.check("并发延长至少一个成功", exOk >= 1, `(${e1.status},${e2.status})`);
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const row = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.id) === built.taskId);
  const finalDeadline = new Date(row?.deadline).getTime();
  s.check("并发延长后截止时间不倒退", finalDeadline >= new Date(later1).getTime(), `final=${row?.deadline}`);
  if (exOk === 2) s.check("两者都成功时取较晚者", finalDeadline === new Date(later2).getTime(), `final=${row?.deadline}`);
  suites.push(s);
}

await clearRules();
await writeSuites(process.env.OUT ?? "evidence/dg/results/C.json", suites);
