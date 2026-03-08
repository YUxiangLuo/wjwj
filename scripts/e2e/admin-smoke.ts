import { setTimeout as delay } from "node:timers/promises";

type CommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

type RunCommandOptions = {
    allowFailure?: boolean;
    cwd?: string;
};

type ApiResponse<T> = {
    status: number;
    ok: boolean;
    body: T | null;
    rawText: string | null;
};

type ApiEnvelope<T> = {
    success: boolean;
    data?: T;
    error?: {
        code?: string;
        message?: string;
    };
};

type AdminNotificationPayload = {
    count: number;
    items: Array<{
        id: number;
        type: string;
        title: string;
        content: string;
        isRead: number;
        createdAt: string;
    }>;
};

type SemesterSummary = {
    id: number;
    name: string;
    isCurrent: number;
    classCount: number;
    createdAt: string;
};

type TeacherSummary = {
    id: number;
    employeeId: string;
    name: string;
    status: number;
    isFirstLogin: number;
    isLocked: boolean;
};

type AssistantSummary = {
    id: number;
    account: string;
    name: string;
    status: number;
    isLocked: boolean;
};

type ClassSummary = {
    id: number;
    name: string;
    semesterId: number;
    semesterName: string;
    teacherId: number;
    teacherName: string;
    studentCount: number;
};

type AnnouncementSummary = {
    id: number;
    title: string;
    content: string;
    status: number;
    targetScope: string;
    createdAt: string;
};

type BackupSummary = {
    backupId: string;
    createdAt: string;
    sqlPath: string;
    zipPath: string;
    hasZip: boolean;
};

type StudentSummary = {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string;
    status: number;
    isFirstLogin: number;
    isLocked: boolean;
};

const projectRoot = process.cwd();
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const runId = Date.now().toString().slice(-6);
const adminBrowserSession = process.env.E2E_BROWSER_SESSION ?? `admin-e2e-${runId}`;
const adminKickedBrowserSession = process.env.E2E_KICK_BROWSER_SESSION ?? `admin-kick-e2e-${runId}`;
const teacherBrowserSession = process.env.E2E_TEACHER_BROWSER_SESSION ?? `teacher-e2e-${runId}`;
const teacherStatusBrowserSession = process.env.E2E_TEACHER_STATUS_BROWSER_SESSION ?? `teacher-status-e2e-${runId}`;
const assistantBrowserSession = process.env.E2E_ASSISTANT_BROWSER_SESSION ?? `assistant-e2e-${runId}`;
const assistantResetBrowserSession = process.env.E2E_ASSISTANT_RESET_BROWSER_SESSION ?? `assistant-reset-e2e-${runId}`;
const studentBrowserSession = process.env.E2E_STUDENT_BROWSER_SESSION ?? `student-e2e-${runId}`;
const studentStatusBrowserSession = process.env.E2E_STUDENT_STATUS_BROWSER_SESSION ?? `student-status-e2e-${runId}`;
const deletedStudentBrowserSession = process.env.E2E_DELETED_STUDENT_BROWSER_SESSION ?? `deleted-student-e2e-${runId}`;
const adminUsername = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "123456";
const adminNewPassword = process.env.E2E_ADMIN_NEW_PASSWORD ?? `Root#${runId}Pass9!`;
const semesterName = process.env.E2E_ADMIN_SEMESTER_NAME ?? "2031-Fall";
const semesterEditedName = process.env.E2E_ADMIN_SEMESTER_EDIT_NAME ?? `${semesterName}-Edited`;
const restoreMarkerSemesterName = process.env.E2E_RESTORE_MARKER_SEMESTER_NAME ?? `rst-${runId}`;
const assistantAccount = process.env.E2E_ASSISTANT_ACCOUNT ?? `AE2E${runId}`;
const assistantName = process.env.E2E_ASSISTANT_NAME ?? `助教E2E${runId}`;
const teacherEmployeeId = process.env.E2E_TEACHER_EMPLOYEE_ID ?? `TE2E${runId}`;
const teacherDisplayName = process.env.E2E_TEACHER_NAME ?? `教师E2E${runId}`;
const teacherEditedName = process.env.E2E_TEACHER_EDIT_NAME ?? `${teacherDisplayName}-改`;
const teacherClassName = process.env.E2E_TEACHER_CLASS_NAME ?? `教师班级E2E${runId}`;
const className = process.env.E2E_CLASS_NAME ?? `E2E班级${runId}`;
const classEditedName = process.env.E2E_CLASS_EDIT_NAME ?? `${className}-改`;
const announcementTitle = process.env.E2E_ANNOUNCEMENT_TITLE ?? `E2E公告${runId}`;
const announcementContent = process.env.E2E_ANNOUNCEMENT_CONTENT ?? `E2E 公告正文 ${runId}`;
const announcementEditedTitle = process.env.E2E_ANNOUNCEMENT_EDITED_TITLE ?? `${announcementTitle}-改`;
const announcementEditedContent = process.env.E2E_ANNOUNCEMENT_EDITED_CONTENT ?? `E2E 公告正文已更新 ${runId}`;
const announcementAssistantTitle = process.env.E2E_ANNOUNCEMENT_ASSISTANT_TITLE ?? `E2E助教公告${runId}`;
const announcementAssistantContent = process.env.E2E_ANNOUNCEMENT_ASSISTANT_CONTENT ?? `E2E 助教定向公告 ${runId}`;
const teacherResetPassword = process.env.E2E_TEACHER_RESET_PASSWORD ?? "teacher";
const teacherNewPassword = process.env.E2E_TEACHER_NEW_PASSWORD ?? `Reset#${runId}A`;
const teacherStatusPassword = process.env.E2E_TEACHER_STATUS_PASSWORD ?? "123456";
const assistantDisabledPassword = process.env.E2E_ASSISTANT_DISABLED_PASSWORD ?? "123456";
const assistantResetAccount = process.env.E2E_ASSISTANT_RESET_ACCOUNT ?? "A005";
const assistantResetOldPassword = process.env.E2E_ASSISTANT_RESET_OLD_PASSWORD ?? "123456";
const assistantNewPassword = process.env.E2E_ASSISTANT_NEW_PASSWORD ?? `Assist#${runId}A`;
const studentEnabledPassword = process.env.E2E_STUDENT_ENABLED_PASSWORD ?? "123456";
const studentResetAccount = process.env.E2E_STUDENT_RESET_ACCOUNT ?? "2024006";
const studentNewPassword = process.env.E2E_STUDENT_NEW_PASSWORD ?? `Student#${runId}A`;
const deletedClassStudentPassword = process.env.E2E_DELETED_CLASS_STUDENT_PASSWORD ?? "123456";
const settingsMaxLoginAttempts = Number(process.env.E2E_SETTINGS_MAX_LOGIN_ATTEMPTS ?? "6");
const settingsLockDuration = Number(process.env.E2E_SETTINGS_LOCK_DURATION ?? "35");
const shouldResetDb = process.env.E2E_SKIP_DB_RESET !== "1";
const shouldReseedDb = process.env.E2E_SKIP_DB_RESEED !== "1";
const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === "1";

let serverProcess: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;

function log(message: string) {
    console.log(`[admin-e2e] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function formatCommand(cmd: string[]) {
    return cmd.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

async function runCommand(cmd: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
    const proc = Bun.spawn({
        cmd,
        cwd: options.cwd ?? projectRoot,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    const result = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
    } satisfies CommandResult;

    if (exitCode !== 0 && !options.allowFailure) {
        const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
        throw new Error(`Command failed (${exitCode}): ${formatCommand(cmd)}${details ? `\n${details}` : ""}`);
    }

    return result;
}

async function runBrowser(args: string[], options: RunCommandOptions = {}, session = adminBrowserSession) {
    return runCommand(["agent-browser", "--session", session, ...args], options);
}

function parseBrowserValue<T>(raw: string): T {
    const text = raw.trim();
    if (!text) {
        return null as T;
    }

    try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed === "string") {
            try {
                return JSON.parse(parsed) as T;
            } catch {
                return parsed as T;
            }
        }
        return parsed as T;
    } catch {
        return text as T;
    }
}

async function browserEval<T>(source: string, session = adminBrowserSession): Promise<T> {
    const result = await runBrowser(["eval", source], {}, session);
    return parseBrowserValue<T>(result.stdout);
}

async function browserJson<T>(body: string, session = adminBrowserSession): Promise<T> {
    const source = `(async () => {
        const value = await (async () => {
${body}
        })();
        return JSON.stringify(value);
    })()`;
    return browserEval<T>(source, session);
}

async function snapshot(label: string, session = adminBrowserSession) {
    log(`Snapshot: ${label}`);
    await runBrowser(["snapshot", "-i"], {}, session);
}

async function currentPath(session = adminBrowserSession) {
    return browserJson<string>("return location.pathname;", session);
}

async function waitFor<T>(
    label: string,
    check: () => Promise<T | false>,
    timeoutMs = 15000,
    intervalMs = 300,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
        try {
            const result = await check();
            if (result !== false) {
                return result;
            }
        } catch (error) {
            lastError = error;
        }
        await delay(intervalMs);
    }

    throw new Error(lastError instanceof Error ? `Timed out waiting for ${label}: ${lastError.message}` : `Timed out waiting for ${label}`);
}

async function waitForPath(pathname: string, timeoutMs = 15000, session = adminBrowserSession) {
    await waitFor(
        `path ${pathname}`,
        async () => ((await currentPath(session)) === pathname ? true : false),
        timeoutMs,
    );
}

async function browserFetch<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
    session = adminBrowserSession,
) {
    const payload = JSON.stringify({
        path,
        init: {
            method: init?.method ?? "GET",
            body: init?.body === undefined ? undefined : JSON.stringify(init.body),
            headers: init?.headers ?? {},
        },
    });

    return browserJson<ApiResponse<T>>(`
        const payload = ${payload};
        const headers = new Headers(payload.init.headers);
        if (payload.init.body !== undefined && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(payload.path, {
            method: payload.init.method,
            body: payload.init.body,
            headers,
            credentials: "include",
        });

        const text = await response.text();
        let body = null;
        if (text) {
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
        }
        return {
            status: response.status,
            ok: response.ok,
            body,
            rawText: text || null,
        };
    `, session);
}

async function listSemesters() {
    const response = await browserFetch<ApiEnvelope<SemesterSummary[]>>("/api/admin/semesters");
    assert(response.status === 200, `Listing semesters failed with status ${response.status}`);
    assert(response.body?.success, "Semester list API did not return success");
    return response.body.data ?? [];
}

async function listTeachers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const response = await browserFetch<ApiEnvelope<TeacherSummary[]>>(`/api/admin/teachers${query}`);
    assert(response.status === 200, `Listing teachers failed with status ${response.status}`);
    assert(response.body?.success, "Teacher list API did not return success");
    return response.body.data ?? [];
}

async function listAssistants() {
    const response = await browserFetch<ApiEnvelope<AssistantSummary[]>>("/api/admin/assistants");
    assert(response.status === 200, `Listing assistants failed with status ${response.status}`);
    assert(response.body?.success, "Assistant list API did not return success");
    return response.body.data ?? [];
}

async function listClasses() {
    const response = await browserFetch<ApiEnvelope<ClassSummary[]>>("/api/admin/classes");
    assert(response.status === 200, `Listing classes failed with status ${response.status}`);
    assert(response.body?.success, "Class list API did not return success");
    return response.body.data ?? [];
}

async function listStudents(params?: { classId?: string; search?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.classId) {
        searchParams.set("class_id", params.classId);
    }
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    const query = searchParams.toString();
    const response = await browserFetch<ApiEnvelope<StudentSummary[]>>(`/api/admin/students${query ? `?${query}` : ""}`);
    assert(response.status === 200, `Listing students failed with status ${response.status}`);
    assert(response.body?.success, "Student list API did not return success");
    return response.body.data ?? [];
}

async function listAnnouncements() {
    const response = await browserFetch<ApiEnvelope<AnnouncementSummary[]>>("/api/admin/announcements");
    assert(response.status === 200, `Listing announcements failed with status ${response.status}`);
    assert(response.body?.success, "Announcement list API did not return success");
    return response.body.data ?? [];
}

async function listBackups() {
    const response = await browserFetch<ApiEnvelope<BackupSummary[]>>("/api/admin/backups");
    assert(response.status === 200, `Listing backups failed with status ${response.status}`);
    assert(response.body?.success, "Backup list API did not return success");
    return response.body.data ?? [];
}

async function getSettings() {
    const response = await browserFetch<ApiEnvelope<Record<string, string | number | boolean>>>("/api/admin/settings");
    assert(response.status === 200, `Loading settings failed with status ${response.status}`);
    assert(response.body?.success, "Settings API did not return success");
    return response.body.data ?? {};
}

async function clickButtonByText(label: string) {
    const result = await browserJson<{ clicked: boolean }>(`
        const button = Array.from(document.querySelectorAll("button"))
            .find((element) => element.textContent?.trim().includes(${JSON.stringify(label)}));
        if (!button) {
            return { clicked: false };
        }
        button.click();
        return { clicked: true };
    `);
    assert(result.clicked, `Could not find button with label containing "${label}"`);
}

async function selectOptionByText(triggerSelector: string, optionText: string, session = adminBrowserSession) {
    await runBrowser(["click", triggerSelector], {}, session);
    await waitFor(
        `select option ${optionText}`,
        async () => {
            const state = await browserJson<{ clicked: boolean }>(`
                const option = Array.from(document.querySelectorAll('[role="option"], [data-radix-collection-item]'))
                    .find((element) => {
                        const text = element.textContent?.trim() ?? "";
                        return text === ${JSON.stringify(optionText)} || text.includes(${JSON.stringify(optionText)});
                    });
                if (!option || !(option instanceof HTMLElement)) {
                    return { clicked: false };
                }
                option.click();
                return { clicked: true };
            `, session);
            return state.clicked ? state : false;
        },
    );
    await runBrowser(["wait", "250"], {}, session);
}

async function cleanupSemesterByName(name: string) {
    const matches = (await listSemesters()).filter((semester) => semester.name === name);
    for (const semester of matches) {
        assert(!semester.isCurrent, `Cannot clean up current semester ${name}`);
        assert(semester.classCount === 0, `Cannot clean up semester ${name} because it has classes`);

        const response = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/semesters/${semester.id}`, {
            method: "DELETE",
        });
        assert(response.status === 200, `Deleting pre-existing semester ${name} failed with status ${response.status}`);
        assert(response.body?.success, `Deleting pre-existing semester ${name} did not return success`);
    }
}

