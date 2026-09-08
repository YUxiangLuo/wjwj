import * as XLSX from "xlsx";
import { SQL } from "bun";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { computePpsMeanPlan, DOGFOOD_NAMES } from "../src/db/seeds/dogfood-fixtures";
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
for (const name of ["student-failure.png", "teacher-failure.png", "result.json"]) {
    await Bun.file(join(artifacts, name)).delete().catch(() => undefined);
}
const environment = { ...process.env, DATABASE_URL: String(databaseUrl), DEMO_MODE: "1", DEV_AUTH_MODE: "0", NODE_ENV: "development", HOST: "127.0.0.1" };
const browserLauncher = join(root, "node_modules/agent-browser/bin/agent-browser.js");
const sessionPrefix = `wj-flow-${crypto.randomUUID().slice(0, 8)}`;
const student = `${sessionPrefix}-student`;
const teacher = `${sessionPrefix}-teacher`;
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
    const activated = await evaluate(session, `(() => {const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(name)}); if (!button || button.disabled) return false; button.click(); return true;})()`);
    assert(activated, `Button unavailable: ${name}`);
}
async function answerLearningCheck(id: string, option: number) {
    const selector = `[data-testid="learning-check-${id}"]`;
    await activate(student, `${selector} input[value="${option}"]`);
    await activate(student, `${selector} button`);
    assert(await evaluate(student, `document.querySelector(${JSON.stringify(selector)}).textContent.includes("理解正确")`), `Learning check ${id} did not pass`);
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
    const templates = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/topics");
    const source = templates.find(item => item.name === DOGFOOD_NAMES.topicA);
    assert(source, "Seed template missing");
    const copied = await api<{ id: number }>(teacher, `/api/teacher/topics/${source.id}/copy`, "POST");
    const name = "浏览器回归：完整教学流程";
    await api(teacher, `/api/teacher/topics/${copied.id}`, "PUT", { name, status: 1 });
    const classes = await api<Array<{ id: number; name: string }>>(teacher, "/api/teacher/classes");
    const targetClass = classes.find(item => item.name === "2024级统计学实验班");
    assert(targetClass, "Seed class missing");
    await api(teacher, "/api/teacher/tasks", "POST", { topicId: copied.id, classIds: [targetClass.id], deadline: new Date(Date.now() + 86400_000).toISOString() });
    console.log("PASS template copy and task publication (real API)");

    await login(student, "student", "S018");
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
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `本周是否完成学习活动 ${index + 1}？` })),
    };
    experiment = await api(student, `${experimentPath}/stages/1/complete`, "POST", { observedVersion: experiment.version, questionnaire });
    experiment = await api(student, `${experimentPath}/stages/1/reopen`, "POST", { observedVersion: experiment.version });
    await page(student, stageUrl, '[data-testid="student-questionnaire-title"]');
    await browser(student, "set", "viewport", "1280", "800");
    await browser(student, "fill", '[data-testid="student-questionnaire-title"]', "学习投入调查：浏览器试填");
    await activate(student, '[data-testid="student-questionnaire-step-4"]');
    await activate(student, '[data-testid="student-questionnaire-start-preview"]');
    await visible(student, '[data-testid="immersive-questionnaire-preview"]');
    assert(await evaluate(student, `(() => {const e=document.querySelector('[data-testid="immersive-questionnaire-preview"]');const r=e.getBoundingClientRect();return e.parentElement===document.body && r.top===0 && r.bottom===innerHeight;})()`), "Questionnaire preview must cover the viewport");
    await activate(student, '[data-testid="immersive-preview-start"]');
    for (let index = 0; index < 5; index++) {
        await evaluate(student, `(() => {const button=[...document.querySelectorAll('[data-testid="immersive-questionnaire-preview"] button')].find(e=>e.textContent.trim().endsWith("是"));if(!button)throw Error("Missing answer");button.click();})()`);
        assert(await evaluate(student, 'Boolean(document.querySelector("[data-testid=immersive-preview-next]"))'), "Selecting an answer must not advance automatically");
        await activate(student, '[data-testid="immersive-preview-next"]');
    }
    await activate(student, '[data-testid="immersive-preview-submit"]');
    await eventually(() => evaluate(student, '!document.querySelector("[data-testid=immersive-questionnaire-preview]")'), "Trial did not return to the editor");
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
    await activate(student, '[data-testid="immersive-sp-decision-next"]');
    for (const [id, answer] of [["quiz_se", 0], ["quiz_population", 1], ["quiz_design", 0]] as const) {
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
    assert(await evaluate(student, `(() => {const panel=document.querySelector('[data-testid="student-target-metrics"]');const table=panel?.querySelector('table');return panel && table && table.getBoundingClientRect().width<=panel.getBoundingClientRect().width && document.documentElement.scrollWidth<=innerWidth;})()`), "Target comparison table must fit the full-width result panel");
    assert(await evaluate(student, `(() => {const rows=document.querySelectorAll('[data-testid="student-target-metrics"] tbody tr');const footer=document.querySelector('[data-testid="student-stage-actions"]');return rows.length>=2 && rows[1].getBoundingClientRect().bottom<=footer.getBoundingClientRect().top;})()`), "The first two comparison results must be fully visible above the footer at 1280×800");
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
        await eventually(async () => (await api<ExperimentData>(student, experimentPath)).status === "submitted", "Submission failed");
    }
    await submit();
    await page(teacher, `/teacher/grading/${experiment.id}`, "#grading-score-report");
    await namedButton(teacher, "驳回修改");
    await browser(teacher, "fill", "#grading-reject-reason", "请补充不同抽样设计的误差解释后重新提交。");
    await namedButton(teacher, "确认驳回");
    await eventually(async () => (await api<ExperimentData>(student, experimentPath)).status === "rejected", "Rejection failed");
    experiment = await api(student, experimentPath);
    await page(student, stageUrl, '[data-testid="student-experiment-rejection-notice"]');
    experiment = await api(student, `${experimentPath}/stages/4/reopen`, "POST", { observedVersion: experiment.version });
    experiment = await api(student, `${experimentPath}/stages/4/complete`, "POST", { observedVersion: experiment.version, reportContent: `<p>${report}补充说明：各设计的误差应结合抽样框排序和规模变量与目标变量的关系解释。</p>` });
    await submit();
    console.log("PASS UI submission, teacher rejection and student resubmission");

    await page(teacher, `/teacher/grading/${experiment.id}`, "#grading-score-report");
    for (const key of ["questionnaire", "process", "report"]) await browser(teacher, "fill", `#grading-score-${key}`, "90");
    await browser(teacher, "fill", "#grading-comment", "已完成修改，分析准确。");
    await namedButton(teacher, "提交评分");
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
    await Bun.write(join(artifacts, "result.json"), JSON.stringify({ success: true, taskId: task.id, experimentId: experiment.id, grade: 90, exportBytes: download.bytes }, null, 2));
} catch (cause) {
    for (const session of [student, teacher]) {
        await browser(session, "screenshot", join(artifacts, `${session.endsWith("student") ? "student" : "teacher"}-failure.png`)).catch(() => undefined);
    }
    throw cause;
} finally {
    for (const session of [student, teacher]) await browser(session, "close").catch(() => undefined);
    if (server) {
        server.kill("SIGTERM");
        const timer = setTimeout(() => server!.kill("SIGKILL"), 7000);
        await server.exited;
        clearTimeout(timer);
    }
    try { if (databaseCreated) await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await admin.close(); await rm(workdir, { recursive: true, force: true }); }
}
