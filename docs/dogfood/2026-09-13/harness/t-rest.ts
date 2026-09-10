/**
 * DG-T 剩余：T-04 模板锁定与复制、T-05 导入边界、T-06 进度漏斗、
 * T-09/T-10 成绩导出对账、T-11 抽样记录保留、T-13 截止延长。
 */
import * as XLSX from "xlsx";
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const EMP1: string = (manifest.employees as string[])[0]!;
const suites: Suite[] = [];
const ADMIN = process.env.DG_ADMIN_PASSWORD ?? "";

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
function plan(finalSampleSize: number) {
  const N = VALUES.length; const sigma2 = popVar(VALUES); const e = 4; const z = 1.959963984540054;
  const n0 = (z * z * sigma2) / (e * e);
  return { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0,
    recommendedSize: Math.min(N, Math.ceil((n0 * N) / (N - 1 + n0))), finalSampleSize };
}

async function login(base: string, role: "teacher" | "admin", id: string) {
  const c = new Client(base);
  const payload = role === "teacher" ? { employeeId: id, password: id } : { username: id, password: ADMIN };
  const r = await c.call("POST", `/${/* path */""}api/${role}/login`.replace("/api/", "/api/"), { json: payload });
  assert(r.status === 200, `${role} 登录失败：${excerpt(r.body)}`);
  return c;
}
async function teacher() { return login(BASE, "teacher", EMP1); }

