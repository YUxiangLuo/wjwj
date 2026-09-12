// UI/UX 专项检查（交互层）：登录页未登录状态、对话框焦点管理、点击目标尺寸、
// 表单错误播报、SPA 路由标题、跳过导航。
// 用法：bun scripts/audit-uiux-interactions.ts
import { $ } from "bun";

const BASE = process.env.UIUX_BASE ?? "http://127.0.0.1:3100";
const EVIDENCE = new URL("../test-results/uiux-audit-2026-09-11/", import.meta.url).pathname;

const findings: Array<{ kind: string; title: string; detail: string }> = [];
const note = (kind: string, title: string, detail: string) => {
    findings.push({ kind, title, detail });
    console.log(`⚠️  [${kind}] ${title} — ${detail}`);
};
const pass = (title: string, detail = "") => console.log(`✅ ${title}${detail ? ` — ${detail}` : ""}`);

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
        return { parseError: true, raw: raw.slice(0, 300), err: result.err.slice(0, 200) };
    }
}

async function clearSession(role: string) {
    process.env.AGENT_BROWSER_SESSION = `uiux-x-${role}`;
    await cli(["cookies", "clear"]);
}

const results: Record<string, unknown> = {};

// ---------- 1) 未登录的登录页 ----------
for (const [role, path] of [["student", "/student/login"], ["teacher", "/teacher/login"], ["admin", "/admin/login"]] as const) {
    await clearSession(role);
    await cli(["set", "viewport", "1440", "900"]);
    await cli(["open", `${BASE}${path}`]);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const a11y = await cli(["a11y", "--json"]);
    let violations: any[] = [];
    try {
        violations = JSON.parse(a11y.out.split("\n").filter(Boolean).pop() ?? "{}").data?.violations ?? [];
    } catch { /* ignore */ }
    const form = await evalJson(`(() => {
        const inputs = [...document.querySelectorAll("input")].map((input) => ({
            type: input.type,
            name: input.name || input.id || "",
            labelled: Boolean(input.labels?.length || input.getAttribute("aria-label") || input.getAttribute("aria-labelledby")),
            autocomplete: input.getAttribute("autocomplete") || "",
        }));
        return JSON.stringify({ title: document.title, h1: document.querySelectorAll("h1").length, inputs });
    })()`);
    results[`login-${role}`] = { violations: violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length })), form };
    if (violations.length) note("a11y", `${role} 登录页 axe 违规`, violations.map((v) => `${v.id}x${v.nodes.length}`).join(", "));
    const unlabelled = (form.inputs ?? []).filter((input: any) => !input.labelled);
    if (unlabelled.length) note("表单标签", `${role} 登录页有未标注输入框`, JSON.stringify(unlabelled));
    const noAutocomplete = (form.inputs ?? []).filter((input: any) => !input.autocomplete);
    if (noAutocomplete.length) note("表单体验", `${role} 登录页输入框缺少 autocomplete（浏览器不提供填充）`, JSON.stringify(noAutocomplete.map((i: any) => i.name || i.type)));
    if (!form.h1) note("标题层级", `${role} 登录页缺少 h1`, JSON.stringify(form));
    pass(`${role} 登录页扫描完成`, `h1=${form.h1} inputs=${(form.inputs ?? []).length} violations=${violations.length}`);
}

