import * as XLSX from "xlsx";
import { SQL } from "bun";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { computePpsMeanPlan, DOGFOOD_ANCHORS, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";
import { calculateFinitePopulationSampleSize } from "../src/student/experiment/sample-plan";
import type { ExperimentData, StudentTask } from "../src/student/api-client";
import type { AnalysisMetricsResult } from "../src/domain/experiment/analysis-types";

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
for (const name of ["student-failure.png", "teacher-failure.png", "result.json", "teacher-dictionary.png", "numeric-variable-binding.png", "sampling-animation-exact.png", "stage4-saved-analysis.png", "teacher-submitted-appendix.png", "stale-analysis-warning.png", "empty-path-narrow.png"]) {
    await Bun.file(join(artifacts, name)).delete().catch(() => undefined);
}
const environment = { ...process.env, DATABASE_URL: String(databaseUrl), DEMO_MODE: "1", DEV_AUTH_MODE: "0", NODE_ENV: "development", HOST: "127.0.0.1" };
const browserLauncher = join(root, "node_modules/agent-browser/bin/agent-browser.js");
const sessionPrefix = `wj-flow-${crypto.randomUUID().slice(0, 8)}`;
const student = `${sessionPrefix}-student`;
const student2 = `${sessionPrefix}-student2`;
const seedStudent = `${sessionPrefix}-seed-student`;
const teacher = `${sessionPrefix}-teacher`;
const teacher2 = `${sessionPrefix}-teacher2`;
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

async function login(session: string, role: "student" | "teacher", account: string) {
    await page(session, `/${role}/login`, "input[type=password]");
    await browser(session, "fill", "input:not([type=password])", account);
    await browser(session, "fill", "input[type=password]", account);
    await browser(session, "click", "button[type=submit]");
    await eventually(() => evaluate(session, `!location.pathname.endsWith("/login") && !document.querySelector("input[type=password]")`), `${role} login failed`);
}

try {
    // This generated name contains only ASCII letters/digits/underscores. Never
    // migrate, seed, reset or drop the database named by TEST_DATABASE_URL itself.
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    for (const name of ["public", "node_modules", "bunfig.toml"]) await symlink(join(root, name), join(workdir, name));
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
    const seededPending = await api<{ items: Array<{ id: number; topic: string }> }>(teacher, "/api/teacher/grading?status=pending&page=1&pageSize=20");
    const seededGrading = seededPending.items.find(item => item.topic === DOGFOOD_NAMES.topicA);
    assert(seededGrading, "Seeded pending grading item missing");
    const seededTeacherDetail = await api<{ samplingResults: Record<string, unknown> }>(teacher, `/api/teacher/grading/${seededGrading.id}`);
    assert(Object.keys(seededTeacherDetail.samplingResults).length > 0, "Seeded teacher grading detail did not hydrate sampling results");
    await login(seedStudent, "student", DOGFOOD_ANCHORS.submitted);
    const seededTasks = await api<StudentTask[]>(seedStudent, "/api/student/tasks");
    const seededTask = seededTasks.find(item => item.name === DOGFOOD_NAMES.topicA);
    assert(seededTask, "Seeded submitted student task missing");
    const seededStudentDetail = await api<{ snapshot: { samplingResults: Record<string, unknown> } }>(seedStudent, `/api/student/tasks/${seededTask.id}/submission`);
    assert(Object.keys(seededStudentDetail.snapshot.samplingResults).length > 0, "Seeded student submission did not hydrate sampling results");
    console.log("PASS seeded teacher grading and student submission hydrate from frozen source");

    const templates = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/topics");
    const source = templates.find(item => item.name === DOGFOOD_NAMES.topicA);
    assert(source, "Seed template missing");
    const copied = await api<{ id: number }>(teacher, `/api/teacher/topics/${source.id}/copy`, "POST");
    const name = "浏览器回归：完整教学流程";
    await api(teacher, `/api/teacher/topics/${copied.id}`, "PUT", { name, status: 0 });
    type DictionarySnapshot = { source: string; revision: number; dictionary: { source: string; revision: number; variables: Array<{ field: string; label: string; unit: string; kind: string; categories: unknown[]; missing: unknown[] }> } | null; suggestion: { source?: string; revision?: number; variables: Array<{ field: string; label: string; unit: string; kind: string; categories: unknown[]; missing: unknown[] }> } };
    const suggestedDictionary = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    const configuredVariables = suggestedDictionary.suggestion.variables.map(variable => variable.field === "每周学习时长" ? { ...variable, kind: "continuous", unit: "小时", categories: [] } : variable);
    await api(teacher, `/api/teacher/topics/${copied.id}/variables`, "PUT", { source: suggestedDictionary.source, observedRevision: suggestedDictionary.revision, dictionary: { source: suggestedDictionary.source, revision: suggestedDictionary.revision, variables: configuredVariables } });
    const dictionaryBefore = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${copied.id}/variables`);
    const continuousVariable = (dictionaryBefore.dictionary ?? dictionaryBefore.suggestion).variables.find(variable => variable.kind === "continuous");
    assert(continuousVariable, `Copied topic has no continuous variable for numeric binding: ${JSON.stringify((dictionaryBefore.dictionary ?? dictionaryBefore.suggestion).variables.map(variable => [variable.field, variable.kind, variable.unit]))}`);
    await page(teacher, "/teacher/topic", `[data-testid="teacher-topic-edit-${copied.id}"]`);
    await activate(teacher, `[data-testid="teacher-topic-edit-${copied.id}"]`);
    await visible(teacher, '[data-testid="teacher-topic-step-1"]');
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await activate(teacher, '[data-testid="teacher-topic-next"]');
    await visible(teacher, `input[aria-label="${continuousVariable.field} 标签"]`);
    const dictionaryLabel = `${continuousVariable.label}（浏览器确认）`;
    await browser(teacher, "fill", `input[aria-label="${continuousVariable.field} 标签"]`, dictionaryLabel);
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
    await api(teacher, `/api/teacher/topics/${copied.id}`, "PUT", { name, status: 1 });
    console.log("PASS teacher dictionary representative UI save and stale-revision conflict");
    const classes = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/classes");
    const targetClass = classes.find(item => item.name === "2026级统计学1班");
    assert(targetClass, "Seed class missing");
    await api(teacher, "/api/teacher/tasks", "POST", { topicId: copied.id, classIds: [targetClass.id], deadline: new Date(Date.now() + 86400_000).toISOString() });
    console.log("PASS template copy and task publication (real API)");

    await login(student, "student", "S2610");
    const tasks = await api<StudentTask[]>(student, "/api/student/tasks");
    const task = tasks.find(item => item.name === name);
    assert(task, "Published task did not reach student");
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
    await browser(student, "set", "viewport", "1280", "800");
    await browser(student, "fill", '[data-testid="student-questionnaire-title"]', "学习投入调查：浏览器试填");
    await activate(student, '[data-testid="student-questionnaire-step-2"]');
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
    await completeQuestionnairePreview(student, 5);
    await activate(student, '[data-testid="student-questionnaire-complete"]');
    await visible(student, '[data-testid="student-stage-sample-plan"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 2 && experiment.stage1CompletedAt, "Stage 1 did not persist");
    assert(experiment.questionnaire?.title === "学习投入调查：浏览器试填", "Questionnaire save lost the reviewed title");
    console.log("PASS questionnaire editing, explicit trial navigation and one-step save (real browser)");
    await page(student, stageUrl, '[data-testid="student-stage-sample-plan"]');
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
    const plan = computePpsMeanPlan();
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
    await activate(student, '[data-testid="immersive-sp-confirm"]');
    await visible(student, '[data-testid="student-stage-sampling"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 3 && experiment.samplePlan?.finalSampleSize === 49, "Stage 2 did not persist");
    await page(student, stageUrl, '[data-testid="student-stage-sampling"]');
    assert(await evaluate(student, `(() => {const button=document.querySelector('[data-testid="student-sampling-simple-run"]').getBoundingClientRect();const footer=document.querySelector('[data-testid="student-stage-actions"]').getBoundingClientRect();return button.top>0 && button.bottom<=footer.top && button.right<=innerWidth;})()`), "The initial sampling action must be visible above the footer at 1280×800");
    await browser(student, "screenshot", join(artifacts, "sampling-start.png"));
    await activate(student, '[data-testid="student-sampling-simple-run"]');
    await visible(student, '[data-testid="immersive-sampling-animation"]');
    assert(await evaluate(student, `(() => {const e=document.querySelector('[data-testid="immersive-sampling-animation"]');const r=e.getBoundingClientRect();return e.parentElement===document.body && r.top===0 && r.bottom===innerHeight;})()`), "Sampling animation must cover the viewport");
    await visible(student, '[data-testid="sampling-animation-dot-grid"]');
    assert(await evaluate(student, `(() => {const grid=document.querySelector('[data-testid="sampling-animation-dot-grid"]');return Number(grid.dataset.visualPopulation)===${experiment.populationSize} && grid.children.length===${experiment.populationSize} && document.querySelector('[data-testid="sampling-animation-scale-note"]').textContent.includes("按实际数量绘制");})()`), "Small population animation did not render one dot per actual unit");
    await eventually(() => evaluate(student, `(() => {const grid=document.querySelector('[data-testid="sampling-animation-dot-grid"]');return grid?.querySelectorAll('[data-selected="true"]').length===${experiment.samplePlan?.finalSampleSize} && document.body.textContent.includes("已选中 ${experiment.samplePlan?.finalSampleSize} / ${experiment.samplePlan?.finalSampleSize}");})()`), "Sampling animation did not select the planned number of visual samples");
    await browser(student, "screenshot", join(artifacts, "sampling-animation-exact.png"));
    await activate(student, '[data-testid="immersive-sampling-skip"]');
    await activate(student, '[data-testid="immersive-sampling-return"]');
    for (const method of ["systematic", "pps"] as const) {
        await api(student, `/api/student/tasks/${task.id}/sampling`, "POST", { method, params: { sampleSize: 49, ...(method === "pps" ? { sizeField: "月生活费" } : {}) } });
    }
    await page(student, stageUrl, '[data-testid="student-stage-sampling"]');
    assert(await evaluate(student, `(() => {const table=document.querySelector('[aria-label^="抽样结果数据表"]');const stage=document.querySelector('[data-testid="student-stage-sampling"]');return table && table.getBoundingClientRect().width > stage.getBoundingClientRect().width*0.8 && document.documentElement.scrollWidth<=innerWidth;})()`), "Sampling data table must use the available width without overflowing the page");
    await activate(student, '[data-testid="student-sampling-next"]');
    await visible(student, '[data-testid="student-stage-analysis-report"]');
    experiment = await api(student, experimentPath);
    assert(experiment.currentStage === 4 && experiment.stage3CompletedAt, "Stage 3 did not persist");
    await page(student, stageUrl, '[data-testid="student-stage-analysis-report"]');
    await eventually(() => evaluate(student, 'document.body.textContent.includes("研究目标结果") && document.body.textContent.includes("PPS")'), "Analysis results missing");
    await eventually(() => evaluate(student, `(() => {const panel=document.querySelector('[data-testid="student-target-metrics"]');const table=panel?.querySelector('table');return panel && table && table.getBoundingClientRect().width<=panel.getBoundingClientRect().width && document.documentElement.scrollWidth<=innerWidth;})()`), "Target comparison table must fit the full-width result panel");
    await eventually(() => evaluate(student, `(() => {const rows=document.querySelectorAll('[data-testid="student-target-metrics"] tbody tr');const footer=document.querySelector('[data-testid="student-stage-actions"]');return rows.length>=2 && rows[1].getBoundingClientRect().bottom<=footer.getBoundingClientRect().top;})()`), "The first two comparison results must be fully visible above the footer at 1280×800");
    await browser(student, "screenshot", join(artifacts, "analysis-results.png"));
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
        await api(student, `/api/student/tasks/${task.id}/sampling`, "POST", { method, params: { sampleSize: 49, seed: 1701, ...(method === "pps" ? { sizeField: "月生活费" } : {}) } });
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
    const report = "本次实验以学生每周学习时长的均值为研究目标。我们比较了简单随机、系统抽样与PPS的实际估计及设计标准误，结合总体真值讨论各设计的精度和代表性。样本量规划采用有限总体校正，本次无回答率假设为零。这里的误差分析依赖完整虚拟总体，不能直接替代现实调查中的设计方差估计。";
    await browser(student, "fill", '[data-testid="student-analysis-report-editor"]', report);
    await browser(student, "screenshot", join(artifacts, "report-editor.png"));
    await activate(student, '[data-testid="student-analysis-preview"]');
    await visible(student, '[data-testid="student-preview-submit"]');
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
    experiment = await api(student, experimentPath);
    await page(student, stageUrl, '[data-testid="student-experiment-rejection-notice"]');
    experiment = await api(student, `${experimentPath}/stages/4/reopen`, "POST", { observedVersion: experiment.version });
    experiment = await api(student, `${experimentPath}/stages/4/complete`, "POST", { observedVersion: experiment.version, reportContent: `<p>${report}补充说明：各设计的误差应结合抽样框排序和规模变量与目标变量的关系解释。</p>`, analysisReferences: [referencedAnalysisId] });
    await submit();
    console.log("PASS UI submission, teacher rejection and student resubmission");

    await page(teacher, `/teacher/grading/${experiment.id}`, "#grading-score-report");
    for (const key of ["questionnaire", "process", "report"]) await browser(teacher, "fill", `#grading-score-${key}`, "90");
    await browser(teacher, "fill", "#grading-comment", "已完成修改，分析准确。");
    await namedButton(teacher, "提交评分");
    // Grading is a two-step confirm in the UI; skipping the second step leaves the
    // form filled but unsaved, which used to make this harness report a timeout.
    await activate(teacher, '[data-testid="teacher-grade-confirm"]');
    await eventually(async () => (await api<ExperimentData>(student, experimentPath)).status === "graded", "Grading failed");
    await page(student, `/student/task/${task.id}/result`, '[data-testid="student-submission-detail"]');
    assert(await evaluate(student, 'document.body.textContent.includes("90") && document.body.textContent.includes("已完成修改，分析准确。")'), "Student grade or comment missing");
    await browser(student, "screenshot", join(artifacts, "student-result.png"));
    await page(teacher, "/teacher/export", 'button');
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
    await namedButton(teacher2, "重新载入");
    await eventually(() => evaluate(teacher2, 'document.querySelector(\'input[aria-label="score 标签"]\').value === "窗口A标签"'), "Window B reload did not show the server version");
    await browser(teacher2, "fill", 'input[aria-label="score 标签"]', "窗口B最终标签");
    await namedButton(teacher2, "明确确认并保存");
    await eventually(async () => {const state = await api<DictionarySnapshot>(teacher, `/api/teacher/topics/${conflictTopic.id}/variables`);return state.revision === revisionBeforeA + 2 && state.dictionary?.variables.find(variable => variable.field === "score")?.label === "窗口B最终标签";}, "Window B retry save failed");
    console.log("PASS dual teacher windows: stale revision, input retention, reload and retry");

    await Bun.write(join(artifacts, "result.json"), JSON.stringify({ success: true, taskId: task.id, experimentId: experiment.id, grade: 90, exportBytes: download.bytes, emptyFeature: { taskId: emptyTask.id, experimentId: emptyExperiment.id }, conflictTopicId: conflictTopic.id }, null, 2));
} catch (cause) {
    for (const session of [student, teacher]) {
        await browser(session, "screenshot", join(artifacts, `${session.endsWith("student") ? "student" : "teacher"}-failure.png`)).catch(() => undefined);
    }
    throw cause;
} finally {
    for (const session of [student, student2, seedStudent, teacher, teacher2]) await browser(session, "close").catch(() => undefined);
    if (server) {
        server.kill("SIGTERM");
        const timer = setTimeout(() => server!.kill("SIGKILL"), 7000);
        await server.exited;
        clearTimeout(timer);
    }
    try { if (databaseCreated) await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await admin.close(); await rm(workdir, { recursive: true, force: true }); }
}
