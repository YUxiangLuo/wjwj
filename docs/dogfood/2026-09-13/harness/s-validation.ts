/**
 * DG-S-02 问卷边界（阶段 1 提交校验契约）。
 * 每个边界用一个独立学生，互不干扰；所有期望来自产品契约本身（校验规则）。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const [EMP1] = manifest.employees as string[];
const PREFIX = manifest.class1StudentPrefix as string;
const suites: Suite[] = [];
const s = new Suite("DG-S-02");

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}
async function buildTask(t: Client, name: string, rows = 20) {
  const data = Array.from({ length: rows }, (_, i) => ({ 记录编号: String(i + 1), y: String(((i * 13) % 40) + 5) }));
  const topic = await t.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const csv = ["记录编号,y", ...data.map((r) => `${r["记录编号"]},${r.y}`)].join("\n") + "\n";
  const form = new FormData();
  form.append("file", new File([csv], "population.csv", { type: "text/csv" }));
  assert((await t.call("POST", `/api/teacher/topics/${topicId}/excel`, { form })).status === 200, "上传失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [], studyContract: {
      version: 1, researchQuestion: "20 个单位的 y 均值", targetPopulation: "20 个单位", unitOfAnalysis: "单位",
      target: { kind: "mean", field: "y" } } } } })).status === 200, "映射失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } } } })).status === 200, "策略失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } })).status === 200, "权重失败");
  assert((await t.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } })).status === 200, "发布失败");
  assert((await t.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [manifest.class1] } })).status === 201, "分配失败");
  const list = (await t.call("GET", "/api/teacher/tasks")).body?.data ?? [];
  const created = (Array.isArray(list) ? list : list.items ?? []).find((x: any) => Number(x.topicId) === topicId);
  assert(created, "未找到任务");
  return Number(created.id);
}

const baseQuestions = [
  { id: "q1", type: "boolean", content: "题一" },
  { id: "q2", type: "single", content: "题二", options: ["A", "B"] },
  { id: "q3", type: "multiple", content: "题三", options: ["A", "B"], minSelect: 1, maxSelect: 2 },
  { id: "q4", type: "scale", content: "题四", scaleMin: 1, scaleMax: 10 },
  { id: "q5", type: "boolean", content: "题五" },
];
const validQuestionnaire = () => ({
  title: "DG 问卷",
  welcomeText: `<p>${"欢迎参加本次调查。".repeat(3)}</p>`,
  endingText: `<p>${"感谢您的参与。".repeat(3)}</p>`,
  questions: JSON.parse(JSON.stringify(baseQuestions)),
});

/** 用一个新学生尝试提交问卷，返回 HTTP 状态与错误信息。 */
async function attempt(taskId: number, index: number, patch: (q: any) => void, name: string, expectOk: boolean) {
  const studentId = `${PREFIX}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  const login = await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  assert(login.status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const q = validQuestionnaire();
  patch(q);
  const r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, {
    json: { observedVersion: Number(exp.body.data.version), questionnaire: q },
  });
  const ok = r.status === 200;
  s.check(name, ok === expectOk, `HTTP ${r.status} ${excerpt(r.body?.error?.message ?? "ok", 90)}`);
  return r;
}

const t = await teacher();
const taskId = await buildTask(t, `DG问卷边界-${Date.now()}`);
let i = 1;

// 标题
await attempt(taskId, i++, (q) => { q.title = ""; }, "标题为空被拒", false);
await attempt(taskId, i++, (q) => { q.title = "标".repeat(101); }, "标题 101 字被拒", false);
await attempt(taskId, i++, (q) => { q.title = "标".repeat(100); }, "标题 100 字被接受", true);
// 欢迎语
await attempt(taskId, i++, (q) => { q.welcomeText = `<p>${"字".repeat(18)}</p>`; }, "欢迎语 18 字被拒", false);
await attempt(taskId, i++, (q) => { q.welcomeText = `<p>${"字".repeat(20)}</p>`; }, "欢迎语 20 字被接受", true);
await attempt(taskId, i++, (q) => { q.welcomeText = `<p>${"字".repeat(1001)}</p>`; }, "欢迎语 1001 字被拒", false);
// 结束语
await attempt(taskId, i++, (q) => { q.endingText = `<p>${"字".repeat(19)}</p>`; }, "结束语 19 字被拒", false);
await attempt(taskId, i++, (q) => { q.endingText = `<p>${"字".repeat(1000)}</p>`; }, "结束语 1000 字被接受", true);
// 题目数量
await attempt(taskId, i++, (q) => { q.questions = baseQuestions.slice(0, 4); }, "题目 4 道被拒", false);
await attempt(taskId, i++, (q) => {
  q.questions = Array.from({ length: 50 }, (_, k) => ({ id: `q${k}`, type: "boolean", content: `第${k + 1}题` }));
}, "题目 50 道被接受", true);
await attempt(taskId, i++, (q) => {
  q.questions = Array.from({ length: 51 }, (_, k) => ({ id: `q${k}`, type: "boolean", content: `第${k + 1}题` }));
}, "题目 51 道被拒", false);
// 单/多选选项
await attempt(taskId, i++, (q) => { q.questions[1].options = ["只有一个"]; }, "单选仅 1 个选项被拒", false);
await attempt(taskId, i++, (q) => { q.questions[1].options = Array.from({ length: 11 }, (_, k) => `选项${k}`); }, "单选 11 个选项被拒", false);
await attempt(taskId, i++, (q) => { q.questions[1].options = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]; }, "单选 10 个选项被接受", true);
await attempt(taskId, i++, (q) => { q.questions[1].options = Array.from({ length: 201 }, () => "x").slice(0, 2).map(() => "长".repeat(201)); }, "选项超过 200 字被拒", false);
// 多选数量限制
await attempt(taskId, i++, (q) => { q.questions[2].maxSelect = 3; }, "多选 maxSelect 超过选项数被拒", false);
await attempt(taskId, i++, (q) => { q.questions[2].minSelect = 2; q.questions[2].maxSelect = 1; }, "多选 minSelect>maxSelect 被拒", false);
// 量表范围
await attempt(taskId, i++, (q) => { q.questions[3].scaleMin = 5; q.questions[3].scaleMax = 5; }, "量表 min>=max 被拒", false);
await attempt(taskId, i++, (q) => { q.questions[3].scaleMax = 11; }, "量表 max>10 被拒", false);
await attempt(taskId, i++, (q) => { q.questions[3].scaleMin = 0; }, "量表 min<1 被拒", false);
// 题干长度
await attempt(taskId, i++, (q) => { q.questions[0].content = "长".repeat(501); }, "题干 501 字被拒", false);
await attempt(taskId, i++, (q) => { q.questions[0].content = "长".repeat(500); }, "题干 500 字被接受", true);
// 题型
await attempt(taskId, i++, (q) => { q.questions[0].type = "unknown"; }, "非法题型被拒", false);

// S-03：服务端不强制试填（试填是客户端门禁）
{
  const studentId = `${PREFIX}${String(i).padStart(3, "0")}`;
  const c = new Client(BASE);
  await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  const r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, {
    json: { observedVersion: Number(exp.body.data.version), questionnaire: validQuestionnaire() },
  });
  s.check("S-03 阶段 1 的服务端契约不检查试填完成状态（试填为客户端门禁）", r.status === 200,
    `HTTP ${r.status}；载荷未包含任何试填标记而仍被接受，说明试填门禁仅在前端`);
}

suites.push(s);
await writeSuites(process.env.OUT ?? "evidence/dg/results/S-validation.json", suites);