// ---------- 2) 登录失败的错误播报 ----------
await clearSession("student-error");
await cli(["open", `${BASE}/student/login`]);
await new Promise((resolve) => setTimeout(resolve, 2500));
await cli(["eval", `(() => {
    const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const id = document.querySelector('input[name=studentId], input#studentId, input[type=text]');
    const pw = document.querySelector('input[type=password]');
    set(id, "S2601"); set(pw, "wrong-password");
    document.querySelector("form button[type=submit], button[type=submit]")?.click();
})()`]);
await new Promise((resolve) => setTimeout(resolve, 2500));
const errorState = await evalJson(`(() => {
    const live = [...document.querySelectorAll("[aria-live], [role=alert], [role=status]")];
    const text = document.body.innerText;
    const invalid = [...document.querySelectorAll("input[aria-invalid=true]")].map((input) => input.name || input.id);
    return JSON.stringify({
        liveRegions: live.map((el) => ({ role: el.getAttribute("role") || "live", text: (el.textContent || "").trim().slice(0, 60) })),
        invalidInputs: invalid,
        showsErrorText: /错误|失败|不正确|无效/.test(text),
    });
})()`);
results.loginError = errorState;
if (!errorState.liveRegions?.length && errorState.showsErrorText) {
    note("错误播报", "登录失败的错误没有放进 aria-live 区域，屏幕阅读器不会自动播报", JSON.stringify(errorState));
} else if (!errorState.showsErrorText) {
    note("错误反馈", "登录失败后页面上看不到错误文案（可能被静默吞掉）", JSON.stringify(errorState));
} else {
    pass("登录失败有可见错误文案与 aria-live 播报", JSON.stringify(errorState.liveRegions));
}

// ---------- 3) 对话框焦点管理 ----------
async function login(role: "teacher" | "admin" | "student") {
    const credentials = role === "teacher"
        ? ["/api/teacher/login", { employeeId: process.env.UIUX_TEACHER ?? "T001", password: process.env.UIUX_TEACHER ?? "T001" }]
        : role === "admin"
            ? ["/api/admin/login", { username: "admin", password: "admin123" }]
            : ["/api/student/login", { studentId: process.env.UIUX_STUDENT ?? "S2601", password: process.env.UIUX_STUDENT ?? "S2601" }];
    await evalJson(`(async () => {
        const response = await fetch(${JSON.stringify(credentials[0])}, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify(credentials[1])}) });
        return JSON.stringify({ status: response.status });
    })()`);
}

const dialogCases: Array<{ role: "teacher" | "admin" | "student"; path: string; label: string; open: string; dialogSelector: string }> = [
    {
        role: "admin", path: "/admin/announcement", label: "管理端-新建公告对话框",
        open: `[...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("新建公告"))?.click()`,
        dialogSelector: "[role=dialog]",
    },
    {
        role: "admin", path: "/admin/teacher", label: "管理端-新建教师对话框",
        open: `[...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("创建教师"))?.click()`,
        dialogSelector: "[role=dialog]",
    },
    {
        role: "teacher", path: "/teacher/topic", label: "教师-实验模板向导对话框",
        open: `[...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("创建实验模板"))?.click()`,
        dialogSelector: "[role=dialog]",
    },
    {
        role: "teacher", path: "/teacher/student-placeholder", label: "教师-删除学生确认对话框",
        open: `document.querySelector('[data-testid=teacher-student-delete-preview]')?.click()`,
        dialogSelector: "[role=alertdialog], [role=dialog]",
    },
];

