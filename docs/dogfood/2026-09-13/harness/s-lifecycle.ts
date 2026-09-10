/**
 * DG-S-16（报告长度）、DG-S-17（提交后只读与成绩可见性）、
 * DG-S-18（驳回→重交→再评分），兼 DG-T-07/T-08（批改与驳回）。
 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const [EMP1] = manifest.employees as string[];
const PREFIX = manifest.class1StudentPrefix as string;
const suites: Suite[] = [];

const S = new Suite("DG-S-16");
const S17 = new Suite("DG-S-17");
const S18 = new Suite("DG-S-18");
const T07 = new Suite("DG-T-07");
const T08 = new Suite("DG-T-08");

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
const report = (n: number) => `<p>${"字".repeat(n)}</p>`;

async function teacher() {
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师登录失败");
  return c;
}
async function buildTask(t: Client, name: string, rows = 30) {
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
      version: 1, researchQuestion: "30 个单位的 y 均值", targetPopulation: "30 个单位", unitOfAnalysis: "单位",
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

/** 推进到阶段 3 完成（含两种必做方法抽样）。 */
async function driveToStage4(taskId: number, index: number) {
  const studentId = `${PREFIX}${String(index).padStart(3, "0")}`;
  const c = new Client(BASE);
  assert((await c.call("POST", "/api/student/login", { json: { studentId, password: studentId } })).status === 200, `${studentId} 登录失败`);
  const exp = await c.call("GET", `/api/student/tasks/${taskId}/experiment`);
  assert(exp.status === 200, `读取实验失败：${excerpt(exp.body)}`);
  const experimentId = Number(exp.body.data.id);
  let v = Number(exp.body.data.version);

  let r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: v, questionnaire: questionnaire(`DG生命周期-${studentId}`) } });
  assert(r.status === 200, `阶段1失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);

  // 推荐样本量：N=30，y 的总体方差由生成式决定；用 N-01 已验证的闭式解
  const y = Array.from({ length: 30 }, (_, i) => ((i * 13) % 40) + 5);
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  const sigma2 = y.reduce((a, b) => a + (b - m) ** 2, 0) / y.length;
  const z = 1.959963984540054; const e = 4;
  const n0 = (z * z * sigma2) / (e * e);
  const recommendedSize = Math.min(30, Math.ceil((n0 * 30) / (29 + n0)));
  const finalSampleSize = Math.min(30, recommendedSize);

  r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, {
    json: { observedVersion: v, samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: e, populationVariance: sigma2, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize } },
  });
  assert(r.status === 200, `阶段2失败：${excerpt(r.body)}`);
  v = Number(r.body.data.version);

  r = await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: finalSampleSize, seed: 4242 } } });
  assert(r.status === 200, `SRS 失败：${excerpt(r.body)}`);
  r = await c.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "systematic", params: { seed: 4242 } } });
  assert(r.status === 200, `系统抽样失败：${excerpt(r.body)}`);

  r = await c.call("POST", `/api/student/tasks/${taskId}/experiment/stages/3/complete`, { json: { observedVersion: v } });
  assert(r.status === 200, `阶段3失败：${excerpt(r.body)}`);
  return { client: c, studentId, version: Number(r.body.data.version), experimentId };
}

const t = await teacher();
const taskId = await buildTask(t, `DG生命周期-${Date.now()}`);

// ---------------------------------------------------------------- S-16 报告长度
const A = await driveToStage4(taskId, 1);
{
  const tooShort = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: A.version, reportContent: report(99) } });
  S.check("报告 99 字被拒", tooShort.status === 400, `HTTP ${tooShort.status} ${excerpt(tooShort.body?.error?.message, 60)}`);
  const tooLong = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: A.version, reportContent: report(5001) } });
  S.check("报告 5001 字被拒", tooLong.status === 400, `HTTP ${tooLong.status} ${excerpt(tooLong.body?.error?.message, 60)}`);
  const exactly100 = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: A.version, reportContent: report(100) } });
  S.check("报告 100 字被接受", exactly100.status === 200, `HTTP ${exactly100.status} ${excerpt(approximately(exactly100.body), 80)}`);
  if (exactly100.status === 200) A.version = Number(exactly100.body.data.version);
  const long = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: A.version, reportContent: report(5000) } });
  S.check("报告 5000 字被接受（上界）", long.status === 200, `HTTP ${long.status} ${excerpt(approximately(long.body), 80)}`);
  if (long.status === 200) A.version = Number(long.body.data.version);
  suites.push(S);
}
function approximately(v: any) { return v?.error?.message ?? "ok"; }

// ---------------------------------------------------------------- S-17 提交与只读
let submittedVersion = A.version;
{
  const submit = await A.client.call("POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: A.version } });
  S17.check("提交成功", submit.status === 200 || submit.status === 201, `HTTP ${submit.status} ${excerpt(submit.body?.error)}`);

  const exp = await A.client.call("GET", `/api/student/tasks/${taskId}/experiment`);
  S17.check("提交后状态为 submitted", exp.body.data.status === "submitted", String(exp.body.data.status));
  submittedVersion = Number(exp.body.data.version);

  const resave = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: submittedVersion, questionnaire: questionnaire("改后") } });
  S17.check("提交后不能再次保存阶段", resave.status === 409 || resave.status === 400, `HTTP ${resave.status} ${excerpt(resave.body?.error?.message, 60)}`);
  const resample = await A.client.call("POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 5, seed: 1 } } });
  S17.check("提交后不能重新抽样", resample.status === 409 || resample.status === 400, `HTTP ${resample.status} ${excerpt(resample.body?.error?.message, 60)}`);
  const reopen = await A.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/3/reopen`, { json: { observedVersion: submittedVersion } });
  S17.check("提交后不能重新编辑阶段", reopen.status === 409 || reopen.status === 400, `HTTP ${reopen.status} ${excerpt(reopen.body?.error?.message, 60)}`);
  suites.push(S17);
}

