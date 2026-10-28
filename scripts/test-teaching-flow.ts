import * as XLSX from "xlsx";
import { SQL } from "bun";
import { deepStrictEqual } from "node:assert";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { computeDiningPlan, DINING_PPS_SIZE_FIELD, DOGFOOD_ANCHORS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";
import { calculateFinitePopulationSampleSize } from "../src/student/experiment/sample-plan";
import type { ExperimentData, StudentTask } from "../src/student/api-client";
import type { AnalysisMetricsResult } from "../src/domain/experiment/analysis-types";
import { teacherTemplateDogfood } from "./teacher-template-dogfood";

const root = resolve(import.meta.dir, "..");
const provisionUrl = process.env.TEST_DATABASE_URL;
if (!provisionUrl) throw new Error("TEST_DATABASE_URL is required; its role must be able to create a disposable database. DATABASE_URL is never used.");
const admin = new SQL(provisionUrl);
const databaseName = `wj_browser_${crypto.randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(provisionUrl);
databaseUrl.pathname = `/${databaseName}`;
const workdir = await mkdtemp(join(tmpdir(), "wj-teaching-"));
const artifacts = resolve(process.env.TEACHING_TEST_ARTIFACTS ?? join(root, "test-results/teaching-flow"));
await mkdir(artifacts, { recursive: true });
for (const name of ["student-failure.png", "teacher-failure.png", "result.json", "teacher-dictionary.png", "teacher-dictionary-save-order.png", "numeric-variable-binding.png", "sampling-pps-policy.png", "sampling-animation-exact.png", "sampling-animation-receipt.png", "sampling-animation-zoom-200.png", "sampling-animation-zoom-200-pagination.png", "sampling-animation-zoom-200-draw.png", "stage4-saved-analysis.png", "teacher-submitted-appendix.png", "stale-analysis-warning.png", "empty-path-narrow.png"]) {
    await Bun.file(join(artifacts, name)).delete().catch(() => undefined);
}
const adminTestPassword = `Test-${crypto.randomUUID()}`;
const environment = { ...process.env, SEED_ADMIN_PASSWORD: adminTestPassword, DATABASE_URL: String(databaseUrl), DEMO_MODE: "1", DEV_AUTH_MODE: "0", NODE_ENV: "development", HOST: "127.0.0.1" };
const browserLauncher = join(root, "node_modules/agent-browser/bin/agent-browser.js");
const sessionPrefix = `wj-flow-${crypto.randomUUID().slice(0, 8)}`;
const student = `${sessionPrefix}-student`;
const student2 = `${sessionPrefix}-student2`;
const seedStudent = `${sessionPrefix}-seed-student`;
const teacher = `${sessionPrefix}-teacher`;
const teacher2 = `${sessionPrefix}-teacher2`;
const administrator = `${sessionPrefix}-admin`;
let server: ReturnType<typeof Bun.spawn> | undefined;
let databaseCreated = false;
let baseUrl = "";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function command(args: string[], cwd = root, timeout = 30_000) {
    const process_ = Bun.spawn(args, { cwd, env: environment, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => process_.kill(), timeout);
    try {
        const [stdout, stderr, code] = await Promise.all([new Response(process_.stdout).text(), new Response(process_.stderr).text(), process_.exited]);
        if (code !== 0) throw new Error(`${args[1] ?? args[0]} failed (${code}): ${stderr}\n${stdout}`);
        return stdout;
    } finally { clearTimeout(timer); }
}

async function browser(session: string, ...args: string[]) {
    const raw = await command([process.execPath, browserLauncher, "--session", session, "--json", ...args]);
    const reply = JSON.parse(raw) as { success: boolean; data: { result?: unknown }; error?: unknown };
    if (!reply.success) throw new Error(`Browser ${args[0]} failed: ${JSON.stringify(reply.error)}`);
    return reply.data;
}
async function evaluate<T>(session: string, code: string): Promise<T> {
    return (await browser(session, "eval", code)).result as T;
}
async function eventually(check: () => Promise<unknown>, message: string) {
    const deadline = Date.now() + 15_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try { if (await check()) return; } catch (cause) { lastError = cause; }
        await Bun.sleep(150);
    }
    throw new Error(`${message}${lastError ? `: ${String(lastError)}` : ""}`);
}
async function visible(session: string, selector: string) {
    await eventually(() => evaluate(session, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), `Missing ${selector}`);
}
async function page(session: string, path: string, selector: string) {
    await browser(session, "open", baseUrl + path);
    await visible(session, selector);
}
async function captureDesktop(session: string, name: string, primary: string) {
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(session, "set", "viewport", String(width), String(height));
        await evaluate(session, 'scrollTo({top:0,behavior:"instant"})');
        assert(await evaluate(session, `(() => {const r=document.querySelector(${JSON.stringify(primary)}).getBoundingClientRect();return r.top>=0 && r.top<innerHeight && r.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth;})()`), `${name} main content must fit at ${width}px`);
        await browser(session, "screenshot", join(artifacts, `${name}-${width}.png`));
        if (width === 1024) {
            const overflowTables = await evaluate<number>(session, `(async () => {let count=0;for(const region of document.querySelectorAll('[data-slot="table-container"]')){if(region.clientWidth===0 || region.scrollWidth<=region.clientWidth)continue;const action=[...region.querySelectorAll('button:not(:disabled),a[href]')].at(-1);if(!action)continue;region.scrollLeft=region.scrollWidth;await new Promise(requestAnimationFrame);const a=action.getBoundingClientRect(),r=region.getBoundingClientRect();if(a.left<r.left || a.right>r.right+1)throw Error('Table action cannot be scrolled into view');count++;}return count;})()`);
            if (overflowTables) await browser(session, "screenshot", join(artifacts, `${name}-table-actions-${width}.png`));
        }
    }
    await browser(session, "set", "viewport", "1280", "800");
}
async function api<T>(session: string, path: string, method = "GET", body?: unknown): Promise<T> {
    return evaluate(session, `(async () => {
        const response = await fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, credentials: "include", headers: { "Content-Type": "application/json" }, ${body === undefined ? "" : `body: JSON.stringify(${JSON.stringify(body)})`} });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(${JSON.stringify(path)} + ": " + JSON.stringify(payload.error));
        return payload.data;
    })()`);
}
async function activate(session: string, selector: string) {
    await visible(session, selector);
    const activated = await evaluate(session, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (button.disabled) return false; button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })); button.click(); return true; })()`);
    assert(activated, `Button unavailable: ${selector}`);
}
async function namedButton(session: string, name: string) {
    const activated = await evaluate(session, `(() => {const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(name)}); if (!button || button.disabled) return false; button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })); button.click(); return true;})()`);
    assert(activated, `Button unavailable: ${name}`);
}
async function questionEscape(session: string, decision: "accept" | "dismiss") {
    // The driver serializes commands: native press waits for confirm, blocking dialog handling.
    // Exercise the DOM Escape path asynchronously; cancel buttons below use native clicks.
    // Allow the eval command's post-processing to finish before opening the blocking dialog.
    await evaluate(session, 'setTimeout(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })), 1500); true');
    await eventually(async () => JSON.stringify(await browser(session, "dialog", "status")).includes("本题未保存"), "Question Escape must protect unsaved input");
    await browser(session, "dialog", decision);
}
async function answerLearningCheck(id: string, option: number) {
    const selector = `[data-testid="learning-check-${id}"]`;
    await activate(student, `${selector} input[value="${option}"]`);
    await activate(student, `${selector} button`);
    assert(await evaluate(student, `document.querySelector(${JSON.stringify(selector)}).textContent.includes("理解正确")`), `Learning check ${id} did not pass`);
}
/** Run the questionnaire trial exactly as a student would, using Enter for the numeric question. */
async function completeQuestionnairePreview(session: string, questionCount: number) {
    // 编辑器的第四步（试填）在重载后可能不在当前步骤
    if (await evaluate(session, 'Boolean(document.querySelector(\'[data-testid="student-questionnaire-step-4"]\'))')) {
        await activate(session, '[data-testid="student-questionnaire-step-4"]');
    }
    await activate(session, '[data-testid="student-questionnaire-start-preview"]');
    await visible(session, '[data-testid="immersive-questionnaire-preview"]');
    assert(await evaluate(session, `(() => {const e=document.querySelector('[data-testid="immersive-questionnaire-preview"]');const r=e.getBoundingClientRect();return e.parentElement===document.body && r.top===0 && r.bottom===innerHeight;})()`), "Questionnaire preview must cover the viewport");
    await activate(session, '[data-testid="immersive-preview-start"]');
    // 键盘继续：数值题输入后按 Enter，不点击按钮
    await browser(session, "fill", '[data-testid="questionnaire-preview-numeric"]', "10");
    await evaluate(session, 'document.querySelector(\'[data-testid="questionnaire-preview-numeric"]\').focus()');
    await browser(session, "press", "Enter");
    await eventually(() => evaluate(session, '!document.querySelector(\'[data-testid="questionnaire-preview-numeric"]\')'), "Enter did not continue the numeric question");
    for (let index = 1; index < questionCount; index++) {
        await evaluate(session, `(() => {const button=[...document.querySelectorAll('[data-testid="immersive-questionnaire-preview"] button')].find(e=>e.textContent.trim().endsWith("是"));if(!button)throw Error("Missing answer");button.click();})()`);
        assert(await evaluate(session, 'Boolean(document.querySelector("[data-testid=immersive-preview-next]"))'), "Selecting an answer must not advance automatically");
        await activate(session, '[data-testid="immersive-preview-next"]');
    }
    await activate(session, '[data-testid="immersive-preview-submit"]');
    await eventually(() => evaluate(session, '!document.querySelector("[data-testid=immersive-questionnaire-preview]")'), "Trial did not return to the editor");
}

async function login(session: string, role: "student" | "teacher" | "admin", account: string, password = account) {
    await page(session, `/${role}/login`, "input[type=password]");
    assert(await evaluate(session, '[...document.querySelectorAll("input")].every(input => input.value === "")'), `${role} login must not prefill credentials with DEV_AUTH_MODE=0`);
    await browser(session, "fill", "input:not([type=password])", account);
    await browser(session, "fill", "input[type=password]", password);
    await browser(session, "click", "button[type=submit]");
    await eventually(() => evaluate(session, `!location.pathname.endsWith("/login") && !document.querySelector("input[type=password]")`), `${role} login failed`);
}