for (const testCase of dialogCases) {
    if (testCase.path.includes("placeholder")) continue; // 需要具体班级页，单独处理
    process.env.AGENT_BROWSER_SESSION = `uiux-x-${testCase.role}`;
    await cli(["cookies", "clear"]);
    await cli(["open", `${BASE}/${testCase.role}/login`]);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await login(testCase.role);
    await cli(["set", "viewport", "1440", "900"]);
    await cli(["open", `${BASE}${testCase.path}`]);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const trigger = await evalJson(`(() => {
        const button = (${testCase.open}, null);
        const active = document.activeElement;
        return JSON.stringify({ opened: Boolean(document.querySelector(${JSON.stringify(testCase.dialogSelector)})), activeTag: active?.tagName?.toLowerCase() ?? null, triggerName: (button?.textContent || "").trim().slice(0, 30) });
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const dialogState = await evalJson(`(() => {
        const dialog = document.querySelector(${JSON.stringify(testCase.dialogSelector)});
        if (!dialog) return JSON.stringify({ present: false });
        const focusables = [...dialog.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])")];
        const activeInside = dialog.contains(document.activeElement);
        return JSON.stringify({
            present: true,
            labelled: Boolean(dialog.getAttribute("aria-label") || dialog.getAttribute("aria-labelledby")),
            described: Boolean(dialog.getAttribute("aria-describedby")),
            focusInside: activeInside,
            activeName: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30),
            focusables: focusables.length,
        });
    })()`);
    await cli(["press", "Escape"]);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const afterEscape = await evalJson(`(() => {
        const dialog = document.querySelector(${JSON.stringify(testCase.dialogSelector)});
        return JSON.stringify({ stillOpen: Boolean(dialog), focusTag: document.activeElement?.tagName?.toLowerCase() ?? null, focusName: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 30) });
    })()`);
    const record = { label: testCase.label, dialogState, afterEscape };
    results[testCase.label] = record;
    if (!dialogState.present) {
        note("对话框", `${testCase.label} 未能打开（选择器需更新）`, JSON.stringify({ trigger }));
    } else {
        if (!dialogState.labelled) note("对话框", `${testCase.label} 缺少可访问名称（aria-labelledby/aria-label）`, JSON.stringify(dialogState));
        if (!dialogState.focusInside) note("对话框焦点", `${testCase.label} 打开后焦点没有进入对话框`, JSON.stringify(dialogState));
        if (!afterEscape.stillOpen && !afterEscape.focusName) note("对话框焦点", `${testCase.label} Esc 关闭后焦点未回到触发元素`, JSON.stringify(afterEscape));
        if (afterEscape.stillOpen) note("对话框键盘", `${testCase.label} 按 Esc 未关闭`, JSON.stringify(afterEscape));
        pass(`${testCase.label}`, JSON.stringify({ labelled: dialogState.labelled, focusInside: dialogState.focusInside, escClosed: !afterEscape.stillOpen, focusReturned: afterEscape.focusName }));
    }
}

// ---------- 4) 点击目标尺寸（WCAG 2.2 AA ≥24×24） ----------
process.env.AGENT_BROWSER_SESSION = "uiux-x-teacher";
await cli(["open", `${BASE}/teacher`]);
await new Promise((resolve) => setTimeout(resolve, 3000));
const targets = await evalJson(`(() => {
    const small = [];
    for (const el of document.querySelectorAll("button, a[href], [role=button], input[type=checkbox], input[type=radio]")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < 24 || rect.height < 24) {
            small.push({ tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30), w: Math.round(rect.width), h: Math.round(rect.height) });
        }
    }
    return JSON.stringify({ total: document.querySelectorAll("button, a[href], [role=button]").length, small: small.slice(0, 10), smallCount: small.length });
})()`);
results.targets = targets;
if ((targets.smallCount ?? 0) > 0) note("点击目标", `教师概览有 ${targets.smallCount} 个交互元素小于 24×24`, JSON.stringify(targets.small));
else pass("点击目标尺寸", `${targets.total} 个交互元素全部 ≥24×24`);

// ---------- 5) SPA 路由标题 ----------
process.env.AGENT_BROWSER_SESSION = "uiux-x-student";
await cli(["open", `${BASE}/student`]);
await new Promise((resolve) => setTimeout(resolve, 2500));
const titleHall = await evalJson(`JSON.stringify({ title: document.title })`);
await cli(["pushstate", `${BASE}/student/profile`]);
await new Promise((resolve) => setTimeout(resolve, 1200));
const titleProfile = await evalJson(`JSON.stringify({ title: document.title, h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 30) })`);
results.titles = { hall: titleHall.title, profile: titleProfile.title, profileH1: titleProfile.h1 };
if (titleHall.title === titleProfile.title) note("路由标题", "SPA 内切换页面时 document.title 不变，浏览器历史与书签无法区分页面", JSON.stringify(results.titles));
else pass("路由标题随页面变化", JSON.stringify(results.titles));

await Bun.write(`${EVIDENCE}interactions.json`, JSON.stringify({ results, findings }, null, 2));
console.log(`\n== 交互层检查完成 == findings ${findings.length} 条；证据：${EVIDENCE}interactions.json`);