// ---------------------------------------------------------------- T-07 批改
{
  const detail = await t.call("GET", `/api/teacher/grading/${A.experimentId}`);
  T07.check("教师可读取提交详情", detail.status === 200, `HTTP ${detail.status} ${excerpt(detail.body?.error)}`);
  const d = detail.body?.data ?? {};
  const version = Number(d.version ?? d.experiment?.version);
  T07.check("详情包含提交时快照（问卷/规划/样本/报告）",
    Boolean(d.questionnaire ?? d.snapshot?.questionnaire) && Boolean(d.samplePlan ?? d.snapshot?.samplePlan) &&
    Boolean(d.reportContent ?? d.snapshot?.reportContent), JSON.stringify(Object.keys(d)).slice(0, 200));

  const badScore = await t.call("POST", `/api/teacher/grading/${A.experimentId}`, { json: { observedVersion: version, scoreQuestionnaire: 101, scoreProcess: 80, scoreReport: 90 } });
  T07.check("分项分数超过 100 被拒", badScore.status >= 400, `HTTP ${badScore.status} ${excerpt(badScore.body?.error?.message, 60)}`);
  const negative = await t.call("POST", `/api/teacher/grading/${A.experimentId}`, { json: { observedVersion: version, scoreQuestionnaire: -1, scoreProcess: 80, scoreReport: 90 } });
  T07.check("分项分数为负被拒", negative.status >= 400, `HTTP ${negative.status} ${excerpt(negative.body?.error?.message, 60)}`);

  const graded = await t.call("POST", `/api/teacher/grading/${A.experimentId}`, {
    json: { observedVersion: version, scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 70, comment: "DG 评语：结构与结论清晰。" },
  });
  T07.check("评分成功", graded.status === 200, `HTTP ${graded.status} ${excerpt(graded.body?.error)}`);
  const expectedTotal = (80 * 30 + 90 * 30 + 70 * 40) / 100;
  const exp = await A.client.call("GET", `/api/student/tasks/${taskId}/experiment`);
  T07.check("状态变为 graded", exp.body.data.status === "graded", String(exp.body.data.status));

  const submission = await A.client.call("GET", `/api/student/tasks/${taskId}/submission`);
  const st = JSON.stringify(submission.body ?? {});
  T07.check("学生可见总分", st.includes(String(expectedTotal)) || Number(submission.body?.data?.totalScore) === expectedTotal, `expect=${expectedTotal} body=${excerpt(st, 160)}`);
  T07.check("学生可见教师评语", st.includes("DG 评语"), excerpt(st, 160));
  T07.check("学生响应不含分项分数字段",
    !/scoreQuestionnaire|scoreProcess|scoreReport|score_questionnaire/.test(st), "checked submission payload");
  T07.check("学生所见总分等于按权重加权结果", Number(submission.body?.data?.totalScore ?? NaN) === expectedTotal, `got=${submission.body?.data?.totalScore} expect=${expectedTotal}`);
  suites.push(T07);
}

