import { SQL } from "bun";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";

// End-to-end compatibility matrix. Expected estimates and design SEs below
// deliberately do not import any production statistical implementation.
const root = resolve(import.meta.dir, "..");
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL role with CREATEDB is required");
const admin = new SQL(process.env.TEST_DATABASE_URL);
const database = `wj_compat_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${database}`;
const workdir = await mkdtemp(join(tmpdir(), "wj-compat-"));
const artifacts = resolve(process.env.COMPATIBILITY_ARTIFACTS ?? join(root, ".amp/in/artifacts/topic-compatibility"));
await mkdir(artifacts, { recursive: true });
const env = { ...process.env, DATABASE_URL: String(url), TEST_DATABASE_URL: String(url), DEV_AUTH_MODE: "0", DEMO_MODE: "0", NODE_ENV: "production" };
let server: ReturnType<typeof Bun.spawn> | undefined;
let created = false, base = "", requests = 0, checks = 0, renderedComparisons = 0;
const results: unknown[] = [], failures: unknown[] = [];
const browserSessions: string[] = [];
const browserCases: Array<{ label: string; task: number; experiment: number }> = [];
const methods = ["simple", "systematic", "pps", "stratified"] as const;
type Method = typeof methods[number];
type Row = Record<string, string | number>;
type Profile = { name: string; kind: "mean" | "proportion"; scale: number; target: string; unit: string; rows: Row[]; methods: Method[] };
const key = (value: unknown) => String(value).trim().normalize("NFKC");
const mean = (values: number[]) => { const origin = values[0]!; return origin + values.reduce((s, y) => s + (y - origin), 0) / values.length; };
const variance = (values: number[]) => values.length < 2 ? 0 : values.reduce((s, y) => s + (y - mean(values)) ** 2, 0) / (values.length - 1);
function near(actual: number, expected: number, label: string) {
    checks++; assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, actual ${actual}`);
}
function same(actual: unknown, expected: unknown) { checks++; assert.deepEqual(actual, expected); }
async function command(args: string[], cwd = root, overrides = {}) {
    const p = Bun.spawn(args, { cwd, env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(`${args.join(" ")}: ${stderr}\n${stdout}`);
    return stdout;
}
async function request(cookie: string, path: string, method = "GET", body?: unknown) {
    requests++;
    return fetch(base + path, { method, headers: { cookie, origin: base, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
}
async function api(cookie: string, path: string, method = "GET", body?: unknown) {
    const r = await request(cookie, path, method, body); const p = await r.json();
    assert.ok(r.ok && p.success, `${method} ${path}: ${r.status} ${JSON.stringify(p)}`);
    return p.data;
}
async function denied(cookie: string, path: string, method: string, body: unknown) {
    const r = await request(cookie, path, method, body); const p = await r.json();
    checks++; assert.ok(r.status >= 400 && r.status < 500 && !p.success, `${method} ${path} should reject: ${r.status} ${JSON.stringify(p)}`);
    return p.error;
}
async function login(role: "teacher" | "student", account: string) {
    const r = await request("", `/api/${role}/login`, "POST", { [role === "teacher" ? "employeeId" : "studentId"]: account, password: account });
    assert.ok(r.ok, `login ${account}`); return r.headers.get("set-cookie")!.split(";")[0]!;
}
function profiles(): Profile[] {
    const names = ["企业净利润", "农业产量", "环境浓度", "医疗费用", "绿色通勤", "罕见事件", "全员达标", "编码类别"];
    return names.map((name, p) => ({ name, kind: p < 4 ? "mean" : "proportion", scale: p === 2 ? 1e-6 : 1,
        target: p === 7 ? "A" : "是", unit: ["万元", "千克", "毫克/升", "元"][p] ?? "",
        methods: p === 0 ? ["simple", "systematic"] : p === 4 ? ["simple", "stratified"] : [...methods],
        rows: Array.from({ length: 24 }, (_, i) => ({
            "编号": String(i + 1).padStart(4, "0"),
            " 测量值 ": (p === 0 ? i * 7 - 81 : p === 3 ? (i === 23 ? 900 : i * 2 + .5) : (i * 7 % 31) + .25) * (p === 2 ? 1e-6 : 1),
            "规模": i === 23 ? 1000 : i % 5 + 1,
            "分层": i === 0 ? "小层" : i < 8 ? "中层" : "大层",
            "类别": p === 5 ? (i === 23 ? "是" : "否") : p === 6 ? "是" : p === 7 ? ["Ａ", "A", " A ", "B"][i % 4]! : i % 3 === 0 ? "是" : "否",
        })),
    }));
}
// Exact random-start distribution for fixed-size systematic sampling, using
// integer boundaries in n*r coordinates rather than the production event sweep.
function systematicSe(y: number[], n: number) {
    const N = y.length, boundaries = new Set([0, N]);
    for (let j = 0; j < n; j++) for (let k = 0; k <= N; k++) { const b = k * n - j * N; if (b > 0 && b < N) boundaries.add(b); }
    const sorted = [...boundaries].sort((a, b) => a - b);
    const distribution = sorted.slice(1).map((hi, i) => { const lo = sorted[i]!; return { p: (hi - lo) / N, y: mean(Array.from({ length: n }, (_, j) => y[Math.floor(((lo + hi) / 2 + j * N) / n)]!)) }; });
    const center = distribution.reduce((s, v) => s + v.p * v.y, 0);
    return Math.sqrt(distribution.reduce((s, v) => s + v.p * (v.y - center) ** 2, 0));
}
function ppsReference(sizes: number[], n: number, y: number[]) {
    const pi = sizes.map(() => 0); let active = sizes.map((_, i) => i), remaining = n;
    while (active.length) {
        const mass = active.reduce((s, i) => s + sizes[i]!, 0);
        const certain = active.filter(i => remaining * sizes[i]! >= mass);
        if (!certain.length) { for (const i of active) pi[i] = remaining * sizes[i]! / mass; break; }
        for (const i of certain) pi[i] = 1;
        remaining -= certain.length; active = active.filter(i => !certain.includes(i));
    }
    let sum = 0; const intervals = pi.map((p, i) => { const lo = sum; if (p < 1) sum += p; return { i, lo, hi: sum, p }; }).filter(v => v.p < 1);
    const boundaries = [...new Set([0, 1, ...intervals.map(v => v.hi % 1)])].sort((a, b) => a - b);
    const distribution = boundaries.slice(1).flatMap((hi, i) => {
        const lo = boundaries[i]!; if (hi - lo < 1e-12) return [];
        const indices = pi.flatMap((p, i) => p === 1 ? [i] : []);
        for (let k = 0; k < Math.round(sum); k++) indices.push(intervals.find(v => k + (lo + hi) / 2 >= v.lo && k + (lo + hi) / 2 < v.hi)!.i);
        const denominator = indices.reduce((s, i) => s + 1 / pi[i]!, 0);
        return [{ p: hi - lo, y: indices.reduce((s, i) => s + y[i]! / pi[i]!, 0) / denominator }];
    });
    const center = distribution.reduce((s, v) => s + v.p * v.y, 0);
    return { pi, se: Math.sqrt(distribution.reduce((s, v) => s + v.p * (v.y - center) ** 2, 0)) };
}
try {
    await admin.unsafe(`CREATE DATABASE "${database}"`); created = true;
    for (const file of ["public", "node_modules", "bunfig.toml", "scripts"]) await symlink(join(root, file), join(workdir, file));
    await command([process.execPath, "src/db/migrate.ts"]);
    await command([process.execPath, join(root, "src/db/seeds/default.ts")], workdir, { DEMO_MODE: "1", SEED_ADMIN_PASSWORD: "compatibility-test-only" });
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reservation.port!; await reservation.stop(true); base = `http://127.0.0.1:${port}`;
    server = Bun.spawn([process.execPath, join(root, "src/index.ts")], { cwd: workdir, env: { ...env, HOST: "127.0.0.1", PORT: String(port) }, stdout: Bun.file(join(artifacts, "server.log")), stderr: Bun.file(join(artifacts, "server-errors.log")) });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/api/student/me")).status === 401) { ready = true; break; } } catch {} await Bun.sleep(100); }
    assert.ok(ready, "server ready");
    const teacher = await login("teacher", "T001");
    const students = await Promise.all(["S2601", "S2602", "S2603"].map(id => login("student", id)));
    const cls = (await api(teacher, "/api/teacher/classes")).find((c: any) => c.name === "2026级统计学1班");
    assert.ok(cls);
    for (const profile of profiles()) for (const format of ["csv", "xlsx"]) {
        const label = `${profile.name}-${format}`;
        try {
            const { id } = await api(teacher, "/api/teacher/topics", "POST", { name: `兼容性：${label}` });
            const sheet = XLSX.utils.json_to_sheet(profile.rows), book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "总体");
            const bytes = format === "csv" ? "\ufeff" + XLSX.utils.sheet_to_csv(sheet) : XLSX.write(book, { type: "buffer", bookType: "xlsx" });
            const form = new FormData(); form.set("file", new File([bytes], `${label}.${format}`));
            const uploaded = await api(teacher, `/api/teacher/topics/${id}/excel`, "POST", form); same(uploaded.rowCount, 24);
            const target = profile.kind === "mean" ? { kind: "mean", field: " 测量值 " } : { kind: "proportion", field: "类别", value: profile.target };
            const mapping = { identifier: "编号", numeric: [" 测量值 ", "规模"], stratified: ["分层"], others: ["类别"], studyContract: { version: 1, researchQuestion: `估计${profile.name}的${profile.kind === "mean" ? "均值" : "比例"}`, targetPopulation: "24个合成观测单位", unitOfAnalysis: "一行对应一个单位", target } };
            await api(teacher, `/api/teacher/topics/${id}/mapping`, "PUT", { fieldMapping: mapping });
            const policy = { version: 1, methods: Object.fromEntries(methods.map(m => [m, profile.methods.includes(m) ? "required" : "disabled"])), ...(profile.methods.includes("pps") ? { ppsSizeFields: ["规模"] } : {}) };
            await api(teacher, `/api/teacher/topics/${id}/sampling-policy`, "PUT", { samplingPolicy: policy });
            const weights = { questionnaire: 25, process: 31, report: 44 };
            await api(teacher, `/api/teacher/topics/${id}/weights`, "PUT", { weightConfig: weights });
            const dictionary = await api(teacher, `/api/teacher/topics/${id}/variables`);
            dictionary.suggestion.variables.find((v: any) => v.field === " 测量值 ").unit = profile.unit;
            const conflicting = structuredClone(dictionary.suggestion);
            const primary = conflicting.variables.find((v: any) => v.field === target.field);
            // CSV formatting may expand scientific notation; missing codes match raw text exactly.
            const observedValue = format === "csv"
                ? XLSX.utils.sheet_to_json<Row>(XLSX.read(bytes, { type: "string", raw: true }).Sheets.Sheet1!)[0]![target.field]
                : profile.rows[0]![target.field];
            primary.missing.push(observedValue);
            primary.categories = primary.categories.filter((c: any) => c.value !== observedValue);
            const missingError = await denied(teacher, `/api/teacher/topics/${id}/variables`, "PUT", { source: dictionary.source, observedRevision: dictionary.revision, dictionary: conflicting });
            assert.match(missingError.message, /研究目标变量.*缺失/);
            same((await api(teacher, `/api/teacher/topics/${id}/variables`)).revision, dictionary.revision);
            await api(teacher, `/api/teacher/topics/${id}/variables`, "PUT", { source: dictionary.source, observedRevision: dictionary.revision, dictionary: dictionary.suggestion });
            await api(teacher, `/api/teacher/topics/${id}`, "PUT", { status: 1 });
            await api(teacher, "/api/teacher/tasks", "POST", { topicId: id, classIds: [cls.id], deadline: new Date(Date.now() + 86400000).toISOString() });
            for (let s = 0; s < students.length; s++) {
                const student = students[s]!, n = [7, 16, 24][s]!, seed = [713, 29, 1701][s]!;
                const task = (await api(student, "/api/student/tasks")).find((t: any) => t.name === `兼容性：${label}`);
                assert.ok(task, "published task visible"); const prefix = `/api/student/tasks/${task.id}`;
                let exp = await api(student, `${prefix}/experiment`); same(exp.samplingPolicy, policy);
                const questionnaire = { title: "兼容性预试", welcomeText: "欢迎参加此次教学预试，所有回答仅用于检查问卷可读性，不参与总体统计估计。", endingText: "感谢参加此次教学预试，所有回答仅用于检查问卷可读性，不参与总体统计估计。", questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: `第${i + 1}项是否清楚？` })) };
                exp = await api(student, `${prefix}/experiment/stages/1/complete`, "POST", { observedVersion: exp.version, questionnaire });
                const rawY = profile.rows.map(r => Number(r[" 测量值 "]));
                const sigma2 = variance(rawY.map(y => y / profile.scale)) * 23 / 24 * profile.scale ** 2;
                const margin = profile.kind === "mean" ? 2 * profile.scale : 5;
                const rawN = 1.96 ** 2 * (profile.kind === "mean" ? sigma2 / margin ** 2 : .25 / .05 ** 2);
                const recommended = Math.min(24, Math.ceil(rawN * 24 / (23 + rawN)));
                const plan = { estimationType: profile.kind, confidenceLevel: "95", marginOfError: margin, populationVariance: sigma2, p: .5, designEffect: 1, nonResponseRate: 0, recommendedSize: recommended, finalSampleSize: n };
                exp = await api(student, `${prefix}/experiment/stages/2/complete`, "POST", { observedVersion: exp.version, samplePlan: plan });
                for (const method of methods.filter(m => !profile.methods.includes(m))) await denied(student, `${prefix}/sampling`, "POST", { method, params: { sampleSize: n, sizeField: "规模" } });
                const counts = n === 7 ? [1, 2, 4] : n === 16 ? [1, 5, 10] : [1, 7, 16];
                for (const method of profile.methods) await api(student, `${prefix}/sampling`, "POST", { method, params: { sampleSize: n, seed, sizeField: "规模", stratifyBy: "分层", layers: ["小层", "中层", "大层"].map((name, i) => ({ name, sampleCount: counts[i] })) } });
                exp = await api(student, `${prefix}/experiment`);
                exp = await api(student, `${prefix}/experiment/stages/3/complete`, "POST", { observedVersion: exp.version });
                const metrics = await api(student, `${prefix}/analysis-metrics`);
                const y = profile.rows.map(r => profile.kind === "mean" ? Number(r[" 测量值 "]) / profile.scale : +(key(r["类别"]) === profile.target));
                const pps = ppsReference(profile.rows.map(r => Number(r["规模"])), n, y);
                near(metrics.target.populationValue / profile.scale, mean(y), `${label} population`);
                const references: number[] = [];
                for (const method of profile.methods) {
                    const sample = exp.samplingResults[method];
                    const exported = await request(student, `${prefix}/export?type=${method}`); same(exported.status, 200);
                    const csv = await exported.text(); const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(XLSX.read(csv, { type: "string", raw: true }).Sheets.Sheet1!);
                    same(parsed.length, n);
                    const indices = parsed.map(row => profile.rows.findIndex(source => source["编号"] === row["编号"]));
                    assert.ok(indices.every(i => i >= 0), "exported IDs belong to the population and preserve leading zeroes");
                    same(indices.length, n); same(new Set(indices).size, n);
                    for (let i = 0; i < n; i++) same(String(sample.data[i]["编号"]), profile.rows[indices[i]!]!["编号"]);
                    let w = indices.map(() => 1), se = 0;
                    if (method === "simple") se = Math.sqrt(variance(y) * (1 - n / 24) / n);
                    if (method === "systematic") {
                        se = systematicSe(y, n);
                        same(indices, Array.from({ length: n }, (_, j) => Math.floor(sample.randomStart + j * 24 / n)));
                    }
                    if (method === "pps") { w = indices.map(i => 1 / pps.pi[i]!); se = pps.se; indices.forEach((i, j) => near(Number(parsed[j]!.__wj_inclusion_probability), pps.pi[i]!, `${label} pi`)); }
                    if (method === "stratified") {
                        w = indices.map(i => { const h = ["小层", "中层", "大层"].indexOf(String(profile.rows[i]!["分层"])); return [1, 7, 16][h]! / counts[h]!; });
                        se = Math.sqrt(["小层", "中层", "大层"].reduce((sum, group, h) => { const values = y.filter((_, i) => profile.rows[i]!["分层"] === group); return sum + (values.length / 24) ** 2 * (1 - counts[h]! / values.length) * variance(values) / counts[h]!; }, 0));
                    }
                    const estimate = indices.reduce((sum, i, j) => sum + y[i]! * w[j]!, 0) / w.reduce((sum, value) => sum + value, 0);
                    near(metrics.target.methods[method].estimate / profile.scale, estimate, `${label}/${n}/${method} estimate`);
                    near(metrics.target.methods[method].standardError / profile.scale, se, `${label}/${n}/${method} SE`);
                    near(metrics.target.methods[method].marginOfError / profile.scale, se * 1.96, `${label}/${n}/${method} halfwidth`);
                    // Dictionary analyses use raw typed categories, intentionally not the main chart's NFKC groups.
                    const saved = await api(student, `${prefix}/analyses`, "POST", { requestId: crypto.randomUUID(), observedVersion: exp.version, config: { question: "核对该抽样设计下的加权测量值", field: " 测量值 ", method, weighted: true } });
                    const numericExpected = indices.reduce((sum, i, j) => sum + rawY[i]! / profile.scale * w[j]!, 0) / w.reduce((sum, value) => sum + value, 0);
                    near(saved.result.mean / profile.scale, numericExpected, `${label}/${method} saved weighted mean`); references.push(saved.id);
                    const categorical = await api(student, `${prefix}/analyses`, "POST", { requestId: crypto.randomUUID(), observedVersion: exp.version, config: { question: "核对原始编码类别的加权比例", field: "类别", method, weighted: true } });
                    for (const category of categorical.result.categories) {
                        const positions = indices.flatMap((i, j) => profile.rows[i]!["类别"] === category.value ? [j] : []);
                        same(category.count, positions.length);
                        near(category.proportion, positions.reduce((sum, j) => sum + w[j]!, 0) / w.reduce((sum, value) => sum + value, 0), "typed weighted category");
                    }
                    references.push(categorical.id);
                }
                exp = await api(student, `${prefix}/experiment/stages/4/complete`, "POST", { observedVersion: exp.version, reportContent: `<p>${"这是统计兼容性测试报告，比较不同抽样设计的点估计与设计标准误，不把教学区间当成覆盖率保证。".repeat(6)}</p>`, analysisReferences: references });
                await api(student, `${prefix}/submit`, "POST", { observedVersion: exp.version });
                const submitted = await api(student, `${prefix}/submission`);
                const grading = await api(teacher, `/api/teacher/grading/${exp.id}`);
                same(submitted.snapshot.targetMetrics, metrics.target); same(grading.targetMetrics, metrics.target);
                same(grading.analysisAppendices, submitted.snapshot.analysisAppendices);
                same(grading.analysisAppendices.map((a: any) => a.id), references);
                for (const method of profile.methods) {
                    const studentCsv = await request(student, `${prefix}/export?type=${method}`);
                    const teacherCsv = await request(teacher, `/api/teacher/grading/${exp.id}/sampling-export?type=${method}`);
                    same(teacherCsv.status, 200); same(await teacherCsv.text(), await studentCsv.text());
                }
                const grade = await api(teacher, `/api/teacher/grading/${exp.id}`, "POST", { observedVersion: grading.version, scoreQuestionnaire: 73, scoreProcess: 86, scoreReport: 91, comment: "专项联动验收" });
                near(grade.totalScore, (73 * 25 + 86 * 31 + 91 * 44) / 100, "grade");
                const graded = await api(student, `${prefix}/submission`); near(graded.totalScore, grade.totalScore, "student grade");
                const excel = await request(teacher, `/api/teacher/grade-export/excel?taskId=${task.id}`); same(excel.status, 200);
                const workbook = XLSX.read(await excel.arrayBuffer(), { type: "array" });
                assert.ok(XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]!]!).includes(String(grade.totalScore)), "grade export score");
                results.push({ label, n, methods: profile.methods, task: task.id, experiment: exp.id, target: metrics.target, grade: grade.totalScore });
                if (format === "csv" && s === 0) browserCases.push({ label, task: task.id, experiment: exp.id });
                console.log(`PASS ${label} n=${n}: teacher upload/publish → student ${profile.methods.join("/")} → appendices/export/submit → teacher grade/export`);
            }
        } catch (cause) { failures.push({ label, error: String(cause) }); console.error(`FAIL ${label}: ${cause}`); }
    }
    // Render both roles for every data shape, using the same real login sessions.
    async function browser(session: string, ...args: string[]) {
        const reply = JSON.parse(await command([process.execPath, join(root, "node_modules/agent-browser/bin/agent-browser.js"), "--session", session, "--json", ...args]));
        assert.ok(reply.success, JSON.stringify(reply)); return reply.data;
    }
    const sessions = { student: `compat-student-${database}`, teacher: `compat-teacher-${database}` };
    for (const [role, cookie] of [["student", students[0]!], ["teacher", teacher]] as const) {
        const session = sessions[role]; browserSessions.push(session);
        const separator = cookie.indexOf("=");
        await browser(session, "cookies", "set", cookie.slice(0, separator), cookie.slice(separator + 1), "--url", base, "--httpOnly");
        await browser(session, "set", "viewport", "1440", "1000");
    }
    for (const fixture of browserCases) {
        const tables: string[] = [];
        for (const role of ["student", "teacher"] as const) {
            const session = sessions[role];
            await browser(session, "open", base + (role === "student" ? `/student/task/${fixture.task}/result` : `/teacher/grading/${fixture.experiment}`));
            let table = "";
            for (let retry = 0; retry < 50 && !table; retry++) {
                table = (await browser(session, "eval", `(() => { const tab=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='报告'); if(tab && tab.getAttribute('aria-selected')!=='true'){tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));tab.click();} const panel=document.querySelector('[data-testid=student-target-metrics]'); if(!panel)return ''; panel.scrollIntoView({block:'center'}); return panel.querySelector('table')?.innerText ?? ''; })()`)).result;
                if (!table) await Bun.sleep(100);
            }
            await browser(session, "screenshot", join(artifacts, `${role}-${fixture.label}.png`));
            assert.ok(table.includes("简单随机"), `${role} ${fixture.label} result table rendered`);
            tables.push(table);
        }
        same(tables[0], tables[1]);
        renderedComparisons++;
        console.log(`PASS rendered teacher/student target tables agree: ${fixture.label}`);
    }
} catch (cause) {
    failures.push({ phase: "setup-or-browser", error: String(cause) });
    throw cause;
} finally {
    await Bun.write(join(artifacts, "results.json"), JSON.stringify({ requests, checks, renderedComparisons, results, failures }, null, 2));
    for (const session of browserSessions) await command([process.execPath, join(root, "node_modules/agent-browser/bin/agent-browser.js"), "--session", session, "close"]).catch(() => undefined);
    if (server) { server.kill("SIGTERM"); await server.exited; }
    if (created) await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.close(); await rm(workdir, { recursive: true, force: true });
}
console.log(JSON.stringify({ workflows: results.length, requests, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
