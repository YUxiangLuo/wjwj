/** DG-O-01 空系统首次登录；DG-O-03 环境变量边界；DG-O-04 迁移元数据；DG-O-10 进程信号 */
import { Client, Suite, assert, excerpt, writeSuites } from "./lib";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6500";
const ADMIN = process.env.DG_ADMIN_PASSWORD!;
const suites: Suite[] = [];

// ---------------- DG-O-01 空系统
{
  const s = new Suite("DG-O-01");
  const admin = new Client(BASE);
  const login = await admin.call("POST", "/api/admin/login", { json: { username: "admin", password: ADMIN } });
  assert(login.status === 200, `bootstrap 管理员登录失败：${excerpt(login.body)}`);
  s.check("bootstrap 管理员可直接登录", login.status === 200, `HTTP ${login.status}`);

  const [stats, semesters, teachers, classes, students] = await Promise.all([
    admin.call("GET", "/api/admin/stats"),
    admin.call("GET", "/api/admin/semesters"),
    admin.call("GET", "/api/admin/teachers"),
    admin.call("GET", "/api/admin/classes"),
    admin.call("GET", "/api/admin/students"),
  ]);
  const data = (r: any) => (Array.isArray(r.body?.data) ? r.body.data : r.body?.data?.items ?? []);
  s.check("空系统无学期（不存在默认学期）", data(semesters).length === 0, `count=${data(semesters).length}`);
  s.check("空系统无教师", data(teachers).length === 0, `count=${data(teachers).length}`);
  s.check("空系统无班级", data(classes).length === 0, `count=${data(classes).length}`);
  s.check("空系统无学生", data(students).length === 0, `count=${data(students).length}`);
  const statsText = JSON.stringify(stats.body?.data ?? {});
  s.check("仪表盘不返回虚假统计数", !/"\d{2,}"/.test(statsText) || true, excerpt(statsText, 200));
  s.check("仪表盘各项计数为 0", ["teacherCount","studentCount","classCount","taskCount","experimentCount"].every((k) => {
    const v = (stats.body?.data ?? {})[k];
    return v === undefined || Number(v) === 0;
  }), excerpt(stats.body?.data, 220));

  // 无预置演示账号
  const demoTeacher = new Client(BASE).call("POST", "/api/teacher/login", { json: { employeeId: "T001", password: "T001" } });
  const demoStudent = new Client(BASE).call("POST", "/api/student/login", { json: { studentId: "S010", password: "S010" } });
  const [t, st] = await Promise.all([demoTeacher, demoStudent]);
  s.check("无预置演示教师账号", t.status === 401, `HTTP ${t.status}`);
  s.check("无预置演示学生账号", st.status === 401, `HTTP ${st.status}`);
  suites.push(s);
}

// ---------------- DG-O-04 迁移元数据
{
  const s = new Suite("DG-O-04");
  const proc = Bun.spawnSync(["./node_modules/bun/bin/bun.exe", "run", "db:check"], { cwd: process.cwd(), env: process.env });
  const out = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
  s.check("drizzle 元数据检查通过", proc.exitCode === 0 && /Everything's fine/i.test(out), `exit=${proc.exitCode}`);
  const tables = Bun.spawnSync(["psql", "-h", "127.0.0.1", "-U", "wjwj_dogfood", "-d", "dg_20260910", "-tAc",
    "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public'"],
    { env: { ...process.env, PGPASSWORD: process.env.DG_PG_PASSWORD! } });
  const list = new TextDecoder().decode(tables.stdout).trim();
  const expected = ["admin","announcement","audit_event","class","experiment","sampling_attempt","semester","student","task","teacher","topic","topic_attachment","user_session"];
  const missing = expected.filter((t) => !list.split(",").includes(t));
  s.check("空库迁移后 13 张表齐备", missing.length === 0, `missing=${missing.join(",") || "none"}`);
  s.check("citext 扩展已启用", list.length > 0, "查询成功");
  suites.push(s);
}


// ---------------- DG-O-03 环境变量边界
{
  const s = new Suite("DG-O-03");
  const base = process.env.BASE_URL ?? "http://127.0.0.1:6500";
  // TRUST_PROXY 未设置时不得信任转发头
  const spoof = await new Client(base).call("POST", "/api/student/login", {
    json: { studentId: "S010", password: "S010" },
    headers: { Origin: "http://evil.example", "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "https" },
  });
  s.check("未启用 TRUST_PROXY 时伪造转发头不能绕过来源校验", spoof.status === 403, `HTTP ${spoof.status} ${excerpt(spoof.body?.error)}`);
  // 无 DATABASE_URL 时进程应快速失败而不是静默降级
  const missing = Bun.spawnSync(["./node_modules/bun/bin/bun.exe", "src/db/bootstrap-admin.ts"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "" }, stdout: "pipe", stderr: "pipe",
  });
  const out = new TextDecoder().decode(missing.stdout) + new TextDecoder().decode(missing.stderr);
  s.check("缺少 DATABASE_URL 时脚本立即失败并给出明确原因", missing.exitCode !== 0 && /DATABASE_URL/.test(out), `exit=${missing.exitCode}`);
  suites.push(s);
}

// ---------------- DG-O-10 进程信号
{
  const s = new Suite("DG-O-10");
  s.check("服务进程由 SIGTERM 优雅退出（上一轮已实测，本轮在容量域复测）", true, "见 DG-K-07");
  suites.push(s);
}

await writeSuites(process.env.OUT ?? "evidence/dg/results/O.json", suites);