async function cleanupAnnouncementByTitle(title: string) {
    const matches = (await listAnnouncements()).filter((announcement) => announcement.title === title);
    for (const match of matches) {
        const response = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/announcements/${match.id}`, {
            method: "DELETE",
        });
        assert(response.status === 200, `Deleting pre-existing announcement ${title} failed with status ${response.status}`);
        assert(response.body?.success, `Deleting pre-existing announcement ${title} did not return success`);
    }
}

async function cleanupBackupArtifacts(backupId: string) {
    await runCommand([
        "rm",
        "-f",
        `${projectRoot}/backups/${backupId}.sql`,
        `${projectRoot}/backups/${backupId}.zip`,
    ], { allowFailure: true });
}

async function cleanupFile(filePath: string) {
    await runCommand(["rm", "-f", filePath], { allowFailure: true });
}

async function listBackupArtifactFiles() {
    const result = await runCommand([
        "find",
        `${projectRoot}/backups`,
        "-maxdepth",
        "1",
        "-type",
        "f",
        "(",
        "-name",
        "*.sql",
        "-o",
        "-name",
        "*.zip",
        ")",
        "-printf",
        "%f\n",
    ], { allowFailure: true });

    if (result.exitCode !== 0 || !result.stdout.trim()) {
        return new Set<string>();
    }

    return new Set(result.stdout.split("\n").map((item) => item.trim()).filter(Boolean));
}

async function cleanupTeacherByEmployeeId(employeeId: string) {
    const match = (await listTeachers(employeeId)).find((teacher) => teacher.employeeId === employeeId);
    if (!match) {
        return;
    }

    const disableResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/teachers/${match.id}/status`, {
        method: "PUT",
        body: {
            status: 0,
        },
    });
    assert(disableResponse.status === 200, `Disabling pre-existing teacher ${employeeId} failed with status ${disableResponse.status}`);
    assert(disableResponse.body?.success, `Disabling pre-existing teacher ${employeeId} did not return success`);
}

async function hasCommand(command: string) {
    const lookup = await runCommand(["bash", "-lc", `command -v ${JSON.stringify(command)}`], { allowFailure: true });
    return lookup.exitCode === 0 && Boolean(lookup.stdout.trim());
}

async function ensureTooling() {
    const requiredTools = [
        { command: "agent-browser", purpose: "browser automation" },
        { command: "mariadb-dump", purpose: "admin backup creation" },
        { command: "mariadb", purpose: "admin backup restore" },
        { command: "zip", purpose: "admin backup asset archive creation" },
        { command: "unzip", purpose: "admin backup asset restore" },
    ];

    const missingTools: string[] = [];
    for (const tool of requiredTools) {
        if (!(await hasCommand(tool.command))) {
            missingTools.push(`${tool.command} (${tool.purpose})`);
        }
    }

    assert(
        missingTools.length === 0,
        `Missing required admin e2e tools: ${missingTools.join(", ")}. Install them before running admin e2e.`,
    );
}

async function resetDatabase() {
    if (!shouldResetDb) {
        return;
    }
    log("Resetting database");
    await runCommand(["bun", "run", "db:reset"]);
}

async function reseedDatabase() {
    if (!shouldReseedDb) {
        return;
    }
    log("Restoring seed data");
    await runCommand(["bun", "run", "db:seed"]);
}

async function startServer() {
    if (useExistingServer) {
        return;
    }

    log("Starting admin server");
    serverProcess = Bun.spawn({
        cmd: ["bun", "run", "start:e2e"],
        cwd: projectRoot,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });

    await waitFor(
        "server to respond",
        async () => {
            try {
                const response = await fetch(`${baseUrl}/admin/login`);
                return response.ok ? true : false;
            } catch {
                if (serverProcess && (await Promise.race([serverProcess.exited.then(() => true), delay(0).then(() => false)]))) {
                    const logs = await collectServerLogs();
                    throw new Error(`Server exited before becoming ready.\n${logs}`);
                }
                return false;
            }
        },
        20000,
        500,
    );
}

async function collectServerLogs() {
    if (!serverProcess) {
        return "";
    }

    await Promise.race([serverProcess.exited, delay(250)]);
    const [stdout, stderr] = await Promise.all([
        new Response(serverProcess.stdout).text().catch(() => ""),
        new Response(serverProcess.stderr).text().catch(() => ""),
    ]);
    return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

async function stopServer() {
    if (!serverProcess) {
        return;
    }

    const proc = serverProcess;
    serverProcess = null;
    proc.kill();
    await proc.exited;
}

async function closeBrowser(session = adminBrowserSession) {
    await runBrowser(["close"], { allowFailure: true }, session);
}

async function loginAsAdmin(session = adminBrowserSession) {
    log("Logging in as admin");
    await runBrowser(["open", `${baseUrl}/admin/login`], {}, session);
    await runBrowser(["wait", "1000"], {}, session);
    await snapshot("login page", session);

    const loginPage = await browserJson<{
        pathname: string;
        username: boolean;
        password: boolean;
        submit: boolean;
    }>(`
        return {
            pathname: location.pathname,
            username: !!document.querySelector('[data-testid="admin-login-username"]'),
            password: !!document.querySelector('[data-testid="admin-login-password"]'),
            submit: !!document.querySelector('[data-testid="admin-login-submit"]'),
        };
    `, session);

    assert(loginPage.pathname === "/admin/login", `Expected /admin/login, got ${loginPage.pathname}`);
    assert(loginPage.username && loginPage.password && loginPage.submit, "Admin login form is incomplete");

    await runBrowser(["fill", '[data-testid="admin-login-username"]', adminUsername], {}, session);
    await runBrowser(["fill", '[data-testid="admin-login-password"]', adminPassword], {}, session);
    await runBrowser(["click", '[data-testid="admin-login-submit"]'], {}, session);

    await waitForPath("/admin", 15000, session);
    await runBrowser(["wait", "1000"], {}, session);
    await snapshot("dashboard", session);

    const me = await browserFetch<ApiEnvelope<{ id: number; username: string }>>("/api/admin/me", undefined, session);
    assert(me.status === 200, `Admin me returned status ${me.status}`);
    assert(me.body?.success, "Admin me did not return success");
    assert(me.body.data?.username === adminUsername, `Expected logged-in admin ${adminUsername}`);
}

async function testDashboardPage() {
    log("Checking dashboard page");

    await runBrowser(["click", '[data-testid="admin-nav-dashboard"]']);
    await waitForPath("/admin");
    await runBrowser(["wait", "700"]);
    await snapshot("dashboard page");

    const statsResponse = await browserFetch<ApiEnvelope<{
        currentSemester: string;
        teacherCount: number;
        classCount: number;
        studentCount: number;
        assistantCount: number;
        todayLogins: number;
        todayActiveUsers: number;
        pendingItems: number;
    }>>("/api/admin/stats");
    assert(statsResponse.status === 200, `Dashboard stats returned status ${statsResponse.status}`);
    assert(statsResponse.body?.success, "Dashboard stats did not return success");
    assert((statsResponse.body.data?.currentSemester ?? "").length > 0, "Dashboard current semester should not be empty");
    assert((statsResponse.body.data?.teacherCount ?? 0) > 0, "Dashboard teacher count should be positive");
    assert((statsResponse.body.data?.classCount ?? 0) > 0, "Dashboard class count should be positive");
    assert((statsResponse.body.data?.studentCount ?? 0) > 0, "Dashboard student count should be positive");
    assert((statsResponse.body.data?.assistantCount ?? 0) > 0, "Dashboard assistant count should be positive");

    const dashboardState = await browserJson<{
        hasCurrentSemester: boolean;
        hasTeacherTotal: boolean;
        hasQuickActions: boolean;
    }>(`
        const text = document.body.textContent ?? "";
        return {
            hasCurrentSemester: text.includes("当前学期"),
            hasTeacherTotal: text.includes("教师总数"),
            hasQuickActions: ["发布公告", "新增教师", "创建班级", "系统设置"].every((label) => text.includes(label)),
        };
    `);
    assert(dashboardState.hasCurrentSemester, "Dashboard current semester card is missing");
    assert(dashboardState.hasTeacherTotal, "Dashboard teacher total card is missing");
    assert(dashboardState.hasQuickActions, "Dashboard quick actions are incomplete");
}

async function testMonitorPage() {
    log("Checking system monitor page");

    await runBrowser(["click", '[data-testid="admin-nav-monitor"]']);
    await waitForPath("/admin/monitor");
    await runBrowser(["wait", "1000"]);
    await snapshot("monitor page");

    await waitFor(
        "monitor controls",
        async () => {
            const state = await browserJson<{
                refresh: boolean;
                pause: boolean;
                exportReport: boolean;
            }>(`
                return {
                    refresh: !!document.querySelector('[data-testid="monitor-refresh"]'),
                    pause: !!document.querySelector('[data-testid="monitor-pause"]'),
                    exportReport: !!document.querySelector('[data-testid="monitor-export-report"]'),
                };
            `);
            return state.refresh && state.pause && state.exportReport ? state : false;
        },
    );

    const metricsResponse = await browserFetch<ApiEnvelope<{
        cpu: number;
        memory: number;
        disk: number;
        network: number;
        activeConnections: number;
        todayLogins?: number;
        activeByRole?: Array<{ role: string; count: number }>;
    }>>("/api/admin/system/metrics");
    assert(metricsResponse.status === 200, `System metrics returned status ${metricsResponse.status}`);
    assert(metricsResponse.body?.success, "System metrics did not return success");
    assert((metricsResponse.body.data?.cpu ?? -1) >= 0 && (metricsResponse.body.data?.cpu ?? 101) <= 100, "System metrics cpu should stay within 0-100");
    assert((metricsResponse.body.data?.memory ?? -1) >= 0 && (metricsResponse.body.data?.memory ?? 101) <= 100, "System metrics memory should stay within 0-100");
    assert((metricsResponse.body.data?.disk ?? -1) >= 0 && (metricsResponse.body.data?.disk ?? 101) <= 100, "System metrics disk should stay within 0-100");
    assert((metricsResponse.body.data?.network ?? -1) >= 0, "System metrics network should not be negative");

    const logsResponse = await browserFetch<ApiEnvelope<Array<{
        id: string;
        time: string;
        level: string;
        message: string;
        source: string;
    }>>>("/api/admin/system/logs");
    assert(logsResponse.status === 200, `System logs returned status ${logsResponse.status}`);
    assert(logsResponse.body?.success, "System logs did not return success");
    assert((logsResponse.body.data ?? []).length > 0, "System logs should contain at least one recent entry");

    const monitorReportPath = `${projectRoot}/tmp/admin-monitor-report-${runId}.txt`;
    await runCommand(["mkdir", "-p", `${projectRoot}/tmp`]);
    try {
        await runBrowser(["download", '[data-testid="monitor-export-report"]', monitorReportPath]);
        await runCommand(["grep", "-q", "系统监控报告", monitorReportPath]);
    } finally {
        await cleanupFile(monitorReportPath);
    }

    await runBrowser(["click", '[data-testid="monitor-pause"]']);
    await waitFor(
        "monitor to pause",
        async () => {
            const state = await browserJson<{ resume: boolean }>(`
                return {
                    resume: !!document.querySelector('[data-testid="monitor-resume"]'),
                };
            `);
            return state.resume ? state : false;
        },
    );

    await runBrowser(["click", '[data-testid="monitor-resume"]']);
    await waitFor(
        "monitor to resume",
        async () => {
            const state = await browserJson<{ pause: boolean }>(`
                return {
                    pause: !!document.querySelector('[data-testid="monitor-pause"]'),
                };
            `);
            return state.pause ? state : false;
        },
    );
}

async function testNotifications() {
    log("Checking notifications");

    const before = await browserFetch<ApiEnvelope<AdminNotificationPayload>>("/api/admin/notifications");
    assert(before.status === 200, `Notifications API returned status ${before.status}`);
    assert(before.body?.success, "Notifications API did not return success");
    assert(before.body.data?.count === 2, `Expected 2 unread admin notifications, got ${before.body.data?.count ?? "unknown"}`);
    assert((before.body.data?.items.length ?? 0) >= 3, "Expected seeded admin notifications to be present");
    const firstUnreadNotification = before.body.data?.items.find((item) => item.isRead === 0);
    assert(firstUnreadNotification, "Expected at least one unread admin notification");

    await runBrowser(["click", '[data-testid="admin-notifications-trigger"]']);
    await waitFor(
        "notification dialog",
        async () => {
            const state = await browserJson<{ markAll: boolean; items: number }>(`
                return {
                    markAll: !!document.querySelector('[data-testid="admin-notifications-mark-all-read"]'),
                    items: document.querySelectorAll('[data-testid^="admin-notification-item-"]').length,
                };
            `);
            return state.markAll && state.items >= 3 ? state : false;
        },
    );
    await snapshot("notifications dialog");

    await runBrowser(["click", `[data-testid="admin-notification-item-${firstUnreadNotification.id}"]`]);

    const afterSingleRead = await waitFor(
        "single notification to be marked as read",
        async () => {
            const response = await browserFetch<ApiEnvelope<AdminNotificationPayload>>("/api/admin/notifications");
            if (response.status !== 200 || !response.body?.success) {
                return false;
            }
            const item = response.body.data?.items.find((candidate) => candidate.id === firstUnreadNotification.id);
            return response.body.data?.count === 1 && item?.isRead === 1 ? response : false;
        },
    );
    assert(afterSingleRead.body?.data?.count === 1, "Unread notification count should decrease by one after single read");

    await runBrowser(["click", '[data-testid="admin-notifications-mark-all-read"]']);

    const after = await waitFor(
        "notifications to be marked as read",
        async () => {
            const response = await browserFetch<ApiEnvelope<AdminNotificationPayload>>("/api/admin/notifications");
            if (response.status !== 200 || !response.body?.success) {
                return false;
            }
            return response.body.data?.count === 0 ? response : false;
        },
    );

    const unreadCount = after.body?.data?.count ?? -1;
    const unreadItems = (after.body?.data?.items ?? []).filter((item) => item.isRead === 0);
    assert(unreadCount === 0, `Expected unread notification count to become 0, got ${unreadCount}`);
    assert(unreadItems.length === 0, "Expected visible admin notifications to all be marked as read");

    await runBrowser(["press", "Escape"]);
}

async function testAdminSingleSessionKickFlow() {
    log("Checking admin single-session kick flow");

    await closeBrowser(adminKickedBrowserSession);
    await loginAsAdmin(adminKickedBrowserSession);

    const kickedMe = await browserFetch<ApiEnvelope<{ username: string }>>("/api/admin/me", undefined, adminBrowserSession);
    assert(kickedMe.status === 401, `Kicked admin session should return 401, got ${kickedMe.status}`);
    assert(kickedMe.body?.success === false, "Kicked admin session should fail");
    assert(kickedMe.body.error?.code === "UNAUTHORIZED", `Expected UNAUTHORIZED, got ${kickedMe.body.error?.code ?? "unknown"}`);

    await runBrowser(["open", `${baseUrl}/admin/semester`]);
    await waitForPath("/admin/login");
    await snapshot("admin kicked to login");

    await loginAsAdmin();
    await closeBrowser(adminKickedBrowserSession);
}

async function testBackupRestoreFlow() {
    log("Checking backup restore flow");

    await cleanupSemesterByName(restoreMarkerSemesterName);

    const baselineBackupFiles = await listBackupArtifactFiles();

    try {
        await runBrowser(["click", '[data-testid="admin-nav-settings"]']);
        await waitForPath("/admin/settings");
        await runBrowser(["wait", "700"]);

        await clickButtonByText("备份恢复");
        await runBrowser(["wait", "400"]);

        const existingBackupIds = new Set((await listBackups()).map((item) => item.backupId));
        await runBrowser(["click", '[data-testid="settings-backup-create"]']);

        const createdBackup = await waitFor(
            "restore test backup to be created",
            async () => {
                const items = await listBackups();
                return items.find((item) => !existingBackupIds.has(item.backupId) && item.hasZip) ?? false;
            },
            20000,
            500,
        );
        assert(createdBackup.backupId.startsWith("backup_"), `Expected restore backup id to start with backup_, got ${createdBackup.backupId}`);

        const createMarkerResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/semesters", {
            method: "POST",
            body: {
                name: restoreMarkerSemesterName,
            },
        });
        assert(
            createMarkerResponse.status === 201,
            `Restore marker semester create returned status ${createMarkerResponse.status}${createMarkerResponse.rawText ? `: ${createMarkerResponse.rawText}` : ""}`,
        );
        assert(createMarkerResponse.body?.success, "Restore marker semester create did not return success");

        const markerSemester = await waitFor(
            `restore marker semester ${restoreMarkerSemesterName} to be created`,
            async () => (await listSemesters()).find((item) => item.name === restoreMarkerSemesterName) ?? false,
        );
        assert(markerSemester.name === restoreMarkerSemesterName, "Restore marker semester was not persisted");

        await runBrowser(["click", '[data-testid="settings-backup-restore-open"]']);
        await waitFor(
            "restore flow dialog",
            async () => {
                const state = await browserJson<{ submit: boolean }>(`
                    return {
                        submit: !!document.querySelector('[data-testid="settings-backup-restore-submit"]'),
                    };
                `);
                return state.submit ? state : false;
            },
        );

        const restoreDialogState = await browserJson<{ includesBackup: boolean }>(`
            const dialog = document.querySelector('[role="dialog"]');
            const text = dialog?.textContent ?? "";
            return {
                includesBackup: text.includes(${JSON.stringify(createdBackup.backupId)}),
            };
        `);
        assert(restoreDialogState.includesBackup, "Restore flow dialog should include the newly created backup");

        const wrongRestorePassword = `${adminPassword}-wrong`;
        await runBrowser(["fill", '[data-testid="settings-backup-restore-password"]', wrongRestorePassword]);
        await runBrowser(["fill", '[data-testid="settings-backup-restore-confirm-password"]', wrongRestorePassword]);
        await runBrowser(["click", '[data-testid="settings-backup-restore-submit"]']);
        await waitFor(
            "restore flow invalid password error",
            async () => {
                const state = await browserJson<{ errorText: string | null }>(`
                    const dialog = document.querySelector('[role="dialog"]');
                    const error = dialog?.querySelector(".text-rose-600");
                    return {
                        errorText: error?.textContent?.trim() ?? null,
                    };
                `);
                return state.errorText === "管理员密码不正确" ? state : false;
            },
        );

        await runBrowser(["fill", '[data-testid="settings-backup-restore-password"]', adminPassword]);
        await runBrowser(["fill", '[data-testid="settings-backup-restore-confirm-password"]', adminPassword]);
        await runBrowser(["click", '[data-testid="settings-backup-restore-submit"]']);

        await waitForPath("/admin/login", 30000);
        await snapshot("post-restore login page");

        const meAfterRestore = await browserFetch<ApiEnvelope<{ username: string }>>("/api/admin/me");
        assert(meAfterRestore.status === 401, `Admin me after restore should return 401, got ${meAfterRestore.status}`);

        await loginAsAdmin();

        const restoredSemesters = await listSemesters();
        assert(
            !restoredSemesters.some((item) => item.name === restoreMarkerSemesterName),
            "Restore should remove the post-backup marker semester",
        );
    } finally {
        const currentBackupFiles = await listBackupArtifactFiles();
        const createdFiles = Array.from(currentBackupFiles).filter((item) => !baselineBackupFiles.has(item));
        for (const fileName of createdFiles) {
            await cleanupFile(`${projectRoot}/backups/${fileName}`);
        }
    }
}

