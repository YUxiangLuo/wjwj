/**
 * DG-L 数据生命周期与删除：L-01 任务级联、L-02 模板删除边界、L-03 学生删除与重建、
 * L-07 审计事件、L-08 停用 vs 删除的登录行为。
 * 数据库仅做只读计数核对（经 psql），不使用写 SQL 修补。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const EMP1: string = (manifest.employees as string[])[0]!;
const suites: Suite[] = [];
const ADMIN = process.env.DG_ADMIN_PASSWORD ?? "";

async function psql(sql: string) {
  const proc = Bun.spawnSync(["psql", "-h", "127.0.0.1", "-U", "wjwj_dogfood", "-d", "dg_20260910", "-tAc", sql], {
    env: { ...process.env, PGPASSWORD: process.env.DG_PG_PASSWORD ?? "" }, stdout: "pipe", stderr: "pipe",
  });
  return new TextDecoder().decode(proc.stdout).trim();
}
async function n(sql: string) { return Number(await psql(sql)); }

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
const VALUES = Array.from({ length: 30 }, (_, i) => ((i * 13) % 40) + 5);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const popVar = (xs: number[]) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; };
function plan(finalSampleSize: number) {
  const N = VALUES.length; const sigma2 = popVar(VALUES); const e = 4; const z = 1.959963984540054;
  const n0 = (z * z * sigma2) / (e * e);
  return { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0,
    recommendedSize: Math.min(N, Math.ceil((n0 * N) / (N - 1 + n0))), finalSampleSize };
}

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}
async function admin() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/admin/login", { json: { username: "admin", password: ADMIN } })).status === 200, "管理员登录失败");
  return c;
}
async function createClass(a: Client, name: string) {
  const r = await a.call("POST", "/api/admin/classes", { json: { name, semesterId: manifest.semesterA, teacherId: manifest.teacher1 } });
  assert(r.status === 201 || r.status === 200, `建班失败：${excerpt(r.body)}`);
  return Number(r.body.data.id);
}
async function importStudents(t: Client, classId: number, csv: string) {
  const form = new FormData();
  form.append("file", new File([csv], "students.csv", { type: "text/csv" }));
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
      version: 1, researchQuestion: "30 个单位的 y 平均值为多少", targetPopulation: "30 个单位", unitOfAnalysis: "单位",
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
/** 学生完成阶段 1-2 并抽样一次（产生 experiment 与 sampling_attempt 行）。 */
async function studentWork(taskId: number, studentId: string) {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const experimentId = Number(exp.body.data.id);
  const s1 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: Number(exp.body.data.version), questionnaire: questionnaire(`DGL-${studentId}`) } });
  assert(s1.status === 200, `阶段1失败：${excerpt(s1.body)}`);
  const s2 = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, { json: { observedVersion: Number(s1.body.data.version), samplePlan: plan(10) } });
  assert(s2.status === 200, `阶段2失败：${excerpt(s2.body)}`);
  assert((await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 10, seed: 21 } } })).status === 200, "抽样失败");
  return { client: c, studentId, experimentId };
}

const t = await teacher();
const a = await admin();

// ================================================================ L-01 任务级联删除
{
  const s = new Suite("DG-L-01");
  const classKeep = await createClass(a, `DGL01保留班-${Date.now()}`);
  const classDrop = await createClass(a, `DGL01删除班-${Date.now()}`);
  const P = `DGL1-${Date.now()}-`;
  assert((await importStudents(t, classKeep, `studentId,name,email\n${P}001,保留甲,a@x.com\n${P}002,保留乙,b@x.com\n`)).status === 200, "导入失败");
  assert((await importStudents(t, classDrop, `studentId,name,email\n${P}101,删除甲,c@x.com\n${P}102,删除乙,d@x.com\n`)).status === 200, "导入失败");

  const keep = await buildTask(t, `DGL01保留-${Date.now()}`, classKeep);
  const drop = await buildTask(t, `DGL01删除-${Date.now()}`, classDrop);
  const w1 = await studentWork(drop.taskId, `${P}101`);
  await studentWork(drop.taskId, `${P}102`);
  await studentWork(keep.taskId, `${P}001`);

  const beforeExperiments = await n("select count(*) from experiment");
  const beforeAttempts = await n(`select count(*) from sampling_attempt where experiment_id=${w1.experimentId}`);
  const keepTaskExperiments = await n(`select count(*) from experiment where task_id=${keep.taskId}`);
  s.check("准备：被删任务已有 2 个实验与抽样记录", beforeAttempts > 0 && keepTaskExperiments === 1, `attempts=${beforeAttempts} keepExp=${keepTaskExperiments}`);

  const del = await t.call("DELETE", `/api/teacher/tasks/${drop.taskId}`);
  s.check("删除任务成功", del.status === 200, `HTTP ${del.status} ${excerpt(del.body?.error)}`);

  s.check("任务行被硬删除", await n(`select count(*) from task where id=${drop.taskId}`) === 0, "task");
  s.check("该任务的实验被级联删除", await n(`select count(*) from experiment where task_id=${drop.taskId}`) === 0, "experiment");
  s.check("其抽样记录被级联删除", await n(`select count(*) from sampling_attempt where experiment_id=${w1.experimentId}`) === 0, "sampling_attempt");
  s.check("其他任务的实验不受影响", await n(`select count(*) from experiment where task_id=${keep.taskId}`) === keepTaskExperiments, "keep task experiments");
  s.check("实验总数只减少了被删任务的 2 个", await n("select count(*) from experiment") === beforeExperiments - 2, `${beforeExperiments} -> ${await n("select count(*) from experiment")}`);
  s.check("另一班级的学生仍在", await n(`select count(*) from student where class_id=${classKeep}`) === 2, "keep class students");
  suites.push(s);
}

