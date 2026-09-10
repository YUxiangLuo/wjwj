/**
 * DG-I 身份/会话 + DG-P 权限矩阵。
 * 顺带完成教师建课（DG-T-01/02/03 的核心断言）以产出真实资源供越权测试。
 */
import { Client, Suite, assert, excerpt, writeSuites, type Check } from "./lib";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const manifest = await Bun.file("evidence/dg/manifest.json").json() as any;
const RUN = manifest.run;
const [EMP1, EMP2] = manifest.employees as string[];
const suites: Suite[] = [];
const ids: Record<string, number> = {};

// ---------------------------------------------------------------- 合成总体
function populationCsv(rows: number) {
  const lines = ["记录编号,y,size,层级"];
  for (let i = 0; i < rows; i += 1) {
    lines.push(`${i + 1},${((i * 37) % 97) + 3},${(i % 40) + 1},${i % 2 === 0 ? "A" : "B"}`);
  }
  return lines.join("\n") + "\n";
}
// ---------------------------------------------------------------- 教师建课（DG-T-01/02/03）
async function buildTask(teacher: Client, name: string, classId: number, rows = 120) {
  const topic = await teacher.call("POST", "/api/teacher/topics", { json: { name } });
  assert(topic.status === 201, `创建模板失败：${excerpt(topic.body)}`);
  const topicId = Number(topic.body.data.id);
  const form = new FormData();
  form.append("file", new File([populationCsv(rows)], "population.csv", { type: "text/csv" }));
  const uploaded = await teacher.call("POST", `/api/teacher/topics/${topicId}/excel`, { form });
  assert(uploaded.status === 200, `上传总体失败：${excerpt(uploaded.body)}`);
  const mapped = await teacher.call("PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y", "size"], others: [], stratified: ["层级"], studyContract: {
      version: 1, researchQuestion: `${name} 的 y 均值`, targetPopulation: `${rows} 个合成单位`,
      unitOfAnalysis: "合成单位", target: { kind: "mean", field: "y" } } } },
  });
  assert(mapped.status === 200, `字段映射失败：${excerpt(mapped.body)}`);
  const policy = await teacher.call("PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "required" } } },
  });
  assert(policy.status === 200, `抽样策略失败：${excerpt(policy.body)}`);
  const weights = await teacher.call("PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } });
  assert(weights.status === 200, `权重失败：${excerpt(weights.body)}`);
  const publish = await teacher.call("PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } });
  assert(publish.status === 200, `发布模板失败：${excerpt(publish.body)}`);
  const task = await teacher.call("POST", "/api/teacher/tasks", { json: { topicId, classIds: [classId] } });
  assert(task.status === 201, `分配任务失败：${excerpt(task.body)}`);
  const tasks = await teacher.call("GET", "/api/teacher/tasks");
  const list = Array.isArray(tasks.body?.data) ? tasks.body.data : tasks.body?.data?.items ?? [];
  const created = list.find((x: any) => Number(x.topicId) === topicId && Number(x.classId) === classId);
  assert(created, `未找到新建任务：${excerpt(tasks.body).slice(0, 200)}`);
  return { topicId, taskId: Number(created.id), rows };
}

{
  const s = new Suite("DG-T-01");
  const t1 = new Client(BASE);
  assert((await t1.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } })).status === 200, "教师甲登录失败");
  const built = await buildTask(t1, `DG课题-${RUN}-甲班`, manifest.class1);
  s.check("从零建课（上传总体→映射→策略→权重→发布→分配）成功", built.taskId > 0, `topic=${built.topicId} task=${built.taskId}`);
  Object.assign(ids, { topic1: built.topicId, task1: built.taskId });

  const t2 = new Client(BASE);
  assert((await t2.call("POST", "/api/teacher/login", { json: { employeeId: EMP2, password: EMP2 } })).status === 200, "教师乙登录失败");
  const built2 = await buildTask(t2, `DG课题-${RUN}-乙班`, manifest.class2);
  Object.assign(ids, { topic2: built2.topicId, task2: built2.taskId });
  s.check("第二个教师独立建课成功", built2.taskId > 0, `topic=${built2.topicId} task=${built2.taskId}`);
  suites.push(s);
}

