/** DG-M 管理端：学期/班级/教师/学生/公告，并产出后续域复用的夹具。 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const ADMIN_PW = process.env.DG_ADMIN_PASSWORD!;
const RUN = process.env.DG_RUN ?? "r1";
const suites: Suite[] = [];
const manifest: Record<string, unknown> = { base: BASE, run: RUN, createdAt: new Date().toISOString() };

const admin = new Client(BASE);
assert((await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: ADMIN_PW } })).status === 200, "管理员登录失败");

// ---------------- DG-M-02 学期
let semesterA = 0;
let semesterB = 0;
{
  const s = new Suite("DG-M-02");
  const s1 = await admin.call("POST", "/api/admin/semesters", { json: { name: `DGsem-${RUN}-A`, setAsCurrent: true } });
  const s2 = await admin.call("POST", "/api/admin/semesters", { json: { name: `DGsem-${RUN}-B` } });
  s.check("新建学期成功", s1.status === 201 || s1.status === 200, `HTTP ${s1.status} ${excerpt(s1.body?.error)}`);
  assert(s1.body?.data?.id && s2.body?.data?.id, `学期创建失败：${excerpt(s1.body)} / ${excerpt(s2.body)}`);
  semesterA = Number(s1.body.data.id);
  semesterB = Number(s2.body.data.id);

  const list = await admin.call("GET", "/api/admin/semesters");
  const items = Array.isArray(list.body?.data) ? list.body.data : list.body?.data?.items ?? [];
  s.check("当前学期恰有一个", items.filter((x: any) => Number(x.isCurrent) === 1 || x.isCurrent === true).length === 1,
    JSON.stringify(items.map((x: any) => ({ n: x.name, c: x.isCurrent }))));

  const dup = await admin.call("POST", "/api/admin/semesters", { json: { name: `DGsem-${RUN}-A` } });
  s.check("重复学期名被拒绝", dup.status >= 400, `HTTP ${dup.status} ${excerpt(dup.body?.error)}`);

  const rename = await admin.call("PUT", `/api/admin/semesters/${semesterB}/update`, { json: { name: `DGsem-${RUN}-Bx` } });
  s.check("学期改名成功", rename.status === 200, `HTTP ${rename.status} ${excerpt(rename.body?.error)}`);

  // 并发把两个学期都设为当前：必须始终只有一个当前学期
  const [a, b] = await Promise.all([
    admin.call("PUT", `/api/admin/semesters/${semesterA}/current`, { json: {} }),
    admin.call("PUT", `/api/admin/semesters/${semesterB}/current`, { json: {} }),
  ]);
  const after = await admin.call("GET", "/api/admin/semesters");
  const afterItems = Array.isArray(after.body?.data) ? after.body.data : after.body?.data?.items ?? [];
  s.check("并发设为当前后仍恰有一个当前学期",
    afterItems.filter((x: any) => Number(x.isCurrent) === 1 || x.isCurrent === true).length === 1,
    `statuses=${a.status},${b.status} items=${JSON.stringify(afterItems.map((x: any) => ({ n: x.name, c: x.isCurrent })))}`);

  await admin.call("PUT", `/api/admin/semesters/${semesterA}/current`, { json: {} });
  Object.assign(manifest, { semesterA, semesterB });
  suites.push(s);
}

// ---------------- DG-M-04 教师
const EMP: [string, string, string] = [`DGT1-${RUN}`, `DGT2-${RUN}`, `DGT3-${RUN}`];
let teacher1 = 0;
let teacher2 = 0;
let teacher3 = 0;
{
  const s = new Suite("DG-M-04");
  const t1 = await admin.call("POST", "/api/admin/teachers", { json: { employeeId: EMP[0], name: "教师甲" } });
  const t2 = await admin.call("POST", "/api/admin/teachers", { json: { employeeId: EMP[1], name: "教师乙" } });
  const t3 = await admin.call("POST", "/api/admin/teachers", { json: { employeeId: EMP[2], name: "教师丙" } });
  assert(t1.body?.data?.id && t2.body?.data?.id && t3.body?.data?.id,
    `教师创建失败：${excerpt(t1.body)} ${excerpt(t2.body)} ${excerpt(t3.body)}`);
  s.check("新建教师成功", [t1, t2, t3].every((r) => r.status === 201 || r.status === 200), `${t1.status},${t2.status},${t3.status}`);
  teacher1 = Number(t1.body.data.id);
  teacher2 = Number(t2.body.data.id);
  teacher3 = Number(t3.body.data.id);

  const lower = await admin.call("POST", "/api/admin/teachers", { json: { employeeId: EMP[0].toLowerCase(), name: "大小写重复" } });
  s.check("工号唯一且大小写不敏感", lower.status >= 400, `HTTP ${lower.status} ${excerpt(lower.body?.error)}`);

  const rename = await admin.call("PUT", `/api/admin/teachers/${teacher2}`, { json: { name: "教师乙改名" } });
  s.check("教师改名成功", rename.status === 200, `HTTP ${rename.status} ${excerpt(rename.body?.error)}`);

  const reset = await admin.call("POST", `/api/admin/teachers/${teacher1}/reset-password`, { json: {} });
  s.check("重置教师口令成功", reset.status === 200, `HTTP ${reset.status} ${excerpt(reset.body?.error)}`);

  const teachers = await admin.call("GET", "/api/admin/teachers");
  const list = Array.isArray(teachers.body?.data) ? teachers.body.data : teachers.body?.data?.items ?? [];
  s.check("教师列表包含新建教师", list.some((x: any) => x.employeeId === EMP[0]) && list.some((x: any) => x.employeeId === EMP[2]), `count=${list.length}`);
  Object.assign(manifest, { teacher1, teacher2, teacher3, employees: EMP });
  suites.push(s);
}

// ---------------- DG-M-03 班级
let class1 = 0;
let class2 = 0;
{
  const s = new Suite("DG-M-03");
  const c1 = await admin.call("POST", "/api/admin/classes", { json: { name: `DG班级一-${RUN}`, semesterId: semesterA, teacherId: teacher1 } });
  const c2 = await admin.call("POST", "/api/admin/classes", { json: { name: `DG班级二-${RUN}`, semesterId: semesterA, teacherId: teacher2 } });
  const c3 = await admin.call("POST", "/api/admin/classes", { json: { name: `DG班级三-${RUN}`, semesterId: semesterB, teacherId: teacher1 } });
  assert(c1.body?.data?.id && c2.body?.data?.id && c3.body?.data?.id,
    `班级创建失败：${excerpt(c1.body)} ${excerpt(c2.body)} ${excerpt(c3.body)}`);
  s.check("新建班级成功", [c1, c2, c3].every((r) => r.status === 201 || r.status === 200), `${c1.status},${c2.status},${c3.status}`);
  class1 = Number(c1.body.data.id);
  class2 = Number(c2.body.data.id);
  const class3 = Number(c3.body.data.id);

  const reassign = await admin.call("PUT", `/api/admin/classes/${class3}`, { json: { teacherId: teacher3 } });
  s.check("班级可更换教师", reassign.status === 200, `HTTP ${reassign.status} ${excerpt(reassign.body?.error)}`);
  const list = await admin.call("GET", "/api/admin/classes");
  const items = Array.isArray(list.body?.data) ? list.body.data : list.body?.data?.items ?? [];
  const row = items.find((x: any) => Number(x.id) === class3);
  s.check("更换后教师归属已更新", Number(row?.teacherId ?? row?.teacher_id) === teacher3, JSON.stringify(row ?? {}).slice(0, 200));
  Object.assign(manifest, { class1, class2, class3 });
  suites.push(s);
}

// ---------------- DG-M-05 学生（经教师导入）与筛选
const STU_C1 = `DGS-${RUN}-`;
const STU_C2 = `DGP-${RUN}-`;
let studentId1 = "";
{
  const s = new Suite("DG-M-05");
  const t1 = new Client(BASE);
  const login1 = await t1.call("POST", "/api/teacher/login", { json: { employeeId: EMP[0], password: EMP[0] } });
  assert(login1.status === 200, `教师甲登录失败（重置后口令=工号）：${excerpt(login1.body)}`);

  const rowsFor = (prefix: string, n: number) => ["studentId,name,email", ...Array.from({ length: n }, (_, i) =>
    `${prefix}${String(i + 1).padStart(3, "0")},合成学生${i + 1},${prefix.toLowerCase()}${i + 1}@example.com`)].join("\n") + "\n";
  const upload = (content: string, name: string) => {
    const f = new FormData();
    f.append("file", new File([content], name, { type: "text/csv" }));
    return f;
  };

  const importC1 = await t1.call("POST", `/api/teacher/classes/${class1}/students/import`, { form: upload(rowsFor(STU_C1, 25), "s.csv") });
  assert(importC1.status === 200, `导入失败：${excerpt(importC1.body)}`);
  s.check("批量导入 25 名学生", Number(importC1.body.data.successCount) === 25 && Number(importC1.body.data.failureCount) === 0, JSON.stringify(importC1.body.data));
  studentId1 = `${STU_C1}001`;

  const messy = [
    "studentId,name,email",
    `${STU_C1}001,重复学号,x@example.com`,
    `,缺学号,y@example.com`,
    `${STU_C1}NEW1,新学生,z@example.com`,
    "",
    `${STU_C1}NEW2,另一新学生,w@example.com`,
    "",
  ].join("\n");
  const import2 = await t1.call("POST", `/api/teacher/classes/${class1}/students/import`, { form: upload(messy, "m.csv") });
  s.check("重复学号与缺学号被逐行报告", import2.status === 200 && Number(import2.body.data.successCount) === 2 && Number(import2.body.data.failureCount) === 2,
    JSON.stringify(import2.body.data ?? import2.body?.error));

  const t2 = new Client(BASE);
  assert((await t2.call("POST", "/api/teacher/login", { json: { employeeId: EMP[1], password: EMP[1] } })).status === 200, "教师乙登录失败");
  const importC2 = await t2.call("POST", `/api/teacher/classes/${class2}/students/import`, { form: upload(rowsFor(STU_C2, 25), "p.csv") });
  assert(importC2.status === 200, `第二班导入失败：${excerpt(importC2.body)}`);
  s.check("第二个班导入 25 名学生", Number(importC2.body.data.successCount) === 25, JSON.stringify(importC2.body.data));

  const list = await admin.call("GET", `/api/admin/students?class_id=${class1}&page=1&pageSize=10`);
  const page = list.body?.data ?? {};
  s.check("学生列表支持分页", Array.isArray(page.items) && page.items.length === 10 && Number(page.total) >= 27, JSON.stringify({ total: page.total, len: page.items?.length }));
  const search = await admin.call("GET", `/api/admin/students?search=${encodeURIComponent(`${STU_C1}00`)}&page=1&pageSize=5`);
  s.check("学生列表支持关键字搜索", (search.body?.data?.items ?? []).length > 0 && (search.body?.data?.items ?? []).every((x: any) => String(x.studentId).startsWith(`${STU_C1}00`)),
    JSON.stringify((search.body?.data?.items ?? []).map((x: any) => x.studentId)));
  const disabled = await admin.call("GET", "/api/admin/students?status=disabled&page=1&pageSize=5");
  s.check("学生列表支持状态筛选", disabled.status === 200, `HTTP ${disabled.status}`);
  Object.assign(manifest, { studentId1, class1StudentPrefix: STU_C1, class2StudentPrefix: STU_C2 });
  suites.push(s);
}

// ---------------- DG-M-07 / DG-M-08 公告
{
  const s = new Suite("DG-M-07");
  const mk = (title: string, scope: string, publish: boolean) =>
    admin.call("POST", "/api/admin/announcements", { json: { title, content: "公告内容", targetScope: scope, publish } });
  const T = { all: `DG公告-${RUN}-全体`, stu: `DG公告-${RUN}-仅学生`, tea: `DG公告-${RUN}-仅教师`, draft: `DG公告-${RUN}-草稿` };
  const all = await mk(T.all, "all", true);
  const stu = await mk(T.stu, "student", true);
  const tea = await mk(T.tea, "teacher", true);
  const draft = await mk(T.draft, "student", false);
  assert([all, stu, tea, draft].every((r) => r.status === 201 || r.status === 200), `公告创建失败：${excerpt(stu.body)}`);
  s.check("按范围创建并发布公告", true, "4 条已创建（all/student/teacher/草稿）");

  const student = new Client(BASE);
  assert((await student.call("POST", "/api/student/login", { json: { studentId: studentId1, password: studentId1 } })).status === 200, "学生登录失败");
  const sTitles = ((await student.call("GET", "/api/student/announcements")).body?.data ?? []).map((x: any) => x.title);
  s.check("学生只看到 all 与 student 且不含草稿",
    sTitles.includes(T.all) && sTitles.includes(T.stu) && !sTitles.includes(T.tea) && !sTitles.includes(T.draft), JSON.stringify(sTitles));

  const teacher = new Client(BASE);
  assert((await teacher.call("POST", "/api/teacher/login", { json: { employeeId: EMP[0], password: EMP[0] } })).status === 200, "教师登录失败");
  const tTitles = ((await teacher.call("GET", "/api/teacher/announcements")).body?.data ?? []).map((x: any) => x.title);
  s.check("教师只看到 all 与 teacher 且不含草稿",
    tTitles.includes(T.all) && tTitles.includes(T.tea) && !tTitles.includes(T.stu) && !tTitles.includes(T.draft), JSON.stringify(tTitles));

  // 公告状态路由是 PUT（与前端 api-client 一致）
  const unpublish = await admin.call("PUT", `/api/admin/announcements/${stu.body.data.id}/unpublish`, { json: {} });
  s.check("取消发布成功", unpublish.status === 200, `HTTP ${unpublish.status} ${excerpt(unpublish.body?.error)}`);
  const sTitles2 = ((await student.call("GET", "/api/student/announcements")).body?.data ?? []).map((x: any) => x.title);
  s.check("取消发布后学生不可见", !sTitles2.includes(T.stu), JSON.stringify(sTitles2));

  const republish = await admin.call("PUT", `/api/admin/announcements/${stu.body.data.id}/publish`, { json: {} });
  s.check("重新发布成功", republish.status === 200, `HTTP ${republish.status}`);
  suites.push(s);

  const s8 = new Suite("DG-M-08");
  const badScope = await mk(`DG公告-${RUN}-非法范围`, "everyone", true);
  s8.check("非法 target_scope 被拒绝", badScope.status >= 400, `HTTP ${badScope.status} ${excerpt(badScope.body?.error)}`);
  const emptyTitle = await admin.call("POST", "/api/admin/announcements", { json: { title: "", content: "x", targetScope: "all" } });
  s8.check("空标题被拒绝", emptyTitle.status >= 400, `HTTP ${emptyTitle.status} ${excerpt(emptyTitle.body?.error)}`);
  const longTitle = await admin.call("POST", "/api/admin/announcements", { json: { title: "很".repeat(101), content: "x", targetScope: "all" } });
  s8.check("标题超过 100 字被拒绝", longTitle.status >= 400, `HTTP ${longTitle.status} ${excerpt(longTitle.body?.error)}`);
  const longContent = await admin.call("POST", "/api/admin/announcements", { json: { title: "长度边界", content: "内".repeat(20001), targetScope: "all" } });
  s8.check("正文超过上限被拒绝", longContent.status >= 400, `HTTP ${longContent.status} ${excerpt(longContent.body?.error)}`);
  suites.push(s8);
}

// ---------------- DG-M-11 仪表盘口径
{
  const s = new Suite("DG-M-11");
  const stats = await admin.call("GET", "/api/admin/stats");
  const [teachers, classes, students] = await Promise.all([
    admin.call("GET", "/api/admin/teachers"),
    admin.call("GET", "/api/admin/classes"),
    admin.call("GET", "/api/admin/students?page=1&pageSize=1"),
  ]);
  const tCount = (Array.isArray(teachers.body?.data) ? teachers.body.data : teachers.body?.data?.items ?? []).length;
  const cCount = (Array.isArray(classes.body?.data) ? classes.body.data : classes.body?.data?.items ?? []).length;
  const sTotal = Number(students.body?.data?.total ?? 0);
  const d = stats.body?.data ?? {};
  s.check("仪表盘教师数与列表一致", Number(d.teacherCount) === tCount, `stats=${d.teacherCount} list=${tCount}`);
  s.check("仪表盘班级数与列表一致", Number(d.classCount) === cCount, `stats=${d.classCount} list=${cCount}`);
  s.check("仪表盘学生数与列表一致", Number(d.studentCount) === sTotal, `stats=${d.studentCount} list=${sTotal}`);
  s.check("当前学期已设置", d.currentSemester !== "未设置", String(d.currentSemester));
  suites.push(s);
}

await Bun.write("evidence/dg/manifest.json", JSON.stringify(manifest, null, 2));
await writeSuites(process.env.OUT ?? "evidence/dg/results/M.json", suites);