async function testSemesterCrud() {
    log("Checking semester create/delete");

    await cleanupSemesterByName(semesterName);
    await cleanupSemesterByName(semesterEditedName);

    const originalCurrentSemester = (await listSemesters()).find((semester) => semester.isCurrent === 1);
    assert(originalCurrentSemester, "Original current semester fixture was not found");

    await runBrowser(["click", '[data-testid="admin-nav-semester"]']);
    await waitForPath("/admin/semester");
    await runBrowser(["wait", "700"]);
    await snapshot("semester page");

    await runBrowser(["click", '[data-testid="semester-create-open"]']);
    await runBrowser(["wait", "300"]);
    await runBrowser(["fill", '[data-testid="semester-create-name"]', semesterName]);
    await runBrowser(["click", '[data-testid="semester-create-submit"]']);

    const createdSemester = await waitFor(
        `semester ${semesterName} to be created`,
        async () => {
            const semester = (await listSemesters()).find((item) => item.name === semesterName);
            return semester ?? false;
        },
    );

    const duplicateSemesterResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/semesters", {
        method: "POST",
        body: {
            name: semesterName,
        },
    });
    assert(duplicateSemesterResponse.status === 400, `Duplicate semester create should return 400, got ${duplicateSemesterResponse.status}`);
    assert(duplicateSemesterResponse.body?.success === false, "Duplicate semester create should fail");
    assert(
        duplicateSemesterResponse.body.error?.code === "DUPLICATE_NAME",
        `Expected DUPLICATE_NAME, got ${duplicateSemesterResponse.body.error?.code ?? "unknown"}`,
    );

    await snapshot("semester created");
    assert(createdSemester.classCount === 0, `Expected new semester ${semesterName} to start with 0 classes`);

    await runBrowser(["click", `[data-testid="semester-edit-open-${createdSemester.id}"]`]);
    await waitFor(
        "semester edit dialog",
        async () => {
            const dialogState = await browserJson<{ input: boolean; submit: boolean }>(`
                return {
                    input: !!document.querySelector('[data-testid="semester-edit-name"]'),
                    submit: !!document.querySelector('[data-testid="semester-edit-submit"]'),
                };
            `);
            return dialogState.input && dialogState.submit ? dialogState : false;
        },
    );
    await runBrowser(["fill", '[data-testid="semester-edit-name"]', semesterEditedName]);
    await runBrowser(["click", '[data-testid="semester-edit-submit"]']);

    const editedSemester = await waitFor(
        `semester ${semesterName} to be edited`,
        async () => {
            const semester = (await listSemesters()).find((item) => item.id === createdSemester.id);
            return semester?.name === semesterEditedName ? semester : false;
        },
    );
    assert(editedSemester.name === semesterEditedName, "Semester edit did not persist");

    await runBrowser(["click", `[data-testid="semester-set-current-${createdSemester.id}"]`]);

    const promotedSemester = await waitFor(
        `semester ${semesterEditedName} to become current`,
        async () => {
            const semesters = await listSemesters();
            const updatedCreated = semesters.find((item) => item.id === createdSemester.id);
            const updatedOriginal = semesters.find((item) => item.id === originalCurrentSemester.id);
            if (updatedCreated?.isCurrent === 1 && updatedOriginal?.isCurrent === 0) {
                return { updatedCreated, updatedOriginal };
            }
            return false;
        },
    );
    assert(promotedSemester.updatedCreated.name === semesterEditedName, "Edited semester did not become current");

    const restoreCurrentResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/semesters/${originalCurrentSemester.id}/current`, {
        method: "PUT",
    });
    assert(restoreCurrentResponse.status === 200, `Restoring original current semester failed with status ${restoreCurrentResponse.status}`);
    assert(restoreCurrentResponse.body?.success, "Restoring original current semester did not return success");

    await waitFor(
        "original current semester to be restored",
        async () => {
            const semesters = await listSemesters();
            const restoredOriginal = semesters.find((item) => item.id === originalCurrentSemester.id);
            const restoredCreated = semesters.find((item) => item.id === createdSemester.id);
            return restoredOriginal?.isCurrent === 1 && restoredCreated?.isCurrent === 0
                ? { restoredOriginal, restoredCreated }
                : false;
        },
    );

    await runBrowser(["click", `[data-testid="semester-delete-${createdSemester.id}"]`]);
    await waitFor(
        "delete confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await snapshot("semester delete confirmation");

    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await waitFor(
        `semester ${semesterEditedName} to be deleted`,
        async () => ((await listSemesters()).some((item) => item.id === createdSemester.id) ? false : true),
    );
}

async function testSemesterProtection() {
    log("Checking current semester delete protection");

    const currentSemester = (await listSemesters()).find((item) => item.isCurrent === 1);
    assert(currentSemester, "Current semester fixture was not found");

    const response = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/semesters/${currentSemester.id}`, {
        method: "DELETE",
    });
    assert(response.status === 400, `Deleting current semester should return 400, got ${response.status}`);
    assert(response.body?.success === false, "Current semester delete should fail");
    assert(response.body.error?.code === "CURRENT_SEMESTER_PROTECTED", `Expected CURRENT_SEMESTER_PROTECTED, got ${response.body.error?.code ?? "unknown"}`);
}

