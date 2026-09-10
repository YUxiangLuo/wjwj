/**
 * R5 准备：向 _r4 实例（6470）导入 50 个合成学生，class 1 / class 2 各 25。
 * 密码规则与产品一致：学生密码 = 学号。
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:6470";
const PREFIX = process.env.STUDENT_PREFIX ?? "L5";

type Jar = Map<string, string>;
async function call(jar: Jar, method: string, path: string, init: { json?: unknown; form?: FormData } = {}) {
    const headers: Record<string, string> = {};
    if (jar.size) headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    let body: BodyInit | undefined;
    if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    else if (init.form) body = init.form;
    const response = await fetch(BASE + path, { method, headers, body });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
        const pair = cookie.split(";", 1)[0]!; const eq = pair.indexOf("=");
        const name = pair.slice(0, eq); const value = pair.slice(eq + 1);
        if (value === "") jar.delete(name); else jar.set(name, value);
    }
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* text */ }
    return { status: response.status, body: parsed as any };
}

const teacher: Jar = new Map();
const login = await call(teacher, "POST", "/api/teacher/login", { json: { employeeId: "T001", password: "T001" } });
if (login.status !== 200) throw new Error(`教师登录失败：${JSON.stringify(login.body)}`);

const perClass = Number(process.env.PER_CLASS ?? 25);
const classes = [1, 2];
const created: Array<{ studentId: string; classId: number }> = [];
let counter = 0;

for (const classId of classes) {
    const rows = ["studentId,name,email"];
    for (let i = 0; i < perClass; i += 1) {
        counter += 1;
        const studentId = `${PREFIX}${String(counter).padStart(4, "0")}`;
        rows.push(`${studentId},合成学生${counter},${studentId.toLowerCase()}@example.com`);
        created.push({ studentId, classId });
    }
    const form = new FormData();
    form.append("file", new File([rows.join("\n") + "\n"], "students.csv", { type: "text/csv" }));
    const res = await call(teacher, "POST", `/api/teacher/classes/${classId}/students/import`, { form });
    console.log(`class ${classId}: HTTP ${res.status} ${JSON.stringify(res.body?.data ?? res.body?.error)}`);
    if (res.status !== 200) throw new Error(`导入失败：${JSON.stringify(res.body)}`);
}

await Bun.write(process.env.OUT ?? "evidence/r5/students.json", JSON.stringify(created, null, 2));
console.log(JSON.stringify({ total: created.length, sample: created.slice(0, 3) }, null, 2));
