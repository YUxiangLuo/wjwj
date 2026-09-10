/**
 * Dogfood 第三批 残余项（HTTP 部分）：R-01 提交已落库但响应丢失。
 *
 * 通过故障代理的 forwardThenFail：请求先被上游真实处理（写入提交），
 * 再向客户端返回 502。客户端无法判断是否提交成功——这才是“响应丢失”。
 * 随后用同一 observedVersion 重试，验证幂等且只有一次提交。
 */
import { SQL } from "bun";

const PROXY = process.env.PROXY_URL ?? "http://127.0.0.1:6469";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required (read-only use)");
const sql = new SQL(DATABASE_URL);

type Jar = Map<string, string>;
interface Check { name: string; ok: boolean; detail: string; }
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string) { checks.push({ name, ok, detail }); }
function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`PREP FAILED: ${message}`);
}
function excerpt(value: unknown, limit = 200) {
    const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
async function setRules(rules: unknown[]) {
    await fetch(`${PROXY}/__fault/rules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
}
async function call(jar: Jar, method: string, path: string, init: { json?: unknown; form?: FormData } = {}) {
    const headers: Record<string, string> = {};
    if (jar.size) headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    let body: BodyInit | undefined;
    if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
    else if (init.form) body = init.form;
    const response = await fetch(PROXY + path, { method, headers, body });
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
async function login(jar: Jar, role: "teacher" | "student", id: string) {
    const payload = role === "teacher" ? { employeeId: id, password: id } : { studentId: id, password: id };
    const res = await call(jar, "POST", `/api/${role}/login`, { json: payload });
    assert(res.status === 200, `${role} ${id} 登录失败：${excerpt(res.body)}`);
    return Number((await call(jar, "GET", `/api/${role}/me`)).body.data.id);
}
const VALUES = [12, 7, 25, 3, 40, 18, 9, 31, 5, 22];
function meanVariance(values: number[]) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}
function planFor(finalSampleSize: number) {
    const N = VALUES.length, variance = meanVariance(VALUES), marginOfError = 2;
    const z = 1.959963984540054, n0 = (z * z * variance) / (marginOfError * marginOfError);
    return { estimationType: "mean", confidenceLevel: "95", marginOfError, populationVariance: variance,
        designEffect: 1, nonResponseRate: 0,
        recommendedSize: Math.max(1, Math.ceil((n0 * N) / (N - 1 + n0))), finalSampleSize };
}
const REPORT = `<p>${"本报告说明抽样设计、估计结果与教学误差半宽的对应关系，并解释设计效应与无回答处理。".repeat(6)}</p>`;
async function seedQuestionnaire() {
    const found = await sql`select questionnaire from experiment where questionnaire is not null order by id limit 1`;
    const value = found[0]?.questionnaire;
    assert(value, "seed 问卷不可用");
    return typeof value === "string" ? JSON.parse(value) : value;
}

const teacherJar: Jar = new Map();
const studentJar: Jar = new Map();
await login(teacherJar, "teacher", "T001");
await login(studentJar, "student", "S011");
const questionnaire = await seedQuestionnaire();
await setRules([]);

let res = await call(teacherJar, "POST", "/api/teacher/topics", { json: { name: `DFR01 ${Date.now()}` } });
assert(res.status === 201, `创建模板失败：${excerpt(res.body)}`);
const topicId = Number(res.body.data.id);
const rows: Array<Record<string, string>> = VALUES.map((v, i) => ({ 记录编号: String(i + 1), y: String(v) }));
const columns = Object.keys(rows[0]!);
const form = new FormData();
form.append("file", new File([[columns.join(","), ...rows.map((r) => columns.map((c) => r[c]).join(","))].join("\n")], "population.csv", { type: "text/csv" }));
res = await call(teacherJar, "POST", `/api/teacher/topics/${topicId}/excel`, { form });
assert(res.status === 200, `上传失败：${excerpt(res.body)}`);
res = await call(teacherJar, "PUT", `/api/teacher/topics/${topicId}/mapping`, {
    json: { fieldMapping: { identifier: "记录编号", numeric: ["y"], others: [], stratified: [], studyContract: {
        version: 1, researchQuestion: "DFR01 的 y 均值", targetPopulation: "10 个合成单位", unitOfAnalysis: "合成单位",
        target: { kind: "mean", field: "y" } } } } });
assert(res.status === 200, `映射失败：${excerpt(res.body)}`);
res = await call(teacherJar, "PUT", `/api/teacher/topics/${topicId}/sampling-policy`, {
    json: { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "required", pps: "disabled", stratified: "disabled" } } } });
assert(res.status === 200, `策略失败：${excerpt(res.body)}`);
res = await call(teacherJar, "PUT", `/api/teacher/topics/${topicId}/weights`, { json: { weightConfig: { questionnaire: 30, process: 30, report: 40 } } });
assert(res.status === 200, `权重失败：${excerpt(res.body)}`);
res = await call(teacherJar, "PUT", `/api/teacher/topics/${topicId}`, { json: { status: 1 } });
assert(res.status === 200, `发布模板失败：${excerpt(res.body)}`);
res = await call(teacherJar, "POST", "/api/teacher/tasks", { json: { topicId, classIds: [1] } });
assert(res.status === 201, `分配失败：${excerpt(res.body)}`);
const taskId = Number((await sql`select id from task where topic_id = ${topicId} and class_id = 1`)[0]!.id);

res = await call(studentJar, "GET", `/api/student/tasks/${taskId}/experiment`);
let version = Number(res.body.data.version);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/experiment/stages/1/complete`, { json: { observedVersion: version, questionnaire } });
assert(res.status === 200, `阶段1失败：${excerpt(res.body)}`);
version = Number(res.body.data.version);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/experiment/stages/2/complete`, { json: { observedVersion: version, samplePlan: planFor(5) } });
assert(res.status === 200, `阶段2失败：${excerpt(res.body)}`);
version = Number(res.body.data.version);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "simple", params: { sampleSize: 5, seed: 71 } } });
assert(res.status === 200, `抽样失败：${excerpt(res.body)}`);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/sampling`, { json: { method: "systematic", params: { seed: 71 } } });
assert(res.status === 200, `系统抽样失败：${excerpt(res.body)}`);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/experiment/stages/3/complete`, { json: { observedVersion: version } });
assert(res.status === 200, `阶段3失败：${excerpt(res.body)}`);
version = Number(res.body.data.version);
res = await call(studentJar, "POST", `/api/student/tasks/${taskId}/experiment/stages/4/complete`, { json: { observedVersion: version, reportContent: REPORT } });
assert(res.status === 200, `阶段4失败：${excerpt(res.body)}`);
version = Number(res.body.data.version);

// ---- 注入：上游真实提交，但客户端只拿到 502
await setRules([{ id: "submit-lost", method: "POST", pathIncludes: `/api/student/tasks/${taskId}/submit`,
    action: { type: "forwardThenFail", status: 502, code: "GATEWAY_ERROR", message: "网关在响应返回前中断" } }]);
const lost = await call(studentJar, "POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: version } });
check("R-01 客户端只看到失败响应", lost.status === 502, `HTTP ${lost.status} ${excerpt(lost.body?.error)}`);

const committed = await sql`select status, submitted_at, submission_snapshot from experiment where task_id = ${taskId}`;
check("R-01 服务端其实已提交（客户端无法判断）", committed[0]!.status === "submitted" && committed[0]!.submission_snapshot !== null,
    `status=${committed[0]!.status} snapshot=${committed[0]!.submission_snapshot !== null}`);
const submittedAtBefore = new Date(committed[0]!.submitted_at).toISOString();

// ---- 清除故障后重试：幂等
await setRules([]);
const retry = await call(studentJar, "POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: version } });
check("R-01 重试成功而不是报假冲突", retry.status === 200 && retry.body?.success === true, `HTTP ${retry.status} ${excerpt(retry.body)}`);
const after = await sql`select status, submitted_at from experiment where task_id = ${taskId}`;
check("R-01 重试未改写 submitted_at", new Date(after[0]!.submitted_at).toISOString() === submittedAtBefore,
    `${submittedAtBefore} -> ${new Date(after[0]!.submitted_at).toISOString()}`);
const count = await sql`select count(*)::int as n from experiment where task_id = ${taskId} and submitted_at is not null`;
check("R-01 全过程只有一次提交", Number(count[0]!.n) === 1, String(count[0]!.n));

// ---- 用更旧的版本重试：已提交实验允许 older version 幂等返回
const stale = await call(studentJar, "POST", `/api/student/tasks/${taskId}/submit`, { json: { observedVersion: version - 1 } });
check("R-01 已提交实验接受更旧版本重放（幂等）", stale.status === 200, `HTTP ${stale.status} ${excerpt(stale.body)}`);

const output = [{ id: "R-01", status: checks.every((c) => c.ok) ? "PASS" : "FAIL", checks }];
await Bun.write("evidence/R3/R01-verdicts.json", JSON.stringify(output, null, 2));
await Bun.write("evidence/R3/cases-R01.jsonl", JSON.stringify({
    id: "R-01", commit: "1dd70e787905bf9b827db3952cc36cc99b1bb74e", role: "student",
    dataset: "forward-then-fail submit", status: output[0]!.status,
    expected: checks.map((c) => c.name), actual: checks.filter((c) => !c.ok).map((c) => `${c.name} => ${c.detail}`).join("; ") || "all checks met",
    evidence: "evidence/R3/R01-verdicts.json", testedAt: new Date().toISOString(), checks,
}) + "\n");

console.log(JSON.stringify({ taskId, checks, failed: checks.filter((c) => !c.ok).length }, null, 2));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
await sql.end();