async function testSemesterHasClassesProtection() {
    log("Checking semester has-classes delete protection");

    const semesterWithClasses = (await listSemesters()).find((item) => item.isCurrent === 0 && item.classCount > 0);
    assert(semesterWithClasses, "Non-current semester with classes fixture was not found");

    const response = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/semesters/${semesterWithClasses.id}`, {
        method: "DELETE",
    });
    assert(response.status === 400, `Deleting semester with classes should return 400, got ${response.status}`);
    assert(response.body?.success === false, "Semester with classes delete should fail");
    assert(response.body.error?.code === "HAS_CLASSES", `Expected HAS_CLASSES, got ${response.body.error?.code ?? "unknown"}`);
}

async function testTeacherPage() {
    log("Checking teacher fixtures");

    await runBrowser(["click", '[data-testid="admin-nav-teacher"]']);
    await waitForPath("/admin/teacher");
    await runBrowser(["wait", "700"]);
    await snapshot("teacher page");

    const teacherState = await browserJson<{
        lockedRow: boolean;
        lockedUnlock: boolean;
        primaryRow: boolean;
        primaryReset: boolean;
        disabledToggle: boolean;
    }>(`
        return {
            lockedRow: !!document.querySelector('[data-testid="teacher-row-T006"]'),
            lockedUnlock: !!document.querySelector('[data-testid="teacher-unlock-T006"]'),
            primaryRow: !!document.querySelector('[data-testid="teacher-row-teacher"]'),
            primaryReset: !!document.querySelector('[data-testid="teacher-reset-teacher"]'),
            disabledToggle: !!document.querySelector('[data-testid="teacher-toggle-status-T005"]'),
        };
    `);

    assert(teacherState.lockedRow, "Locked teacher T006 row is missing");
    assert(teacherState.lockedUnlock, "Locked teacher T006 unlock action is missing");
    assert(teacherState.primaryRow, "Primary teacher row is missing");
    assert(teacherState.primaryReset, "Primary teacher reset action is missing");
    assert(teacherState.disabledToggle, "Disabled teacher toggle action is missing");

    await runBrowser(["click", '[data-testid="teacher-unlock-T006"]']);
    await waitFor(
        "teacher unlock confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const unlockedTeacher = await waitFor(
        "teacher T006 to unlock",
        async () => {
            const teacher = (await listTeachers("T006")).find((item) => item.employeeId === "T006");
            return teacher && !teacher.isLocked ? teacher : false;
        },
    );
    assert(unlockedTeacher.employeeId === "T006", "Teacher T006 unlock verification failed");

    await runBrowser(["click", '[data-testid="teacher-toggle-status-T005"]']);
    await waitFor(
        "teacher status confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const enabledTeacher = await waitFor(
        "teacher T005 to enable",
        async () => {
            const teacher = (await listTeachers("T005")).find((item) => item.employeeId === "T005");
            return teacher?.status === 1 ? teacher : false;
        },
    );
    assert(enabledTeacher.employeeId === "T005", "Teacher T005 status toggle verification failed");
}

async function testTeacherCrudFlow() {
    log("Checking teacher create/edit/classes flow");

    await cleanupTeacherByEmployeeId(teacherEmployeeId);

    await runBrowser(["click", '[data-testid="teacher-create-open"]']);
    await waitFor(
        "teacher create dialog",
        async () => {
            const state = await browserJson<{ employeeId: boolean; name: boolean; submit: boolean }>(`
                return {
                    employeeId: !!document.querySelector('[data-testid="teacher-create-employee-id"]'),
                    name: !!document.querySelector('[data-testid="teacher-create-name"]'),
                    submit: !!document.querySelector('[data-testid="teacher-create-submit"]'),
                };
            `);
            return state.employeeId && state.name && state.submit ? state : false;
        },
    );
    await runBrowser(["fill", '[data-testid="teacher-create-employee-id"]', teacherEmployeeId]);
    await runBrowser(["fill", '[data-testid="teacher-create-name"]', teacherDisplayName]);
    await runBrowser(["click", '[data-testid="teacher-create-submit"]']);

    const createdTeacher = await waitFor(
        `teacher ${teacherEmployeeId} to be created`,
        async () => (await listTeachers(teacherEmployeeId)).find((teacher) => teacher.employeeId === teacherEmployeeId) ?? false,
    );
    assert(createdTeacher.name === teacherDisplayName, "Created teacher name mismatch");
    assert(createdTeacher.isFirstLogin === 1, "Created teacher should start in first-login state");

    const duplicateTeacherResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/teachers", {
        method: "POST",
        body: {
            employeeId: teacherEmployeeId,
            name: `${teacherDisplayName}-重复`,
        },
    });
    assert(duplicateTeacherResponse.status === 400, `Duplicate teacher create should return 400, got ${duplicateTeacherResponse.status}`);
    assert(duplicateTeacherResponse.body?.success === false, "Duplicate teacher create should fail");
    assert(
        duplicateTeacherResponse.body.error?.code === "DUPLICATE_EMPLOYEE_ID",
        `Expected DUPLICATE_EMPLOYEE_ID, got ${duplicateTeacherResponse.body.error?.code ?? "unknown"}`,
    );

    await runBrowser(["fill", '[data-testid="teacher-search-input"]', teacherEmployeeId]);
    await runBrowser(["click", '[data-testid="teacher-search-submit"]']);
    await waitFor(
        `teacher row ${teacherEmployeeId}`,
        async () => {
            const state = await browserJson<{ row: boolean; edit: boolean; viewClasses: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="teacher-row-${teacherEmployeeId}"]'),
                    edit: !!document.querySelector('[data-testid="teacher-edit-open-${teacherEmployeeId}"]'),
                    viewClasses: !!document.querySelector('[data-testid="teacher-view-classes-${teacherEmployeeId}"]'),
                };
            `);
            return state.row && state.edit && state.viewClasses ? state : false;
        },
    );

    await runBrowser(["click", `[data-testid="teacher-edit-open-${teacherEmployeeId}"]`]);
    await waitFor(
        "teacher edit dialog",
        async () => {
            const state = await browserJson<{ input: boolean }>(`
                return {
                    input: !!document.querySelector('#editName'),
                };
            `);
            return state.input ? state : false;
        },
    );
    await runBrowser(["fill", "#editName", teacherEditedName]);
    await clickButtonByText("确认修改");

    const editedTeacher = await waitFor(
        `teacher ${teacherEmployeeId} to be edited`,
        async () => {
            const teacher = (await listTeachers(teacherEmployeeId)).find((item) => item.employeeId === teacherEmployeeId);
            return teacher?.name === teacherEditedName ? teacher : false;
        },
    );
    assert(editedTeacher.name === teacherEditedName, "Teacher edit did not persist");

    const semesterForTeacherClass = (await listSemesters()).find((semester) => semester.name === "2024-2025学年 第二学期");
    assert(semesterForTeacherClass, "Target semester fixture for teacher class was not found");

    const createClassResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/classes", {
        method: "POST",
        body: {
            name: teacherClassName,
            semesterId: semesterForTeacherClass.id,
            teacherId: createdTeacher.id,
        },
    });
    assert(createClassResponse.status === 201, `Teacher fixture class create returned status ${createClassResponse.status}`);
    assert(createClassResponse.body?.success, "Teacher fixture class create did not return success");

    const createdTeacherClass = await waitFor(
        `teacher class ${teacherClassName} to be created`,
        async () => (await listClasses()).find((item) => item.name === teacherClassName && item.teacherId === createdTeacher.id) ?? false,
    );

    await runBrowser(["click", `[data-testid="teacher-view-classes-${teacherEmployeeId}"]`]);
    await waitFor(
        "teacher classes dialog",
        async () => {
            const state = await browserJson<{ open: boolean; rows: number; hasClass: boolean }>(`
                const text = document.body.textContent ?? "";
                return {
                    open: text.includes(${JSON.stringify(`教师「${teacherEditedName}」的关联班级`)}),
                    rows: Array.from(document.querySelectorAll("tbody tr")).length,
                    hasClass: text.includes(${JSON.stringify(teacherClassName)}),
                };
            `);
            return state.open && state.rows > 0 && state.hasClass ? state : false;
        },
    );
    await snapshot("teacher classes dialog");

    const classApiResponse = await browserFetch<ApiEnvelope<ClassSummary[]>>(`/api/admin/classes?teacher_id=${createdTeacher.id}`);
    assert(classApiResponse.status === 200, `Teacher classes filtered API returned status ${classApiResponse.status}`);
    assert(classApiResponse.body?.success, "Teacher classes filtered API did not return success");
    assert(
        (classApiResponse.body.data ?? []).some((item) => item.id === createdTeacherClass.id),
        "Teacher classes filtered API did not include the created teacher class",
    );

    await runBrowser(["press", "Escape"]);
    await runBrowser(["fill", '[data-testid="teacher-search-input"]', ""]);
    await runBrowser(["click", '[data-testid="teacher-search-submit"]']);
    await waitFor(
        "primary teacher row to return after clearing search",
        async () => {
            const state = await browserJson<{ primaryRow: boolean; primaryReset: boolean }>(`
                return {
                    primaryRow: !!document.querySelector('[data-testid="teacher-row-teacher"]'),
                    primaryReset: !!document.querySelector('[data-testid="teacher-reset-teacher"]'),
                };
            `);
            return state.primaryRow && state.primaryReset ? state : false;
        },
    );
}

async function testTeacherStatusLoginFlow() {
    log("Checking enabled teacher login");

    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, teacherStatusBrowserSession);
    await runBrowser(["wait", "1000"], {}, teacherStatusBrowserSession);

    const login = await browserFetch<ApiEnvelope<{
        user: {
            employeeId: string;
            type: string;
            isFirstLogin: number;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "T005",
            password: teacherStatusPassword,
        },
    }, teacherStatusBrowserSession);
    assert(login.status === 200, `Enabled teacher login should return 200, got ${login.status}`);
    assert(login.body?.success, "Enabled teacher login did not return success");
    assert(login.body.data?.user.employeeId === "T005", "Enabled teacher login returned the wrong user");
    assert(login.body.data?.user.type === "teacher", "Enabled teacher login did not return teacher type");

    const me = await browserFetch<ApiEnvelope<{
        employeeId: string;
        name: string;
        isFirstLogin: number;
        type: string;
    }>>("/api/teacher/me", undefined, teacherStatusBrowserSession);
    assert(me.status === 200, `Enabled teacher me should return 200, got ${me.status}`);
    assert(me.body?.success, "Enabled teacher me did not return success");
    assert(me.body.data?.employeeId === "T005", "Enabled teacher me returned the wrong account");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/teacher/logout", {
        method: "POST",
    }, teacherStatusBrowserSession);
    assert(logout.status === 200, `Enabled teacher logout should return 200, got ${logout.status}`);
    assert(logout.body?.success, "Enabled teacher logout did not return success");
}

async function testTeacherDisabledLoginFlow() {
    log("Checking disabled teacher login");

    const teacher = (await listTeachers("T005")).find((item) => item.employeeId === "T005");
    assert(teacher, "Teacher T005 was not found for disable login check");

    const disableResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/teachers/${teacher.id}/status`, {
        method: "PUT",
        body: {
            status: 0,
        },
    });
    assert(disableResponse.status === 200, `Teacher disable returned status ${disableResponse.status}`);
    assert(disableResponse.body?.success, "Teacher disable did not return success");

    const disabledTeacher = await waitFor(
        "teacher T005 to disable",
        async () => {
            const item = (await listTeachers("T005")).find((candidate) => candidate.employeeId === "T005");
            return item?.status === 0 ? item : false;
        },
    );
    assert(disabledTeacher.employeeId === "T005", "Teacher T005 disable verification failed");

    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, teacherStatusBrowserSession);
    await runBrowser(["wait", "1000"], {}, teacherStatusBrowserSession);

    const login = await browserFetch<ApiEnvelope<{
        user: {
            employeeId: string;
            type: string;
            isFirstLogin: number;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "T005",
            password: teacherStatusPassword,
        },
    }, teacherStatusBrowserSession);
    assert(login.status === 403, `Disabled teacher login should return 403, got ${login.status}`);
    assert(login.body?.success === false, "Disabled teacher login should fail");
    assert(login.body.error?.code === "ACCOUNT_DISABLED", `Expected ACCOUNT_DISABLED, got ${login.body.error?.code ?? "unknown"}`);

    const me = await browserFetch<ApiEnvelope<{ employeeId: string }>>("/api/teacher/me", undefined, teacherStatusBrowserSession);
    assert(me.status === 401, `Disabled teacher me should return 401, got ${me.status}`);
}

async function testTeacherResetPasswordFlow() {
    log("Checking teacher password reset flow");

    await runBrowser(["click", '[data-testid="teacher-reset-teacher"]']);
    await waitFor(
        "teacher reset confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const updatedTeacher = await waitFor(
        "teacher reset state",
        async () => {
            const teacher = (await listTeachers("teacher")).find((item) => item.employeeId === "teacher");
            return teacher?.isFirstLogin === 1 ? teacher : false;
        },
    );
    assert(updatedTeacher.employeeId === "teacher", "Teacher reset target was not found after reset");

    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, teacherBrowserSession);
    await runBrowser(["wait", "1000"], {}, teacherBrowserSession);
    await snapshot("teacher login page", teacherBrowserSession);

    await runBrowser(["fill", '[data-testid="teacher-login-username"]', "teacher"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-login-password"]', teacherResetPassword], {}, teacherBrowserSession);
    await runBrowser(["click", '[data-testid="teacher-login-submit"]'], {}, teacherBrowserSession);

    await waitForPath("/teacher", 15000, teacherBrowserSession);
    await waitFor(
        "teacher first-login password dialog",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="teacher-password-submit"]'),
                };
            `, teacherBrowserSession);
            return state.submit ? state : false;
        },
        15000,
        300,
    );
    await snapshot("teacher first-login password dialog", teacherBrowserSession);

    await runBrowser(["fill", "#currentPassword", teacherResetPassword], {}, teacherBrowserSession);
    await runBrowser(["fill", "#newPassword", teacherNewPassword], {}, teacherBrowserSession);
    await runBrowser(["fill", "#confirmPassword", teacherNewPassword], {}, teacherBrowserSession);
    await runBrowser(["click", '[data-testid="teacher-password-submit"]'], {}, teacherBrowserSession);

    await waitFor(
        "teacher password dialog to close",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="teacher-password-submit"]'),
                };
            `, teacherBrowserSession);
            return state.submit ? false : true;
        },
    );

    const teacherMe = await browserFetch<ApiEnvelope<{ name: string; isFirstLogin: number }>>("/api/teacher/me", undefined, teacherBrowserSession);
    assert(teacherMe.status === 200, `Teacher me returned status ${teacherMe.status}`);
    assert(teacherMe.body?.success, "Teacher me did not return success after password change");
    assert(teacherMe.body.data?.isFirstLogin === 0, "Teacher remained in first-login state after password change");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/teacher/logout", {
        method: "POST",
    }, teacherBrowserSession);
    assert(logout.status === 200, `Teacher logout returned status ${logout.status}`);
    assert(logout.body?.success, "Teacher logout did not return success");

    const oldPasswordLogin = await browserFetch<ApiEnvelope<{ user: { employeeId: string } }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "teacher",
            password: teacherResetPassword,
        },
    }, teacherBrowserSession);
    assert(oldPasswordLogin.status === 401, `Old teacher password should return 401, got ${oldPasswordLogin.status}`);
    assert(oldPasswordLogin.body?.success === false, "Old teacher password login should fail");
    assert(oldPasswordLogin.body.error?.code === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${oldPasswordLogin.body.error?.code ?? "unknown"}`);

    const newPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            employeeId: string;
            isFirstLogin: number;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "teacher",
            password: teacherNewPassword,
        },
    }, teacherBrowserSession);
    assert(newPasswordLogin.status === 200, `New teacher password should return 200, got ${newPasswordLogin.status}`);
    assert(newPasswordLogin.body?.success, "New teacher password login did not return success");
    assert(newPasswordLogin.body.data?.user.employeeId === "teacher", "New teacher password login returned wrong user");
    assert(newPasswordLogin.body.data?.user.isFirstLogin === 0, "Teacher should not return to first-login after password change");

    const finalLogout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/teacher/logout", {
        method: "POST",
    }, teacherBrowserSession);
    assert(finalLogout.status === 200, `Teacher final logout returned status ${finalLogout.status}`);
    assert(finalLogout.body?.success, "Teacher final logout did not return success");
}