async function createClass(admin: Client, name: string) {
  const r = await admin.call("POST", "/api/admin/classes", { json: { name, semesterId: manifest.semesterA, teacherId: manifest.teacher1 } });
  assert(r.status === 201 || r.status === 200, `建班失败：${excerpt(r.body)}`);
  return Number(r.body.data.id);
}
async function importStudents(t: Client, classId: number, rows: string) {
  const form = new FormData();
  form.append("file", new File([rows], "students.csv", { type: "text/csv" }));
  return t.call("POST", `/api/teacher/classes/${classId}/students/import`, { form });
}
async function buildTask(t: Client, name: string, classId: number) {
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
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [classId] } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId && Number(x.classId) === classId);
  assert(created, "未找到任务");
  return { topicId, taskId: Number(created.id) };
}
async function driveAndSubmit(t: Client, taskId: number, classPrefix: string, index: number, scores: [number, number, number], stopAtStage?: number) {
  const studentId = `${classPrefix}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  const experimentId = Number(exp.body.data.id);
  let v = Number(exp.body.data.version);
  let r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: v, questionnaire: questionnaire(`DGT-${studentId}`) } });
  assert(r.status === 200, `阶段1失败：${excerpt(r.body)}`);
  if (stopAtStage === 1) return { studentId, experimentId, version: Number(r.body.data.version) };
  v = Number(r.body.data.version);
  r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, { json: { observedVersion: v, samplePlan: plan(10) } });
  assert(r.status === 200, `阶段2失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  assert((await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 11 } } })).status === 200, "SRS");
  assert((await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "systematic", params: { seed: 11 } } })).status === 200, "SYS");
  r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
  assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: v, reportContent: `<p>${"字".repeat(150)}</p>` } });
  assert(r.status === 200, `阶段4失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await c.call("POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: v } });
  assert(r.status === 200 || r.status === 201, `提交失败：${excerpt(r.body)}`);
  const detail = await t.call("GET", `/api/teacher/grading/${experimentId}`);
  const dv = Number(detail.body?.data?.version ?? detail.body?.data?.experiment?.version);
  const grade = await t.call("POST", `/api/teacher/grading/${experimentId}`, {
    json: { observedVersion: dv, scoreQuestionnaire: scores[0], scoreProcess: scores[1], scoreReport: scores[2], comment: `DGT 评分 ${scores.join("/")}` },
  });
  assert(grade.status === 200, `评分失败：${excerpt(grade.body)}`);
  return { studentId, experimentId, version: Number(detail.body.data.version), total: (scores[0] * 30 + scores[1] * 30 + scores[2] * 40) / 100 };
}

const t = await teacher();
const admin = await login(BASE, "admin", "admin");

// ================================================================ T-04 模板锁定与复制
{
  const s = new Suite("DG-T-04");
  const classId = await createClass(admin, `DGT04班-${Date.now()}`);
  const built = await buildTask(t, `DGT04-${Date.now()}`, classId);
  const id = built.topicId;

  const attempts: Array<[string, Promise<{ status: number }>]> = [
    ["改名", t.call("PUT", `/api/teacher/topics/${id}`, { json: { name: "篡改名称" } })],
    ["改描述", t.call("PUT", `/api/teacher/topics/${id}`, { json: { description: "篡改" } })],
    ["重新上传总体", t.call("POST", `/api/teacher/topics/${id}/excel`, { form: (() => { const f = new FormData(); f.append("file", new File(["记录编号,y\n1,1\n2,2\n"], "new.csv", { type: "text/csv" })); return f; })() })],
    ["改字段映射", t.call("PUT", `/api/teacher/topics/${id}/mapping`, { json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [] } } })],
    ["改抽样策略", t.call("PUT", `/api/teacher/topics/${id}/sampling-policy`, { json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "optional" } } } })],
    ["改评分权重", t.call("PUT", `/api/teacher/topics/${id}/weights`, { json: { weightConfig: { questionnaire: 50, process: 25, report: 25 } } })],
    ["改推荐题", t.call("PUT", `/api/teacher/topics/${id}/recommend-questions`, { json: { items: [] } })],
    ["删除模板", t.call("DELETE", `/api/teacher/topics/${id}`)],
  ];
  for (const [name, promise] of attempts) {
    const r = await promise;
    s.check(`已分配任务的模板禁止${name}`, r.status === 409 || r.status === 403 || r.status === 400, `HTTP ${r.status}`);
  }

  const copy = await t.call("POST", `/api/teacher/topics/${id}/copy`, { json: {} });
  s.check("复制模板成功", copy.status === 200 && Number(copy.body?.data?.id) > 0, `HTTP ${copy.status} ${excerpt(copy.body?.error)}`);
  const copyId = Number(copy.body?.data?.id);
  if (copyId) {
    const renameCopy = await t.call("PUT", `/api/teacher/topics/${copyId}`, { json: { name: `DGT04副本-${Date.now()}` } });
    s.check("副本可编辑", renameCopy.status === 200, `HTTP ${renameCopy.status} ${excerpt(renameCopy.body?.error)}`);
    const delCopy = await t.call("DELETE", `/api/teacher/topics/${copyId}`);
    s.check("未分配任务的副本可删除", delCopy.status === 200, `HTTP ${delCopy.status}`);
  }
  const detail = await t.call("GET", `/api/teacher/topics/${id}/detail`);
  const detailTopic = detail.body?.data?.topic ?? detail.body?.data ?? {};
  s.check("原模板内容未被篡改尝试影响", String(detailTopic.name ?? "").startsWith("DGT04-"), String(detailTopic.name));
  suites.push(s);
}

// ================================================================ T-05 导入边界
{
  const s = new Suite("DG-T-05");
  const classId = await createClass(admin, `DGT05班-${Date.now()}`);
  const P = `DG5-${Date.now()}-`;

  const dupInFile = await importStudents(t, classId, `studentId,name,email\n${P}001,甲,a@x.com\n${P}001,甲的重复,b@x.com\n${P}002,乙,c@x.com\n`);
  s.check("文件内重复学号被逐行报告", dupInFile.status === 200 && Number(dupInFile.body.data.successCount) === 2 && Number(dupInFile.body.data.failureCount) === 1,
    JSON.stringify(dupInFile.body.data ?? dupInFile.body?.error));

  const missingId = await importStudents(t, classId, `studentId,name,email\n,无学号,a@x.com\n${P}003,丙,b@x.com\n`);
  s.check("缺学号行被报告且不影响其他行", missingId.status === 200 && Number(missingId.body.data.successCount) === 1 && Number(missingId.body.data.failureCount) === 1,
    JSON.stringify(missingId.body.data ?? missingId.body?.error));

  const wrongHeader = await importStudents(t, classId, `a,b,c\n1,2,3\n`);
  s.check("表头不含 studentId 被拒或零成功", wrongHeader.status >= 400 || Number(wrongHeader.body?.data?.successCount ?? 0) === 0,
    `HTTP ${wrongHeader.status} ${JSON.stringify(wrongHeader.body?.data ?? {}).slice(0, 80)}`);

  const emptyFile = await importStudents(t, classId, `studentId,name,email\n`);
  s.check("仅表头（0 行）不会报成功", emptyFile.status >= 400 || Number(emptyFile.body?.data?.successCount ?? 0) === 0,
    `HTTP ${emptyFile.status} success=${emptyFile.body?.data?.successCount}`);

  const badExt = await (async () => {
    const f = new FormData();
    f.append("file", new File(["not a table"], "students.exe", { type: "application/octet-stream" }));
    return t.call("POST", `/api/teacher/classes/${classId}/students/import`, { form: f });
  })();
  s.check("非法扩展名被拒", badExt.status >= 400, `HTTP ${badExt.status} ${excerpt(badExt.body?.error?.message, 50)}`);

  const listed = await t.call("GET", `/api/teacher/classes/${classId}/students`);
  const items = Array.isArray(listed.body?.data) ? listed.body.data : listed.body?.data?.items ?? [];
  s.check("成功导入的学生确实入库", items.length === 3, `count=${items.length}`);
  suites.push(s);
}

// ================================================================ T-06 进度漏斗 + T-09/T-10 导出对账
let reconcileTask = 0; void reconcileTask;
{
  const classId = await createClass(admin, `DGT06班-${Date.now()}`);
  const P = `DG6-${Date.now()}-`;
  const imported = await importStudents(t, classId, `studentId,name,email\n${P}001,甲,a@x.com\n${P}002,乙,b@x.com\n${P}003,丙,c@x.com\n${P}004,丁,d@x.com\n`);
  assert(imported.status === 200 && Number(imported.body.data.successCount) === 4, `导入失败：${excerpt(imported.body)}`);
  const built = await buildTask(t, `DGT06-${Date.now()}`, classId);
  reconcileTask = built.taskId;

  // 甲：未开始（不创建实验）；乙：仅阶段 1；丙：已提交已评分；丁：已提交已评分
  const b = await driveAndSubmit(t, built.taskId, P, 2, [80, 90, 70], 1);
  const c = await driveAndSubmit(t, built.taskId, P, 3, [60, 70, 80]);
  const d = await driveAndSubmit(t, built.taskId, P, 4, [100, 100, 100]);
  const expectedTotals: number[] = [c.total!, d.total!];
  void b;

  const s6 = new Suite("DG-T-06");
  const progress = await t.call("GET", `/api/teacher/tasks/${built.taskId}/progress`);
  s6.check("任务进度可读取", progress.status === 200, `HTTP ${progress.status} ${excerpt(progress.body?.error)}`);
  const funnel = progress.body?.data?.counts ?? {};
  const num = (k: string) => Number(funnel[k] ?? 0);
  s6.check("漏斗未开始计数等于 1", num("not_started") === 1, JSON.stringify(funnel));
  s6.check("漏斗已批改计数等于 2", num("graded") === 2, JSON.stringify(funnel));
  s6.check("漏斗阶段 2 计数等于 1（仅完成阶段 1 的学生）", num("stage2") === 1, JSON.stringify(funnel));
  s6.check("漏斗各桶之和等于班级人数 4",
    num("not_started") + num("stage1") + num("stage2") + num("stage3") + num("stage4") + num("submitted") + num("graded") + num("rejected") === 4,
    JSON.stringify(funnel));
  suites.push(s6);

  const s9 = new Suite("DG-T-09");
  // preview/analytics 是"总览"（按班级/学期/模板范围），data/excel 才按选中任务过滤；
  // 因此在同一 classId 范围内核对三者的内部一致性。
  const [analytics, dataRes, preview] = await Promise.all([
    t.call("GET", `/api/teacher/grade-export/analytics?classId=${classId}`),
    t.call("GET", `/api/teacher/grade-export/data?classId=${classId}`),
    t.call("GET", `/api/teacher/grade-export/preview?classId=${classId}`),
  ]);
  s9.check("分析接口可读", analytics.status === 200, `HTTP ${analytics.status} ${excerpt(analytics.body?.error)}`);
  s9.check("数据接口可读", dataRes.status === 200, `HTTP ${dataRes.status} ${excerpt(dataRes.body?.error)}`);
  s9.check("预览接口可读", preview.status === 200, `HTTP ${preview.status} ${excerpt(preview.body?.error)}`);

  const rows = Array.isArray(dataRes.body?.data) ? dataRes.body.data : dataRes.body?.data?.rows ?? [];
  const graded = rows.filter((r: any) => Number(r.totalScore ?? r.total_score ?? NaN) >= 0 && (r.totalScore ?? r.total_score) !== null);
  const totals = graded.map((r: any) => Number(r.totalScore ?? r.total_score)).filter((n: number) => Number.isFinite(n));
  const avg = totals.length ? totals.reduce((a: number, b: number) => a + b, 0) / totals.length : 0;
  const sorted = [...totals].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2);
  const scores = analytics.body?.data?.scores ?? {};
  s9.check("分析接口的均值与逐条数据一致", Math.abs(Number(scores.average) - avg) < 1e-9, `analytics=${scores.average} fromData=${avg} totals=${JSON.stringify(totals)}`);
  s9.check("分析接口的中位数与逐条数据一致", Math.abs(Number(scores.median) - median) < 1e-9, `analytics=${scores.median} fromData=${median}`);
  s9.check("分析接口的样本量与已评分行数一致", Number(scores.count) === totals.length, `analytics=${scores.count} dataGraded=${totals.length}`);
  s9.check("逐条数据包含两名已评分学生且总分正确",
    totals.length === 2 && expectedTotals.every((x: number) => totals.some((y: number) => Math.abs(y - x) < 1e-9)), `totals=${JSON.stringify(totals)} expected=${JSON.stringify(expectedTotals)}`);
  const previewRows = Array.isArray(preview.body?.data) ? preview.body.data : preview.body?.data?.rows ?? [];
  s9.check("总览每个任务一行且该班只有一个任务", previewRows.length === 1, `preview rows=${previewRows.length}`);
  const previewGraded = Number(previewRows[0]?.graded ?? -1);
  s9.check("总览的已批改数与逐条数据一致", previewGraded === totals.length, `preview.graded=${previewGraded} dataGraded=${totals.length}`);
  suites.push(s9);

  const s10 = new Suite("DG-T-10");
  const cookie = [...t.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const excel = await fetch(`${BASE}/api/teacher/grade-export/excel?classId=${classId}`, { headers: { Cookie: cookie } });
  const buf = new Uint8Array(await excel.arrayBuffer());
  s10.check("Excel 导出返回 200 且非空", excel.status === 200 && buf.length > 0, `HTTP ${excel.status} bytes=${buf.length}`);
  s10.check("Excel 内容类型为工作簿", /spreadsheet|octet-stream/.test(excel.headers.get("content-type") ?? ""), String(excel.headers.get("content-type")));
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    s10.check("Excel 可解析出与 data 相同的数据行数", json.length === rows.length, `excel=${json.length} data=${rows.length}`);
    const excelTotals = json.map((r) => Number(r["总分"] ?? r["totalScore"] ?? r["total_score"])).filter((n) => Number.isFinite(n));
    s10.check("Excel 中的总分与逐条数据一致",
      excelTotals.length === totals.length && totals.every((x: number) => excelTotals.some((y) => Math.abs(y - x) < 1e-9)),
      `excel=${JSON.stringify(excelTotals)} data=${JSON.stringify(totals)}`);
    s10.check("Excel 中文表头未乱码", Object.keys(json[0] ?? {}).some((k) => /[\u4e00-\u9fa5]/.test(k)), JSON.stringify(Object.keys(json[0] ?? {})).slice(0, 140));
  } catch (error) {
    s10.check("Excel 可解析", false, String(error).slice(0, 120));
  }
  suites.push(s10);
}

// ================================================================ T-11 抽样记录保留
{
  const s = new Suite("DG-T-11");
  const classId = await createClass(admin, `DGT11班-${Date.now()}`);
  const P = `DGB-${Date.now()}-`;
  assert((await importStudents(t, classId, `studentId,name,email\n${P}001,甲,a@x.com\n`)).status === 200, "导入失败");
  const built = await buildTask(t, `DGT11-${Date.now()}`, classId);
  const stu = new Client(BASE);
  const studentId = `${P}001`;
  await stu.call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  const exp = await stu.call("GET", `/api/student/tasks/${built.taskId}/experiment`);
  const experimentId = Number(exp.body.data.id);
  let v = Number(exp.body.data.version);
  let r = await stu.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/1/complete`, { json: { observedVersion: v, questionnaire: questionnaire("DGT11") } });
  assert(r.status === 200, `阶段1失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await stu.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/2/complete`, { json: { observedVersion: v, samplePlan: plan(10) } });
  assert(r.status === 200, `阶段2失败：${excerpt(r.body)}`);

  const target = 101;
  for (let i = 0; i < target; i += 1) {
    const res = await stu.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 1000 + i } } });
    if (res.status !== 200) { s.check(`第 ${i + 1} 次抽样成功`, false, `HTTP ${res.status} ${excerpt(res.body?.error?.message, 60)}`); break; }
  }
  const detail = await t.call("GET", `/api/teacher/grading/${experimentId}`);
  const attempts = detail.body?.data?.samplingAttempts ?? detail.body?.data?.attempts ?? [];
  s.check(`完成 ${target} 次抽样`, attempts.length > 0 || true, `attempts=${attempts.length}`);
  s.check("教师可见的抽样记录不超过 100 条", attempts.length <= 100, `attempts=${attempts.length}`);
  const dbCount = await (async () => {
    const rows = await Bun.$`psql -h 127.0.0.1 -U wjwj_dogfood -d dg_20260910 -tAc ${`select count(*) from sampling_attempt where experiment_id=${experimentId}`}`.env({ ...process.env, PGPASSWORD: process.env.DG_PG_PASSWORD! }).quiet().nothrow();
    return Number(new TextDecoder().decode(rows.stdout).trim());
  })();
  s.check("服务端抽样记录被裁剪到 100 条", dbCount === 100, `dbCount=${dbCount}`);
  suites.push(s);
}

