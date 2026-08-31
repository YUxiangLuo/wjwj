import { mkdir } from "node:fs/promises";

const port = Number(process.env.E2E_PORT ?? 3198);
const baseUrl = `http://127.0.0.1:${port}`;
const session = `wj-e2e-${process.pid}`;
const outputDir = "test-results/browser-smoke";
const pageOverflowCheck = `Array.from(document.querySelectorAll("body *")).filter((element) => { const rect = element.getBoundingClientRect(); const outside = rect.right > document.documentElement.clientWidth + 2 || rect.left < -2; if (!outside) return false; if (element.closest(".overflow-x-auto,[data-slot=table-container],[data-slot=workspace-sidebar]")) return false; let parent = element.parentElement; while (parent && parent !== document.body) { const overflowX = getComputedStyle(parent).overflowX; if (overflowX === "hidden" || overflowX === "clip") return false; if ((overflowX === "auto" || overflowX === "scroll") && parent.scrollWidth > parent.clientWidth) return false; parent = parent.parentElement; } return true; }).length === 0`;
await mkdir(outputDir, { recursive: true });

async function browser(args: string[], options: { capture?: boolean } = {}) {
    const process = Bun.spawn(["bunx", "agent-browser", "--session", session, ...args], {
        cwd: processCwd,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed: ${stderr || stdout}`);
    if (options.capture) console.log(stdout.trim());
    return stdout.trim();
}

type BrowserRunner = (args: string[]) => Promise<string>;

async function assertNoPageOverflow(label: string, run: BrowserRunner = browser, debugName = "overflow-debug.png") {
    const value = await run(["eval", pageOverflowCheck]);
    if (!value.includes("true")) {
        const offenders = await run(["eval", `JSON.stringify(Array.from(document.querySelectorAll("body *")).map((element) => { const rect = element.getBoundingClientRect(); return { tag: element.tagName, testid: element.getAttribute("data-testid"), className: String(element.className || "").slice(0, 160), left: Math.round(rect.left), right: Math.round(rect.right), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }; }).filter((item) => item.right > document.documentElement.clientWidth + 2 || item.left < -2).slice(0, 12))`]);
        await run(["screenshot", "--full", `${outputDir}/${debugName}`]).catch(() => undefined);
        throw new Error(`${label} has page-wide horizontal overflow: ${value}; offenders=${offenders}`);
    }
}

async function assertNoCriticalAccessibilityViolations(label: string) {
    const output = await browser(["a11y", "--tags", "wcag2a,wcag2aa", "--json"]);
    const parsed = JSON.parse(output) as { data?: { violations?: Array<{ impact?: string; id?: string }> }; violations?: Array<{ impact?: string; id?: string }> };
    const violations = parsed.data?.violations ?? parsed.violations ?? [];
    const critical = violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    if (critical.length) throw new Error(`${label} accessibility violations: ${critical.map((item) => item.id).join(", ")}`);
}

const processCwd = process.cwd();
const server = Bun.spawn(["bun", "src/index.ts"], {
    cwd: processCwd,
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port) },
    stdout: "inherit",
    stderr: "inherit",
});

try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/student`);
            if (response.ok) { ready = true; break; }
        } catch {
            // Server is still starting.
        }
        await Bun.sleep(100);
    }
    if (!ready) throw new Error("production server did not become ready");

    await browser(["set", "viewport", "1280", "900"]);
    await browser(["open", `${baseUrl}/student/login`]);
    await browser(["fill", "#username", "S010"]);
    await browser(["fill", "#password", "Student!010"]);
    await browser(["click", "[data-testid=student-login-submit]"]);
    await browser(["wait", "--text", "均值对照（PPS 可用）"]);
    await browser(["screenshot", "--full", `${outputDir}/student-desktop.png`]);
    await assertNoCriticalAccessibilityViolations("student desktop task hall");

    await browser(["open", `${baseUrl}/student/task/7/experiment`]);
    await browser(["wait", "--text", "研究目标结果"]);
    await browser(["screenshot", "--full", `${outputDir}/student-proportion-target.png`]);

    await browser(["set", "viewport", "320", "800"]);
    await browser(["reload"]);
    await browser(["wait", "--text", "研究目标结果"]);
    await assertNoPageOverflow("student proportion analysis at 320px");
    await browser(["screenshot", "--full", `${outputDir}/student-reflow-320.png`]);
    await assertNoCriticalAccessibilityViolations("student proportion analysis at 320px");

    await browser(["close"]);

    const teacherSession = `${session}-teacher`;
    const teacher = async (args: string[]) => {
        const proc = Bun.spawn(["bunx", "agent-browser", "--session", teacherSession, ...args], { cwd: processCwd, stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
        if (code !== 0) throw new Error(`teacher browser failed: ${stderr || stdout}`);
        return stdout.trim();
    };
    await teacher(["set", "viewport", "320", "800"]);
    await teacher(["open", `${baseUrl}/teacher/login`]);
    await teacher(["fill", "#username", "T001"]);
    await teacher(["fill", "#password", "Teacher!2026"]);
    await teacher(["click", "[data-testid=teacher-login-submit]"]);
    await teacher(["wait", "--text", "关注班级、课题与待批改任务"]);
    await assertNoPageOverflow("teacher dashboard at 320px", teacher, "teacher-overflow-debug.png");
    await teacher(["screenshot", "--full", `${outputDir}/teacher-reflow-320.png`]);
    await teacher(["close"]);

    const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
    if (adminPassword) {
        const adminSession = `${session}-admin`;
        const admin = async (args: string[]) => {
            const proc = Bun.spawn(["bunx", "agent-browser", "--session", adminSession, ...args], { cwd: processCwd, stdout: "pipe", stderr: "pipe" });
            const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
            if (code !== 0) throw new Error(`admin browser failed: ${stderr || stdout}`);
            return stdout.trim();
        };
        await admin(["set", "viewport", "800", "900"]);
        await admin(["open", `${baseUrl}/admin/login`]);
        await admin(["fill", "#username", "admin"]);
        await admin(["fill", "#password", adminPassword]);
        await admin(["click", "[data-testid=admin-login-submit]"]);
        await admin(["wait", "--text", "首次登录请修改密码"]);
        await admin(["screenshot", "--full", `${outputDir}/admin-first-login.png`]);
        await admin(["fill", "[data-testid=admin-password-current]", adminPassword]);
        await admin(["fill", "[data-testid=admin-password-new]", "Viewport!Ci2026X"]);
        await admin(["fill", "[data-testid=admin-password-confirm]", "Viewport!Ci2026X"]);
        await admin(["click", "[data-testid=admin-password-submit]"]);
        await admin(["wait", "--text", "最近公告"]);
        await admin(["set", "viewport", "320", "800"]);
        await admin(["reload"]);
        await admin(["wait", "--text", "最近公告"]);
        await assertNoPageOverflow("admin dashboard at 320px", admin, "admin-overflow-debug.png");
        await admin(["screenshot", "--full", `${outputDir}/admin-reflow-320.png`]);
        await admin(["close"]);
    }

    console.log(`Browser smoke passed. Screenshots: ${outputDir}`);
} finally {
    await browser(["close", "--all"]).catch(() => undefined);
    server.kill();
    await server.exited;
}