async function testAssistantPage() {
    log("Checking assistant create/delete flow");

    const ownerTeacher = (await listTeachers("teacher")).find((item) => item.employeeId === "teacher");
    assert(ownerTeacher, "Owner teacher fixture was not found for assistant creation");

    const createResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/assistants", {
        method: "POST",
        body: {
            account: assistantAccount,
            name: assistantName,
            teacherId: ownerTeacher.id,
        },
    });
    assert(createResponse.status === 201, `Assistant create returned status ${createResponse.status}`);
    assert(createResponse.body?.success, "Assistant create did not return success");

    const createdAssistant = await waitFor(
        "created assistant to appear in API",
        async () => (await listAssistants()).find((item) => item.account === assistantAccount) ?? false,
    );

    const duplicateAssistantResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/assistants", {
        method: "POST",
        body: {
            account: assistantAccount,
            name: `${assistantName}-重复`,
            teacherId: ownerTeacher.id,
        },
    });
    assert(duplicateAssistantResponse.status === 400, `Duplicate assistant create should return 400, got ${duplicateAssistantResponse.status}`);
    assert(duplicateAssistantResponse.body?.success === false, "Duplicate assistant create should fail");
    assert(
        duplicateAssistantResponse.body.error?.code === "DUPLICATE_ACCOUNT",
        `Expected DUPLICATE_ACCOUNT, got ${duplicateAssistantResponse.body.error?.code ?? "unknown"}`,
    );

    await runBrowser(["click", '[data-testid="admin-nav-assistant"]']);
    await waitForPath("/admin/assistant");
    await runBrowser(["wait", "700"]);
    await snapshot("assistant page");

    const assistantState = await browserJson<{
        createdRow: boolean;
        createdDelete: boolean;
        lockedRow: boolean;
        lockedUnlock: boolean;
    }>(`
        return {
            createdRow: !!document.querySelector('[data-testid="assistant-row-${assistantAccount}"]'),
            createdDelete: !!document.querySelector('[data-testid="assistant-delete-${assistantAccount}"]'),
            lockedRow: !!document.querySelector('[data-testid="assistant-row-A005"]'),
            lockedUnlock: !!document.querySelector('[data-testid="assistant-unlock-A005"]'),
        };
    `);
    assert(assistantState.createdRow, "Created assistant row is missing");
    assert(assistantState.createdDelete, "Created assistant delete action is missing");
    assert(assistantState.lockedRow, "Locked assistant A005 row is missing");
    assert(assistantState.lockedUnlock, "Locked assistant A005 unlock action is missing");

    await runBrowser(["fill", '[data-testid="assistant-search-input"]', assistantAccount]);
    await waitFor(
        `assistant search result ${assistantAccount}`,
        async () => {
            const state = await browserJson<{ createdRow: boolean; lockedRow: boolean }>(`
                return {
                    createdRow: !!document.querySelector('[data-testid="assistant-row-${assistantAccount}"]'),
                    lockedRow: !!document.querySelector('[data-testid="assistant-row-A005"]'),
                };
            `);
            return state.createdRow && !state.lockedRow ? state : false;
        },
    );
    await runBrowser(["fill", '[data-testid="assistant-search-input"]', ""]);
    await waitFor(
        "assistant list to restore after clearing search",
        async () => {
            const state = await browserJson<{ createdRow: boolean; lockedRow: boolean }>(`
                return {
                    createdRow: !!document.querySelector('[data-testid="assistant-row-${assistantAccount}"]'),
                    lockedRow: !!document.querySelector('[data-testid="assistant-row-A005"]'),
                };
            `);
            return state.createdRow && state.lockedRow ? state : false;
        },
    );

    await runBrowser(["click", '[data-testid="assistant-unlock-A005"]']);
    await waitFor(
        "assistant unlock confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const unlockedAssistant = await waitFor(
        "assistant A005 to unlock",
        async () => {
            const assistant = (await listAssistants()).find((item) => item.account === "A005");
            return assistant && !assistant.isLocked ? assistant : false;
        },
    );
    assert(unlockedAssistant.account === "A005", "Assistant A005 unlock verification failed");

    await runBrowser(["click", '[data-testid="assistant-toggle-status-assistant"]']);
    await waitFor(
        "assistant status confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const disabledAssistant = await waitFor(
        "assistant main account to disable",
        async () => {
            const assistant = (await listAssistants()).find((item) => item.account === "assistant");
            return assistant?.status === 0 ? assistant : false;
        },
    );
    assert(disabledAssistant.account === "assistant", "Assistant main account toggle verification failed");

    await runBrowser(["click", `[data-testid="assistant-delete-${assistantAccount}"]`]);
    await waitFor(
        "assistant delete confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await waitFor(
        "assistant to be deleted",
        async () => ((await listAssistants()).some((item) => item.account === assistantAccount) ? false : true),
    );
    assert(createdAssistant.account === assistantAccount, "Created assistant account mismatch");
}

async function testAssistantDisabledLoginFlow() {
    log("Checking disabled assistant login");

    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, assistantBrowserSession);
    await runBrowser(["wait", "1000"], {}, assistantBrowserSession);

    const login = await browserFetch<ApiEnvelope<{
        user: {
            account: string;
            type: string;
            isFirstLogin: number;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "assistant",
            password: assistantDisabledPassword,
        },
    }, assistantBrowserSession);
    assert(login.status === 403, `Disabled assistant login should return 403, got ${login.status}`);
    assert(login.body?.success === false, "Disabled assistant login should fail");
    assert(login.body.error?.code === "ACCOUNT_DISABLED", `Expected ACCOUNT_DISABLED, got ${login.body.error?.code ?? "unknown"}`);

    const me = await browserFetch<ApiEnvelope<{ account: string }>>("/api/teacher/me", undefined, assistantBrowserSession);
    assert(me.status === 401, `Disabled assistant me should return 401, got ${me.status}`);
}

async function testAssistantResetPasswordFlow() {
    log("Checking assistant password reset flow");

    await waitFor(
        `assistant ${assistantResetAccount} reset button`,
        async () => {
            const state = await browserJson<{ row: boolean; reset: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="assistant-row-${assistantResetAccount}"]'),
                    reset: !!document.querySelector('[data-testid="assistant-reset-${assistantResetAccount}"]'),
                };
            `);
            return state.row && state.reset ? state : false;
        },
    );

    await runBrowser(["click", `[data-testid="assistant-reset-${assistantResetAccount}"]`]);
    await waitFor(
        "assistant reset confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, assistantResetBrowserSession);
    await runBrowser(["wait", "1000"], {}, assistantResetBrowserSession);
    await snapshot("assistant login page", assistantResetBrowserSession);

    await runBrowser(["fill", '[data-testid="teacher-login-username"]', assistantResetAccount], {}, assistantResetBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-login-password"]', assistantResetAccount], {}, assistantResetBrowserSession);
    await runBrowser(["click", '[data-testid="teacher-login-submit"]'], {}, assistantResetBrowserSession);

    await waitFor(
        "assistant first-login password dialog",
        async () => {
            const state = await browserJson<{ pathname: string; submit: boolean }>(`
                return {
                    pathname: location.pathname,
                    submit: !!document.querySelector('[data-testid="teacher-password-submit"]'),
                };
            `, assistantResetBrowserSession);
            return state.submit && (state.pathname === "/teacher/grading" || state.pathname === "/teacher")
                ? state
                : false;
        },
        15000,
        300,
    );
    await snapshot("assistant first-login password dialog", assistantResetBrowserSession);

    await runBrowser(["fill", "#currentPassword", assistantResetAccount], {}, assistantResetBrowserSession);
    await runBrowser(["fill", "#newPassword", assistantNewPassword], {}, assistantResetBrowserSession);
    await runBrowser(["fill", "#confirmPassword", assistantNewPassword], {}, assistantResetBrowserSession);
    await runBrowser(["click", '[data-testid="teacher-password-submit"]'], {}, assistantResetBrowserSession);

    await waitFor(
        "assistant password dialog to close",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="teacher-password-submit"]'),
                };
            `, assistantResetBrowserSession);
            return state.submit ? false : true;
        },
    );

    const assistantMe = await browserFetch<ApiEnvelope<{
        account: string;
        name: string;
        isFirstLogin: number;
        type: string;
    }>>("/api/teacher/me", undefined, assistantResetBrowserSession);
    assert(assistantMe.status === 200, `Assistant me returned status ${assistantMe.status}`);
    assert(assistantMe.body?.success, "Assistant me did not return success after password change");
    assert(assistantMe.body.data?.account === assistantResetAccount, "Assistant me returned the wrong account after password change");
    assert(assistantMe.body.data?.type === "assistant", "Assistant me should return assistant type");
    assert(assistantMe.body.data?.isFirstLogin === 0, "Assistant remained in first-login state after password change");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/teacher/logout", {
        method: "POST",
    }, assistantResetBrowserSession);
    assert(logout.status === 200, `Assistant logout returned status ${logout.status}`);
    assert(logout.body?.success, "Assistant logout did not return success");

    const oldPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            account: string;
            type: string;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: assistantResetAccount,
            password: assistantResetOldPassword,
        },
    }, assistantResetBrowserSession);
    assert(oldPasswordLogin.status === 401, `Old assistant password should return 401, got ${oldPasswordLogin.status}`);
    assert(oldPasswordLogin.body?.success === false, "Old assistant password login should fail");
    assert(oldPasswordLogin.body.error?.code === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${oldPasswordLogin.body.error?.code ?? "unknown"}`);

    const newPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            account: string;
            isFirstLogin: number;
            type: string;
        };
    }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: assistantResetAccount,
            password: assistantNewPassword,
        },
    }, assistantResetBrowserSession);
    assert(newPasswordLogin.status === 200, `New assistant password should return 200, got ${newPasswordLogin.status}`);
    assert(newPasswordLogin.body?.success, "New assistant password login did not return success");
    assert(newPasswordLogin.body.data?.user.account === assistantResetAccount, "New assistant password login returned the wrong account");
    assert(newPasswordLogin.body.data?.user.type === "assistant", "New assistant password login should return assistant type");
    assert(newPasswordLogin.body.data?.user.isFirstLogin === 0, "Assistant should not return to first-login after password change");

    const finalLogout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/teacher/logout", {
        method: "POST",
    }, assistantResetBrowserSession);
    assert(finalLogout.status === 200, `Assistant final logout returned status ${finalLogout.status}`);
    assert(finalLogout.body?.success, "Assistant final logout did not return success");
}

async function testStudentPage() {
    log("Checking student fixtures");

    await runBrowser(["click", '[data-testid="admin-nav-student"]']);
    await waitForPath("/admin/student");
    await runBrowser(["wait", "700"]);
    await snapshot("student page");

    const studentState = await browserJson<{
        filterClass: boolean;
        filterStatus: boolean;
        lockedRow: boolean;
        lockedUnlock: boolean;
        transferRow: boolean;
        transferButton: boolean;
    }>(`
        return {
            filterClass: !!document.querySelector('[data-testid="student-filter-class"]'),
            filterStatus: !!document.querySelector('[data-testid="student-filter-status"]'),
            lockedRow: !!document.querySelector('[data-testid="student-row-2024014"]'),
            lockedUnlock: !!document.querySelector('[data-testid="student-unlock-2024014"]'),
            transferRow: !!document.querySelector('[data-testid="student-row-2024003"]'),
            transferButton: !!document.querySelector('[data-testid="student-open-transfer-2024003"]'),
        };
    `);

    assert(studentState.filterClass, "Student class filter is missing");
    assert(studentState.filterStatus, "Student status filter is missing");
    assert(studentState.lockedRow, "Locked student 2024014 row is missing");
    assert(studentState.lockedUnlock, "Locked student 2024014 unlock action is missing");
    assert(studentState.transferRow, "Transfer fixture student 2024003 row is missing");
    assert(studentState.transferButton, "Transfer fixture student 2024003 button is missing");

    const transferFixtureStudent = (await listStudents({ search: "2024003" })).find((item) => item.studentId === "2024003");
    assert(transferFixtureStudent, "Transfer fixture student 2024003 was not found in API");

    const visibleStudents = await listStudents();
    const comparisonStudent = visibleStudents.find((item) => item.studentId !== transferFixtureStudent.studentId && item.classId !== transferFixtureStudent.classId);
    assert(comparisonStudent, "A comparison student from a different class was not found");

    const experimentStudent = visibleStudents.find((item) => item.studentId === "2024006");
    assert(experimentStudent, "Experiment fixture student 2024006 was not found");

    await selectOptionByText('[data-testid="student-filter-status"]', "已停用");
    await waitFor(
        "student disabled filter results",
        async () => {
            const state = await browserJson<{ disabledRow: boolean; activeRow: boolean }>(`
                return {
                    disabledRow: !!document.querySelector('[data-testid="student-row-2024204"]'),
                    activeRow: !!document.querySelector('[data-testid="student-row-2024006"]'),
                };
            `);
            return state.disabledRow && !state.activeRow ? state : false;
        },
    );

    await selectOptionByText('[data-testid="student-filter-status"]', "正常");
    await waitFor(
        "student active filter results",
        async () => {
            const state = await browserJson<{ disabledRow: boolean; activeRow: boolean }>(`
                return {
                    disabledRow: !!document.querySelector('[data-testid="student-row-2024204"]'),
                    activeRow: !!document.querySelector('[data-testid="student-row-2024006"]'),
                };
            `);
            return !state.disabledRow && state.activeRow ? state : false;
        },
    );

    await selectOptionByText('[data-testid="student-filter-status"]', "全部状态");
    await waitFor(
        "student status filter reset",
        async () => {
            const state = await browserJson<{ disabledRow: boolean; activeRow: boolean }>(`
                return {
                    disabledRow: !!document.querySelector('[data-testid="student-row-2024204"]'),
                    activeRow: !!document.querySelector('[data-testid="student-row-2024006"]'),
                };
            `);
            return state.disabledRow && state.activeRow ? state : false;
        },
    );

    await selectOptionByText('[data-testid="student-filter-class"]', transferFixtureStudent.className);
    await waitFor(
        `student class filter ${transferFixtureStudent.className}`,
        async () => {
            const state = await browserJson<{ transferRow: boolean; comparisonRow: boolean }>(`
                return {
                    transferRow: !!document.querySelector('[data-testid="student-row-${transferFixtureStudent.studentId}"]'),
                    comparisonRow: !!document.querySelector('[data-testid="student-row-${comparisonStudent.studentId}"]'),
                };
            `);
            return state.transferRow && !state.comparisonRow ? state : false;
        },
    );
    await snapshot("student class filtered");

    await selectOptionByText('[data-testid="student-filter-class"]', "全部班级");
    await waitFor(
        "student class filter reset",
        async () => {
            const state = await browserJson<{ comparisonRow: boolean }>(`
                return {
                    comparisonRow: !!document.querySelector('[data-testid="student-row-${comparisonStudent.studentId}"]'),
                };
            `);
            return state.comparisonRow ? state : false;
        },
    );

    const experimentResponse = await browserFetch<ApiEnvelope<Array<{
        id: number;
        taskName: string | null;
        currentStage: number;
        progress: number;
    }>>>(`/api/admin/students/${experimentStudent.id}/experiments`);
    assert(experimentResponse.status === 200, `Student experiments API should return 200, got ${experimentResponse.status}`);
    assert(experimentResponse.body?.success, "Student experiments API did not return success");
    assert((experimentResponse.body.data ?? []).length > 0, "Student experiments fixture should have at least one experiment");
    const expectedExperimentCount = (experimentResponse.body.data ?? []).length;

    await runBrowser(["click", `[data-testid="student-open-experiments-${experimentStudent.studentId}"]`]);
    await waitFor(
        "student experiments dialog",
        async () => {
            const state = await browserJson<{ open: boolean; rows: number }>(`
                const dialog = document.querySelector('[role="dialog"]');
                return {
                    open: !!dialog && (dialog.textContent ?? "").includes(${JSON.stringify(experimentStudent.studentId)}),
                    rows: dialog ? dialog.querySelectorAll("tbody tr").length : 0,
                };
            `);
            return state.open && state.rows >= expectedExperimentCount ? state : false;
        },
    );
    await snapshot("student experiments dialog");
    await runBrowser(["press", "Escape"]);
    await waitFor(
        "student experiments dialog to close",
        async () => {
            const state = await browserJson<{ open: boolean }>(`
                const dialog = document.querySelector('[role="dialog"]');
                return {
                    open: !!dialog && (dialog.textContent ?? "").includes(${JSON.stringify(experimentStudent.studentId)}),
                };
            `);
            return state.open ? false : true;
        },
    );

    await runBrowser(["click", '[data-testid="student-unlock-2024014"]']);
    await waitFor(
        "student unlock confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const unlockedStudent = await waitFor(
        "student 2024014 to unlock",
        async () => {
            const student = (await listStudents({ search: "2024014" })).find((item) => item.studentId === "2024014");
            return student && !student.isLocked ? student : false;
        },
    );
    assert(unlockedStudent.studentId === "2024014", "Student 2024014 unlock verification failed");

    await runBrowser(["click", '[data-testid="student-toggle-status-2024204"]']);
    await waitFor(
        "student status confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const enabledStudent = await waitFor(
        "student 2024204 to enable",
        async () => {
            const student = (await listStudents({ search: "2024204" })).find((item) => item.studentId === "2024204");
            return student?.status === 1 ? student : false;
        },
    );
    assert(enabledStudent.studentId === "2024204", "Student 2024204 status toggle verification failed");

    await runBrowser(["click", '[data-testid="student-open-transfer-2024003"]']);
    await waitFor(
        "student transfer dialog",
        async () => {
            const transferDialog = await browserJson<{ targetClass: boolean }>(`
                return {
                    targetClass: !!document.querySelector('[data-testid="student-transfer-target-class"]'),
                };
            `);
            return transferDialog.targetClass ? transferDialog : false;
        },
    );
    await snapshot("student transfer dialog");

    await runBrowser(["press", "Escape"]);
}

async function testStudentStatusLoginFlow() {
    log("Checking enabled student login");

    await runBrowser(["open", `${baseUrl}/student/login`], {}, studentStatusBrowserSession);
    await runBrowser(["wait", "1000"], {}, studentStatusBrowserSession);

    const login = await browserFetch<ApiEnvelope<{
        user: {
            studentId: string;
            isFirstLogin: number;
        };
    }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: "2024204",
            password: studentEnabledPassword,
        },
    }, studentStatusBrowserSession);
    assert(login.status === 200, `Enabled student login should return 200, got ${login.status}`);
    assert(login.body?.success, "Enabled student login did not return success");
    assert(login.body.data?.user.studentId === "2024204", "Enabled student login returned the wrong student");

    const me = await browserFetch<ApiEnvelope<{
        studentId: string;
        isFirstLogin: number;
    }>>("/api/student/me", undefined, studentStatusBrowserSession);
    assert(me.status === 200, `Enabled student me should return 200, got ${me.status}`);
    assert(me.body?.success, "Enabled student me did not return success");
    assert(me.body.data?.studentId === "2024204", "Enabled student me returned the wrong student");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", {
        method: "POST",
    }, studentStatusBrowserSession);
    assert(logout.status === 200, `Enabled student logout should return 200, got ${logout.status}`);
    assert(logout.body?.success, "Enabled student logout did not return success");
}

async function testStudentDisabledLoginFlow() {
    log("Checking disabled student login");

    const student = (await listStudents({ search: "2024204" })).find((item) => item.studentId === "2024204");
    assert(student, "Student 2024204 was not found for disable login check");

    const disableResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/students/${student.id}/status`, {
        method: "PUT",
        body: {
            status: 0,
        },
    });
    assert(disableResponse.status === 200, `Student disable returned status ${disableResponse.status}`);
    assert(disableResponse.body?.success, "Student disable did not return success");

    const disabledStudent = await waitFor(
        "student 2024204 to disable",
        async () => {
            const item = (await listStudents({ search: "2024204" })).find((candidate) => candidate.studentId === "2024204");
            return item?.status === 0 ? item : false;
        },
    );
    assert(disabledStudent.studentId === "2024204", "Student 2024204 disable verification failed");

    await runBrowser(["open", `${baseUrl}/student/login`], {}, studentStatusBrowserSession);
    await runBrowser(["wait", "1000"], {}, studentStatusBrowserSession);

    const login = await browserFetch<ApiEnvelope<{
        user: {
            studentId: string;
            isFirstLogin: number;
        };
    }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: "2024204",
            password: studentEnabledPassword,
        },
    }, studentStatusBrowserSession);
    assert(login.status === 403, `Disabled student login should return 403, got ${login.status}`);
    assert(login.body?.success === false, "Disabled student login should fail");
    assert(login.body.error?.code === "ACCOUNT_DISABLED", `Expected ACCOUNT_DISABLED, got ${login.body.error?.code ?? "unknown"}`);

    const me = await browserFetch<ApiEnvelope<{ studentId: string }>>("/api/student/me", undefined, studentStatusBrowserSession);
    assert(me.status === 401, `Disabled student me should return 401, got ${me.status}`);
}