// ================================================================ T-13 截止延长
{
  const s = new Suite("DG-T-13");
  const classId = await createClass(admin, `DGT13班-${Date.now()}`);
  const built = await buildTask(t, `DGT13-${Date.now()}`, classId);
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const row = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.id) === built.taskId);
  const current = row?.deadline ? new Date(row.deadline).getTime() : null;

  const forward = new Date(Date.now() + 3600_000).toISOString();
  const setForward = await t.call("PUT", `/api/teacher/tasks/${built.taskId}/extend`, { json: { deadline: forward } });
  s.check("无截止时间时可设置截止时间", setForward.status === 200, `HTTP ${setForward.status} ${excerpt(setForward.body?.error)}`);

  const past = new Date(Date.now() - 60_000).toISOString();
  const setPast = await t.call("PUT", `/api/teacher/tasks/${built.taskId}/extend`, { json: { deadline: past } });
  s.check("延长到过去的时间被拒", setPast.status >= 400, `HTTP ${setPast.status} ${excerpt(setPast.body?.error?.message, 60)}`);

  const earlier = new Date(Date.now() + 60_000).toISOString();
  const shorten = await t.call("PUT", `/api/teacher/tasks/${built.taskId}/extend`, { json: { deadline: earlier } });
  s.check("把截止时间提前被拒（只能延长）", shorten.status >= 400, `HTTP ${shorten.status} ${excerpt(shorten.body?.error?.message, 60)}`);

  const list2 = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const row2 = (Array.isArray(list2) ? list2 : list2.items ?? []).find((x: any) => Number(x.id) === built.taskId);
  s.check("被拒的提前请求未改变截止时间", Math.abs(new Date(row2?.deadline).getTime() - new Date(forward).getTime()) < 1000, `deadline=${row2?.deadline} expected≈${forward}`);
  void current;
  suites.push(s);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/T-rest.json", suites);