{
  const s = new Suite("DG-T-02");
  const t1 = new Client(BASE);
  await t1.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } });

  // 未上传总体的模板不可发布
  const bare = await t1.call("POST", "/api/teacher/topics", { json: { name: `DG空模板-${RUN}` } });
  const bareId = Number(bare.body.data.id);
  await t1.call("PUT", `/api/teacher/topics/${bareId}`, { json: { status: 1 } });
  const publishBare = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: bareId, classIds: [manifest.class1] } });
  s.check("缺总体数据的模板不能发布任务", publishBare.status >= 400, `HTTP ${publishBare.status} ${excerpt(publishBare.body?.error)}`);

  // 未发布模板不能分配
  const unpublished = await t1.call("POST", "/api/teacher/topics", { json: { name: `DG未发布-${RUN}` } });
  const unpubId = Number(unpublished.body.data.id);
  const publishUnpub = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: unpubId, classIds: [manifest.class1] } });
  s.check("未发布（status≠1）模板不能分配任务", publishUnpub.status >= 400, `HTTP ${publishUnpub.status} ${excerpt(publishUnpub.body?.error)}`);

  // 权重不等于 100
  const badWeight = await t1.call("PUT", `/api/teacher/topics/${ids.topic1}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 30 } } });
  s.check("权重之和不为 100 被拒绝", badWeight.status >= 400, `HTTP ${badWeight.status} ${excerpt(badWeight.body?.error)}`);

  // 非法抽样策略：简单随机不是必做
  const badPolicy = await t1.call("PUT", `/api/teacher/topics/${ids.topic1}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "optional", systematic: "required", pps: "disabled", stratified: "disabled" } } },
  });
  s.check("简单随机必须为必做，否则拒绝", badPolicy.status >= 400, `HTTP ${badPolicy.status} ${excerpt(badPolicy.body?.error)}`);

  // 只启用一种方法
  const oneMethod = await t1.call("PUT", `/api/teacher/topics/${ids.topic1}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "disabled", pps: "disabled", stratified: "disabled" } } },
  });
  s.check("至少需启用两种抽样方法", oneMethod.status >= 400, `HTTP ${oneMethod.status} ${excerpt(oneMethod.body?.error)}`);

  // 映射引用不存在的列
  const badMapping = await t1.call("PUT", `/api/teacher/topics/${bareId}/mapping`, {
    json: { fieldMapping: { identifier: "不存在", numeric: ["也没有"], others: [], stratified: [] } },
  });
  s.check("字段映射引用不存在的列被拒绝", badMapping.status >= 400, `HTTP ${badMapping.status} ${excerpt(badMapping.body?.error)}`);
  suites.push(s);
}

{
  const s = new Suite("DG-T-03");
  const t1 = new Client(BASE);
  await t1.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } });
  const dup = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: ids.topic1, classIds: [manifest.class1] } });
  const dupSkipped = dup.body?.data?.skipped;
  s.check("同一模板重复分配到同一班级被跳过并报告",
    dup.status === 201 && Array.isArray(dupSkipped) && dupSkipped.includes(manifest.class1),
    `HTTP ${dup.status} ${excerpt(dup.body)}`);

  // class3 已在 DG-M-03 转交给教师丙；为教师甲新建一个班级用于截止时间用例
  const admin = new Client(BASE);
  await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: process.env.DG_ADMIN_PASSWORD! } });
  const freshClass = await admin.call("POST", "/api/admin/classes", {
    json: { name: `DG班级四-${RUN}`, semesterId: manifest.semesterA, teacherId: manifest.teacher1 },
  });
  assert(freshClass.body?.data?.id, `新建班级失败：${excerpt(freshClass.body)}`);
  const class4 = Number(freshClass.body.data.id);
  ids.class4 = class4;

  const past = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: ids.topic1, classIds: [class4], deadline: new Date(Date.now() - 60_000).toISOString() } });
  s.check("截止时间早于当前时间被拒绝", past.status >= 400, `HTTP ${past.status} ${excerpt(past.body?.error)}`);

  const future = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: ids.topic1, classIds: [class4], deadline: new Date(Date.now() + 3600_000).toISOString() } });
  s.check("合法截止时间可发布", future.status === 201, `HTTP ${future.status} ${excerpt(future.body?.error)}`);
  if (future.status === 201) {
    const tasks = await t1.call("GET", "/api/teacher/tasks");
    const list = Array.isArray(tasks.body?.data) ? tasks.body.data : tasks.body?.data?.items ?? [];
    const created = list.find((x: any) => Number(x.topicId) === ids.topic1 && Number(x.classId) === class4);
    if (created) ids.task3 = Number(created.id);
  }
  const otherClass = await t1.call("POST", "/api/teacher/tasks", { json: { topicId: ids.topic1, classIds: [manifest.class3] } });
  s.check("向他人班级发布任务被拒绝（越权保护）", otherClass.status === 403, `HTTP ${otherClass.status} ${excerpt(otherClass.body?.error)}`);
  suites.push(s);
}

// ---------------------------------------------------------------- DG-I 身份
{
  const s = new Suite("DG-I-01");
  const studentId = manifest.studentId1;
  const ok = await new Client(BASE).call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  s.check("正确凭据可登录", ok.status === 200, `HTTP ${ok.status}`);
  const badPw = await new Client(BASE).call("POST", "/api/student/login", { json: { studentId, password: "错误口令x" } });
  s.check("错误口令返回统一凭据错误", badPw.status === 401 && badPw.body?.error?.code === "INVALID_CREDENTIALS", `HTTP ${badPw.status} ${excerpt(badPw.body?.error)}`);
  const ghost = await new Client(BASE).call("POST", "/api/student/login", { json: { studentId: `不存在-${RUN}`, password: "x" } });
  s.check("不存在账号返回同一错误码（不区分账号是否存在）", ghost.status === 401 && ghost.body?.error?.code === "INVALID_CREDENTIALS", `HTTP ${ghost.status} ${excerpt(ghost.body?.error)}`);
  const badLoginJar = new Client(BASE);
  await badLoginJar.call("POST", "/api/student/login", { json: { studentId, password: "错误口令x" } });
  const meAfterFail = await badLoginJar.call("GET", "/api/student/me");
  s.check("失败登录不建立会话", meAfterFail.status === 401, `HTTP ${meAfterFail.status}`);

  // 停用账号
  const admin = new Client(BASE);
  await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: process.env.DG_ADMIN_PASSWORD! } });
  const stuList = await admin.call("GET", `/api/admin/students?search=${encodeURIComponent(manifest.studentId1)}&page=1&pageSize=1`);
  const stuRow = (stuList.body?.data?.items ?? [])[0];
  assert(stuRow, "未找到学生行");
  const disable = await admin.call("PUT", `/api/admin/students/${stuRow.id}/status`, { json: { status: 0 } });
  s.check("管理员可停用学生", disable.status === 200, `HTTP ${disable.status} ${excerpt(disable.body?.error)}`);
  const disabledLogin = await new Client(BASE).call("POST", "/api/student/login", { json: { studentId, password: studentId } });
  s.check("停用账号不能建立会话", disabledLogin.status === 401, `HTTP ${disabledLogin.status}`);
  await admin.call("PUT", `/api/admin/students/${stuRow.id}/status`, { json: { status: 1 } });
  suites.push(s);
}

{
  const s = new Suite("DG-I-02");
  const student = new Client(BASE);
  const teacher = new Client(BASE);
  await student.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  await teacher.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } });
  s.check("学生会话不能访问教师接口", (await student.call("GET", "/api/teacher/topics")).status === 401, "student→teacher");
  s.check("学生会话不能访问管理接口", (await student.call("GET", "/api/admin/stats")).status === 401, "student→admin");
  s.check("教师会话不能访问学生接口", (await teacher.call("GET", "/api/student/tasks")).status === 401, "teacher→student");
  s.check("教师会话不能访问管理接口", (await teacher.call("GET", "/api/admin/stats")).status === 401, "teacher→admin");
  const admin = new Client(BASE);
  await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: process.env.DG_ADMIN_PASSWORD! } });
  s.check("管理会话不能访问学生接口", (await admin.call("GET", "/api/student/tasks")).status === 401, "admin→student");
  s.check("管理会话不能访问教师接口", (await admin.call("GET", "/api/teacher/topics")).status === 401, "admin→teacher");
  suites.push(s);
}

{
  const s = new Suite("DG-I-03");
  const student = new Client(BASE);
  const me = await student.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  const ownId = Number((await student.call("GET", "/api/student/me")).body.data.id);
  const other = await adminLookup(manifest.class2StudentPrefix);
  s.check("登录后 /me 返回本人", ownId > 0, `id=${ownId}`);
  const match = await student.call("GET", "/api/student/me", { headers: { "X-Expected-User-Id": String(ownId) } });
  s.check("身份约束匹配时放行", match.status === 200, `HTTP ${match.status}`);
  const mismatch = await student.call("GET", "/api/student/me", { headers: { "X-Expected-User-Id": String(other) } });
  s.check("身份约束冲突返回 SESSION_CHANGED", mismatch.status === 409 && mismatch.body?.error?.code === "SESSION_CHANGED", `HTTP ${mismatch.status} ${excerpt(mismatch.body?.error)}`);
  const absent = await student.call("GET", "/api/student/me");
  s.check("未提供约束时仍由 Cookie 授权", absent.status === 200, `HTTP ${absent.status}`);
  const badValue = await student.call("GET", "/api/student/me", { headers: { "X-Expected-User-Id": "not-a-number" } });
  s.check("非法身份约束值被拒绝", badValue.status === 409 || badValue.status === 400, `HTTP ${badValue.status}`);
  void me;
  suites.push(s);
}

async function adminLookup(prefix: string) {
  const admin = new Client(BASE);
  await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: process.env.DG_ADMIN_PASSWORD! } });
  const r = await admin.call("GET", `/api/admin/students?search=${encodeURIComponent(prefix)}&page=1&pageSize=50`);
  const items = r.body?.data?.items ?? [];
  const row = items.find((x: any) => String(x.studentId).startsWith(prefix) && String(x.studentId).endsWith("001")) ?? items[0];
  assert(row, `未找到前缀 ${prefix} 的学生`);
  return Number(row.id);
}

{
  const s = new Suite("DG-I-04");
  const student = new Client(BASE);
  await student.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  const ownId = Number((await student.call("GET", "/api/student/me")).body.data.id);
  const otherId = await adminLookup(manifest.class2StudentPrefix);
  const ok = await student.call("GET", `/api/student/me?expected_user_id=${ownId}`);
  s.check("URL 身份约束匹配放行", ok.status === 200, `HTTP ${ok.status}`);
  const bad = await student.call("GET", `/api/student/me?expected_user_id=${otherId}`);
  s.check("URL 身份约束冲突返回 409", bad.status === 409 && bad.body?.error?.code === "SESSION_CHANGED", `HTTP ${bad.status} ${excerpt(bad.body?.error)}`);
  const none = await student.call("GET", "/api/student/me");
  s.check("缺省约束仍授权", none.status === 200, `HTTP ${none.status}`);
  suites.push(s);
}

{
  const s = new Suite("DG-I-05");
  const student = new Client(BASE);
  await student.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  const logout = await student.call("POST", "/api/student/logout");
  s.check("登出返回成功", logout.status === 200, `HTTP ${logout.status}`);
  const setsCookie = (logout.headers.getSetCookie?.() ?? []).some((c) => /student[_-]?token=/i.test(c) && /max-age=0|expires=/i.test(c));
  s.check("登出不发送清理 Cookie 的 Set-Cookie", !setsCookie, JSON.stringify(logout.headers.getSetCookie?.() ?? []));
  s.check("登出后旧令牌失效", (await student.call("GET", "/api/student/me")).status === 401, "after logout");
  const again = await student.call("POST", "/api/student/logout");
  s.check("重复登出幂等", again.status === 200, `HTTP ${again.status}`);
  suites.push(s);
}

{
  const s = new Suite("DG-I-08");
  const jarA = new Client(BASE);
  const jarB = new Client(BASE);
  const idA = await adminLookup(manifest.class1StudentPrefix);
  await jarA.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  const studentB = `${manifest.class1StudentPrefix}002`;
  const loginB = await jarB.call("POST", "/api/student/login", { json: { studentId: studentB, password: studentB } });
  assert(loginB.status === 200, `学生 B 登录失败：${excerpt(loginB.body)}`);
  const staleWrite = await jarA.call("GET", "/api/student/me", { headers: { "X-Expected-User-Id": String(await adminLookup(manifest.class2StudentPrefix)) } });
  s.check("旧标签页带错身份约束的请求被拒绝", staleWrite.status === 409, `HTTP ${staleWrite.status}`);
  s.check("新账号会话不受影响", (await jarB.call("GET", "/api/student/me")).status === 200, "B still valid");
  void idA;
  suites.push(s);
}

// ---------------------------------------------------------------- DG-P 权限
{
  const s = new Suite("DG-P-01");
  const anon = new Client(BASE);
  const targets = [
    "/api/student/tasks", "/api/student/me", "/api/student/announcements",
    "/api/teacher/topics", "/api/teacher/tasks", "/api/teacher/grading", "/api/teacher/dashboard",
    "/api/admin/stats", "/api/admin/students", "/api/admin/teachers", "/api/admin/classes",
  ];
  const codes: string[] = [];
  for (const t of targets) { const r = await anon.call("GET", t); codes.push(`${t}=${r.status}`); }
  s.check("全部受保护端点对未登录请求返回 401", codes.every((c) => c.endsWith("=401")), codes.join(" "));
  suites.push(s);
}

{
  const s = new Suite("DG-P-02");
  const studentA = new Client(BASE);
  await studentA.call("POST", "/api/student/login", { json: { studentId: manifest.studentId1, password: manifest.studentId1 } });
  const foreignTask = ids.task2;
  const cases: Array<[string, () => Promise<{ status: number }>]> = [
    ["跨班读取实验", () => studentA.call("GET", `/api/student/tasks/${foreignTask}/experiment`)],
    ["跨班读取任务详情", () => studentA.call("GET", `/api/student/tasks/${foreignTask}`)],
    ["跨班导出样本", () => studentA.call("GET", `/api/student/tasks/${foreignTask}/export?type=all`)],
    ["跨班读取分析", () => studentA.call("GET", `/api/student/tasks/${foreignTask}/analysis-metrics`)],
    ["跨班提交", () => studentA.call("POST", `/api/student/tasks/${foreignTask}/submit`, { json: {} })],
    ["跨班抽样", () => studentA.call("POST", `/api/student/tasks/${foreignTask}/sampling`, { json: { method: "simple", params: { sampleSize: 5 } } })],
    ["跨班阶段完成", () => studentA.call("POST", `/api/student/tasks/${foreignTask}/experiment/stages/1/complete`, { json: {} })],
  ];
  const denied: Check[] = [];
  for (const [name, fn] of cases) {
    const r = await fn();
    s.check(`学生横向越权被拒：${name}`, r.status === 403 || r.status === 404, `HTTP ${r.status}`);
  }
  void denied;
  suites.push(s);
}

{
  const s = new Suite("DG-P-03");
  const t1 = new Client(BASE);
  await t1.call("POST", "/api/teacher/login", { json: { employeeId: EMP1, password: EMP1 } });
  const check = async (name: string, r: { status: number }) => s.check(`教师横向越权被拒：${name}`, r.status === 403 || r.status === 404, `HTTP ${r.status}`);
  await check("他人模板详情", await t1.call("GET", `/api/teacher/topics/${ids.topic2}/detail`));
  await check("他人模板改名", await t1.call("PUT", `/api/teacher/topics/${ids.topic2}`, { json: { name: "篡改" } }));
  await check("他人模板总体上传", await t1.call("POST", `/api/teacher/topics/${ids.topic2}/excel`, { form: new FormData() }));
  await check("他人任务进度", await t1.call("GET", `/api/teacher/tasks/${ids.task2}/progress`));
  await check("他人任务截止延长", await t1.call("PUT", `/api/teacher/tasks/${ids.task2}/extend`, { json: { deadline: new Date(Date.now() + 7200_000).toISOString() } }));
  await check("他人任务删除", await t1.call("DELETE", `/api/teacher/tasks/${ids.task2}`));
  await check("他人班级学生列表", await t1.call("GET", `/api/teacher/classes/${manifest.class2}/students`));
  await check("他人班级导入学生", await t1.call("POST", `/api/teacher/classes/${manifest.class2}/students/import`, { form: new FormData() }));
  const t1Topics = await t1.call("GET", "/api/teacher/topics");
  const list = Array.isArray(t1Topics.body?.data) ? t1Topics.body.data : t1Topics.body?.data?.items ?? [];
  s.check("教师模板列表不含他人模板", !list.some((x: any) => Number(x.id) === ids.topic2), JSON.stringify(list.map((x: any) => x.id)));
  suites.push(s);
}

{
  const s = new Suite("DG-P-07");
  const target = "/api/student/login";
  const crossSite = await fetch(BASE + target, {
    method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
    body: JSON.stringify({ studentId: manifest.studentId1, password: manifest.studentId1 }),
  });
  s.check("Sec-Fetch-Site: cross-site 被拒", crossSite.status === 403, `HTTP ${crossSite.status}`);
  const badOrigin = await fetch(BASE + target, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: JSON.stringify({ studentId: manifest.studentId1, password: manifest.studentId1 }),
  });
  s.check("跨站 Origin 被拒", badOrigin.status === 403, `HTTP ${badOrigin.status}`);
  const sameOrigin = await fetch(BASE + target, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ studentId: manifest.studentId1, password: manifest.studentId1 }),
  });
  s.check("同源 Origin 放行", sameOrigin.status === 200, `HTTP ${sameOrigin.status}`);
  const textPlain = await fetch(BASE + target, {
    method: "POST", headers: { "Content-Type": "text/plain", Origin: BASE },
    body: JSON.stringify({ studentId: manifest.studentId1, password: manifest.studentId1 }),
  });
  s.check("非 JSON/表单媒体类型被拒", textPlain.status === 415, `HTTP ${textPlain.status}`);
  const badReferer = await fetch(BASE + target, {
    method: "POST", headers: { "Content-Type": "application/json", Referer: "http://evil.example/x" },
    body: JSON.stringify({ studentId: manifest.studentId1, password: manifest.studentId1 }),
  });
  s.check("跨站 Referer（无 Origin）被拒", badReferer.status === 403, `HTTP ${badReferer.status}`);
  suites.push(s);
}

{
  const s = new Suite("DG-P-08");
  const r = await fetch(BASE + "/student", { method: "HEAD" });
  const need = ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-resource-policy"];
  const missing = need.filter((h) => !r.headers.get(h));
  s.check("页面响应包含全部安全头", missing.length === 0, `missing=${missing.join(",") || "none"}`);
  s.check("CSP 限制 frame-ancestors 与 object-src", /frame-ancestors 'self'/.test(r.headers.get("content-security-policy") ?? "") && /object-src 'none'/.test(r.headers.get("content-security-policy") ?? ""), (r.headers.get("content-security-policy") ?? "").slice(0, 120));
  const api = await fetch(BASE + "/api/student/me");
  s.check("API 响应禁止缓存", /no-store/.test(api.headers.get("cache-control") ?? ""), String(api.headers.get("cache-control")));
  suites.push(s);
}

await Bun.write("evidence/dg/ids.json", JSON.stringify(ids, null, 2));
await writeSuites(process.env.OUT ?? "evidence/dg/results/I-P.json", suites);