async function testStudentResetPasswordFlow() {
    log("Checking student password reset flow");

    await runBrowser(["fill", '[data-testid="student-search-input"]', studentResetAccount]);
    await runBrowser(["click", '[data-testid="student-search-refresh"]']);
    await waitFor(
        `student ${studentResetAccount} row`,
        async () => {
            const state = await browserJson<{ row: boolean; reset: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="student-row-${studentResetAccount}"]'),
                    reset: !!document.querySelector('[data-testid="student-reset-${studentResetAccount}"]'),
                };
            `);
            return state.row && state.reset ? state : false;
        },
    );

    await runBrowser(["click", `[data-testid="student-reset-${studentResetAccount}"]`]);
    await waitFor(
        "student reset confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await runBrowser(["open", `${baseUrl}/student/login`], {}, studentBrowserSession);
    await runBrowser(["wait", "1000"], {}, studentBrowserSession);
    await snapshot("student login page", studentBrowserSession);

    await runBrowser(["fill", '[data-testid="student-login-username"]', studentResetAccount], {}, studentBrowserSession);
    await runBrowser(["fill", '[data-testid="student-login-password"]', studentResetAccount], {}, studentBrowserSession);
    await runBrowser(["click", '[data-testid="student-login-submit"]'], {}, studentBrowserSession);

    await waitForPath("/student", 15000, studentBrowserSession);
    await waitFor(
        "student first-login password dialog",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="student-password-save"]'),
                };
            `, studentBrowserSession);
            return state.submit ? state : false;
        },
        15000,
        300,
    );
    await snapshot("student first-login password dialog", studentBrowserSession);

    await runBrowser(["fill", '[data-testid="student-password-current"]', studentResetAccount], {}, studentBrowserSession);
    await runBrowser(["fill", '[data-testid="student-password-new"]', studentNewPassword], {}, studentBrowserSession);
    await runBrowser(["fill", '[data-testid="student-password-confirm"]', studentNewPassword], {}, studentBrowserSession);
    await runBrowser(["click", '[data-testid="student-password-save"]'], {}, studentBrowserSession);

    await waitFor(
        "student password dialog to close",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="student-password-save"]'),
                };
            `, studentBrowserSession);
            return state.submit ? false : true;
        },
    );

    const me = await browserFetch<ApiEnvelope<{
        studentId: string;
        isFirstLogin: number;
    }>>("/api/student/me", undefined, studentBrowserSession);
    assert(me.status === 200, `Student me returned status ${me.status}`);
    assert(me.body?.success, "Student me did not return success after password change");
    assert(me.body.data?.studentId === studentResetAccount, "Student me returned the wrong student after password change");
    assert(me.body.data?.isFirstLogin === 0, "Student remained in first-login state after password change");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", {
        method: "POST",
    }, studentBrowserSession);
    assert(logout.status === 200, `Student logout returned status ${logout.status}`);
    assert(logout.body?.success, "Student logout did not return success");

    const oldPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            studentId: string;
            isFirstLogin: number;
        };
    }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: studentResetAccount,
            password: studentResetAccount,
        },
    }, studentBrowserSession);
    assert(oldPasswordLogin.status === 401, `Old student password should return 401, got ${oldPasswordLogin.status}`);
    assert(oldPasswordLogin.body?.success === false, "Old student password login should fail");
    assert(oldPasswordLogin.body.error?.code === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${oldPasswordLogin.body.error?.code ?? "unknown"}`);

    const newPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            studentId: string;
            isFirstLogin: number;
        };
    }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: studentResetAccount,
            password: studentNewPassword,
        },
    }, studentBrowserSession);
    assert(newPasswordLogin.status === 200, `New student password should return 200, got ${newPasswordLogin.status}`);
    assert(newPasswordLogin.body?.success, "New student password login did not return success");
    assert(newPasswordLogin.body.data?.user.studentId === studentResetAccount, "New student password login returned the wrong student");
    assert(newPasswordLogin.body.data?.user.isFirstLogin === 0, "Student should not return to first-login after password change");

    const finalLogout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", {
        method: "POST",
    }, studentBrowserSession);
    assert(finalLogout.status === 200, `Student final logout returned status ${finalLogout.status}`);
    assert(finalLogout.body?.success, "Student final logout did not return success");
}

async function testStudentTransferFlow() {
    log("Checking student transfer route protections and success path");

    const students = await listStudents({ search: "2024003" });
    const transferStudent = students.find((item) => item.studentId === "2024003");
    assert(transferStudent, "Student 2024003 was not found");

    const classes = await listClasses();
    const targetClass = classes.find((item) => item.id !== transferStudent.classId && item.semesterName === "2024-2025学年 第一学期");
    assert(targetClass, "Transfer target class was not found");

    const sameClassResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/students/${transferStudent.id}/transfer`, {
        method: "POST",
        body: {
            targetClassId: transferStudent.classId,
            reason: "same-class guard",
        },
    });
    assert(sameClassResponse.status === 400, `Same-class transfer should return 400, got ${sameClassResponse.status}`);
    assert(sameClassResponse.body?.success === false, "Same-class transfer should fail");
    assert(sameClassResponse.body.error?.code === "SAME_CLASS", `Expected SAME_CLASS, got ${sameClassResponse.body.error?.code ?? "unknown"}`);

    const transferResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/students/${transferStudent.id}/transfer`, {
        method: "POST",
        body: {
            targetClassId: targetClass.id,
            reason: "e2e transfer",
        },
    });
    assert(transferResponse.status === 200, `Student transfer returned status ${transferResponse.status}`);
    assert(transferResponse.body?.success, "Student transfer did not return success");

    const updatedStudent = await waitFor(
        "student transfer to persist",
        async () => {
            const item = (await listStudents({ search: "2024003" })).find((student) => student.studentId === "2024003");
            return item?.classId === targetClass.id ? item : false;
        },
    );
    assert(updatedStudent.className === targetClass.name, `Expected transferred student class name ${targetClass.name}, got ${updatedStudent.className}`);
}

async function testClassPage() {
    log("Checking class create/edit/delete flow");

    const ownerTeacher = (await listTeachers("teacher")).find((item) => item.employeeId === "teacher");
    assert(ownerTeacher, "Owner teacher fixture was not found for class creation");
    const reassignedTeacher = (await listTeachers(teacherEmployeeId)).find((item) => item.employeeId === teacherEmployeeId);
    assert(reassignedTeacher, `Reassignment teacher ${teacherEmployeeId} was not found for class edit`);

    const targetSemester = (await listSemesters()).find((item) => item.name === "2024-2025学年 第二学期");
    assert(targetSemester, "Target semester fixture was not found for class creation");

    const createResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/classes", {
        method: "POST",
        body: {
            name: className,
            semesterId: targetSemester.id,
            teacherId: ownerTeacher.id,
        },
    });
    assert(createResponse.status === 201, `Class create returned status ${createResponse.status}`);
    assert(createResponse.body?.success, "Class create did not return success");

    const createdClass = await waitFor(
        "created class to appear in API",
        async () => (await listClasses()).find((item) => item.name === className) ?? false,
    );

    await runBrowser(["click", '[data-testid="admin-nav-class"]']);
    await waitForPath("/admin/class");
    await runBrowser(["wait", "700"]);
    await snapshot("class page");

    const classState = await browserJson<{
        row: boolean;
        edit: boolean;
        deleteButton: boolean;
        filterSemester: boolean;
        filterTeacher: boolean;
    }>(`
        return {
            row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
            edit: !!document.querySelector('[data-testid="class-edit-open-${createdClass.id}"]'),
            deleteButton: !!document.querySelector('[data-testid="class-delete-${createdClass.id}"]'),
            filterSemester: !!document.querySelector('[data-testid="class-filter-semester"]'),
            filterTeacher: !!document.querySelector('[data-testid="class-filter-teacher"]'),
        };
    `);
    assert(classState.row, "Created class row is missing");
    assert(classState.edit, "Created class edit action is missing");
    assert(classState.deleteButton, "Created class delete action is missing");
    assert(classState.filterSemester, "Class semester filter is missing");
    assert(classState.filterTeacher, "Class teacher filter is missing");

    await runBrowser(["fill", '[data-testid="class-search-input"]', className]);
    await waitFor(
        "created class to remain visible under search",
        async () => {
            const state = await browserJson<{ row: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
                };
            `);
            return state.row ? state : false;
        },
    );

    await runBrowser(["click", `[data-testid="class-edit-open-${createdClass.id}"]`]);
    await waitFor(
        "class edit dialog",
        async () => {
            const dialogState = await browserJson<{ input: boolean }>(`
                return {
                    input: !!document.querySelector('[data-testid="class-edit-name"]'),
                };
            `);
            return dialogState.input ? dialogState : false;
        },
    );
    await runBrowser(["fill", '[data-testid="class-edit-name"]', classEditedName]);
    await runBrowser(["click", '[data-testid="class-edit-submit"]']);

    await waitFor(
        "class name update",
        async () => {
            const updated = (await listClasses()).find((item) => item.id === createdClass.id);
            return updated?.name === classEditedName ? updated : false;
        },
    );

    const reassignResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/classes/${createdClass.id}`, {
        method: "PUT",
        body: {
            teacherId: reassignedTeacher.id,
        },
    });
    assert(reassignResponse.status === 200, `Class teacher reassignment returned status ${reassignResponse.status}`);
    assert(reassignResponse.body?.success, "Class teacher reassignment did not return success");

    const updatedClass = await waitFor(
        "class teacher reassignment",
        async () => {
            const updated = (await listClasses()).find((item) => item.id === createdClass.id);
            return updated?.teacherId === reassignedTeacher.id ? updated : false;
        },
    );
    assert(updatedClass.teacherName === teacherEditedName, "Class teacher name did not reflect the reassigned teacher");

    await runBrowser(["fill", '[data-testid="class-search-input"]', classEditedName]);
    await selectOptionByText('[data-testid="class-filter-teacher"]', ownerTeacher.name);
    await waitFor(
        "class to disappear under previous teacher filter",
        async () => {
            const state = await browserJson<{ row: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
                };
            `);
            return state.row ? false : true;
        },
    );

    await selectOptionByText('[data-testid="class-filter-teacher"]', teacherEditedName);
    await waitFor(
        "class to appear under reassigned teacher filter",
        async () => {
            const state = await browserJson<{ row: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
                };
            `);
            return state.row ? state : false;
        },
    );

    await selectOptionByText('[data-testid="class-filter-semester"]', targetSemester.name);
    await waitFor(
        "class to remain visible under semester filter",
        async () => {
            const state = await browserJson<{ row: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
                };
            `);
            return state.row ? state : false;
        },
    );

    await selectOptionByText('[data-testid="class-filter-semester"]', "全部学期");
    await selectOptionByText('[data-testid="class-filter-teacher"]', "全部教师");
    await runBrowser(["fill", '[data-testid="class-search-input"]', ""]);
    await waitFor(
        "class row to remain available after clearing filters",
        async () => {
            const state = await browserJson<{ row: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${createdClass.id}"]'),
                };
            `);
            return state.row ? state : false;
        },
    );

    await runBrowser(["click", `[data-testid="class-delete-${createdClass.id}"]`]);
    await waitFor(
        "class delete confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await waitFor(
        "class to be deleted",
        async () => ((await listClasses()).some((item) => item.id === createdClass.id) ? false : true),
    );
}