try {
    // This generated name contains only ASCII letters/digits/underscores. Never
    // migrate, seed, reset or drop the database named by TEST_DATABASE_URL itself.
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    for (const name of ["public", "node_modules", "bunfig.toml", "scripts"]) await symlink(join(root, name), join(workdir, name));
    await command([process.execPath, join(root, "src/db/migrate.ts")]);
    await command([process.execPath, join(root, "src/db/seeds/default.ts")], workdir);
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reservation.port;
    await reservation.stop(true);
    baseUrl = `http://127.0.0.1:${port}`;
    server = Bun.spawn([process.execPath, join(root, "src/index.ts")], {
        cwd: workdir, env: { ...environment, PORT: String(port) },
        stdout: Bun.file(join(artifacts, "server.log")), stderr: Bun.file(join(artifacts, "server-errors.log")),
    });
    await eventually(async () => {
        if (server!.exitCode !== null) throw new Error("Test server stopped");
        return (await fetch(baseUrl + "/student")).ok;
    }, "Test server failed to start");

    await login(teacher, "teacher", "T001");
    const seedTopics = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/topics");
    const happinessSource = seedTopics.find(item => item.name === DOGFOOD_NAMES.topicA);
    assert(happinessSource, "Seeded happiness topic missing");
    const happinessCopy = await api<{ id: number }>(teacher, `/api/teacher/topics/${happinessSource.id}/copy`, "POST");
    try {
        await api(teacher, `/api/teacher/topics/${happinessCopy.id}`, "PUT", { status: 1 });
        const copyVariables = await api<{ dictionary: { variables: Array<{ field: string; kind: string; missing: unknown[] }> } | null }>(teacher, `/api/teacher/topics/${happinessCopy.id}/variables`);
        const service = copyVariables.dictionary?.variables.find(variable => variable.field === "社区服务满意度");
        assert(service?.kind === "ordinal" && service.missing.includes(null), "Publication must preserve ordinal service satisfaction and missing nonusers");
    } finally {
        await api(teacher, `/api/teacher/topics/${happinessCopy.id}`, "DELETE");
    }
    console.log("PASS happiness seed copies and publishes with its nullable ordinal dictionary intact");
    const templateMatrix = await teacherTemplateDogfood({ teacher, artifacts, workdir, browser, evaluate, api, page, eventually });
    await login(administrator, "admin", "admin", adminTestPassword);
    for (const [session, role, endpoint, panel, ready] of [
        [teacher, "teacher", "/api/teacher/dashboard", "teacher-dashboard-active-tasks", '[data-testid="teacher-dashboard-active-tasks"] a[href*="/progress"]'],
        [administrator, "admin", "/api/admin/stats", "admin-dashboard-announcements", '[data-testid="admin-dashboard-stat-students"]'],
    ] as const) {
        await page(session, `/${role}`, ready);
        await eventually(() => evaluate(session, `document.querySelector('${ready}')?.textContent.trim().length > 0`), `${role} dashboard data missing`);
        for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
            await browser(session, "set", "viewport", String(width), String(height));
            assert(await evaluate(session, `(() => {const panel=document.querySelector('[data-testid="${panel}"]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth && panel.left>=0 && panel.right<=innerWidth && panel.top<innerHeight/2;})()`), `${role} dashboard main content must fit and start in the upper half at ${width}`);
            await browser(session, "screenshot", join(artifacts, `${role}-dashboard-${width}.png`));
        }
        const route = `${baseUrl}${endpoint}*`;
        await browser(session, "network", "route", route, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "模拟首页加载失败" } }));
        await page(session, `/${role}`, '[role="alert"]');
        await browser(session, "screenshot", join(artifacts, `${role}-dashboard-error.png`));
        await browser(session, "network", "unroute", route);
        await namedButton(session, role === "teacher" ? "重试" : "重新加载");
        await eventually(() => evaluate(session, `!document.querySelector('[role="alert"]') && document.querySelector('${ready}')?.textContent.trim().length > 0`), `${role} dashboard retry failed`);
        await browser(session, "set", "viewport", "1280", "800");
    }
    await activate(teacher, '[data-testid="teacher-dashboard-active-tasks"] a[href*="/progress"]');
    await eventually(() => evaluate(teacher, 'location.pathname.endsWith("/progress")'), "Dashboard task link did not open progress");
    await visible(teacher, '#teacher-progress-search');
    const progressRows = await evaluate<number>(teacher, 'document.querySelectorAll("table[aria-label=任务学生进度] tbody tr").length');
    assert(progressRows > 0, "Progress fixture must include students");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(teacher, "set", "viewport", String(width), String(height));
        assert(await evaluate(teacher, `(() => {const list=document.querySelector('[data-testid="teacher-progress-students"]').getBoundingClientRect();return !document.querySelector('#teacher-progress-charts') && list.top<innerHeight/2 && document.documentElement.scrollWidth<=innerWidth;})()`), `Progress list must take priority at ${width}px`);
        await evaluate(teacher, 'document.getAnimations().forEach(animation=>animation.finish())');
        await evaluate(teacher, `(() => {const button=document.querySelector('[aria-controls="teacher-progress-charts"]');button.addEventListener('click',event=>button.dataset.trustedClick=String(event.isTrusted),{once:true});})()`);
        await browser(teacher, "click", '[aria-controls="teacher-progress-charts"]');
        assert(await evaluate(teacher, `document.querySelector('[aria-controls="teacher-progress-charts"]').dataset.trustedClick==='true'`), "Progress disclosure must receive a trusted browser click");
        await eventually(() => evaluate(teacher, `document.querySelector('[aria-controls="teacher-progress-charts"]').getAttribute('aria-expanded')==='true' && document.querySelector('[aria-label="学生实验状态分布环形图"]').getBoundingClientRect().height>0 && document.documentElement.scrollWidth<=innerWidth`), `Distribution must expand without overflow at ${width}px`);
        await browser(teacher, "screenshot", join(artifacts, `teacher-progress-expanded-${width}.png`));
        await browser(teacher, "press", "Enter");
        await eventually(() => evaluate(teacher, `!document.querySelector('#teacher-progress-charts') && document.querySelector('[aria-controls="teacher-progress-charts"]').getAttribute('aria-expanded')==='false'`), "Distribution must collapse");
        await browser(teacher, "press", "Space");
        assert(await evaluate(teacher, `document.querySelector('[aria-controls="teacher-progress-charts"]').getAttribute('aria-expanded')==='true'`), "Space must expand the distribution");
        await browser(teacher, "press", "Space");
        await browser(teacher, "press", "Tab");
        assert(await evaluate(teacher, `document.activeElement?.id==='teacher-progress-search'`), "Tab must advance from disclosure to student search");
        await browser(teacher, "screenshot", join(artifacts, `teacher-progress-${width}.png`));
    }
    await captureDesktop(teacher, 'progress-table', '[data-testid="teacher-progress-students"]');
    await browser(teacher, "fill", '#teacher-progress-search', "no-such-student-ui-check");
    assert(await evaluate(teacher, 'document.querySelector("table[aria-label=任务学生进度] tbody").textContent.includes("暂无数据")'), "Progress search must show empty state");
    await evaluate(teacher, `(() => {const input=document.querySelector('#teacher-progress-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await eventually(() => evaluate(teacher, `document.querySelectorAll('table[aria-label="任务学生进度"] tbody tr').length===${progressRows}`), "Clearing progress search must restore all students");
    console.log("PASS teacher/admin dashboard hierarchy, desktop viewports, retry and task navigation");
    for (const [session, role, path, search, table] of [
        [teacher, "teacher", "/teacher/task", "teacher-task-search", "实验任务列表"],
        [administrator, "admin", "/admin/class", "class-search-input", "班级列表"],
    ] as const) {
        await page(session, path, `[data-testid="${search}"]`);
        await eventually(() => evaluate(session, `document.querySelectorAll('table[aria-label="${table}"] tbody tr').length > 1`), `${role} list rows missing`);
        for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
            await browser(session, "set", "viewport", String(width), String(height));
            await evaluate(session, "scrollTo(0,0)");
            assert(await evaluate(session, `(() => {const search=document.querySelector('[data-testid="${search}"]').getBoundingClientRect();const table=document.querySelector('table[aria-label="${table}"]');return document.documentElement.scrollWidth<=innerWidth && search.left>=0 && search.right<=innerWidth && table.querySelector('tbody tr').getBoundingClientRect().bottom<innerHeight;})()`), `${role} list must expose filters and first row without page overflow at ${width}`);
            await browser(session, "screenshot", join(artifacts, `${role}-list-${width}.png`));
        }
        await browser(session, "fill", `[data-testid="${search}"]`, "不存在的专项测试记录");
        await eventually(() => evaluate(session, `document.querySelectorAll('table[aria-label="${table}"] tbody tr td').length === 1`), `${role} empty search state missing`);
        await browser(session, "screenshot", join(artifacts, `${role}-list-empty.png`));
        // Explicit native input event: the browser CLI's empty fill did not notify React.
        await evaluate(session, `(() => {const input=document.querySelector('[data-testid="${search}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await eventually(() => evaluate(session, `document.querySelectorAll('table[aria-label="${table}"] tbody tr').length > 1`), `${role} search clear did not restore rows`);
        await browser(session, "set", "viewport", "1280", "800");
    }
    console.log("PASS teacher/admin list hierarchy, three desktop viewports and search recovery");
    const seededPending = await api<{ items: Array<{ id: number; topic: string }> }>(teacher, "/api/teacher/grading?status=pending&page=1&pageSize=20");
    const seededGrading = seededPending.items.find(item => item.topic === DOGFOOD_NAMES.topicB);
    assert(seededGrading, "Seeded pending grading item missing");
    const seededTeacherDetail = await api<{ samplingResults: Record<string, unknown> }>(teacher, `/api/teacher/grading/${seededGrading.id}`);
    assert(Object.keys(seededTeacherDetail.samplingResults).length > 0, "Seeded teacher grading detail did not hydrate sampling results");
    await login(seedStudent, "student", DOGFOOD_ANCHORS.submitted);
    const seededTasks = await api<StudentTask[]>(seedStudent, "/api/student/tasks");
    const seededTask = seededTasks.find(item => item.name === DOGFOOD_NAMES.topicB);
    assert(seededTask, "Seeded submitted student task missing");
    const seededStudentDetail = await api<{ snapshot: { samplingResults: Record<string, unknown> } }>(seedStudent, `/api/student/tasks/${seededTask.id}/submission`);
    assert(Object.keys(seededStudentDetail.snapshot.samplingResults).length > 0, "Seeded student submission did not hydrate sampling results");
    console.log("PASS seeded teacher grading and student submission hydrate from frozen source");

    const templates = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/topics");
    const source = templates.find(item => item.name === DOGFOOD_NAMES.topicD);
    assert(source, "Seed template missing");
    const copied = await api<{ id: number }>(teacher, `/api/teacher/topics/${source.id}/copy`, "POST");
    const name = "浏览器回归：完整教学流程";
    await api(teacher, `/api/teacher/topics/${copied.id}`, "PUT", { name, status: 0 });
    type DictionarySnapshot = { source: string; revision: number; dictionary: { source: string; revision: number; variables: Array<{ field: string; label: string; unit: string; kind: string; categories: unknown[]; missing: unknown[] }> } | null; suggestion: { source?: string; revision?: number; variables: Array<{ field: string; label: string; unit: string; kind: string; categories: unknown[]; missing: unknown[] }> } };
    const suggestedDictionary = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    const configuredVariables = suggestedDictionary.suggestion.variables.map(variable => variable.field === "等待分钟" ? { ...variable, kind: "continuous", unit: "分钟", categories: [] } : variable);
    await api(teacher, `/api/teacher/topics/${copied.id}/variables`, "PUT", { source: suggestedDictionary.source, observedRevision: suggestedDictionary.revision, dictionary: { source: suggestedDictionary.source, revision: suggestedDictionary.revision, variables: configuredVariables } });
    const dictionaryBefore = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    const continuousVariable = (dictionaryBefore.dictionary ?? dictionaryBefore.suggestion).variables.find(variable => variable.kind === "continuous");
    assert(continuousVariable, `Copied topic has no continuous variable for numeric binding: ${JSON.stringify((dictionaryBefore.dictionary ?? dictionaryBefore.suggestion).variables.map(variable => [variable.field, variable.kind, variable.unit]))}`);
    await page(teacher, "/teacher/topic", `[data-testid="teacher-topic-edit-${copied.id}"]`);
    await activate(teacher, `[data-testid="teacher-topic-edit-${copied.id}"]`);
    await visible(teacher, '[data-testid="teacher-topic-step-1"]');
    await eventually(() => evaluate(teacher, '!document.querySelector("[data-testid=teacher-topic-jump-7]").disabled'), "Direct editing must wait for template details");
    await browser(teacher, "click", '[data-testid="teacher-topic-jump-7"]');
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-step-7]").getAttribute("aria-current")==="step" && !document.querySelector("[data-testid=teacher-topic-step-1] svg")'), "Direct navigation must not mark skipped sections complete");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(teacher, "set", "viewport", String(width), String(height));
        await evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-jump-7]").scrollIntoView({block:"nearest",inline:"nearest"})');
        assert(await evaluate(teacher, '(() => {const b=document.querySelector("[data-testid=teacher-topic-jump-7]").getBoundingClientRect();const f=document.querySelector("[data-testid=teacher-topic-finish]").getBoundingClientRect();return b.left>=0 && b.right<=innerWidth && f.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth;})()'), "Direct edit navigation and save must fit the viewport");
        await browser(teacher, "screenshot", join(artifacts, `teacher-direct-edit-${width}.png`));
    }
    await browser(teacher, "set", "viewport", "1280", "800");
    await browser(teacher, "click", '[data-testid="teacher-topic-jump-1"]');
    await browser(teacher, "fill", '[data-testid="teacher-topic-name"]', "不应保存的临时名称");
    for (const decision of ["dismiss", "accept"] as const) {
        await browser(teacher, "click", '[data-testid="teacher-topic-jump-6"]');
        assert(JSON.stringify(await browser(teacher, "dialog", "status")).includes("本步未保存"), "Direct editing must confirm before discarding");
        await browser(teacher, "dialog", decision);
        if (decision === "dismiss") assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-name]").value==="不应保存的临时名称"'), "Cancelled navigation must retain edits");
    }
    await browser(teacher, "click", '[data-testid="teacher-topic-jump-1"]');
    assert(await evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-name"]').value===${JSON.stringify(name)}`), "Discarded edits must not leak into later saves");
    console.log("PASS direct template section editing, discard protection and desktop viewports");
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await visible(teacher, `input[aria-label="${continuousVariable.field} 标签"]`);
    const selectedRoles = await evaluate<string[]>(teacher, 'Array.from(document.querySelectorAll("input[data-testid^=teacher-topic-mapping-]:checked"), input => input.dataset.testid)');
    await browser(teacher, "set", "viewport", "1024", "768", "2");
    await browser(teacher, "fill", "#teacher-field-search", "不存在的字段");
    assert(await evaluate(teacher, 'document.querySelectorAll("input[data-testid^=teacher-topic-mapping-]").length===0'), "Unmatched search must hide roles without modifying their values");
    await evaluate(teacher, 'document.querySelector("#teacher-field-search").scrollIntoView({block:"start"})');
    await browser(teacher, "screenshot", join(artifacts, "teacher-fields-empty-search.png"));
    await namedButton(teacher, "显示全部字段");
    assert(JSON.stringify(await evaluate(teacher, 'Array.from(document.querySelectorAll("input[data-testid^=teacher-topic-mapping-]:checked"), input => input.dataset.testid)')) === JSON.stringify(selectedRoles), "Clearing search must retain all selected roles");
    await browser(teacher, "click", '#teacher-field-search + label input');
    assert(await evaluate(teacher, `document.querySelectorAll("input[data-testid^=teacher-topic-mapping-]").length===${selectedRoles.length} && Array.from(document.querySelectorAll("input[data-testid^=teacher-topic-mapping-]")).every(input => input.checked)`), "Selected-only mode must show all and only each role's selections");
    await browser(teacher, "screenshot", join(artifacts, "teacher-fields-selected.png"));
    await evaluate(teacher, 'document.querySelector("input[data-testid^=teacher-topic-mapping-others-]").scrollIntoView({block:"center"})');
    assert(await evaluate(teacher, '(() => {const field=document.querySelector("input[data-testid^=teacher-topic-mapping-others-]").getBoundingClientRect();const content=document.querySelector("[data-testid=teacher-topic-scroll-content]").getBoundingClientRect();return field.top>=content.top && field.bottom<=content.bottom;})()'), "Other selected categories must scroll clear of the fixed footer");
    await namedButton(teacher, "显示全部字段");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(teacher, "set", "viewport", String(width), String(height));
        await evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-scroll-content"]').scrollTop=0`);
        assert(await evaluate(teacher, `(() => {const dialog=document.querySelector('[role="dialog"]').getBoundingClientRect();const nav=document.querySelector('[data-testid="teacher-topic-step-navigation"]').getBoundingClientRect();const content=document.querySelector('[data-testid="teacher-topic-scroll-content"]').getBoundingClientRect();const next=document.querySelector('[data-testid="teacher-topic-next"]').getBoundingClientRect();return dialog.left>=0 && dialog.right<=innerWidth && dialog.top>=0 && dialog.bottom<=innerHeight && nav.bottom<=content.top && content.height>200 && content.bottom<=next.top;})()`), `Wizard navigation, scroll area and actions must not overlap at ${width}`);
        await browser(teacher, "screenshot", join(artifacts, `teacher-wizard-${width}.png`));
        await evaluate(teacher, `(() => {const content=document.querySelector('[data-testid="teacher-topic-scroll-content"]');content.scrollTop=content.scrollHeight;})()`);
        assert(await evaluate(teacher, `(() => {const nav=document.querySelector('[data-testid="teacher-topic-step-navigation"]').getBoundingClientRect();const content=document.querySelector('[data-testid="teacher-topic-scroll-content"]');return content.scrollTop>0 && nav.bottom<=content.getBoundingClientRect().top && document.querySelector('[aria-current="step"]').textContent==='3';})()`), "Wizard scrolling must not hide the current step");
        assert(await evaluate(teacher, '(() => {const target=document.querySelector("[data-testid=teacher-topic-analysis-field]");const question=document.querySelector("[data-testid=teacher-contract-question]");return Boolean(target.compareDocumentPosition(question)&Node.DOCUMENT_POSITION_FOLLOWING) && !document.querySelector("[data-testid=teacher-variable-dictionary]").open;})()'), "Research fields must precede text; optional dictionary must start collapsed");
        await evaluate(teacher, 'document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").scrollIntoView({block:"center",behavior:"instant"})');
        // Scroll offsets round to CSS pixels; rectangles can retain subpixel precision.
        await eventually(() => evaluate(teacher, '(() => {const summary=document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").getBoundingClientRect();const content=document.querySelector("[data-testid=teacher-topic-scroll-content]").getBoundingClientRect();return summary.top>=content.top-1 && summary.bottom<=content.bottom+1;})()'), "Dictionary summary must scroll clear of the fixed footer");
        await browser(teacher, "screenshot", join(artifacts, `teacher-research-target-${width}.png`));
    }
    await browser(teacher, "set", "viewport", "1280", "800");
    await evaluate(teacher, 'document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").focus()');
    await browser(teacher, "press", "Enter");
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-variable-dictionary]").open'), "Keyboard must open the dictionary");
    const dictionaryLabel = `${continuousVariable.label}（浏览器确认）`;
    await browser(teacher, "fill", `input[aria-label="${continuousVariable.field} 标签"]`, dictionaryLabel);
    await evaluate(teacher, 'document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").scrollIntoView({block:"center"})');
    await browser(teacher, "click", '[data-testid="teacher-variable-dictionary-toggle"]');
    assert(await evaluate(teacher, '!document.querySelector("[data-testid=teacher-variable-dictionary]").open && document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").textContent.includes("未保存")'), "Collapsed dictionary must retain and disclose unsaved edits");
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-variable-dictionary]").open'), "Blocked mapping save must reopen the unsaved dictionary");
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-save-error]")?.textContent.includes("变量字典有未保存的修改") && document.querySelector("[data-testid=teacher-topic-step-3]").getAttribute("aria-current")==="step"'), "Mapping save must not discard dictionary edits");
    const missingBefore = await evaluate<string>(teacher, 'document.querySelector("#missing-0").value');
    await browser(teacher, "fill", "#missing-0", "[broken");
    await namedButton(teacher, "明确确认并保存");
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=alert]")?.textContent.includes("请填写 JSON 数组")'), "Invalid missing values lack actionable Chinese feedback");
    assert(await evaluate(teacher, `document.querySelector("#missing-0").value === "[broken" && document.querySelector(${JSON.stringify(`input[aria-label="${continuousVariable.field} 标签"]`)}).value === ${JSON.stringify(dictionaryLabel)}`), "Validation failure lost dictionary inputs");
    assert((await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`)).revision === dictionaryBefore.revision, "Invalid JSON changed the saved dictionary");
    await browser(teacher, "fill", "#missing-0", missingBefore);
    await browser(teacher, "screenshot", join(artifacts, "teacher-dictionary.png"));
    await namedButton(teacher, "明确确认并保存");
    await eventually(async () => (await api<{ revision: number; dictionary: { variables: Array<{ field: string; label: string }> } | null }>(teacher, `/api/teacher/topics/${copied.id}/variables`)).dictionary?.variables.some(variable => variable.field === continuousVariable.field && variable.label === dictionaryLabel), "Dictionary UI save did not persist");
    const staleConflict = await evaluate<{ status: number; code?: string }>(teacher, `(async()=>{const r=await fetch(${JSON.stringify(`/api/teacher/topics/${copied.id}/variables`)},{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(${JSON.stringify({ source: dictionaryBefore.source, observedRevision: dictionaryBefore.revision, dictionary: dictionaryBefore.dictionary ?? { source: dictionaryBefore.source, revision: dictionaryBefore.revision, variables: dictionaryBefore.suggestion.variables } })})});const p=await r.json();return {status:r.status,code:p.error?.code}})()`);
    assert(staleConflict.status === 409 && staleConflict.code === "VARIABLE_REVISION_CONFLICT", "Stale dictionary update did not produce an optimistic conflict");

    // Change and then restore an optional role. Each real mapping write must
    // precede dictionary confirmation, including when a dictionary already exists.
    await eventually(() => evaluate(teacher, '!document.querySelector("[data-testid=teacher-topic-next]").disabled'), "Initial dictionary confirmation must finish before changing field roles");
    const policyBeforeRoleChanges = (await api<{ topic: { samplingPolicy: unknown } }>(teacher, `/api/teacher/topics/${copied.id}/detail`)).topic.samplingPolicy;
    const optionalRole = await evaluate<string>(teacher, 'document.querySelector("input[data-testid^=teacher-topic-mapping-others-]:checked").dataset.testid');
    const optionalRoleSelector = `[data-testid=${JSON.stringify(optionalRole)}]`;
    let confirmedDictionary = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    for (const checked of [false, true]) {
        await activate(teacher, optionalRoleSelector);
        assert(await evaluate(teacher, `document.querySelector(${JSON.stringify(optionalRoleSelector)}).checked===${checked}`), "Optional role change was not applied");
        assert(await evaluate(teacher, 'document.body.textContent.includes("会使已保存的字典失效") && [...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="明确确认并保存")?.disabled'), "Unsaved mapping must explain invalidation and disable dictionary confirmation");
        assert((await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`)).revision === confirmedDictionary.revision, "Editing a local role must not mutate the saved dictionary");
        await activate(teacher, '[data-testid="teacher-topic-save-mapping"]');
        await eventually(() => evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-step-3"]').getAttribute('aria-current')==='step' && document.querySelector('[data-testid="teacher-variable-dictionary"]')?.open && document.querySelector(${JSON.stringify(`input[aria-label="${continuousVariable.field} 标签"]`)})?.disabled===false && !document.querySelector('[data-testid="teacher-topic-next"]').disabled`), "Mapping save must stay on step 3 and load an editable dictionary");
        const invalidated = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
        assert(invalidated.source !== confirmedDictionary.source && invalidated.revision === confirmedDictionary.revision + 1 && invalidated.dictionary === null, "Changed mapping must invalidate the old dictionary before reconfirmation");
        assert(invalidated.suggestion.variables.find(variable => variable.field === continuousVariable.field)?.kind === continuousVariable.kind, "Numeric role must preserve a continuous suggestion after reloading");
        await browser(teacher, "fill", `input[aria-label="${continuousVariable.field} 标签"]`, dictionaryLabel);
        await browser(teacher, "fill", `input[aria-label="${continuousVariable.field} 单位"]`, continuousVariable.unit);
        await namedButton(teacher, "明确确认并保存");
        await eventually(async () => {
            const saved = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
            return saved.revision === invalidated.revision + 1 && saved.dictionary?.source === invalidated.source
                && saved.dictionary.variables.some(variable => variable.field === continuousVariable.field && variable.kind === continuousVariable.kind && variable.label === dictionaryLabel && variable.unit === continuousVariable.unit);
        }, "Dictionary confirmation must use the reloaded source and revision");
        await eventually(() => evaluate(teacher, '!document.querySelector("[data-testid=teacher-topic-next]").disabled'), "Dictionary save must finish before the next mapping change");
        confirmedDictionary = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    }
    assert(confirmedDictionary.source === dictionaryBefore.source, "Restoring the optional role must restore the original source interpretation");
    // Role changes intentionally reset the sampling policy. Restore this fixture's
    // PPS requirement and permitted size field for the remaining teaching flow.
    await api(teacher, `/api/teacher/topics/${copied.id}/sampling-policy`, "PUT", { samplingPolicy: policyBeforeRoleChanges });
    await browser(teacher, "screenshot", join(artifacts, "teacher-dictionary-save-order.png"));
    const mappingRoute = `${baseUrl}/api/teacher/topics/${copied.id}/mapping`;
    await browser(teacher, "network", "route", mappingRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "字段配置暂时无法保存，请重试" } }));
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await eventually(() => evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-save-error"]')?.textContent.includes('字段配置暂时无法保存') && document.activeElement===document.querySelector('[data-testid="teacher-topic-save-error"]')`), "Mapping save error must remain visible and receive focus");
    assert(await evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-step-3"]').getAttribute('aria-current')==='step' && document.querySelector(${JSON.stringify(`input[aria-label="${continuousVariable.field} 标签"]`)}).value===${JSON.stringify(dictionaryLabel)}`), "Mapping failure must preserve step and inputs");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(teacher, "set", "viewport", String(width), String(height));
        assert(await evaluate(teacher, `(() => {const error=document.querySelector('[data-testid="teacher-topic-save-error"]').getBoundingClientRect();const next=document.querySelector('[data-testid="teacher-topic-next"]').getBoundingClientRect();return error.top>=0 && error.bottom<=next.top && next.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth;})()`), `Save feedback and retry must fit at ${width}px`);
        await browser(teacher, "screenshot", join(artifacts, `teacher-template-save-error-${width}.png`));
    }
    await browser(teacher, "network", "unroute", mappingRoute);
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await eventually(() => evaluate(teacher, `document.querySelector('[data-testid="teacher-topic-step-4"]').getAttribute('aria-current')==='step' && !document.querySelector('[data-testid="teacher-topic-save-error"]')`), "Successful mapping retry must advance and clear the error");
    deepStrictEqual(await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`), confirmedDictionary, "Continuing after dictionary confirmation must retain its content and revision");
    await activate(teacher, '[data-testid="teacher-topic-prev"]');
    await eventually(() => evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-step-3]").getAttribute("aria-current")==="step" && !document.querySelector("[data-testid=teacher-topic-next]").disabled'), "Returning to fields must load the confirmed dictionary");
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await eventually(() => evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-step-4]").getAttribute("aria-current")==="step" && !document.querySelector("[data-testid=teacher-topic-next]").disabled'), "Continuing again must keep the unchanged mapping usable");
    deepStrictEqual(await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`), confirmedDictionary, "Back and continue must not clear or revise the confirmed dictionary");
    console.log("PASS mapping-before-dictionary persistence, explicit invalidation, source reload and repeated navigation");
    await browser(teacher, "set", "viewport", "1280", "800");
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await eventually(() => evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-step-5]").getAttribute("aria-current")==="step"'), "Sampling policy save must advance");
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await namedButton(teacher, "+ 添加题目");
    await activate(teacher, '[data-testid="student-question-type-boolean"]');
    await browser(teacher, "fill", '[data-testid="student-question-content"]', "是否愿意参加后续调查？");
    await browser(teacher, "click", '[data-testid="student-question-cancel"]');
    assert(JSON.stringify(await browser(teacher, "dialog", "status")).includes("本题未保存"), "Question cancel must ask before discarding");
    await browser(teacher, "dialog", "dismiss");
    await questionEscape(teacher, "dismiss");
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=student-question-content]").value === "是否愿意参加后续调查？" && document.querySelector("[data-testid=teacher-topic-step-6]").getAttribute("aria-current")==="step"'), "Cancelling nested close must preserve question and parent step");
    await activate(teacher, '[data-testid="student-question-save"]');
    await eventually(() => evaluate(teacher, '!document.querySelector("[data-testid=student-question-editor]") && document.body.textContent.includes("是否愿意参加后续调查？")'), "Question save must update the parent without discard confirmation");
    await browser(teacher, "click", '[data-testid="teacher-topic-prev"]');
    assert(JSON.stringify(await browser(teacher, "dialog", "status")).includes("本步未保存"), "Saving a question must keep the outer template dirty");
    await browser(teacher, "dialog", "accept");
    await eventually(() => evaluate(teacher, 'document.querySelector("[data-testid=teacher-topic-step-5]").getAttribute("aria-current")==="step"'), "Discard must return to the prior template step");
    console.log("PASS nested teacher question cancel, Escape, local save and outer draft protection");
    await page(teacher, "/teacher/topic", `[data-testid="teacher-topic-publish-${copied.id}"]`);
    const checkRoute = `${baseUrl}/api/teacher/topics/${copied.id}/publish-check`;
    await browser(teacher, "network", "route", checkRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "检查暂时不可用，请重试" } }));
    await activate(teacher, `[data-testid="teacher-topic-publish-${copied.id}"]`);
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=alertdialog]")?.textContent.includes("检查暂时不可用")'), "Failed preflight must remain visible");
    await browser(teacher, "screenshot", join(artifacts, "teacher-publish-check-error.png"));
    await browser(teacher, "network", "unroute", checkRoute);
    await namedButton(teacher, "重新检查");
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=alertdialog]")?.textContent.includes("检查通过")'), "Publish preflight did not pass");
    assert((await api<Array<{ id: number; status: number }>>(teacher, "/api/teacher/topics")).find(topic => topic.id === copied.id)?.status === 0, "Preflight must not publish or mutate the template");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(teacher, "set", "viewport", String(width), String(height));
        await browser(teacher, "screenshot", join(artifacts, `teacher-publish-check-${width}.png`));
    }
    await namedButton(teacher, "确认");
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=alertdialog]")?.textContent.includes("模板已发布")'), "Publish success must offer assignment");
    await browser(teacher, "screenshot", join(artifacts, "teacher-publish-success.png"));
    const assignmentClassesRoute = `${baseUrl}/api/teacher/classes`;
    await browser(teacher, "network", "route", assignmentClassesRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "班级暂不可用，请重试" } }));
    await browser(teacher, "click", '[role="alertdialog"] a');
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=dialog] [role=alert]")?.textContent.includes("班级暂不可用")'), "Assignment failure must not appear as empty classes");
    assert(await evaluate(teacher, 'document.querySelector("[data-testid=teacher-task-publish-submit]").disabled && !document.querySelector("[data-testid=teacher-task-topic-select]")'), "Failed assignment options must block publishing stale choices");
    await browser(teacher, "set", "viewport", "1024", "768", "2");
    await browser(teacher, "screenshot", join(artifacts, "teacher-assignment-error.png"));
    await browser(teacher, "network", "unroute", assignmentClassesRoute);
    assert(await evaluate(teacher, 'document.activeElement?.textContent==="重试加载"'), "Assignment error must focus the retry action");
    await browser(teacher, "press", "Enter");
    await eventually(() => evaluate(teacher, `document.querySelector('[data-testid="teacher-task-topic-select"]')?.textContent.includes(${JSON.stringify(name)})`), "Assignment must preselect the newly published template");
    assert(await evaluate(teacher, 'document.activeElement?.getAttribute("data-testid")==="teacher-task-topic-select"'), "Successful retry must focus template selection");
    await browser(teacher, "press", "Tab");
    assert(await evaluate(teacher, 'document.activeElement?.getAttribute("aria-label")==="搜索班级"'), "Tab must reach class search");
    await browser(teacher, "press", "Tab");
    assert(await evaluate(teacher, 'document.activeElement?.getAttribute("type")==="checkbox"'), "Tab must continue from template selection to a class checkbox");
    assert(!(await api<Array<{ topicId: number }>>(teacher, "/api/teacher/tasks")).some(task => task.topicId === copied.id), "Opening assignment must not create tasks");
    await browser(teacher, "screenshot", join(artifacts, "teacher-assignment-prefilled.png"));
    await browser(teacher, "press", "Space");
    await browser(teacher, "fill", '[aria-label="搜索班级"]', "不存在的班级");
    assert(await evaluate(teacher, 'document.querySelector("[role=dialog]").textContent.includes("已选 1 个班级") && document.querySelector("[role=dialog]").textContent.includes("没有匹配的班级")'), "Class search must retain hidden choices and show their count");
    await browser(teacher, "screenshot", join(artifacts, "teacher-assignment-search.png"));
    await browser(teacher, "click", '[aria-label="搜索班级"]');
    await browser(teacher, "press", "Control+a");
    await browser(teacher, "press", "Backspace");
    await eventually(() => evaluate(teacher, 'document.querySelector("[aria-label=搜索班级]").value==="" && Boolean(document.querySelector("[role=dialog] input[type=checkbox]:checked"))'), "Clearing search must restore the selected class");
    const assignmentSaveRoute = `${baseUrl}/api/teacher/tasks`;
    await browser(teacher, "network", "route", assignmentSaveRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "暂时无法发布，请重试" } }));
    await browser(teacher, "click", '[data-testid="teacher-task-publish-submit"]');
    await eventually(() => evaluate(teacher, 'document.querySelector("[role=dialog] [role=alert]")?.textContent.includes("暂时无法发布")'), "Assignment save failure must remain in the dialog");
    assert(await evaluate(teacher, 'Boolean(document.querySelector("[role=dialog] input[type=checkbox]:checked")) && document.activeElement?.getAttribute("role")==="alert"'), "Failed assignment must preserve choices and focus its error");
    await browser(teacher, "screenshot", join(artifacts, "teacher-assignment-save-error.png"));
    await browser(teacher, "network", "unroute", assignmentSaveRoute);
    await namedButton(teacher, "取消");
    await browser(teacher, "set", "viewport", "1280", "800");
    console.log("PASS read-only publish preflight, retry, confirmed publication and preselected assignment");
    console.log("PASS teacher dictionary representative UI save and stale-revision conflict");
    const classes = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/classes");
    const targetClass = classes.find(item => item.name === "2026级统计学1班");
    assert(targetClass, "Seed class missing");
    await api(teacher, "/api/teacher/tasks", "POST", { topicId: copied.id, classIds: [targetClass.id], deadline: new Date(Date.now() + 86400_000).toISOString() });
    console.log("PASS template copy and task publication (real API)");

    await login(student, "student", "S2610");
    const tasks = await api<StudentTask[]>(student, "/api/student/tasks");
    for (const item of templateMatrix) {
        const visibleTasks = tasks.filter(task => task.topicId === item.topicId);
        assert(visibleTasks.length === 1, `${item.name}: student sees exactly their class task`);
        assert(item.tasks.some(task => task.classId === targetClass.id && task.id === visibleTasks[0]!.id), "Student task belongs to the assigned class");
        const experiment = await api<ExperimentData>(student, `/api/student/tasks/${visibleTasks[0]!.id}/experiment`);
        deepStrictEqual(experiment.studyContract?.contract.target, item.target);
        deepStrictEqual(experiment.samplingPolicy?.methods, item.methods);
        assert(experiment.populationSize === 24, "Student population matches uploaded data");
    }
    console.log(`PASS ${templateMatrix.length} UI-created templates: student visibility, class isolation, target and policy persistence`);
    await page(student, "/student", '[data-testid="student-task-grid"]');
    await eventually(() => evaluate(student, `document.querySelectorAll('[data-testid^="student-task-card-"]').length===${tasks.length}`), "Task hall cards missing");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        assert(await evaluate(student, `document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('[data-testid^="student-task-card-"]')].every(card=>card.getBoundingClientRect().width>=320)`), `Task cards must retain readable width at ${width}`);
        await browser(student, "screenshot", join(artifacts, `student-hall-${width}.png`));
    }
    for (const filter of ["submitted", "graded"] as const) {
        await activate(student, `[data-testid="student-filter-${filter}"]`);
        const expected = tasks.filter(task => task.status === filter).map(task => `student-task-card-${task.id}`).sort();
        await eventually(() => evaluate(student, `JSON.stringify([...document.querySelectorAll('[data-testid^="student-task-card-"]')].map(card=>card.dataset.testid).sort())===${JSON.stringify(JSON.stringify(expected))} && document.querySelector('[data-testid="student-filter-${filter}"]').getAttribute('aria-pressed')==='true'`), `Task filter ${filter} does not match server tasks`);
        await browser(student, "screenshot", join(artifacts, `student-hall-${filter}.png`));
    }
    await activate(student, '[data-testid="student-filter-all"]');
    await browser(student, "set", "viewport", "1280", "800");
    const task = tasks.find(item => item.name === name);
    assert(task, "Published task did not reach student");
    await page(student, `/student/task/${task.id}`, '[data-testid="student-task-action"]');
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, 'scrollTo({top:0,behavior:"instant"})');
        assert(await evaluate(student, `(() => {const a=document.querySelector('[data-testid="student-task-action"] a');const r=a.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth;})()`), `Task primary action must be visible without scrolling at ${width}px`);
        await browser(student, "screenshot", join(artifacts, `task-primary-action-${width}.png`));
    }
    await browser(student, "set", "viewport", "1280", "800");
    const experimentPath = `/api/student/tasks/${task.id}/experiment`;
    const stageUrl = `/student/task/${task.id}/experiment`;
    let experiment = await api<ExperimentData>(student, experimentPath);
    await page(student, stageUrl, '[data-testid="student-stage-questionnaire"]');
    // Seed a five-question draft through the real stage API, then complete every
    // stage through its student-facing controls.
    const questionnaire = {
        title: "学习投入调查", welcomeText: "欢迎参加本次学习投入调查，请根据真实情况回答，所有题目仅用于课堂教学与统计分析。",
        endingText: "感谢您的参与和支持，本次调查已经结束，调查结果将用于理解学习投入的总体特征。",
        questions: Array.from({ length: 5 }, (_, index) => index === 0
            ? { id: "q0", type: "numeric", content: `请填写您的${continuousVariable.label}`, unit: continuousVariable.unit, decimalPlaces: 0 }
            : { id: `q${index}`, type: "boolean", content: `本周是否完成学习活动 ${index + 1}？` }),
    };
    experiment = await api(student, `${experimentPath}/stages/1/complete`, "POST", { observedVersion: experiment.version, questionnaire });
    experiment = await api(student, `${experimentPath}/stages/1/reopen`, "POST", { observedVersion: experiment.version });
    await page(student, stageUrl, '[data-testid="student-questionnaire-title"]');
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, 'scrollTo({top:0,behavior:"instant"})');
        assert(await evaluate(student, `(() => {const title=document.querySelector('[data-testid="student-questionnaire-title"]');return title.value==='学习投入调查' && document.querySelector('[data-testid="student-questionnaire-welcome-editor"]').textContent.includes('欢迎参加本次学习投入调查') && document.documentElement.scrollWidth<=innerWidth;})()`), `Opening form must retain draft and fit at ${width}px`);
        await browser(student, "screenshot", join(artifacts, `questionnaire-opening-${width}.png`));
        assert(await evaluate(student, `(async () => {const reference=document.querySelector('[data-testid="student-questionnaire-opening-reference"]');reference.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const bounds=reference.getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top && reference.textContent.includes('数据仅用于教学分析');})()`), `Opening reference must remain readable above the footer at ${width}px`);
        await browser(student, "screenshot", join(artifacts, `questionnaire-opening-reference-${width}.png`));
    }
    await browser(student, "set", "viewport", "1280", "800");
    await browser(student, "fill", '[data-testid="student-questionnaire-title"]', "学习投入调查：浏览器试填");
    await activate(student, '[data-testid="student-questionnaire-step-2"]');
    await activate(student, '[data-testid="student-questionnaire-add-question"]');
    await browser(student, "fill", '[data-testid="student-question-content"]', "尚未完成的题目");
    await questionEscape(student, "accept");
    await eventually(() => evaluate(student, '!document.querySelector("[data-testid=student-question-editor]")'), "Accepting discard must close the student editor");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, 'scrollTo({top:0,behavior:"instant"})');
        assert(await evaluate(student, `(() => {const list=document.querySelector('[data-testid="student-questionnaire-list"]');const rows=[...list.querySelectorAll('[draggable="true"]')];return rows.length===5 && rows.every(row=>row.getBoundingClientRect().right<=innerWidth) && document.documentElement.scrollWidth<=innerWidth;})()`), `Questionnaire rows must fit at ${width}px`);
        await browser(student, "screenshot", join(artifacts, `questionnaire-editor-${width}.png`));
        assert(await evaluate(student, `(async () => {const last=document.querySelector('[data-testid="student-questionnaire-item-q4"]');last.scrollIntoView({block:'center'});await new Promise(requestAnimationFrame);const bounds=last.getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top;})()`), `Last question must scroll clear of the footer at ${width}px`);
        assert(await evaluate(student, `(async () => {scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});await new Promise(requestAnimationFrame);const reference=document.querySelector('[data-testid="student-questionnaire-reference"]');return reference.getBoundingClientRect().bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top;})()`), `Design advice must scroll clear of the footer at ${width}px`);
        await browser(student, "screenshot", join(artifacts, `questionnaire-reference-tail-${width}.png`));
    }
    await browser(student, "set", "viewport", "1280", "800");
    const recommendationToggle = '[aria-controls="student-recommended-question-list"]';
    await evaluate(student, `document.querySelector('${recommendationToggle}').focus()`);
    await browser(student, "press", "Enter");
    assert(await evaluate(student, `document.querySelector('${recommendationToggle}').getAttribute('aria-expanded')==='false' && !document.querySelector('#student-recommended-question-list')`), "Keyboard collapse must hide recommended questions");
    await browser(student, "screenshot", join(artifacts, "questionnaire-references-collapsed.png"));
    await browser(student, "press", "Space");
    assert(await evaluate(student, `document.querySelector('${recommendationToggle}').getAttribute('aria-expanded')==='true' && Boolean(document.querySelector('#student-recommended-question-list'))`), "Keyboard expand must restore recommended questions");
    await activate(student, '[data-testid="student-questionnaire-move-down-q0"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-questionnaire-list"] [draggable="true"]').dataset.testid==='student-questionnaire-item-q1'`), "Question move-down must change order");
    await activate(student, '[data-testid="student-questionnaire-move-up-q0"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-questionnaire-list"] [draggable="true"]').dataset.testid==='student-questionnaire-item-q0'`), "Question move-up must restore order");
    await namedButton(student, "关联变量");
    await visible(student, '[aria-label="选择变量字段"]');
    // 关联对话框：焦点进入、Tab 不逃逸、Escape 关闭并把焦点还给触发按钮
    await eventually(() => evaluate(student, 'document.querySelector(\'[role="dialog"]\')?.contains(document.activeElement) ?? false'), "Binding dialog did not receive focus");
    for (let tab = 0; tab < 10; tab += 1) {
        await browser(student, "press", "Tab");
        assert(await evaluate(student, 'document.querySelector(\'[role="dialog"]\')?.contains(document.activeElement) ?? false'), `Tab ${tab + 1} escaped the binding dialog`);
    }
    await browser(student, "press", "Escape");
    await eventually(() => evaluate(student, '!document.querySelector(\'[role="dialog"]\')'), "Escape did not close the binding dialog");
    await namedButton(student, "关联变量");
    await visible(student, '[aria-label="选择变量字段"]');
    await browser(student, "click", '[aria-label="选择变量字段"]');
    const selectedVariable = await evaluate(student, `(() => {const option=[...document.querySelectorAll('[role="option"]')].find(element=>element.textContent.trim()===${JSON.stringify(`${dictionaryLabel}（${continuousVariable.field}）`)});if(!option)return false;option.dispatchEvent(new MouseEvent("click",{bubbles:true}));return true})()`);
    assert(selectedVariable, "Numeric variable option is unavailable");
    await namedButton(student, "确认关联");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("已关联变量")'), "Numeric variable binding was not shown");
    await browser(student, "screenshot", join(artifacts, "numeric-variable-binding.png"));
    await activate(student, '[data-testid="student-questionnaire-step-4"]');
    for (const state of ["pending", "completed"]) {
        if (state === "completed") await completeQuestionnairePreview(student, 5);
        assert(await evaluate(student, `document.querySelector('[data-testid="student-questionnaire-complete"]').disabled===${state === "pending"}`), `Questionnaire completion gate must reflect ${state} trial`);
        for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
            await browser(student, "set", "viewport", String(width), String(height));
            const trialSelector = `[data-testid="student-questionnaire-${state === "pending" ? "start" : "redo"}-preview"]`;
            await evaluate(student, `document.querySelector('${trialSelector}').scrollIntoView({block:'center'})`);
            assert(await evaluate(student, `(() => {const button=document.querySelector('${trialSelector}').getBoundingClientRect();return button.top>=0 && button.bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top && document.documentElement.scrollWidth<=innerWidth;})()`), `${state} trial action must remain reachable at ${width}px`);
            await browser(student, "screenshot", join(artifacts, `questionnaire-trial-${state}-${width}.png`));
            assert(await evaluate(student, `(async () => {scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});await new Promise(requestAnimationFrame);const panel=document.querySelector('[data-testid="student-questionnaire-structure"]');return panel.textContent.includes('100分不代表问卷具有良好效度、信度') && panel.getBoundingClientRect().bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top;})()`), `Structure details and caveat must remain available at ${width}px`);
            await browser(student, "screenshot", join(artifacts, `questionnaire-structure-${state}-${width}.png`));
        }
    }
    await browser(student, "set", "viewport", "1280", "800");
    await activate(student, '[data-testid="student-questionnaire-complete"]');
    await visible(student, '[data-testid="student-stage-sample-plan"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 2 && experiment.stage1CompletedAt, "Stage 1 did not persist");
    assert(experiment.questionnaire?.title === "学习投入调查：浏览器试填", "Questionnaire save lost the reviewed title");
    console.log("PASS questionnaire editing, explicit trial navigation and one-step save (real browser)");
    await page(student, stageUrl, '[data-testid="student-stage-sample-plan"]');
    await visible(student, '[data-testid="planning-scroll-content"]');
    await activate(student, '[data-testid="immersive-sp-close"]');
    await namedButton(student, "确定退出");
    await visible(student, '[data-testid="student-sample-plan-start"]');
    await browser(student, "screenshot", join(artifacts, "planning-entry.png"));
    await activate(student, '[data-testid="student-sample-plan-start"]');
    await visible(student, '[data-testid="planning-scroll-content"]');
    const planningLayout = await evaluate<{ viewportHeight: number; top: number; bottom: number; contentBottom: number; footerTop: number }>(student, `(() => {
        const dialog = document.querySelector('[data-testid="immersive-sample-planning"]');
        const bounds = dialog.getBoundingClientRect();
        const content = dialog.querySelector('[data-testid="planning-scroll-content"]').getBoundingClientRect();
        const footer = dialog.querySelector('footer').getBoundingClientRect();
        return { viewportHeight: innerHeight, top: bounds.top, bottom: bounds.bottom, contentBottom: content.bottom, footerTop: footer.top };
    })()`);
    assert(planningLayout.top === 0 && planningLayout.bottom === planningLayout.viewportHeight,
        "Planning dialog must cover the viewport independently of page animations");
    assert(planningLayout.contentBottom <= planningLayout.footerTop,
        "Planning footer must not overlap scrollable content");
    console.log("PASS planning dialog viewport and content/footer geometry (real browser)");
    const plan = computeDiningPlan();
    const hasLearningEntry = await evaluate(student, '[...document.querySelectorAll("button")].some(button => button.textContent.trim() === "暂不估计，直接查看建议")');
    if (hasLearningEntry) {
    await namedButton(student, "暂不估计，直接查看建议");
    assert(await evaluate(student, '!document.body.textContent.includes("已了解，直接调整方案")'), "Planning still exposes the learning bypass");
    await activate(student, '[data-testid="immersive-sp-next"]');
    assert(await evaluate(student, 'document.querySelector("[data-testid=immersive-sp-next]").disabled'), "Precision lesson should require an understanding check");
    await activate(student, '[data-testid="learning-check-precision"] input[value="0"]');
    await activate(student, '[data-testid="learning-check-precision"] button');
    assert(await evaluate(student, 'document.querySelector("[data-testid=immersive-sp-next]").disabled'), "An incorrect answer unlocked precision");
    await evaluate(student, 'document.querySelector("[data-testid=learning-check-precision]").scrollIntoView({block:"end"})');
    await browser(student, "screenshot", join(artifacts, "planning-learning-feedback.png"));
    await answerLearningCheck("precision", 1);
    await activate(student, '[data-testid="immersive-sp-next"]');
    await answerLearningCheck("error_tolerance", 0);
    await activate(student, '[data-testid="immersive-sp-next"]');
    // A real reload resumes the first unfinished factor without unlocking later content.
    await browser(student, "reload");
    await visible(student, '[data-testid="learning-check-subpopulation"]');
    assert(await evaluate(student, 'document.querySelector("[data-testid=immersive-sp-next]").disabled && document.body.textContent.includes("已掌握 1 / 6")'), "Learning progress was lost or skipped after reloading");
    await evaluate(student, 'document.querySelector("[data-testid=learning-check-subpopulation]").scrollIntoView({block:"end"})');
    assert(await evaluate(student, 'document.documentElement.scrollWidth <= innerWidth && document.querySelector("[data-testid=planning-scroll-content]").scrollWidth <= document.querySelector("[data-testid=planning-scroll-content]").clientWidth'), "Learning content overflows its viewport");
    await browser(student, "screenshot", join(artifacts, "planning-learning-resumed.png"));
    for (const [id, answer] of [["subpopulation", 2], ["variability", 1], ["design_effect", 2], ["non_response", 0], ["cost_balance", 1]] as const) {
        await answerLearningCheck(id, answer);
        await activate(student, '[data-testid="immersive-sp-next"]');
    }
    await activate(student, '[data-testid="immersive-sp-next"]');
    await answerLearningCheck("calculation", 2);
    await activate(student, '[data-testid="immersive-sp-next"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="immersive-sp-final-size"]').value === ${JSON.stringify(String(plan.recommendedSize))}`), "Planning UI recommendation differs from the fixture");
    } else {
        await namedButton(student, "采用建议值");
        assert(await evaluate(student, `document.querySelector('[data-testid="immersive-sp-final-size"]').value === ${JSON.stringify(String(plan.recommendedSize))}`), "Planning UI recommendation differs from the fixture");
    }
    await activate(student, '[data-testid="immersive-sp-decision-next"]');
    if (await evaluate(student, 'Boolean(document.querySelector("[data-testid=immersive-sp-quiz-next]"))')) for (const [id, answer] of [["quiz_se", 0], ["quiz_population", 1], ["quiz_design", 0]] as const) {
        assert(await evaluate(student, 'document.querySelector("[data-testid=immersive-sp-quiz-next]").disabled && !document.body.textContent.includes("跳过，直接去确认")'), "Quiz can be skipped without understanding");
        await answerLearningCheck(id, answer);
        await activate(student, '[data-testid="immersive-sp-quiz-next"]');
    }
    console.log("PASS required planning lessons, retry feedback, draft recovery and layout (real browser)");
    const planSaveRoute = `${baseUrl}/api/student/tasks/${task.id}/experiment/stages/2/complete*`;
    await browser(student, "network", "route", planSaveRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "模拟规划保存失败，请重试" } }));
    await activate(student, '[data-testid="immersive-sp-confirm"]');
    await visible(student, '[data-testid="student-sample-plan-summary"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-sample-plan-summary"]').textContent.includes(${JSON.stringify(String(plan.recommendedSize))})`), "Failed save must retain the calculated plan summary");
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, `document.querySelector('[data-testid="student-sample-plan-summary"]').scrollIntoView({block:'center'})`);
        assert(await evaluate(student, "document.documentElement.scrollWidth<=innerWidth"), "Plan summary must not overflow");
        await browser(student, "screenshot", join(artifacts, `planning-summary-${width}.png`));
    }
    await browser(student, "network", "unroute", planSaveRoute);
    await activate(student, '[data-testid="student-sample-plan-next"]');
    await visible(student, '[data-testid="student-stage-sampling"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 3 && experiment.samplePlan?.finalSampleSize === plan.recommendedSize, "Stage 2 did not persist");
    await browser(student, "set", "viewport", "1024", "768");
    await page(student, stageUrl, '[data-testid="student-stage-sampling"]');
    const diningStats = await api<{ ppsEligibleFields: string[] }>(student, `/api/student/tasks/${task.id}/stats`);
    assert(JSON.stringify(diningStats.ppsEligibleFields) === JSON.stringify([DINING_PPS_SIZE_FIELD]), `Dining PPS policy exposed unintended fields: ${JSON.stringify(diningStats.ppsEligibleFields)}`);
    for (const method of ["simple", "systematic", "pps", "stratified"]) {
        await activate(student, `[data-testid="student-sampling-tab-${method}"]`);
        assert(await evaluate(student, `(() => {const preview=document.querySelector('[data-testid="student-sampling-${method}-preview"]');const bounds=preview?.getBoundingClientRect();return bounds && bounds.height>0 && bounds.height<140 && !preview.querySelector('table') && document.documentElement.scrollWidth<=innerWidth;})()`), `${method} empty preview must be compact without horizontal overflow`);
        await evaluate(student, `document.querySelector('[data-testid="student-sampling-${method}-preview"]').scrollIntoView({block:'center'})`);
        await browser(student, "screenshot", join(artifacts, `sampling-${method}-empty.png`));
    }
    await evaluate(student, 'scrollTo({top:0,behavior:"instant"})');
    await activate(student, '[data-testid="student-sampling-tab-pps"]');
    await visible(student, '[data-testid="student-sampling-pps-size-field"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-sampling-pps-size-field"]').textContent.includes(${JSON.stringify(DINING_PPS_SIZE_FIELD)})`), "Dining PPS control did not select the policy-approved prior-frame size field");
    await browser(student, "screenshot", join(artifacts, "sampling-pps-policy.png"));
    await activate(student, '[data-testid="student-sampling-tab-simple"]');
    assert(await evaluate(student, `(() => {const button=document.querySelector('[data-testid="student-sampling-simple-run"]').getBoundingClientRect();const footer=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect();return button.top>0 && button.bottom<=footer.top && button.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth;})()`), "The initial sampling action must remain visible without document overflow at 1024×768");
    await browser(student, "screenshot", join(artifacts, "sampling-start.png"));
    const savedRecordLayout = await evaluate<{ found: boolean; top?: number; bottom?: number; footerTop?: number; scrollY: number; scrollHeight: number }>(student, `(async () => {const heading=[...document.querySelectorAll('div')].find(element=>element.textContent.trim()==="已保存的入样记录");const card=heading?.closest('[data-slot="card"]');scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});await new Promise(requestAnimationFrame);const footer=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect();const bounds=card?.getBoundingClientRect();return {found:Boolean(card),top:bounds?.top,bottom:bounds?.bottom,footerTop:footer.top,scrollY,scrollHeight:document.documentElement.scrollHeight};})()`);
    assert(savedRecordLayout.found && Number(savedRecordLayout.bottom) <= Number(savedRecordLayout.footerTop), `The saved-record card cannot be scrolled clear of the sticky actions at 1024×768: ${JSON.stringify(savedRecordLayout)}`);
    await activate(student, '[data-testid="student-sampling-simple-run"]');
    await visible(student, '[data-testid="immersive-sampling-animation"]');
    assert(await evaluate(student, `(() => {const e=document.querySelector('[data-testid="immersive-sampling-animation"]');const r=e.getBoundingClientRect();return e.parentElement===document.body && r.top===0 && r.bottom===innerHeight && r.right===innerWidth && document.documentElement.scrollWidth<=innerWidth;})()`), "Sampling animation must cover the 1024×768 desktop viewport without document overflow");
    await visible(student, '[data-testid="sampling-animation-dot-grid"]');
    assert(await evaluate(student, `(() => {const grid=document.querySelector('[data-testid="sampling-animation-dot-grid"]');const card=grid.closest('.overflow-hidden').getBoundingClientRect();const legend=document.querySelector('[data-testid="sampling-animation-legend"]').getBoundingClientRect();return Number(grid.dataset.visualPopulation)===${experiment.populationSize} && grid.children.length===${experiment.populationSize} && document.querySelector('[data-testid="sampling-animation-scale-note"]').textContent.includes("按实际数量绘制") && card.left>=0 && card.right<=innerWidth && card.bottom<=innerHeight && legend.left>=card.left && legend.right<=card.right;})()`), "Small population animation did not fit or render one dot per actual unit at 1024×768");
    experiment = await api(student, experimentPath);
    const simpleSeed = experiment.samplingResults?.simple?.seed;
    assert(simpleSeed !== undefined, "Simple sampling result did not save its random seed");
    await eventually(() => evaluate(student, `(() => {const grid=document.querySelector('[data-testid="sampling-animation-dot-grid"]');return grid?.querySelectorAll('[data-selected="true"]').length===${experiment.samplePlan?.finalSampleSize} && document.body.textContent.includes("演示进度 ${experiment.samplePlan?.finalSampleSize} / ${experiment.samplePlan?.finalSampleSize}") && document.body.textContent.includes("随机种子 ${simpleSeed}");})()`), "Sampling animation did not replay the saved draw parameters and planned sample count");
    await browser(student, "screenshot", join(artifacts, "sampling-animation-exact.png"));
    await activate(student, '[data-testid="immersive-sampling-skip"]');
    await visible(student, '[data-testid="sampling-animation-receipt"]');
    assert(await evaluate(student, `(() => {const receipt=document.querySelector('[data-testid="sampling-animation-receipt"]');return receipt.textContent.includes("${experiment.populationSize} → ${experiment.samplePlan?.finalSampleSize}") && receipt.textContent.includes("抽样比") && receipt.textContent.includes("随机种子");})()`), "Sampling receipt did not preserve the saved draw parameters");
    assert(await evaluate(student, `(() => {const overlay=document.querySelector('[data-testid="immersive-sampling-animation"]');const receipt=document.querySelector('[data-testid="sampling-animation-receipt"]').getBoundingClientRect();const table=document.querySelector('[aria-label="抽样结果数据表"]').getBoundingClientRect();const actions=[...overlay.querySelectorAll('button')].map(button=>button.getBoundingClientRect());return document.documentElement.scrollWidth<=innerWidth && receipt.left>=0 && receipt.right<=innerWidth && table.height>=120 && table.bottom<=innerHeight && actions.every(rect=>rect.left>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight);})()`), "Sampling receipt, table, or actions are clipped at 1024×768");
    for (let tab = 0; tab < 6; tab += 1) {
        await browser(student, "press", "Tab");
        assert(await evaluate(student, `document.querySelector('[data-testid="immersive-sampling-animation"]').contains(document.activeElement)`), `Sampling animation focus escaped at 1024×768 after Tab ${tab + 1}`);
    }
    await browser(student, "screenshot", join(artifacts, "sampling-animation-receipt.png"));
    // A 512×384 CSS viewport reproduces the layout viewport of a 1024×768
    // desktop display at 200% browser zoom; this is not a mobile breakpoint.
    await browser(student, "set", "viewport", "512", "384");
    assert(await evaluate(student, `(() => {const overlay=document.querySelector('[data-testid="immersive-sampling-animation"]');const canvas=overlay.firstElementChild.getBoundingClientRect();return canvas.width>=1024 && overlay.scrollWidth>=1024;})()`), "Sampling overlay did not preserve the documented 1024px desktop canvas at 200% zoom");
    for (const selector of ['[data-testid="immersive-sampling-replay"]', '[data-testid="immersive-sampling-skip-rest"]', '[data-testid="immersive-sampling-return"]']) {
        assert(await evaluate(student, `(async () => {const element=document.querySelector(${JSON.stringify(selector)});element?.scrollIntoView({block:"nearest",inline:"nearest"});await new Promise(requestAnimationFrame);const bounds=element?.getBoundingClientRect();return bounds && bounds.left>=0 && bounds.right<=innerWidth && bounds.top>=0 && bounds.bottom<=innerHeight;})()`), `Sampling action ${selector} is unreachable at 200% desktop zoom`);
    }
    assert(await evaluate(student, `(async () => {const receipt=document.querySelector('[data-testid="sampling-animation-receipt"]');receipt?.scrollIntoView({block:"start",inline:"start"});await new Promise(requestAnimationFrame);const receiptBounds=receipt?.getBoundingClientRect();const table=document.querySelector('[aria-label="抽样结果数据表"]');table?.scrollIntoView({block:"start",inline:"start"});await new Promise(requestAnimationFrame);const tableBounds=table?.getBoundingClientRect();const firstRow=table?.querySelector('tbody tr')?.getBoundingClientRect();return receiptBounds && receiptBounds.width>0 && tableBounds && tableBounds.width>0 && tableBounds.height>=80 && firstRow && firstRow.height>0;})()`), "Sampling evidence and data rows are unreachable at 200% desktop zoom");
    await browser(student, "screenshot", join(artifacts, "sampling-animation-zoom-200.png"));
    assert(await evaluate(student, `(async () => {const range=document.querySelector('[data-testid="sampling-animation-result-range"]');range?.scrollIntoView({block:"end",inline:"nearest"});await new Promise(requestAnimationFrame);const bounds=range?.getBoundingClientRect();return range?.textContent.includes("显示第 1-10 条，共 ${plan.recommendedSize} 条") && bounds && bounds.left>=0 && bounds.right<=innerWidth && bounds.top>=0 && bounds.bottom<=innerHeight;})()`), "Sampling result range is unreachable at 200% desktop zoom");
    assert(await evaluate(student, `(async () => {const next=document.querySelector('[aria-label="抽样结果下一页"]');next?.scrollIntoView({block:"end",inline:"nearest"});await new Promise(requestAnimationFrame);const bounds=next?.getBoundingClientRect();return bounds && bounds.left>=0 && bounds.right<=innerWidth && bounds.top>=0 && bounds.bottom<=innerHeight && !next.disabled;})()`), "Sampling pagination is unreachable at 200% desktop zoom");
    await browser(student, "screenshot", join(artifacts, "sampling-animation-zoom-200-pagination.png"));
    await activate(student, '[data-testid="immersive-sampling-replay"]');
    await visible(student, '[data-testid="sampling-animation-dot-grid"]');
    assert(await evaluate(student, `(async () => {const grid=document.querySelector('[data-testid="sampling-animation-dot-grid"]');grid?.scrollIntoView({block:"center",inline:"center"});await new Promise(requestAnimationFrame);const bounds=grid?.getBoundingClientRect();return grid?.children.length===${experiment.populationSize} && document.querySelector('[data-testid="sampling-animation-legend"]') && document.body.textContent.includes("随机种子 ${simpleSeed}") && bounds && bounds.right>0 && bounds.left<innerWidth && bounds.bottom>0 && bounds.top<innerHeight;})()`), "Sampling draw is unreachable when replayed at 200% desktop zoom");
    await eventually(() => evaluate(student, `document.querySelector('[data-testid="sampling-animation-dot-grid"]')?.querySelectorAll('[data-selected="true"]').length===${experiment.samplePlan?.finalSampleSize}`), "Sampling replay did not expose the completed draw at 200% desktop zoom");
    await browser(student, "screenshot", join(artifacts, "sampling-animation-zoom-200-draw.png"));
    await activate(student, '[data-testid="immersive-sampling-skip"]');
    await visible(student, '[data-testid="sampling-animation-receipt"]');
    await browser(student, "set", "viewport", "1024", "768");
    await activate(student, '[data-testid="immersive-sampling-replay"]');
    await visible(student, '[data-testid="sampling-animation-dot-grid"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="sampling-animation-legend"]').textContent.includes("实色描边：已选样本") && document.body.textContent.includes("随机种子 ${simpleSeed}")`), "Sampling replay did not retain the saved draw or explain the dot encoding");
    await activate(student, '[data-testid="immersive-sampling-skip"]');
    await visible(student, '[data-testid="sampling-animation-receipt"]');
    await activate(student, '[data-testid="immersive-sampling-return"]');
    await browser(student, "set", "viewport", "1280", "800");
    for (const method of ["systematic", "pps"] as const) {
        await api(student, `/api/student/tasks/${task.id}/sampling`, "POST", { method, params: { sampleSize: plan.recommendedSize, ...(method === "pps" ? { sizeField: DINING_PPS_SIZE_FIELD } : {}) } });
    }
    await page(student, stageUrl, '[data-testid="student-stage-sampling"]');
    assert(await evaluate(student, `(() => {const table=document.querySelector('[aria-label^="抽样结果数据表"]');const stage=document.querySelector('[data-testid="student-stage-sampling"]');return table && table.getBoundingClientRect().width > stage.getBoundingClientRect().width*0.8 && document.documentElement.scrollWidth<=innerWidth;})()`), "Sampling data table must use the available width without overflowing the page");
    await activate(student, '[data-testid="student-sampling-tab-stratified"]');
    await activate(student, '[data-testid="student-sampling-stratified-run"]');
    await visible(student, '[data-testid="immersive-sampling-animation"]');
    await activate(student, '[data-testid="immersive-sampling-skip"]');
    await visible(student, '[data-testid="sampling-animation-receipt"]');
    await activate(student, '[data-testid="immersive-sampling-return"]');
    const beforeReview = await api<ExperimentData>(student, experimentPath);
    for (const method of ["simple", "systematic", "pps", "stratified"]) {
        await activate(student, `[data-testid="student-sampling-tab-${method}"]`);
        assert(await evaluate(student, `(() => {const preview=document.querySelector('[data-testid="student-sampling-${method}-preview"]');return preview?.getBoundingClientRect().height===360 && preview.querySelector('table tbody tr') && document.documentElement.scrollWidth<=innerWidth;})()`), `${method} completed preview must retain table space and saved records`);
        await evaluate(student, `document.querySelector('[data-testid="student-sampling-${method}-preview"]').scrollIntoView({block:'center'})`);
        await browser(student, "screenshot", join(artifacts, `sampling-${method}-completed.png`));
        assert(await evaluate(student, `(async () => {const preview=document.querySelector('[data-testid="student-sampling-${method}-preview"]');const region=preview.querySelector('[role="region"]');region.scrollTop=region.scrollHeight;await new Promise(requestAnimationFrame);const last=region.querySelector('tbody tr:last-child').getBoundingClientRect();const bounds=region.getBoundingClientRect();return last.top>=bounds.top && last.bottom<=bounds.bottom && preview.getBoundingClientRect().bottom<=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect().top;})()`), `${method} last preview row and pagination must remain reachable above the sticky footer`);
        if (method === "pps") await browser(student, "fill", '[data-testid="student-sampling-pps-sample-size"]', "999999");
        await activate(student, `[data-testid="student-sampling-${method}-review"]`);
        await activate(student, '[data-testid="sampling-animation-step"]');
        await activate(student, '[data-testid="sampling-animation-step"]');
        assert(await evaluate(student, `(async () => {const count=()=>document.querySelectorAll('[data-testid="sampling-animation-dot-grid"] [data-selected="true"]').length;const before=count();await new Promise(resolve=>setTimeout(resolve,300));return before===1 && count()===1 && document.body.textContent.includes('已暂停');})()`), `${method} single step must pause at exactly one illustrated unit`);
        await browser(student, "set", "viewport", "1024", "768", "2");
        await browser(student, "screenshot", join(artifacts, `sampling-${method}-paused.png`));
        await activate(student, '[data-testid="immersive-sampling-skip"]');
        assert(await evaluate(student, `document.querySelector('[data-testid="sampling-animation-receipt"]').textContent.includes("${experiment.populationSize} → ${plan.recommendedSize}")`), `${method} explanation must use saved counts, not edited form values`);
        await activate(student, '[data-testid="immersive-sampling-return"]');
        await eventually(() => evaluate(student, `document.activeElement?.getAttribute('data-testid')==='student-sampling-${method}-review'`), `${method} explanation restores focus`);
        await browser(student, "set", "viewport", "1280", "800", "2");
        if (method === "pps") await browser(student, "fill", '[data-testid="student-sampling-pps-sample-size"]', String(plan.recommendedSize));
    }
    const afterReview = await api<ExperimentData>(student, experimentPath);
    deepStrictEqual(afterReview.samplingResults, beforeReview.samplingResults, "Viewing explanations must not replace saved samples");
    assert(afterReview.version === beforeReview.version, "Viewing explanations must not write the experiment");
    await activate(student, '[data-testid="student-sampling-next"]');
    await visible(student, '[data-testid="student-stage-analysis-report"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 4 && experiment.stage3CompletedAt, "Stage 3 did not persist");
    await page(student, stageUrl, '[data-testid="student-stage-analysis-report"]');
    await eventually(() => evaluate(student, 'document.body.textContent.includes("研究目标结果") && document.body.textContent.includes("PPS")'), "Analysis results missing");
    await eventually(() => evaluate(student, `(() => {const panel=document.querySelector('[data-testid="student-target-metrics"]');const table=panel?.querySelector('table');return panel && table && table.getBoundingClientRect().width<=panel.getBoundingClientRect().width && document.documentElement.scrollWidth<=innerWidth;})()`), "Target comparison table must fit the full-width result panel");
    await eventually(() => evaluate(student, `(() => {const rows=document.querySelectorAll('[data-testid="student-target-metrics"] tbody tr');const footer=document.querySelector('[data-testid="student-stage-actions"]');return rows.length>=2 && rows[1].getBoundingClientRect().bottom<=footer.getBoundingClientRect().top;})()`), "The first two comparison results must be fully visible above the footer at 1280×800");
    await browser(student, "screenshot", join(artifacts, "analysis-results.png"));
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, `scrollTo(0,0);document.querySelector('[data-testid="student-study-context"]').open=true`);
        assert(await evaluate(student, `(() => {const nav=document.querySelector('[data-testid="student-experiment-navigation"]').getBoundingClientRect();const context=document.querySelector('[data-testid="student-study-context"]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth && context.top>=nav.bottom && document.querySelectorAll('[data-testid="student-experiment-stages"] [aria-current="step"]').length===1;})()`), `Student navigation and expanded study context must remain readable at ${width}`);
        await browser(student, "screenshot", join(artifacts, `student-context-${width}.png`));
    }
    await evaluate(student, `document.querySelector('[data-testid="student-study-context"]').open=false`);
    await browser(student, "set", "viewport", "1280", "800");
    await evaluate(student, `document.querySelector('[data-testid="student-target-metrics"] details').open = true`);
    await evaluate(student, `document.querySelector('[data-testid="student-target-metrics"] details').scrollIntoView({block:'center'})`);
    await browser(student, "screenshot", join(artifacts, "analysis-diagnostics.png"));
    await evaluate(student, `document.querySelector('[data-testid="student-target-metrics"] details').open = false`);
    const metrics = await api<AnalysisMetricsResult>(student, `/api/student/tasks/${task.id}/analysis-metrics`);
    assert(metrics.ppsStandardErrorMode === "systematic_exact" && metrics.ppsMonteCarloReplicates === 0,
        "PPS worker did not use exact design integration");
    const ppsStandardError = metrics.target?.methods.pps.standardError;
    assert(typeof ppsStandardError === "number" && Number.isFinite(ppsStandardError) && ppsStandardError > 0,
        "PPS worker returned no valid standard error for the nondegenerate fixture");
    // Recoverable transport and render failures must not erase the local report.
    const draftText = "异常恢复时需要保留的报告草稿";
    await activate(student, '[data-testid="student-analysis-workspace-report"]');
    await browser(student, "fill", '[data-testid="student-analysis-report-editor"]', draftText);
    await activate(student, '[data-testid="student-analysis-workspace-overview"]');
    await activate(student, '[data-testid="student-analysis-workspace-report"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-analysis-report-editor"]').textContent.includes(${JSON.stringify(draftText)})`), "Switching analysis workspaces lost the report draft");
    const draftKey = `wj:experiment-draft:${experiment.id}:stage:4:version:${experiment.version}`;
    await eventually(() => evaluate(student, `localStorage.getItem(${JSON.stringify(draftKey)})?.includes(${JSON.stringify(draftText)})`), "Report draft did not save");
    const experimentRoute = baseUrl + experimentPath;
    await browser(student, "network", "route", experimentRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "模拟实验请求失败" } }));
    await page(student, stageUrl, '[role="alert"]');
    assert(await evaluate(student, 'document.body.textContent.includes("模拟实验请求失败")'), "Request failure was hidden or redirected");
    await browser(student, "network", "unroute", experimentRoute);
    await namedButton(student, "重试加载");
    await visible(student, '[data-testid="student-analysis-report-editor"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-analysis-report-editor"]').textContent.includes(${JSON.stringify(draftText)})`), "Retry lost report draft");
    const taskInfo = await api<Record<string, unknown>>(student, `/api/student/tasks/${task.id}`);
    const taskRoute = `${baseUrl}/api/student/tasks/${task.id}`;
    await browser(student, "network", "route", taskRoute, "--body", JSON.stringify({ success: true, data: { ...taskInfo, name: { broken: true } } }));
    await page(student, stageUrl, '[data-testid="page-error-boundary"]');
    assert(await evaluate(student, 'Boolean(document.querySelector("header a"))'), "Page failure removed navigation");
    await browser(student, "screenshot", join(artifacts, "page-error-recovery.png"));
    await browser(student, "network", "unroute", taskRoute);
    await namedButton(student, "重试显示");
    await visible(student, '[data-testid="student-analysis-report-editor"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-analysis-report-editor"]').textContent.includes(${JSON.stringify(draftText)})`), "Render recovery lost report draft");
    console.log("PASS request retry, page error boundary and draft restoration");
    await activate(student, '[data-testid="student-analysis-workspace-univariate"]');
    await visible(student, '[data-testid="student-univariate-workspace"]');
    await browser(student, "fill", '[data-testid="student-univariate-workspace"] textarea', `简单随机样本中的${dictionaryLabel}分布如何？`);
    await evaluate(student, `(() => {const selects=document.querySelectorAll('[data-testid="student-univariate-workspace"] select');for(const [select,value] of [[selects[0],"simple"],[selects[1],${JSON.stringify(continuousVariable.field)}]]){select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}))}})()`);
    await browser(student, "check", '[data-testid="student-univariate-workspace"] input[type="checkbox"]');
    await activate(student, '[data-testid="student-analysis-workspace-report"]');
    assert(await evaluate(student, 'document.querySelector("[data-testid=student-univariate-workspace]").getBoundingClientRect().height === 0'), "Inactive analysis workspace remains visible");
    await activate(student, '[data-testid="student-analysis-workspace-univariate"]');
    await visible(student, '[data-testid="student-univariate-workspace"] textarea');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-univariate-workspace"] textarea').value === ${JSON.stringify(`简单随机样本中的${dictionaryLabel}分布如何？`)} && document.querySelectorAll('[data-testid="student-univariate-workspace"] select')[1].value === ${JSON.stringify(continuousVariable.field)} && document.querySelector('[data-testid="student-univariate-workspace"] input[type="checkbox"]').checked`), "Tab switching lost the analysis question, variable or weighting choice");
    assert((await api<{ records: unknown[] }>(student, `/api/student/tasks/${task.id}/analyses`)).records.length === 0, "Changing tabs ran analysis implicitly");
    await browser(student, "uncheck", '[data-testid="student-univariate-workspace"] input[type="checkbox"]');
    await namedButton(student, "执行并保存分析");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("已保存分析（1/")'), "Univariate analysis did not save through the UI");
    const savedAnalyses = await api<{ records: Array<{ id: number; config: { field: string; method: string }; result: { kind: string } }> }>(student, `/api/student/tasks/${task.id}/analyses`);
    const savedAnalysis = savedAnalyses.records.find(record => record.config.field === continuousVariable.field && record.config.method === "simple");
    assert(savedAnalysis?.result.kind === "numeric", "Saved analysis is missing or is not numeric");
    await namedButton(student, "引用到报告");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("移除引用")'), "Saved analysis was not referenced in the report draft");
    let referencedAnalysisId = savedAnalysis.id;
    await evaluate(student, '[...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="移除引用").closest("article").scrollIntoView({block:"center"})');
    await browser(student, "screenshot", join(artifacts, "stage4-saved-analysis.png"));
    await browser(student, "fill", '[data-testid="student-univariate-workspace"] textarea', `加权估计${dictionaryLabel}的总体均值是多少？`);
    await browser(student, "check", '[data-testid="student-univariate-workspace"] input[type="checkbox"]');
    await namedButton(student, "执行并保存分析");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("已保存分析（2/")'), "Weighted analysis did not save");
    await browser(student, "set", "viewport", "1280", "1100");
    await evaluate(student, 'document.querySelector("[data-testid=student-univariate-workspace] article").scrollIntoView({block:"center"})');
    assert(await evaluate(student, 'document.querySelector("[data-testid=student-univariate-workspace] article").textContent.includes("设计加权比率点估计")'), "Weighted analysis lacks its interpretation label");
    await browser(student, "screenshot", join(artifacts, "stage4-weighted-analysis.png"));
    await browser(student, "set", "viewport", "1280", "800");

    // P0 上游失效：保存引用后重开阶段 3，同种子重抽使历史分析永久过期
    const beforeReopen = await api<ExperimentData>(student, experimentPath);
    experiment = await api<ExperimentData>(student, `${experimentPath}/stages/3/reopen`, "POST", { observedVersion: beforeReopen.version });
    assert(experiment.currentStage === 3 && experiment.stage3CompletedAt === null, "Stage 3 reopen did not roll back");
    assert((experiment.analysisReferences ?? []).length === 0, "Reopening upstream kept report references");
    assert((experiment.samplingGeneration ?? 0) === (beforeReopen.samplingGeneration ?? 0) + 1, "Reopening upstream did not advance the sampling generation");
    const staleRecords = await api<{ records: Array<{ id: number; stale: boolean }> }>(student, `/api/student/tasks/${task.id}/analyses`);
    assert(staleRecords.records.length === 2 && staleRecords.records.every(record => record.stale), "Reopening upstream did not mark saved analyses stale");
    for (const method of ["simple", "systematic", "pps"] as const) {
        await api(student, `/api/student/tasks/${task.id}/sampling`, "POST", { method, params: { sampleSize: plan.recommendedSize, seed: 1701, ...(method === "pps" ? { sizeField: DINING_PPS_SIZE_FIELD } : {}) } });
    }
    experiment = await api<ExperimentData>(student, `${experimentPath}/stages/3/complete`, "POST", { observedVersion: (await api<ExperimentData>(student, experimentPath)).version });
    assert(experiment.currentStage === 4, "Stage 3 recompletion failed");
    // 保存报告与提交共用引用校验；此处以阶段四保存触发 STALE_REFERENCE
    const staleReport = "上游重开后旧引用不得保存，必须重新运行或明确移除。" .repeat(6);
    const staleSave = await evaluate<{ status: number; code?: string }>(student, `(async()=>{const r=await fetch(${JSON.stringify(`${experimentPath}/stages/4/complete`)},{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({observedVersion:${experiment.version},reportContent:${JSON.stringify(`<p>${staleReport}</p>`)},analysisReferences:[${savedAnalysis.id}]})});const p=await r.json();return {status:r.status,code:p.error?.code}})()`);
    const debugState = await api<ExperimentData>(student, experimentPath);
    assert(staleSave.status === 409 && staleSave.code === "STALE_REFERENCE", `Stale reference report save was not rejected: ${JSON.stringify(staleSave)} local=${JSON.stringify({ version: experiment.version, stage: experiment.currentStage, s3: experiment.stage3CompletedAt, s4: experiment.stage4CompletedAt })} server=${JSON.stringify({ version: debugState.version, stage: debugState.currentStage, s3: debugState.stage3CompletedAt, s4: debugState.stage4CompletedAt })}`);
    await page(student, stageUrl, '[data-testid="student-analysis-report"]');
    await activate(student, '[data-testid="student-analysis-workspace-univariate"]');
    await eventually(() => evaluate(student, 'document.querySelector("[data-testid=student-univariate-workspace] article")?.textContent.includes("来源已过期")'), "Stale analysis warning missing in the student UI");
    assert(await evaluate(student, `[...document.querySelectorAll("button")].filter(button=>button.textContent.trim()==="引用到报告").every(button=>button.disabled)`), "Stale analyses must not be newly referenceable");
    await evaluate(student, 'document.querySelector("[data-testid=student-univariate-workspace] article").scrollIntoView({block:"center"})');
    await browser(student, "screenshot", join(artifacts, "stale-analysis-warning.png"));
    // 页面重载后组件状态清空：重新填写研究问题与变量后再运行（草稿契约不含分析配置）
    await browser(student, "fill", '[data-testid="student-univariate-workspace"] textarea', `重开后简单随机样本中的${dictionaryLabel}分布如何？`);
    await evaluate(student, `(() => {const selects=document.querySelectorAll('[data-testid="student-univariate-workspace"] select');for(const [select,value] of [[selects[0],"simple"],[selects[1],${JSON.stringify(continuousVariable.field)}]]){select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}))}})()`);
    await namedButton(student, "执行并保存分析");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("已保存分析（3/")'), "Analysis after reopen did not save");
    const refreshedRecords = await api<{ records: Array<{ id: number; stale: boolean; config: { field: string; method: string } }> }>(student, `/api/student/tasks/${task.id}/analyses`);
    const freshAnalysis = refreshedRecords.records.find(record => !record.stale && record.config.field === continuousVariable.field);
    assert(freshAnalysis, "Fresh analysis after reopen is missing");
    const referenceFocused = await evaluate<boolean>(student, `(() => {const button=[...document.querySelectorAll("button")].find(entry=>!entry.disabled && entry.textContent.trim()==="引用到报告");if(!button)return false;button.focus();return document.activeElement===button;})()`);
    assert(referenceFocused, "Enabled reference button was not focusable");
    await browser(student, "press", "Enter");
    await eventually(() => evaluate(student, 'document.body.textContent.includes("移除引用")'), "Keyboard reference was not applied");
    referencedAnalysisId = freshAnalysis.id;
    console.log("PASS upstream reopen, stale reference gate, resample and re-analysis (real browser)");

    await activate(student, '[data-testid="student-analysis-workspace-report"]');
    const report = "本次实验以食堂午间十五分钟服务时段的平均等待分钟数为研究目标。我们比较了简单随机、系统抽样与以客流量为规模变量的PPS估计及设计标准误，并结合总体真值讨论精度和代表性。样本量规划采用有限总体校正，本次无回答率假设为零。分析单位是服务时段而非就餐学生，单次样本差异不能直接解释为服务质量的因果差异。";
    await browser(student, "fill", '[data-testid="student-analysis-report-editor"]', report);
    await browser(student, "screenshot", join(artifacts, "report-editor.png"));
    for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
        await browser(student, "set", "viewport", String(width), String(height));
        await evaluate(student, `document.querySelector('[data-testid="student-analysis-report-editor"]').scrollIntoView({block:'center'})`);
        assert(await evaluate(student, `(() => {const editor=document.querySelector('[data-testid="student-analysis-report-editor"]').getBoundingClientRect();const reference=document.querySelector('[aria-label="报告写作参考"]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth && editor.width>=400 && (reference.left>=editor.right || reference.top>=editor.bottom);})()`), `Report editor and reference must not overlap or overflow at ${width}×${height}`);
        await browser(student, "screenshot", join(artifacts, `report-editor-${width}.png`));
        await evaluate(student, `document.querySelector('[aria-label="报告写作参考"] > p:last-child').scrollIntoView({block:'center'})`);
        assert(await evaluate(student, `(() => {const tail=document.querySelector('[aria-label="报告写作参考"] > p:last-child').getBoundingClientRect();const footer=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect();const navigation=document.querySelector('[data-testid="student-experiment-navigation"]').getBoundingClientRect();return tail.bottom<=footer.top && tail.top>=navigation.bottom;})()`), `Report reference tail must scroll clear of sticky navigation and actions at ${width}×${height}`);
        await browser(student, "screenshot", join(artifacts, `report-reference-tail-${width}.png`));
    }
    await browser(student, "set", "viewport", "1280", "800");
    await activate(student, '[data-testid="student-analysis-preview"]');
    await visible(student, '[data-testid="student-preview-submit"]');
    await captureDesktop(student, "submission-preview", '[data-testid="student-preview-submit-panel"]');
    await activate(student, '[data-testid="student-preview-tab-questionnaire"]');
    await captureDesktop(student, "submission-questionnaire", '[data-testid="student-preview-submit-panel"]');
    await activate(student, '[data-testid="student-preview-tab-report"]');
    experiment = await api(student, experimentPath);
    assert(experiment.stage4CompletedAt, "Stage 4 did not persist");
    console.log("PASS four stage transitions, rendered pages and PPS analysis");

    async function submit() {
        await page(student, `/student/task/${task!.id}/preview`, '[data-testid="student-preview-submit"]');
        await activate(student, '[data-testid="student-preview-submit"]');
        await visible(student, '[data-testid="student-preview-submit-confirm"]');
        await activate(student, '[data-testid="student-preview-submit-confirm"]');
        await eventually(async () => {
            if ((await api<ExperimentData>(student, experimentPath)).status === "submitted") return true;
            const error = await evaluate<string>(student, '[...document.querySelectorAll(".text-destructive")].map(element=>element.textContent).filter(Boolean).join(" | ")');
            if (error) throw new Error(error);
            return false;
        }, "Submission failed");
    }
    await submit();
    await page(student, `/student/task/${task.id}/result`, '[data-testid="student-submission-pending"]');
    assert(await evaluate(student, `!document.querySelector('[data-testid="student-submission-scores"]') && document.querySelector('[data-testid="student-submission-pending"]').getBoundingClientRect().top<document.querySelector('[data-testid="student-submission-content"]').getBoundingClientRect().top`), "Pending state must precede frozen content without empty score tiles");
    await captureDesktop(student, "submission-pending", '[data-testid="student-submission-pending"]');
    const frozenStudent = await api<{ snapshot: { analysisAppendices: Array<{ id: number; result: unknown }> } }>(student, `/api/student/tasks/${task.id}/submission`);
    const frozenTeacher = await api<{ analysisAppendices: Array<{ id: number; result: unknown }> }>(teacher, `/api/teacher/grading/${experiment.id}`);
    assert(frozenStudent.snapshot.analysisAppendices[0]?.id === referencedAnalysisId, "Submission did not freeze selected analysis");
    assert(JSON.stringify(frozenTeacher.analysisAppendices) === JSON.stringify(frozenStudent.snapshot.analysisAppendices), "Student and teacher did not receive the same frozen appendices");
    await page(teacher, `/teacher/grading/${experiment.id}`, "#grading-score-report");
    await namedButton(teacher, "报告");
    await eventually(() => evaluate(teacher, `document.body.textContent.includes(${JSON.stringify(`简单随机样本中的${dictionaryLabel}分布如何？`)})`), "Teacher grading view is missing the frozen analysis appendix");
    await evaluate(teacher, 'document.querySelector("[data-testid=analysis-appendices]").scrollIntoView({block:"start"})');
    await browser(teacher, "screenshot", join(artifacts, "teacher-submitted-appendix.png"));
    console.log("PASS saved univariate analysis, report reference, submission snapshot and teacher appendix");
    await namedButton(teacher, "驳回修改");
    await browser(teacher, "fill", "#grading-reject-reason", "请补充不同抽样设计的误差解释后重新提交。");
    await namedButton(teacher, "确认驳回");
    await eventually(async () => (await api<ExperimentData>(student, experimentPath)).status === "rejected", "Rejection failed");
    await page(student, `/student/task/${task.id}/result`, '[data-testid="student-submission-rejection"]');
    assert(await evaluate(student, `document.querySelector('[data-testid="student-submission-rejection"]').textContent.includes('请补充不同抽样设计的误差解释') && !document.querySelector('[data-testid="student-submission-scores"]')`), "Rejected result must show actionable feedback without scores");
    await captureDesktop(student, "submission-rejected", '[data-testid="student-submission-rejection"]');
    experiment = await api(student, experimentPath);
    await page(student, stageUrl, '[data-testid="student-experiment-rejection-notice"]');
    experiment = await api(student, `${experimentPath}/stages/4/reopen`, "POST", { observedVersion: experiment.version });
    experiment = await api(student, `${experimentPath}/stages/4/complete`, "POST", { observedVersion: experiment.version, reportContent: `<p>${report}补充说明：各设计的误差应结合抽样框排序和规模变量与目标变量的关系解释。</p>`, analysisReferences: [referencedAnalysisId] });
    await submit();
    console.log("PASS UI submission, teacher rejection and student resubmission");

    await page(teacher, `/teacher/grading/${experiment.id}`, "#grading-score-report");
    for (const key of ["questionnaire", "process", "report"]) await browser(teacher, "fill", `#grading-score-${key}`, "90");
    await browser(teacher, "fill", "#grading-comment", "已完成修改，分析准确。");
    await browser(teacher, "reload");
    await eventually(() => evaluate(teacher, 'document.querySelector("#grading-comment")?.value === "已完成修改，分析准确。" && document.querySelector("#grading-score-report")?.value === "90"'), "Refreshing grading must restore the local draft");
    const gradingSaveRoute = `${baseUrl}/api/teacher/grading/${experiment.id}`;
    await browser(teacher, "network", "route", gradingSaveRoute, "--body", JSON.stringify({ success: false, error: { code: "TEST_UNAVAILABLE", message: "模拟评分保存失败" } }));
    await namedButton(teacher, "提交评分");
    await activate(teacher, '[data-testid="teacher-grade-next"]');
    await eventually(() => evaluate(teacher, 'document.body.textContent.includes("模拟评分保存失败") && Boolean(document.querySelector("#grading-comment:not(:disabled)"))'), "Failed grading must remain editable");
    assert(await evaluate(teacher, `location.pathname==='/teacher/grading/${experiment.id}' && document.querySelector('#grading-comment').value==='已完成修改，分析准确。'`), "Failed save must not navigate or discard grading input");
    await browser(teacher, "network", "unroute", gradingSaveRoute);
    await namedButton(teacher, "提交评分");
    await captureDesktop(teacher, "grading-continue-confirm", '[data-testid="teacher-grading-panel"]');
    const pendingGrades = await api<{ items: Array<{ id: number }> }>(teacher, "/api/teacher/grading?status=pending&pageSize=100");
    const nextGrade = pendingGrades.items.find(item => item.id !== experiment.id);
    assert(nextGrade, "Seed must include another pending submission for continuous grading");
    await activate(teacher, '[data-testid="teacher-grade-next"]');
    await eventually(async () => (await api<ExperimentData>(student, experimentPath)).status === "graded", "Grading failed");
    await eventually(() => evaluate(teacher, `location.pathname==='/teacher/grading/${nextGrade.id}' && Boolean(document.querySelector('#grading-comment:not(:disabled)'))`), "Saving must open the next pending submission");
    assert(await evaluate(teacher, 'document.querySelector("#grading-comment").value!=="已完成修改，分析准确。"'), "Previous student's comment must not carry into next submission");
    assert(await evaluate(teacher, 'document.activeElement?.matches("h2[aria-describedby=grading-student-identity]")'), "Next submission must focus student identity");
    await browser(teacher, "press", "Tab");
    assert(await evaluate(teacher, 'document.activeElement?.getAttribute("role")==="tab"'), "Tab must continue from student identity into submitted materials");
    await browser(teacher, "screenshot", join(artifacts, "grading-next-submission.png"));
    await browser(teacher, "back");
    await eventually(() => evaluate(teacher, `location.pathname==='/teacher/grading/${experiment.id}' && document.body.textContent.includes('更新评分') && document.querySelector('#grading-score-report')?.value==='90'`), "Browser back must load the saved grade rather than resurrect the pending submission");
    await page(student, `/student/task/${task.id}/result`, '[data-testid="student-submission-detail"]');
    assert(await evaluate(student, 'document.body.textContent.includes("90") && document.body.textContent.includes("已完成修改，分析准确。")'), "Student grade or comment missing");
    await browser(student, "screenshot", join(artifacts, "student-result.png"));
    await captureDesktop(student, "submission-graded", '[data-testid="student-submission-scores"]');
    await page(teacher, "/teacher/export", 'button');
    await visible(teacher, '[data-testid="teacher-export-list"]');
    await captureDesktop(teacher, "export-list", '[data-testid="teacher-export-list"]');
    assert(await evaluate(teacher, `Boolean(document.querySelector('[data-testid="teacher-export-list"]').compareDocumentPosition(document.querySelector('[aria-label="成绩统计参考"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`), "Export filters must precede analytics in DOM reading order");
    const rows = await api<Array<{ totalScore: string; name: string }>>(teacher, `/api/teacher/grade-export/data?taskId=${task.id}`);
    assert(rows.length === 1 && Number(rows[0]!.totalScore) === 90, "Grade export disagrees with the submitted score");
    const download = await evaluate<{ status: number; bytes: number; base64: string }>(teacher, `(async()=>{const r=await fetch("/api/teacher/grade-export/excel?taskId=${task.id}");const bytes=new Uint8Array(await r.arrayBuffer());return {status:r.status,bytes:bytes.length,base64:btoa(String.fromCharCode(...bytes))}})()`);
    assert(download.status === 200 && download.bytes > 1000, "Excel export failed");
    const workbook = XLSX.read(Buffer.from(download.base64, "base64"), { type: "buffer" });
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]!]!);
    assert(exported.length === 1 && Number(exported[0]!["总分"]) === 90 && exported[0]!["实验模板名称"] === name, "Excel content disagrees with the graded submission");
    await browser(teacher, "screenshot", join(artifacts, "teacher-export.png"));
    console.log("PASS UI grading, student result and Excel export");
    // =====================================================================
    // 空功能路径：无字典、无关联、无分析引用的完整四阶段（规划 T3 §9.5）
    // =====================================================================
    const emptyTopicName = "浏览器回归：无字典空功能路径";
    const emptyPopulation = ["id,score,group", ...Array.from({ length: 300 }, (_, index) => `${String(index + 1).padStart(3, "0")},${20 + (index % 61)},${index % 3 === 0 ? "A" : "B"}`)].join("\n");
    const emptyTopic = await api<{ id: number }>(teacher, "/api/teacher/topics", "POST", { name: emptyTopicName, status: 0 });
    const uploaded = await evaluate<{ rowCount: number; columns: string[] }>(teacher, `(async () => {const form = new FormData();form.append("file", new File([${JSON.stringify(emptyPopulation)}], "empty-population.csv", { type: "text/csv" }));const response = await fetch(${JSON.stringify(`/api/teacher/topics/${emptyTopic.id}/excel`)}, { method: "POST", credentials: "include", body: form });const payload = await response.json();if (!response.ok || !payload.success) throw new Error("upload: " + JSON.stringify(payload.error));return payload.data;})()`);
    assert(uploaded.rowCount === 300 && uploaded.columns.includes("group"), "Empty-path population upload failed");
    const emptyMapping = { identifier: "id", numeric: ["score"], stratified: ["group"], others: [], analysisTarget: { kind: "proportion", field: "group", value: "A" } };
    await api(teacher, `/api/teacher/topics/${emptyTopic.id}/mapping`, "PUT", { fieldMapping: emptyMapping });
    await api(teacher, `/api/teacher/topics/${emptyTopic.id}/sampling-policy`, "PUT", { samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } } });
    await api(teacher, `/api/teacher/topics/${emptyTopic.id}/weights`, "PUT", { weightConfig: { questionnaire: 30, process: 30, report: 40 } });
    await api(teacher, `/api/teacher/topics/${emptyTopic.id}`, "PUT", { name: emptyTopicName, status: 1 });
    await api(teacher, "/api/teacher/tasks", "POST", { topicId: emptyTopic.id, classIds: [targetClass.id], deadline: new Date(Date.now() + 86400_000).toISOString() });
    assert((await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${emptyTopic.id}/variables`)).dictionary === null, "Empty-path template must start without a confirmed dictionary");

    const emptyTasks = await api<StudentTask[]>(student, "/api/student/tasks");
    const emptyTask = emptyTasks.find(item => item.name === emptyTopicName);
    assert(emptyTask, "Empty-path task did not reach the student");
    const emptyPath = `/api/student/tasks/${emptyTask.id}/experiment`;
    const emptyStageUrl = `/student/task/${emptyTask.id}/experiment`;
    const recommendedSize = calculateFinitePopulationSampleSize({ confidenceLevel: "95", marginOfError: 5, populationSize: 300, designEffect: 1, nonResponseRate: 0 });
    assert(recommendedSize !== null, "Empty-path sample size could not be calculated");
    const emptyQuestionnaire = {
        title: "空功能路径预试",
        welcomeText: "欢迎参加本次无字典路径的问卷预试，请按真实感受回答，答案只用于课堂试填。",
        endingText: "感谢参与本次预试，试填到此结束，答案不会进入估计或报告内容。",
        questions: [
            { id: "q0", type: "numeric", content: "每周自习时长是多少小时？", unit: "小时", decimalPlaces: 0, numericMin: 0, numericMax: 100 },
            ...Array.from({ length: 4 }, (_, index) => ({ id: `q${index + 1}`, type: "boolean", content: `第${index + 2}题是否完成？` })),
        ],
    };
    let emptyExperiment = await api<ExperimentData>(student, emptyPath);
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/1/complete`, "POST", { observedVersion: emptyExperiment.version, questionnaire: emptyQuestionnaire });
    // 重开后让窗口 B 先加载，再由窗口 A 再次完成，构造真实的双窗口版本冲突
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/1/reopen`, "POST", { observedVersion: emptyExperiment.version });
    await login(student2, "student", "S2610");
    await page(student2, emptyStageUrl, '[data-testid="student-stage-questionnaire"]');
    assert(await evaluate(student2, '!document.body.textContent.includes("已关联变量") && !document.querySelector(\'[aria-label="选择变量字段"]\')'), "Empty-path questionnaire must not expose variable binding");
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/1/complete`, "POST", { observedVersion: emptyExperiment.version, questionnaire: emptyQuestionnaire });
    await completeQuestionnairePreview(student2, 5);
    await activate(student2, '[data-testid="student-questionnaire-complete"]');
    await eventually(() => evaluate(student2, 'Boolean(document.querySelector("[data-testid=student-refresh-experiment]"))'), "Stale student window did not surface the version conflict");
    // 回到第一步核对草稿仍在（题意输入只在该步渲染）
    await activate(student2, '[data-testid="student-questionnaire-step-1"]');
    await eventually(() => evaluate(student2, 'document.querySelector(\'[data-testid="student-questionnaire-title"]\')?.value === "空功能路径预试"'), "Stale student window lost its questionnaire draft");
    await activate(student2, '[data-testid="student-refresh-experiment"]');
    await visible(student2, '[data-testid="student-stage-sample-plan"]');
    console.log("PASS dual student windows: stale version conflict, draft retention and explicit page refresh");

    const emptyPlan = { estimationType: "proportion", confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize: recommendedSize };
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/2/complete`, "POST", { observedVersion: emptyExperiment.version, samplePlan: emptyPlan });
    for (const method of ["simple", "systematic"] as const) {
        await api(student, `/api/student/tasks/${emptyTask.id}/sampling`, "POST", { method, params: { sampleSize: recommendedSize, seed: 4242 } });
    }
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/3/complete`, "POST", { observedVersion: emptyExperiment.version });
    assert(emptyExperiment.currentStage === 4, "Empty-path stage 3 did not complete");
    const emptyReport = "本实验用于验证在没有变量字典、没有题目关联且不引用任何分析时，学生仍能完成四阶段并提交报告。抽样与规划按任务策略执行，报告只描述样本与设计选择，不声称任何统计推断，也不把预试答案当作数据来源。该路径的目的只是证明这些功能全部可选。";
    emptyExperiment = await api<ExperimentData>(student, `${emptyPath}/stages/4/complete`, "POST", { observedVersion: emptyExperiment.version, reportContent: `<p>${emptyReport}</p>`, analysisReferences: [] });

    await page(student, emptyStageUrl, '[data-testid="student-stage-analysis-report"]');
    await activate(student, '[data-testid="student-analysis-workspace-univariate"]');
    await eventually(() => evaluate(student, 'document.body.textContent.includes("教师尚未提供变量字典")'), "No-dictionary analysis banner missing");
    await activate(student, '[data-testid="student-analysis-workspace-report"]');
    await eventually(() => evaluate(student, 'Boolean(document.querySelector(\'[data-slot="tabs-content"][data-state="inactive"] [data-testid="student-univariate-workspace"]\'))'), "Univariate panel is not kept mounted and inactive");
    await evaluate(student, 'document.querySelector(\'[data-testid="student-analysis-workspace-tabs"] [role="tab"][data-state="active"]\').focus()');
    for (let press = 0; press < 20; press += 1) {
        await browser(student, "press", "Tab");
        assert(!(await evaluate<boolean>(student, 'Boolean(document.activeElement?.closest?.(\'[data-testid="student-univariate-workspace"]\'))')), `Tab ${press + 1} focused the inactive analysis panel`);
    }
    await browser(student, "set", "viewport", "1024", "800");
    await evaluate(student, 'document.querySelector("[data-testid=student-analysis-report-editor]").scrollIntoView({block:"end"})');
    const narrow = await evaluate<{ scrollWidth: number; innerWidth: number; editorWidth: number; left: number; right: number }>(student, `(() => {const editor = document.querySelector('[data-testid=student-analysis-report-editor]');const rect = editor.getBoundingClientRect();return { scrollWidth: document.documentElement.scrollWidth, innerWidth, editorWidth: rect.width, left: rect.left, right: rect.right };})()`);
    assert(narrow.editorWidth > 0 && narrow.left >= 0 && narrow.right <= narrow.innerWidth, `Narrow viewport hides or overflows the report editor: ${JSON.stringify(narrow)}`);
    // 1024px 是产品支持的桌面下限：整页不得横向溢出，阶段主操作必须完整可见且可获得焦点
    const narrowPage = await evaluate<{ scrollWidth: number; innerWidth: number; action: { right: number; bottom: number; width: number } }>(student, `(() => {
        const actions = document.querySelector('[data-testid=student-stage-actions]');
        const buttons = actions ? [...actions.querySelectorAll('button')].filter(button => button.offsetParent !== null) : [];
        const primary = buttons[buttons.length - 1];
        const rect = primary ? primary.getBoundingClientRect() : { right: -1, bottom: -1, width: 0 };
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth, action: { right: rect.right, bottom: rect.bottom, width: rect.width } };
    })()`);
    assert(narrowPage.scrollWidth <= narrowPage.innerWidth, `1024px viewport overflows the document: ${JSON.stringify(narrowPage)}`);
    assert(narrowPage.action.width > 0 && narrowPage.action.right <= narrowPage.innerWidth && narrowPage.action.bottom <= 800, `1024px viewport hides the primary stage action: ${JSON.stringify(narrowPage)}`);
    const narrowFocusable = await evaluate<boolean>(student, `(() => {
        const actions = document.querySelector('[data-testid=student-stage-actions]');
        const buttons = actions ? [...actions.querySelectorAll('button')].filter(button => button.offsetParent !== null) : [];
        const primary = buttons[buttons.length - 1];
        if (!primary) return false;
        primary.focus();
        return document.activeElement === primary;
    })()`);
    assert(narrowFocusable, "1024px primary stage action is not focusable");
    await browser(student, "screenshot", join(artifacts, "empty-path-narrow.png"));
    await browser(student, "set", "viewport", "1280", "800");
    const emptyCsv = await evaluate<{ status: number; text: string }>(student, `(async () => {const response = await fetch(${JSON.stringify(`/api/student/tasks/${emptyTask.id}/export?type=all`)});return { status: response.status, text: await response.text() };})()`);
    assert(emptyCsv.status === 200 && emptyCsv.text.includes("id"), "Empty-path sampling CSV export failed");
    await page(student, `/student/task/${emptyTask.id}/preview`, '[data-testid="student-preview-submit"]');
    await activate(student, '[data-testid="student-preview-submit"]');
    await visible(student, '[data-testid="student-preview-submit-confirm"]');
    await activate(student, '[data-testid="student-preview-submit-confirm"]');
    await eventually(async () => (await api<ExperimentData>(student, emptyPath)).status === "submitted", "Reference-free submission failed");
    console.log("PASS empty-feature path: no dictionary, no binding, no references, keyboard Tab, narrow viewport and CSV export");

    const scopedGrades = await api<{ items: Array<{ id: number }>; total: number }>(teacher, `/api/teacher/grading?status=pending&taskId=${emptyTask.id}`);
    assert(scopedGrades.total === 1 && scopedGrades.items[0]?.id === emptyExperiment.id, "Task filter must return only its own submission");
    const otherPending = await api<{ total: number }>(teacher, "/api/teacher/grading?status=pending");
    assert(otherPending.total > 1, "Cross-task regression needs pending work outside this task");
    await page(teacher, "/teacher/task", `[data-testid="teacher-task-row-${emptyTask.id}"]`);
    await browser(teacher, "click", `[data-testid="teacher-task-row-${emptyTask.id}"] a[href="/teacher/grading?taskId=${emptyTask.id}"]`);
    await eventually(() => evaluate(teacher, `document.body.textContent.includes('当前仅显示任务 #${emptyTask.id}') && document.body.textContent.includes('共 1 条记录')`), "Task link must open scoped grading");
    await browser(teacher, "set", "viewport", "1024", "768", "2");
    await browser(teacher, "screenshot", join(artifacts, "grading-task-scope.png"));
    await browser(teacher, "click", `[data-testid="teacher-grading-item-${emptyExperiment.id}"]`);
    await visible(teacher, "#grading-score-report");
    assert(await evaluate(teacher, `new URLSearchParams(location.search).get('taskId')==='${emptyTask.id}'`), "Opening detail must keep the task scope");
    for (const [key, score] of [["questionnaire", "72"], ["process", "81"], ["report", "93"]]) await browser(teacher, "fill", `#grading-score-${key}`, score!);
    await namedButton(teacher, "提交评分");
    await activate(teacher, '[data-testid="teacher-grade-next"]');
    await eventually(() => evaluate(teacher, `location.pathname==='/teacher/grading' && new URLSearchParams(location.search).get('taskId')==='${emptyTask.id}' && document.body.textContent.includes('当前没有待批改作业')`), "Finishing a task must not continue into another task");
    assert((await api<{ total: number }>(teacher, "/api/teacher/grading?status=pending")).total === otherPending.total - 1, "Other tasks must remain pending");
    await browser(teacher, "screenshot", join(artifacts, "grading-task-complete.png"));
    console.log("PASS task-scoped grading link, detail, completion and cross-task isolation");

    // =====================================================================
    // 双窗口教师字典冲突：过期修订、输入保留、显式重载后重试
    // =====================================================================
    const conflictTopic = await api<{ id: number }>(teacher, "/api/teacher/topics", "POST", { name: "浏览器回归：双窗口字典冲突", status: 0 });
    await evaluate(teacher, `(async () => {const form = new FormData();form.append("file", new File([${JSON.stringify(emptyPopulation)}], "conflict-population.csv", { type: "text/csv" }));const response = await fetch(${JSON.stringify(`/api/teacher/topics/${conflictTopic.id}/excel`)}, { method: "POST", credentials: "include", body: form });const payload = await response.json();if (!response.ok || !payload.success) throw new Error("upload: " + JSON.stringify(payload.error));return payload.data;})()`);
    await api(teacher, `/api/teacher/topics/${conflictTopic.id}/mapping`, "PUT", { fieldMapping: { identifier: "id", numeric: ["score"], stratified: ["group"], others: [], analysisTarget: { kind: "proportion", field: "group", value: "A" } } });
    await login(teacher2, "teacher", "T001");
    const openDictionaryStep = async (session: string) => {
        await page(session, "/teacher/topic", `[data-testid="teacher-topic-edit-${conflictTopic.id}"]`);
        await activate(session, `[data-testid="teacher-topic-edit-${conflictTopic.id}"]`);
        await visible(session, '[data-testid="teacher-topic-step-1"]');
        await activate(session, '[data-testid="teacher-topic-next"]');
        await activate(session, '[data-testid="teacher-topic-next"]');
        await visible(session, 'input[aria-label="score 标签"]');
        if (session === teacher) {
            await evaluate(session, 'document.querySelector("[data-testid=teacher-study-contract-editor]").scrollIntoView({block:"start"})');
            await browser(session, "screenshot", join(artifacts, "teacher-research-proportion.png"));
        }
        await evaluate(session, 'document.querySelector("[data-testid=teacher-variable-dictionary-toggle]").scrollIntoView({block:"center"})');
        await browser(session, "click", '[data-testid="teacher-variable-dictionary-toggle"]');
    };
    // 上传/改映射会推进 source 与修订号：两窗口在保存前必须处于同一观察修订
    const revisionBeforeA = (await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${conflictTopic.id}/variables`)).revision;
    await openDictionaryStep(teacher);
    await openDictionaryStep(teacher2);
    await browser(teacher, "fill", 'input[aria-label="score 标签"]', "窗口A标签");
    await namedButton(teacher, "明确确认并保存");
    await Bun.sleep(500);
    const windowAState = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${conflictTopic.id}/variables`);
    assert(windowAState.revision === revisionBeforeA + 1, `Window A dictionary save failed: revision=${windowAState.revision} expected=${revisionBeforeA + 1} alert=${await evaluate<string>(teacher, 'document.querySelector("[role=alert]")?.textContent ?? ""')}`);
    await browser(teacher2, "fill", 'input[aria-label="score 标签"]', "窗口B标签");
    await namedButton(teacher2, "明确确认并保存");
    await eventually(() => evaluate(teacher2, 'document.querySelector("[role=alert]")?.textContent.includes("已被更新")'), "Window B did not surface the revision conflict");
    assert(await evaluate(teacher2, 'document.querySelector(\'input[aria-label="score 标签"]\').value === "窗口B标签"'), "Window B lost its dictionary input");
    for (const decision of ["dismiss", "accept"] as const) {
        await evaluate(teacher2, 'document.querySelector("[data-testid=teacher-dictionary-reload]").scrollIntoView({block:"center"})');
        await browser(teacher2, "screenshot", join(artifacts, `dictionary-reload-${decision}.png`));
        await browser(teacher2, "click", '[data-testid="teacher-dictionary-reload"]');
        const dialog = await browser(teacher2, "dialog", "status");
        assert(JSON.stringify(dialog).includes("重新载入会丢弃"), `Dictionary reload must ask before discarding edits: ${JSON.stringify(dialog)}`);
        await browser(teacher2, "dialog", decision);
        if (decision === "dismiss") assert(await evaluate(teacher2, 'document.querySelector(\'input[aria-label="score 标签"]\').value === "窗口B标签"'), "Cancelling reload lost dictionary input");
    }
    await eventually(() => evaluate(teacher2, 'document.querySelector(\'input[aria-label="score 标签"]\').value === "窗口A标签"'), "Window B reload did not show the server version");
    await browser(teacher2, "fill", 'input[aria-label="score 标签"]', "窗口B最终标签");
    await namedButton(teacher2, "明确确认并保存");
    await eventually(async () => {const state = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${conflictTopic.id}/variables`);return state.revision === revisionBeforeA + 2 && state.dictionary?.variables.find(variable => variable.field === "score")?.label === "窗口B最终标签";}, "Window B retry save failed");
    console.log("PASS dual teacher windows: stale revision, input retention, reload and retry");

    for (const [session, path, name, selector] of [
        [teacher, '/teacher/topic', 'topic-list', '[data-testid="teacher-topic-search"]'],
        [teacher, '/teacher/grading', 'grading-list', '#grading-search'],
        [teacher, '/teacher/class', 'teacher-class-list', '[data-testid="teacher-class-search"]'],
        [administrator, '/admin/semester', 'semester-list', '[aria-label="搜索学期名称"]'],
    ] as const) {
        await page(session, path, selector);
        await captureDesktop(session, name, selector);
    }
    await page(teacher, '/teacher/class', '[data-testid="teacher-class-search"]');
    await eventually(() => evaluate(teacher, `Boolean(document.querySelector('a[href*="/students"]'))`), 'Student management link missing');
    await activate(teacher, 'a[href*="/students"]');
    await visible(teacher, '[data-testid="teacher-student-search"]');
    await captureDesktop(teacher, 'teacher-student-list', '[data-testid="teacher-student-search"]');

    await Bun.write(join(artifacts, "result.json"), JSON.stringify({ success: true, taskId: task.id, experimentId: experiment.id, grade: 90, exportBytes: download.bytes, emptyFeature: { taskId: emptyTask.id, experimentId: emptyExperiment.id }, conflictTopicId: conflictTopic.id }, null, 2));
} catch (cause) {
    for (const session of [student, teacher]) {
        await browser(session, "screenshot", join(artifacts, `${session.endsWith("student") ? "student" : "teacher"}-failure.png`)).catch(() => undefined);
    }
    throw cause;
} finally {
    for (const session of [student, student2, seedStudent, teacher, teacher2, administrator]) await browser(session, "close").catch(() => undefined);
    if (server) {
        server.kill("SIGTERM");
        const timer = setTimeout(() => server!.kill("SIGKILL"), 7000);
        await server.exited;
        clearTimeout(timer);
    }
    try { if (databaseCreated) await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await admin.close(); await rm(workdir, { recursive: true, force: true }); }
}