// ================================================================ L-02 模板删除边界
{
  const s = new Suite("DG-L-02");
  const classId = await createClass(a, `DGL02班-${Date.now()}`);
  const P = `DGL2-${Date.now()}-`;
  assert((await importStudents(t, classId, `studentId,name,email\n${P}001,甲,a@x.com\n`)).status === 200, "导入失败");

  const bare = await t.call("POST", "/api/teacher/topics", { json: { name: `DGL02未发布-${Date.now()}` } });
  const bareId = Number(bare.body.data.id);
  const delBare = await t.call("DELETE", `/api/teacher/topics/${bareId}`);
  s.check("未发布、未分配的模板可硬删除", delBare.status === 200, `HTTP ${delBare.status} ${excerpt(delBare.body?.error)}`);
  s.check("模板行确实消失", await n(`select count(*) from topic where id=${bareId}`) === 0, "topic");

  const assigned = await buildTask(t, `DGL02已分配-${Date.now()}`, classId);
  const delAssigned = await t.call("DELETE", `/api/teacher/topics/${assigned.topicId}`);
  s.check("已分配任务的模板删除被拒", delAssigned.status >= 400, `HTTP ${delAssigned.status} ${excerpt(delAssigned.body?.error?.message, 50)}`);
  s.check("被拒后模板仍在", await n(`select count(*) from topic where id=${assigned.topicId}`) === 1, "topic remains");
  s.check("被拒后任务仍在", await n(`select count(*) from task where id=${assigned.taskId}`) === 1, "task remains");
  suites.push(s);
}

// ================================================================ L-03 学生删除与重建
{
  const s = new Suite("DG-L-03");
  const classId = await createClass(a, `DGL03班-${Date.now()}`);
  const P = `DGL3-${Date.now()}-`;
  const target = `${P}001`;
  assert((await importStudents(t, classId, `studentId,name,email\n${target},待删,a@x.com\n${P}002,保留,b@x.com\n`)).status === 200, "导入失败");
  const built = await buildTask(t, `DGL03-${Date.now()}`, classId);
  const work = await studentWork(built.taskId, target);

  const studentRow = await psql(`select id from student where student_id='${target}'`);
  const studentId = Number(studentRow);
  const attemptsBefore = await n(`select count(*) from sampling_attempt where experiment_id=${work.experimentId}`);
  s.check("准备：该学生有会话与实验记录", await n(`select count(*) from experiment where student_id=${studentId}`) === 1 && attemptsBefore > 0,
    `exp=${await n(`select count(*) from experiment where student_id=${studentId}`)} attempts=${attemptsBefore}`);

  const del = await t.call("DELETE", `/api/teacher/students/${studentId}`);
  s.check("教师可删除本班学生", del.status === 200, `HTTP ${del.status} ${excerpt(del.body?.error)}`);
  s.check("学生行被硬删除", await n(`select count(*) from student where id=${studentId}`) === 0, "student");
  s.check("其实验记录被级联删除", await n(`select count(*) from experiment where student_id=${studentId}`) === 0, "experiment");
  s.check("其抽样记录被级联删除", await n(`select count(*) from sampling_attempt where experiment_id=${work.experimentId}`) === 0, "sampling_attempt");
  s.check("其会话被清除", await n(`select count(*) from user_session where user_type='student' and user_id=${studentId}`) === 0, "user_session");
  s.check("同班其他学生不受影响", await n(`select count(*) from student where class_id=${classId}`) === 1, "remaining students");

  // 重新导入同一学号：必须是全新账号，不带旧数据
  const reimport = await importStudents(t, classId, `studentId,name,email\n${target},重建,a@x.com\n`);
  s.check("重新导入同一学号成功", reimport.status === 200 && Number(reimport.body.data.successCount) === 1, JSON.stringify(reimport.body.data ?? reimport.body?.error));
  const newRow = Number(await psql(`select id from student where student_id='${target}'`));
  s.check("重建后是新账号（ID 不同）", newRow > 0 && newRow !== studentId, `old=${studentId} new=${newRow}`);
  s.check("新账号没有旧实验记录", await n(`select count(*) from experiment where student_id=${newRow}`) === 0, "new student experiments");
  const login = await new Client(BASE).call("POST", "/api/student/login", { json: { studentId: target, password: target } });
  s.check("新账号可用学号作为初始口令登录", login.status === 200, `HTTP ${login.status}`);
  suites.push(s);
}