async function testClassDeleteSoftDeletesStudents() {
    log("Checking class delete soft-deletes enrolled students");

    let classCandidate: ClassSummary | null = null;
    let deletedStudent: StudentSummary | null = null;
    const classCandidates = (await listClasses()).filter((item) => item.studentCount > 0);
    for (const candidate of classCandidates) {
        const enrolledStudents = await listStudents({ classId: String(candidate.id) });
        const matchedStudent = enrolledStudents.find((item) =>
            item.status === 1
            && item.studentId !== "2024204"
            && item.studentId !== "2024014"
            && item.studentId !== "2024003"
            && item.studentId !== studentResetAccount,
        );
        if (matchedStudent) {
            classCandidate = candidate;
            deletedStudent = matchedStudent;
            break;
        }
    }

    assert(classCandidate, "Fixture class with a deletable active student was not found");
    assert(deletedStudent, "Active fixture student for class delete was not found");

    await runBrowser(["click", '[data-testid="admin-nav-class"]']);
    await waitForPath("/admin/class");
    await runBrowser(["wait", "700"]);

    await waitFor(
        `fixture class ${classCandidate.id} row`,
        async () => {
            const state = await browserJson<{ row: boolean; deleteButton: boolean }>(`
                return {
                    row: !!document.querySelector('[data-testid="class-row-${classCandidate.id}"]'),
                    deleteButton: !!document.querySelector('[data-testid="class-delete-${classCandidate.id}"]'),
                };
            `);
            return state.row && state.deleteButton ? state : false;
        },
    );
    await snapshot("fixture class delete target");

    await runBrowser(["click", `[data-testid="class-delete-${classCandidate.id}"]`]);
    await waitFor(
        "fixture class delete confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await waitFor(
        "fixture class to be deleted",
        async () => ((await listClasses()).some((item) => item.id === classCandidate.id) ? false : true),
    );

    const classStudentsAfterDelete = await listStudents({ classId: String(classCandidate.id) });
    assert(classStudentsAfterDelete.length === 0, "Deleted class should no longer return enrolled students");

    const deletedStudentLookup = await listStudents({ search: deletedStudent.studentId });
    assert(
        !deletedStudentLookup.some((item) => item.studentId === deletedStudent.studentId),
        `Deleted class student ${deletedStudent.studentId} should disappear from admin student list`,
    );

    await runBrowser(["open", `${baseUrl}/student/login`], {}, deletedStudentBrowserSession);
    await runBrowser(["wait", "1000"], {}, deletedStudentBrowserSession);

    const deletedStudentLogin = await browserFetch<ApiEnvelope<{
        user: {
            studentId: string;
            isFirstLogin: number;
        };
    }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: deletedStudent.studentId,
            password: deletedClassStudentPassword,
        },
    }, deletedStudentBrowserSession);
    assert(deletedStudentLogin.status === 403, `Deleted class student login should return 403, got ${deletedStudentLogin.status}`);
    assert(deletedStudentLogin.body?.success === false, "Deleted class student login should fail");
    assert(
        deletedStudentLogin.body.error?.code === "ACCOUNT_DISABLED",
        `Expected ACCOUNT_DISABLED for deleted class student, got ${deletedStudentLogin.body.error?.code ?? "unknown"}`,
    );

    const deletedStudentMe = await browserFetch<ApiEnvelope<{ studentId: string }>>("/api/student/me", undefined, deletedStudentBrowserSession);
    assert(deletedStudentMe.status === 401, `Deleted class student me should return 401, got ${deletedStudentMe.status}`);
}

async function testAnnouncementPage() {
    log("Checking announcement create/publish/delete flow");

    await runBrowser(["open", `${baseUrl}/admin/announcement`]);
    await waitForPath("/admin/announcement");
    await runBrowser(["wait", "700"]);
    await snapshot("announcement page");

    await runBrowser(["click", '[data-testid="announcement-create-open"]']);
    await waitFor(
        "announcement create dialog",
        async () => {
            const dialogState = await browserJson<{ title: boolean; editor: boolean }>(`
                return {
                    title: !!document.querySelector('[data-testid="announcement-create-title"]'),
                    editor: !!document.querySelector('[data-testid="announcement-create-content"] [contenteditable="true"]'),
                };
            `);
            return dialogState.title && dialogState.editor ? dialogState : false;
        },
    );

    await runBrowser(["fill", '[data-testid="announcement-create-title"]', announcementTitle]);
    const editorUpdate = await browserJson<{ ok: boolean }>(`
        const editor = document.querySelector('[data-testid="announcement-create-content"] [contenteditable="true"]');
        if (!editor) {
            return { ok: false };
        }
        editor.innerHTML = "<p>${announcementContent}</p>";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(announcementContent)} }));
        return { ok: true };
    `);
    assert(editorUpdate.ok, "Announcement rich text editor was not found");

    await runBrowser(["click", '[data-testid="announcement-create-draft"]']);

    const createdAnnouncement = await waitFor(
        "announcement draft to be created",
        async () => (await listAnnouncements()).find((item) => item.title === announcementTitle) ?? false,
    );
    assert(createdAnnouncement.status === 0, "Announcement draft was not created as draft");

    await runBrowser(["click", `[data-testid="announcement-edit-open-${createdAnnouncement.id}"]`]);
    await waitFor(
        "announcement edit dialog",
        async () => {
            const dialogState = await browserJson<{ title: boolean; editor: boolean }>(`
                return {
                    title: !!document.querySelector('[data-testid="announcement-edit-title"]'),
                    editor: !!document.querySelector('[data-testid="announcement-edit-content"] [contenteditable="true"]'),
                };
            `);
            return dialogState.title && dialogState.editor ? dialogState : false;
        },
    );
    await runBrowser(["fill", '[data-testid="announcement-edit-title"]', announcementEditedTitle]);
    const editEditorUpdate = await browserJson<{ ok: boolean }>(`
        const editor = document.querySelector('[data-testid="announcement-edit-content"] [contenteditable="true"]');
        if (!editor) {
            return { ok: false };
        }
        editor.innerHTML = "<p>${announcementEditedContent}</p>";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(announcementEditedContent)} }));
        return { ok: true };
    `);
    assert(editEditorUpdate.ok, "Announcement edit rich text editor was not found");
    await runBrowser(["click", '[data-testid="announcement-edit-submit"]']);

    const updatedAnnouncement = await waitFor(
        "announcement edit to persist",
        async () => {
            const announcement = (await listAnnouncements()).find((item) => item.id === createdAnnouncement.id);
            return announcement?.title === announcementEditedTitle ? announcement : false;
        },
    );
    assert(updatedAnnouncement.content.includes(announcementEditedContent), "Announcement content update was not persisted");

    const draftStatsResponse = await browserFetch<ApiEnvelope<{
        readCount: number;
        totalCount: number;
        readRate: number;
        byRole: Array<{ role: string; readCount: number; totalCount: number }>;
    }>>(`/api/admin/announcements/${createdAnnouncement.id}/stats`);
    assert(draftStatsResponse.status === 400, `Draft announcement stats should return 400, got ${draftStatsResponse.status}`);
    assert(draftStatsResponse.body?.success === false, "Draft announcement stats should fail");
    assert(
        draftStatsResponse.body.error?.code === "ANNOUNCEMENT_NOT_PUBLISHED",
        `Expected ANNOUNCEMENT_NOT_PUBLISHED, got ${draftStatsResponse.body.error?.code ?? "unknown"}`,
    );

    await snapshot("announcement draft created");

    const draftState = await browserJson<{ statsDisabled: boolean }>(`
        const button = document.querySelector('[data-testid="announcement-stats-${createdAnnouncement.id}"]');
        return {
            statsDisabled: button instanceof HTMLButtonElement ? button.disabled : false,
        };
    `);
    assert(draftState.statsDisabled, "Draft announcement stats button should be disabled");

    await runBrowser(["click", `[data-testid="announcement-toggle-publish-${createdAnnouncement.id}"]`]);
    await waitFor(
        "announcement publish confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const publishedAnnouncement = await waitFor(
        "announcement to be published",
        async () => {
            const item = (await listAnnouncements()).find((announcement) => announcement.id === createdAnnouncement.id);
            return item?.status === 1 ? item : false;
        },
    );
    assert(publishedAnnouncement.status === 1, "Announcement was not published");

    await runBrowser(["click", `[data-testid="announcement-stats-${createdAnnouncement.id}"]`]);
    await waitFor(
        "announcement stats dialog",
        async () => {
            const dialogState = await browserJson<{ close: boolean }>(`
                return {
                    close: !!document.querySelector('[data-testid="announcement-stats-close"]'),
                };
            `);
            return dialogState.close ? dialogState : false;
        },
    );
    await snapshot("announcement stats dialog");

    const statsResponse = await browserFetch<ApiEnvelope<{
        readCount: number;
        totalCount: number;
        readRate: number;
        byRole: Array<{ role: string; readCount: number; totalCount: number }>;
    }>>(`/api/admin/announcements/${createdAnnouncement.id}/stats`);
    assert(statsResponse.status === 200, `Announcement stats returned status ${statsResponse.status}`);
    assert(statsResponse.body?.success, "Announcement stats did not return success");
    assert((statsResponse.body.data?.totalCount ?? 0) > 0, "Published announcement stats totalCount should be positive");

    await runBrowser(["click", '[data-testid="announcement-stats-close"]']);

    await runBrowser(["click", `[data-testid="announcement-toggle-publish-${createdAnnouncement.id}"]`]);
    await waitFor(
        "announcement unpublish confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    const unpublishedAnnouncement = await waitFor(
        "announcement to be unpublished",
        async () => {
            const item = (await listAnnouncements()).find((announcement) => announcement.id === createdAnnouncement.id);
            return item?.status === 0 ? item : false;
        },
    );
    assert(unpublishedAnnouncement.status === 0, "Announcement was not unpublished");

    const unpublishedState = await browserJson<{ statsDisabled: boolean }>(`
        const button = document.querySelector('[data-testid="announcement-stats-${createdAnnouncement.id}"]');
        return {
            statsDisabled: button instanceof HTMLButtonElement ? button.disabled : false,
        };
    `);
    assert(unpublishedState.statsDisabled, "Unpublished announcement stats button should be disabled");

    const unpublishedStatsResponse = await browserFetch<ApiEnvelope<{
        readCount: number;
        totalCount: number;
        readRate: number;
    }>>(`/api/admin/announcements/${createdAnnouncement.id}/stats`);
    assert(unpublishedStatsResponse.status === 400, `Unpublished announcement stats should return 400, got ${unpublishedStatsResponse.status}`);
    assert(unpublishedStatsResponse.body?.success === false, "Unpublished announcement stats should fail");
    assert(
        unpublishedStatsResponse.body.error?.code === "ANNOUNCEMENT_NOT_PUBLISHED",
        `Expected ANNOUNCEMENT_NOT_PUBLISHED after unpublish, got ${unpublishedStatsResponse.body.error?.code ?? "unknown"}`,
    );

    await runBrowser(["click", `[data-testid="announcement-delete-${createdAnnouncement.id}"]`]);
    await waitFor(
        "announcement delete confirmation dialog",
        async () => {
            const dialogState = await browserJson<{ action: boolean }>(`
                return {
                    action: !!document.querySelector('[data-testid="confirm-dialog-action"]'),
                };
            `);
            return dialogState.action ? dialogState : false;
        },
    );
    await runBrowser(["click", '[data-testid="confirm-dialog-action"]']);

    await waitFor(
        "announcement to be deleted",
        async () => ((await listAnnouncements()).some((item) => item.id === createdAnnouncement.id) ? false : true),
    );
}

