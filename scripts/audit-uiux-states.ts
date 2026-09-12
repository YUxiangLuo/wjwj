// UI/UX 专项检查（状态层）：把列表接口打成 500/空数据，检查错误态与空态是否
// 明确可见、可重试、可退出。用法：bun scripts/audit-uiux-states.ts
import { $ } from "bun";

const BASE = process.env.UIUX_BASE ?? "http://127.0.0.1:3100";
const EVIDENCE = new URL("../test-results/uiux-audit-2026-09-11/", import.meta.url).pathname;

const findings: Array<{ kind: string; title: string; detail: string }> = [];
const note = (kind: string, title: string, detail: string) => {
    findings.push({ kind, title, detail });
    console.log(`⚠️  [${kind}] ${title} — ${detail}`);
};

async function cli(args: string[]) {
    const result = await $`agent-browser ${args}`.quiet().nothrow();
    return { code: result.exitCode, out: result.stdout.toString().trim(), err: result.stderr.toString().trim() };
}

async function evalJson(js: string) {
    const result = await cli(["eval", js]);
    const raw = result.out.split("\n").filter(Boolean).pop() ?? "";
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch {
        return { parseError: true, raw: raw.slice(0, 200) };
    }
}

const PROBE = `(() => {
    const buttons = [...document.querySelectorAll("button, a[href]")].map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24)).filter(Boolean);
    const alerts = [...document.querySelectorAll("[role=alert], [role=status], [aria-live]")].map((el) => (el.textContent || "").trim().slice(0, 70)).filter(Boolean);
    const headings = [...document.querySelectorAll("h1, h2")].map((el) => el.textContent.trim().slice(0, 24));
    return JSON.stringify({
        text: document.body.innerText.replace(/\\s+/g, " ").slice(0, 260),
        hasRetry: buttons.some((label) => label.includes("重试")),
        buttons: buttons.slice(0, 8),
        alerts,
        headings,
    });
})()`;

const CASES: Array<{ role: "student" | "teacher" | "admin"; path: string; label: string; api: string; emptyBody: string }> = [
    { role: "student", path: "/student", label: "学生-任务大厅", api: "**/api/student/tasks", emptyBody: '{"success":true,"data":[]}' },
    { role: "teacher", path: "/teacher/grading", label: "教师-批改列表", api: "**/api/teacher/grading*", emptyBody: '{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}' },
    { role: "teacher", path: "/teacher/topic", label: "教师-实验模板", api: "**/api/teacher/topics", emptyBody: '{"success":true,"data":[]}' },
    { role: "admin", path: "/admin/student", label: "管理端-学生", api: "**/api/admin/students*", emptyBody: '{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}' },
];

const credentialsFor = (role: string) => role === "teacher"
    ? ["/api/teacher/login", { employeeId: "T001", password: "T001" }]
    : role === "admin"
        ? ["/api/admin/login", { username: "admin", password: "admin123" }]
        : ["/api/student/login", { studentId: "S2601", password: "S2601" }];

const results: Record<string, unknown> = {};

for (const testCase of CASES) {
    const session = `uiux-state-${testCase.role}`;
    process.env.AGENT_BROWSER_SESSION = session;
    await cli(["open", `${BASE}/${testCase.role}/login`]);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const [loginPath, loginBody] = credentialsFor(testCase.role) as [string, Record<string, unknown>];
    await evalJson(`(async () => {
        const response = await fetch(${JSON.stringify(loginPath)}, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify(loginBody)}) });
        return JSON.stringify({ status: response.status });
    })()`);

    // 1) 接口 500：必须出现可重试的错误态，而不是空白或"0 条"
    await cli(["network", "route", testCase.api, "--abort"]);
    await cli(["open", `${BASE}${testCase.path}`]);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const errorState = await evalJson(PROBE);
    const errorA11y = await cli(["a11y", "--json"]);
    let errorViolations: any[] = [];
    try {
        errorViolations = JSON.parse(errorA11y.out.split("\n").filter(Boolean).pop() ?? "{}").data?.violations ?? [];
    } catch { /* ignore */ }
    await cli(["network", "unroute", testCase.api]);

    // 2) 空数据：必须给出明确空态（而不是看起来像加载失败）
    await cli(["network", "route", testCase.api, "--body", testCase.emptyBody]);
    await cli(["open", `${BASE}${testCase.path}`]);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const emptyState = await evalJson(PROBE);
    await cli(["network", "unroute", testCase.api]);

    results[testCase.label] = { errorState, errorViolations: errorViolations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length })), emptyState };

    if (!errorState.hasRetry) note("错误态", `${testCase.label} 接口失败时看不到"重试"入口`, JSON.stringify(errorState).slice(0, 260));
    else console.log(`✅ ${testCase.label} 错误态有重试入口 — ${(errorState.alerts ?? []).join(" | ").slice(0, 80)}`);
    if (errorViolations.length) note("a11y", `${testCase.label} 错误态 axe 违规`, errorViolations.map((v) => `${v.id}x${v.nodes.length}`).join(", "));
    const emptyHints = /暂无|没有|空|无符合|未找到/.test(emptyState.text ?? "");
    if (!emptyHints) note("空态", `${testCase.label} 空数据时没有明确空态文案`, JSON.stringify(emptyState).slice(0, 260));
    else console.log(`✅ ${testCase.label} 空态明确 — ${(emptyState.text ?? "").slice(0, 90)}`);
    if ((emptyState.headings ?? []).length === 0) note("标题层级", `${testCase.label} 空态缺少 h1/h2 标题`, JSON.stringify(emptyState.headings));
}

await Bun.write(`${EVIDENCE}states.json`, JSON.stringify({ results, findings }, null, 2));
console.log(`\n== 状态层检查完成 == findings ${findings.length} 条；证据：${EVIDENCE}states.json`);