// ---------------------------------------------------------------- S-18 / T-08 驳回重交
const B = await driveToStage4(taskId, 2);
{
  const stage4 = await B.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: B.version, reportContent: report(120) } });
  assert(stage4.status === 200, `B 阶段4失败：${excerpt(stage4.body)}`);
  const bVersion = Number(stage4.body.data.version);
  const submit = await B.client.call("POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: bVersion } });
  assert(submit.status === 200 || submit.status === 201, `B 提交失败：${excerpt(submit.body)}`);

  const detail = await t.call("GET", `/api/teacher/grading/${B.experimentId}`);
  const dv = Number(detail.body?.data?.version ?? detail.body?.data?.experiment?.version);

  const emptyReason = await t.call("POST", `/api/teacher/grading/${B.experimentId}/reject`, { json: { observedVersion: dv, reason: "  " } });
  T08.check("驳回理由为空被拒", emptyReason.status >= 400, `HTTP ${emptyReason.status} ${excerpt(emptyReason.body?.error?.message, 60)}`);

  const reject = await t.call("POST", `/api/teacher/grading/${B.experimentId}/reject`, { json: { observedVersion: dv, reason: "样本量说明不足，请补充抽样过程描述后重交。" } });
  T08.check("驳回成功", reject.status === 200, `HTTP ${reject.status} ${excerpt(reject.body?.error)}`);

  const expB = await B.client.call("GET", `/api/student/tasks/${taskId}/experiment`);
  S18.check("学生可见驳回状态", expB.body.data.status === "rejected", String(expB.body.data.status));
  S18.check("学生可见驳回理由", String(expB.body.data.rejectReason ?? "").includes("样本量说明不足"), excerpt(expB.body.data.rejectReason, 80));

  const reopen = await B.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/reopen`, { json: { observedVersion: Number(expB.body.data.version) } });
  S18.check("驳回后可重开阶段 4", reopen.status === 200, `HTTP ${reopen.status} ${excerpt(reopen.body?.error?.message, 60)}`);

  const newVersion = reopen.status === 200 ? Number(reopen.body.data.version) : Number(expB.body.data.version);
  const updated = await B.client.call("POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: newVersion, reportContent: report(200) } });
  S18.check("重开后可修改报告并再次完成阶段", updated.status === 200, `HTTP ${updated.status} ${excerpt(updated.body?.error?.message, 60)}`);

  const resubmit = await B.client.call("POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: Number(updated.body.data.version) } });
  S18.check("重交成功", resubmit.status === 200 || resubmit.status === 201, `HTTP ${resubmit.status} ${excerpt(resubmit.body?.error)}`);

  const detail2 = await t.call("GET", `/api/teacher/grading/${B.experimentId}`);
  const dv2 = Number(detail2.body?.data?.version ?? detail2.body?.data?.experiment?.version);
  const regrade = await t.call("POST", `/api/teacher/grading/${B.experimentId}`, {
    json: { observedVersion: dv2, scoreQuestionnaire: 90, scoreProcess: 95, scoreReport: 85, comment: "重交后评分。" },
  });
  T08.check("重交后教师可再次评分", regrade.status === 200, `HTTP ${regrade.status} ${excerpt(regrade.body?.error)}`);
  const expected2 = (90 * 30 + 95 * 30 + 85 * 40) / 100;
  const finalSub = await B.client.call("GET", `/api/student/tasks/${taskId}/submission`);
  S18.check("学生所见为最新评分（旧分不残留）", Number(finalSub.body?.data?.totalScore ?? NaN) === expected2, `got=${finalSub.body?.data?.totalScore} expect=${expected2}`);
  suites.push(S18);
  suites.push(T08);
}

void submittedVersion;
await writeSuites(process.env.OUT ?? "evidence/dg/results/S-lifecycle.json", suites);