async function testAnnouncementAssistantScopeStats() {
    log("Checking announcement assistant-scope stats");

    await cleanupAnnouncementByTitle(announcementAssistantTitle);

    const expectedAssistantCount = (await listAssistants()).filter((assistant) => assistant.status === 1).length;
    assert(expectedAssistantCount > 0, "Expected at least one active assistant for scoped announcement stats");

    const createResponse = await browserFetch<ApiEnvelope<{ id: number }>>("/api/admin/announcements", {
        method: "POST",
        body: {
            title: announcementAssistantTitle,
            content: `<p>${announcementAssistantContent}</p>`,
            publish: true,
            targetScope: "assistant",
        },
    });
    assert(createResponse.status === 201, `Assistant announcement create returned status ${createResponse.status}`);
    assert(createResponse.body?.success, "Assistant announcement create did not return success");

    const scopedAnnouncement = await waitFor(
        `assistant announcement ${announcementAssistantTitle} to be created`,
        async () => (await listAnnouncements()).find((announcement) => announcement.title === announcementAssistantTitle) ?? false,
    );
    assert(scopedAnnouncement.status === 1, "Assistant announcement should be published immediately");
    assert(scopedAnnouncement.targetScope === "assistant", "Assistant announcement target scope should be assistant");

    const statsResponse = await browserFetch<ApiEnvelope<{
        readCount: number;
        totalCount: number;
        readRate: number;
        byRole: Array<{ role: string; readCount: number; totalCount: number }>;
    }>>(`/api/admin/announcements/${scopedAnnouncement.id}/stats`);
    assert(statsResponse.status === 200, `Assistant announcement stats returned status ${statsResponse.status}`);
    assert(statsResponse.body?.success, "Assistant announcement stats did not return success");
    assert(statsResponse.body.data?.totalCount === expectedAssistantCount, `Expected assistant-scope totalCount ${expectedAssistantCount}, got ${statsResponse.body.data?.totalCount ?? "unknown"}`);
    assert(statsResponse.body.data?.readCount === 0, "New assistant announcement should have 0 reads");
    assert(statsResponse.body.data?.readRate === 0, "New assistant announcement should start with 0% read rate");
    assert((statsResponse.body.data?.byRole ?? []).length === 1, "Assistant announcement stats should only include one role");
    assert(statsResponse.body.data?.byRole[0]?.role === "助教", `Expected only assistant role, got ${statsResponse.body.data?.byRole[0]?.role ?? "unknown"}`);
    assert(statsResponse.body.data?.byRole[0]?.totalCount === expectedAssistantCount, "Assistant role totalCount did not match expected active assistants");

    const deleteResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/admin/announcements/${scopedAnnouncement.id}`, {
        method: "DELETE",
    });
    assert(deleteResponse.status === 200, `Assistant announcement delete returned status ${deleteResponse.status}`);
    assert(deleteResponse.body?.success, "Assistant announcement delete did not return success");

    await waitFor(
        "assistant-scope announcement to be deleted",
        async () => ((await listAnnouncements()).some((item) => item.id === scopedAnnouncement.id) ? false : true),
    );
}

async function testSettingsPage() {
    log("Checking settings page");

    await runBrowser(["click", '[data-testid="admin-nav-settings"]']);
    await waitForPath("/admin/settings");
    await runBrowser(["wait", "700"]);
    await snapshot("settings page");

    await clickButtonByText("安全设置");
    await runBrowser(["wait", "400"]);
    await snapshot("settings security");

    const securityState = await browserJson<{ changePassword: boolean }>(`
        return {
            changePassword: !!document.querySelector('[data-testid="settings-change-password-open"]'),
        };
    `);
    assert(securityState.changePassword, "Settings change-password entry is missing");

    await runBrowser(["fill", '[data-testid="settings-max-login-attempts"]', String(settingsMaxLoginAttempts)]);
    await runBrowser(["fill", '[data-testid="settings-lock-duration"]', String(settingsLockDuration)]);
    await runBrowser(["click", '[data-testid="settings-save"]']);

    const settingsAfterSave = await waitFor(
        "settings save to persist",
        async () => {
            const settings = await getSettings();
            return settings["login.max_fail_count"] === settingsMaxLoginAttempts
                && settings["login.lock_duration_minutes"] === settingsLockDuration
                ? settings
                : false;
        },
    );
    assert(settingsAfterSave["login.max_fail_count"] === settingsMaxLoginAttempts, "Settings max login attempts was not saved");
    assert(settingsAfterSave["login.lock_duration_minutes"] === settingsLockDuration, "Settings lock duration was not saved");

    await clickButtonByText("备份恢复");
    await runBrowser(["wait", "400"]);
    await snapshot("settings backup");

    const backupSection = await browserJson<{
        createBackup: boolean;
        openRestore: boolean;
    }>(`
        return {
            createBackup: !!document.querySelector('[data-testid="settings-backup-create"]'),
            openRestore: !!document.querySelector('[data-testid="settings-backup-restore-open"]'),
        };
    `);

    assert(backupSection.createBackup, "Settings backup create button is missing");
    assert(backupSection.openRestore, "Settings backup restore opener is missing");

    const existingBackupIds = new Set((await listBackups()).map((item) => item.backupId));
    await runBrowser(["click", '[data-testid="settings-backup-create"]']);

    const createdBackup = await waitFor(
        "new backup to be created",
        async () => {
            const items = await listBackups();
            return items.find((item) => !existingBackupIds.has(item.backupId) && item.hasZip) ?? false;
        },
        20000,
        500,
    );
    try {
        assert(createdBackup.backupId.startsWith("backup_"), `Expected backup id to start with backup_, got ${createdBackup.backupId}`);
        await runCommand(["stat", `${projectRoot}/backups/${createdBackup.backupId}.sql`]);
        await runCommand(["stat", `${projectRoot}/backups/${createdBackup.backupId}.zip`]);

        await runBrowser(["click", '[data-testid="settings-backup-restore-open"]']);
        await waitFor(
            "backup restore dialog",
            async () => {
                const restoreState = await browserJson<{
                    select: boolean;
                    password: boolean;
                    confirmPassword: boolean;
                    submit: boolean;
                }>(`
                    return {
                        select: !!document.querySelector('[data-testid="settings-backup-restore-select"]'),
                        password: !!document.querySelector('[data-testid="settings-backup-restore-password"]'),
                        confirmPassword: !!document.querySelector('[data-testid="settings-backup-restore-confirm-password"]'),
                        submit: !!document.querySelector('[data-testid="settings-backup-restore-submit"]'),
                    };
                `);
                return restoreState.select && restoreState.password && restoreState.confirmPassword && restoreState.submit
                    ? restoreState
                    : false;
            },
        );
        await snapshot("settings backup restore dialog");

        const restoreDialogState = await browserJson<{ includesBackup: boolean }>(`
            const dialog = document.querySelector('[role="dialog"]');
            const text = dialog?.textContent ?? "";
            return {
                includesBackup: text.includes(${JSON.stringify(createdBackup.backupId)}),
            };
        `);
        assert(restoreDialogState.includesBackup, "Restore dialog should include the most recently created backup id");

        await runBrowser(["click", '[data-testid="settings-backup-restore-submit"]']);
        await waitFor(
            "restore dialog frontend validation",
            async () => {
                const state = await browserJson<{ errorText: string | null }>(`
                    const dialog = document.querySelector('[role="dialog"]');
                    const error = dialog?.querySelector(".text-rose-600");
                    return {
                        errorText: error?.textContent?.trim() ?? null,
                    };
                `);
                return state.errorText === "请输入备份ID" || state.errorText === "请输入管理员密码确认"
                    ? state
                    : false;
            },
        );

        const invalidRestoreResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>("/api/admin/restore", {
            method: "POST",
            body: {
                backupId: "bad id!",
                password: adminPassword,
                confirmPassword: adminPassword,
            },
        });
        assert(invalidRestoreResponse.status === 400, `Invalid restore backupId should return 400, got ${invalidRestoreResponse.status}`);
        assert(invalidRestoreResponse.body?.success === false, "Invalid restore backupId should fail");
        assert(
            invalidRestoreResponse.body.error?.code === "INVALID_ID",
            `Expected INVALID_ID, got ${invalidRestoreResponse.body.error?.code ?? "unknown"}`,
        );

        await runBrowser(["press", "Escape"]);
    } finally {
        await cleanupBackupArtifacts(createdBackup.backupId);
    }
}

async function testAdminChangePasswordFlow() {
    log("Checking admin change-password flow");

    await runBrowser(["click", '[data-testid="admin-nav-settings"]']);
    await waitForPath("/admin/settings");
    await runBrowser(["wait", "700"]);

    await clickButtonByText("安全设置");
    await runBrowser(["wait", "400"]);
    await waitFor(
        "settings change-password entry",
        async () => {
            const state = await browserJson<{ open: boolean }>(`
                return {
                    open: !!document.querySelector('[data-testid="settings-change-password-open"]'),
                };
            `);
            return state.open ? state : false;
        },
    );

    await runBrowser(["click", '[data-testid="settings-change-password-open"]']);
    await waitFor(
        "admin change-password dialog",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="settings-change-password-submit"]'),
                };
            `);
            return state.submit ? state : false;
        },
    );
    await snapshot("admin change-password dialog");

    await runBrowser(["fill", '[data-testid="settings-change-password-current"]', adminPassword]);
    await runBrowser(["fill", '[data-testid="settings-change-password-new"]', adminNewPassword]);
    await runBrowser(["fill", '[data-testid="settings-change-password-confirm"]', adminNewPassword]);
    await runBrowser(["click", '[data-testid="settings-change-password-submit"]']);

    await waitFor(
        "admin change-password dialog to close",
        async () => {
            const state = await browserJson<{ submit: boolean }>(`
                return {
                    submit: !!document.querySelector('[data-testid="settings-change-password-submit"]'),
                };
            `);
            return state.submit ? false : true;
        },
    );

    const me = await browserFetch<ApiEnvelope<{ username: string; isFirstLogin: number }>>("/api/admin/me");
    assert(me.status === 200, `Admin me returned status ${me.status} after password change`);
    assert(me.body?.success, "Admin me did not return success after password change");
    assert(me.body.data?.username === adminUsername, "Admin me returned wrong user after password change");
    assert(me.body.data?.isFirstLogin === 0, "Admin should not enter first-login state after self password change");

    const logout = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/admin/logout", {
        method: "POST",
    });
    assert(logout.status === 200, `Admin logout returned status ${logout.status}`);
    assert(logout.body?.success, "Admin logout did not return success");

    const oldPasswordLogin = await browserFetch<ApiEnvelope<{ user: { username: string } }>>("/api/admin/login", {
        method: "POST",
        body: {
            username: adminUsername,
            password: adminPassword,
        },
    });
    assert(oldPasswordLogin.status === 401, `Old admin password should return 401, got ${oldPasswordLogin.status}`);
    assert(oldPasswordLogin.body?.success === false, "Old admin password login should fail");
    assert(oldPasswordLogin.body.error?.code === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${oldPasswordLogin.body.error?.code ?? "unknown"}`);

    const newPasswordLogin = await browserFetch<ApiEnvelope<{
        user: {
            username: string;
            isFirstLogin: number;
        };
    }>>("/api/admin/login", {
        method: "POST",
        body: {
            username: adminUsername,
            password: adminNewPassword,
        },
    });
    assert(newPasswordLogin.status === 200, `New admin password should return 200, got ${newPasswordLogin.status}`);
    assert(newPasswordLogin.body?.success, "New admin password login did not return success");
    assert(newPasswordLogin.body.data?.user.username === adminUsername, "New admin password login returned wrong user");
    assert(newPasswordLogin.body.data?.user.isFirstLogin === 0, "Admin should not return to first-login after self password change");

    const reloginMe = await browserFetch<ApiEnvelope<{ username: string }>>("/api/admin/me");
    assert(reloginMe.status === 200, `Admin me after re-login should return 200, got ${reloginMe.status}`);
    assert(reloginMe.body?.success, "Admin me after re-login did not return success");
    assert(reloginMe.body.data?.username === adminUsername, "Admin me after re-login returned wrong user");
}

async function testAdminUiLogoutFlow() {
    log("Checking admin UI logout flow");

    await runBrowser(["click", '[data-testid="admin-logout-trigger"]']);
    await waitFor(
        "admin logout confirmation dialog",
        async () => {
            const state = await browserJson<{ title: boolean }>(`
                const text = document.body.textContent ?? "";
                return {
                    title: text.includes("确认退出登录?"),
                };
            `);
            return state.title ? state : false;
        },
    );
    await clickButtonByText("退出");
    await waitForPath("/admin/login", 15000);

    const me = await browserFetch<ApiEnvelope<{ username: string }>>("/api/admin/me");
    assert(me.status === 401, `Admin me after UI logout should return 401, got ${me.status}`);
    assert(me.body?.success === false, "Admin me after UI logout should fail");
    assert(me.body.error?.code === "UNAUTHORIZED", `Expected UNAUTHORIZED after UI logout, got ${me.body.error?.code ?? "unknown"}`);
}

async function main() {
    log(
        `Using browser sessions ${adminBrowserSession} / ${adminKickedBrowserSession} / ${teacherBrowserSession} / ${teacherStatusBrowserSession} / ${assistantBrowserSession} / ${studentBrowserSession} / ${studentStatusBrowserSession} / ${deletedStudentBrowserSession}`,
    );
    await ensureTooling();

    try {
        await resetDatabase();
        await startServer();
        await loginAsAdmin();
        await testDashboardPage();
        await testMonitorPage();
        await testNotifications();
        await testSemesterCrud();
        await testSemesterProtection();
        await testSemesterHasClassesProtection();
        await testTeacherPage();
        await testTeacherCrudFlow();
        await testTeacherStatusLoginFlow();
        await testTeacherDisabledLoginFlow();
        await testTeacherResetPasswordFlow();
        await testAssistantPage();
        await testAssistantDisabledLoginFlow();
        await testAssistantResetPasswordFlow();
        await testStudentPage();
        await testStudentStatusLoginFlow();
        await testStudentDisabledLoginFlow();
        await testStudentResetPasswordFlow();
        await testStudentTransferFlow();
        await testClassPage();
        await testAnnouncementPage();
        await testAnnouncementAssistantScopeStats();
        await testClassDeleteSoftDeletesStudents();
        await testSettingsPage();
        await testAdminSingleSessionKickFlow();
        await testBackupRestoreFlow();
        await testAdminChangePasswordFlow();
        await testAdminUiLogoutFlow();
        log("Admin smoke e2e passed");
    } finally {
        await closeBrowser(adminBrowserSession);
        await closeBrowser(adminKickedBrowserSession);
        await closeBrowser(teacherBrowserSession);
        await closeBrowser(teacherStatusBrowserSession);
        await closeBrowser(assistantBrowserSession);
        await closeBrowser(assistantResetBrowserSession);
        await closeBrowser(studentBrowserSession);
        await closeBrowser(studentStatusBrowserSession);
        await closeBrowser(deletedStudentBrowserSession);
        await stopServer();
        await reseedDatabase();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin-e2e] FAILED: ${message}`);
    process.exitCode = 1;
});