// ================================================================ L-07 审计事件
{
  const s = new Suite("DG-L-07");
  const classId = await createClass(a, `DGL07班-${Date.now()}`);
  const P = `DGL7-${Date.now()}-`;
  assert((await importStudents(t, classId, `studentId,name,email\n${P}001,甲,a@x.com\n`)).status === 200, "导入失败");
  const built = await buildTask(t, `DGL07-${Date.now()}`, classId);
  const work = await studentWork(built.taskId, `${P}001`);

  // 走到提交与评分，触发审计写入
  let v = Number((await work.client.call("GET", `/api/student/tasks/${built.taskId}/experiment`)).body.data.version);
  assert((await work.client.call("POST", `/api/student/tasks/${built.taskId}/sampling`, { json: { method: "systematic", params: { seed: 21 } } })).status === 200, "系统抽样失败");
  let r = await work.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
  assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  r = await work.client.call("POST", `/api/student/tasks/${built.taskId}/experiment/stages/4/complete`, { json: { observedVersion: v, reportContent: `<p>${"字".repeat(150)}</p>` } });
  assert(r.status === 200, `阶段4失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);
  assert((await work.client.call("POST", `/api/student/tasks/${built.taskId}/submit`, { json: { observedVersion: v } })).status === 200, "提交失败");
  const detail = await t.call("GET", `/api/teacher/grading/${work.experimentId}`);
  const dv = Number(detail.body?.data?.version ?? detail.body?.data?.experiment?.version);
  const grade = await t.call("POST", `/api/teacher/grading/${work.experimentId}`, { json: { observedVersion: dv, scoreQuestionnaire: 70, scoreProcess: 80, scoreReport: 90, comment: "审计用例" } });
  s.check("评分成功（应写入审计）", grade.status === 200, `HTTP ${grade.status}`);

  const auditForExperiment = await n(`select count(*) from audit_event where entity_type='experiment' and entity_id=${work.experimentId}`);
  s.check("评分产生对应的审计事件", auditForExperiment >= 1, `audit rows=${auditForExperiment}`);
  const orphan = await n(`select count(*) from audit_event a where a.entity_type='experiment' and not exists (select 1 from experiment e where e.id=a.entity_id)`);
  s.check("不存在指向已删实验的悬空审计事件", orphan === 0, `orphan=${orphan}`);
  const byActor = await n(`select count(*) from audit_event where actor_type='teacher' and actor_id=${manifest.teacher1}`);
  s.check("审计事件带教师操作者", byActor >= 1, `teacher audit rows=${byActor}`);
  suites.push(s);
}

// ================================================================ L-08 停用 vs 删除
{
  const s = new Suite("DG-L-08");
  const classId = await createClass(a, `DGL08班-${Date.now()}`);
  const P = `DGL8-${Date.now()}-`;
  assert((await importStudents(t, classId, `studentId,name,email\n${P}001,停用,a@x.com\n${P}002,删除,b@x.com\n`)).status === 200, "导入失败");
  const idA = Number(await psql(`select id from student where student_id='${P}001'`));
  const idB = Number(await psql(`select id from student where student_id='${P}002'`));

  const jarA = new Client(BASE);
  assert((await jarA.call("POST", "/api/student/login", { json: { studentId: `${P}001`, password: `${P}001` } })).status === 200, "A 登录失败");
  const disable = await a.call("PUT", `/api/admin/students/${idA}/status`, { json: { status: 0 } });
  s.check("管理员可停用学生", disable.status === 200, `HTTP ${disable.status}`);
  s.check("停用后既有会话立即失效", (await jarA.call("GET", "/api/student/me")).status === 401, "session after disable");
  s.check("停用后不能重新登录", (await new Client(BASE).call("POST", "/api/student/login", { json: { studentId: `${P}001`, password: `${P}001` } })).status === 401, "disabled login");
  s.check("停用后账号行仍在（非物理删除）", await n(`select count(*) from student where id=${idA}`) === 1, "disabled student row");

  const jarB = new Client(BASE);
  assert((await jarB.call("POST", "/api/student/login", { json: { studentId: `${P}002`, password: `${P}002` } })).status === 200, "B 登录失败");
  const del = await t.call("DELETE", `/api/teacher/students/${idB}`);
  s.check("教师可删除学生", del.status === 200, `HTTP ${del.status}`);
  s.check("删除后账号行不存在", await n(`select count(*) from student where id=${idB}`) === 0, "deleted student row");
  s.check("删除后不能登录（与停用一致的 401）", (await new Client(BASE).call("POST", "/api/student/login", { json: { studentId: `${P}002`, password: `${P}002` } })).status === 401, "deleted login");
  s.check("删除后既有会话也失效", (await jarB.call("GET", "/api/student/me")).status === 401, "session after delete");
  suites.push(s);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/L.json", suites);
