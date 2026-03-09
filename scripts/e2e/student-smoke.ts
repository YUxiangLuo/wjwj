import { setTimeout as delay } from "node:timers/promises";
import { mkdir, rm } from "node:fs/promises";

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

type StudentUser = {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
    isFirstLogin: number;
    sessionExpiresAt?: string | null;
};

type StudentTask = {
    id: number;
    topicId: number;
    name: string;
    description: string | null;
    publishedAt: string;
    deadline: string | null;
    status: "not_started" | "in_progress" | "submitted" | "grading" | "graded" | "rejected";
    progress: number;
    currentStage: number;
    score?: number;
    rejectReason?: string;
};

type TaskDetailResponse = StudentTask & {
    populationSize: number;
    attachments: Array<{
        id: number;
        name: string;
        type: string;
        size: number;
    }>;
};

type SubmissionSummary = {
    id: number;
    submittedAt: string;
    status: number;
    totalScore: number | null;
    gradedAt: string | null;
    graderName: string | null;
    rejectReason: string | null;
};

type SubmissionDetail = {
    id: number;
    taskId: number;
    topicId: number;
    topicName: string;
    submittedAt: string;
    status: number;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason: string | null;
    gradedAt: string | null;
    graderName: string | null;
    questionnairePdfPath: string | null;
    reportPdfPath: string | null;
    pdfStatus: "pending" | "generating" | "ready" | "failed";
    pdfStatusMessage: string | null;
    weights: {
        questionnaire: number;
        process: number;
        report: number;
    };
};

type ExperimentData = {
    id: number;
    taskId: number;
    currentStage: number;
    status: number;
    questionnaire: unknown;
    samplePlan: unknown;
    samplingResults: unknown;
    reportContent: string | null;
    lastSavedAt: string | null;
    populationSize: number;
};

type StudentNotification = {
    id: number;
    type: string;
    title: string;
    content: string;
    isRead: number;
    createdAt: string;
    relatedType: string | null;
    relatedId: number | null;
};

type NotificationsPayload = {
    notifications: StudentNotification[];
    unreadCount: number;
};

type Announcement = {
    id: number;
    title: string;
    content: string;
    createdAt: string;
    isRead: boolean;
};

type FetchMeta = {
    status: number;
    ok: boolean;
    contentType: string | null;
    size: number;
};

const projectRoot = process.cwd();
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const runId = Date.now().toString().slice(-6);
const shouldResetDb = process.env.E2E_SKIP_DB_RESET !== "1";
const shouldReseedDb = process.env.E2E_SKIP_DB_RESEED !== "1";
const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === "1";
const downloadDir = `${projectRoot}/tmp/student-e2e-${runId}`;

const mainSession = process.env.E2E_STUDENT_MAIN_SESSION ?? `student-main-e2e-${runId}`;
const firstLoginSession = process.env.E2E_STUDENT_FIRST_SESSION ?? `student-first-e2e-${runId}`;
const rejectedSession = process.env.E2E_STUDENT_REJECTED_SESSION ?? `student-rejected-e2e-${runId}`;
const submitSession = process.env.E2E_STUDENT_SUBMIT_SESSION ?? `student-submit-e2e-${runId}`;
const questionnaireSession = process.env.E2E_STUDENT_QUESTIONNAIRE_SESSION ?? `student-questionnaire-e2e-${runId}`;
const samplePlanSession = process.env.E2E_STUDENT_SAMPLE_PLAN_SESSION ?? `student-sample-plan-e2e-${runId}`;
const samplingSession = process.env.E2E_STUDENT_SAMPLING_SESSION ?? `student-sampling-e2e-${runId}`;
const notificationSession = process.env.E2E_STUDENT_NOTIFICATION_SESSION ?? `student-notification-e2e-${runId}`;
const gradedSession = process.env.E2E_STUDENT_GRADED_SESSION ?? `student-graded-e2e-${runId}`;
const passwordSession = process.env.E2E_STUDENT_PASSWORD_SESSION ?? `student-password-e2e-${runId}`;
const devicePrimarySession = process.env.E2E_STUDENT_DEVICE_PRIMARY_SESSION ?? `student-device-primary-e2e-${runId}`;
const deviceSecondarySession = process.env.E2E_STUDENT_DEVICE_SECONDARY_SESSION ?? `student-device-secondary-e2e-${runId}`;
const invalidSession = process.env.E2E_STUDENT_INVALID_SESSION ?? `student-invalid-e2e-${runId}`;
const lockedSession = process.env.E2E_STUDENT_LOCKED_SESSION ?? `student-locked-e2e-${runId}`;
const disabledSession = process.env.E2E_STUDENT_DISABLED_SESSION ?? `student-disabled-e2e-${runId}`;

const normalStudentId = process.env.E2E_STUDENT_MAIN_ID ?? "2024001";
const normalStudentPassword = process.env.E2E_STUDENT_MAIN_PASSWORD ?? "123456";
const firstLoginStudentId = process.env.E2E_STUDENT_FIRST_ID ?? "2024013";
const firstLoginStudentPassword = process.env.E2E_STUDENT_FIRST_PASSWORD ?? "123456";
const firstLoginNewPassword = process.env.E2E_STUDENT_FIRST_NEW_PASSWORD ?? `StudentFirst#${runId}Aa!`;
const rejectedStudentId = process.env.E2E_STUDENT_REJECTED_ID ?? "2024003";
const rejectedStudentPassword = process.env.E2E_STUDENT_REJECTED_PASSWORD ?? "123456";
const stageFourStudentId = process.env.E2E_STUDENT_SUBMIT_ID ?? "2024006";
const stageFourStudentPassword = process.env.E2E_STUDENT_SUBMIT_PASSWORD ?? "123456";
const questionnaireStudentId = process.env.E2E_STUDENT_QUESTIONNAIRE_ID ?? "2024001";
const questionnaireStudentPassword = process.env.E2E_STUDENT_QUESTIONNAIRE_PASSWORD ?? "123456";
const samplePlanStudentId = process.env.E2E_STUDENT_SAMPLE_PLAN_ID ?? "2024004";
const samplePlanStudentPassword = process.env.E2E_STUDENT_SAMPLE_PLAN_PASSWORD ?? "123456";
const samplingStudentId = process.env.E2E_STUDENT_SAMPLING_ID ?? "2024005";
const samplingStudentPassword = process.env.E2E_STUDENT_SAMPLING_PASSWORD ?? "123456";
const notificationStudentId = process.env.E2E_STUDENT_NOTIFICATION_ID ?? "student";
const notificationStudentPassword = process.env.E2E_STUDENT_NOTIFICATION_PASSWORD ?? "123456";
const gradedStudentId = process.env.E2E_STUDENT_GRADED_ID ?? "2024002";
const gradedStudentPassword = process.env.E2E_STUDENT_GRADED_PASSWORD ?? "123456";
const passwordStudentId = process.env.E2E_STUDENT_PASSWORD_ID ?? "2024005";
const passwordStudentPassword = process.env.E2E_STUDENT_PASSWORD_PASSWORD ?? "123456";
const passwordStudentNewPassword = process.env.E2E_STUDENT_PASSWORD_NEW_PASSWORD ?? `StudentProfile#${runId}Aa!`;
const singleDeviceStudentId = process.env.E2E_STUDENT_SINGLE_DEVICE_ID ?? "2024008";
const singleDeviceStudentPassword = process.env.E2E_STUDENT_SINGLE_DEVICE_PASSWORD ?? "123456";
const lockedStudentId = process.env.E2E_STUDENT_LOCKED_ID ?? "2024014";
const disabledStudentId = process.env.E2E_STUDENT_DISABLED_ID ?? "2024204";

let serverProcess: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;

function log(message: string) {
    console.log(`[student-e2e] ${message}`);
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

async function runBrowser(args: string[], options: RunCommandOptions = {}, session = mainSession) {
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

async function browserJson<T>(body: string, session = mainSession): Promise<T> {
    const source = `(async () => {
        const value = await (async () => {
${body}
        })();
        return JSON.stringify(value);
    })()`;
    const result = await runBrowser(["eval", source], {}, session);
    return parseBrowserValue<T>(result.stdout);
}

async function browserFetch<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
    session = mainSession,
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

async function browserFetchMeta(path: string, session = mainSession) {
    return browserJson<FetchMeta>(`
        const response = await fetch(${JSON.stringify(path)}, { credentials: "include" });
        const blob = await response.blob();
        return {
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get("content-type"),
            size: blob.size,
        };
    `, session);
}

async function httpJson<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<ApiResponse<T>> {
    const headers = new Headers(init?.headers ?? {});
    let body: string | undefined;
    if (init?.body !== undefined) {
        body = JSON.stringify(init.body);
        if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method: init?.method ?? "GET",
        headers,
        body,
        redirect: "manual",
    });

    const text = await response.text();
    let parsedBody: T | null = null;
    if (text) {
        try {
            parsedBody = JSON.parse(text) as T;
        } catch {
            parsedBody = null;
        }
    }

    return {
        status: response.status,
        ok: response.ok,
        body: parsedBody,
        rawText: text || null,
    };
}

async function currentPath(session = mainSession) {
    return browserJson<string>("return location.pathname;", session);
}

async function bodyText(session = mainSession) {
    return browserJson<string>("return document.body.innerText;", session);
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

async function waitForPath(pathname: string, timeoutMs = 15000, session = mainSession) {
    await waitFor(
        `path ${pathname}`,
        async () => ((await currentPath(session)) === pathname ? true : false),
        timeoutMs,
    );
}

async function waitForText(text: string, session = mainSession, timeoutMs = 15000) {
    await waitFor(
        `text ${text}`,
        async () => ((await bodyText(session)).includes(text) ? true : false),
        timeoutMs,
    );
}

async function waitForSelector(selector: string, session = mainSession, timeoutMs = 15000) {
    await waitFor(
        `selector ${selector}`,
        async () => {
            const exists = await browserJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`, session);
            return exists ? true : false;
        },
        timeoutMs,
    );
}

async function clickByTestId(testId: string, session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const element = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        if (!(element instanceof HTMLElement)) return false;
        element.click();
        return true;
    `, session);
    assert(clicked, `Could not click data-testid="${testId}"`);
}

async function clickButtonByText(label: string, session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const button = Array.from(document.querySelectorAll("button")).find((element) => {
            return isVisible(element) && (element.textContent?.trim().includes(${JSON.stringify(label)}) ?? false);
        });
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
    `, session);
    assert(clicked, `Could not find button containing "${label}"`);
}

async function isButtonEnabled(testId: string, session = mainSession) {
    return browserJson<boolean>(`
        const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        return button instanceof HTMLButtonElement && !button.disabled;
    `, session);
}

async function openStudent(path: string, session = mainSession) {
    await runBrowser(["open", `${baseUrl}${path}`], {}, session);
}

async function loginAsStudent(options: {
    studentId: string;
    password: string;
    session: string;
    expectedPath?: string;
}) {
    const expectedPath = options.expectedPath ?? "/student";

    log(`Logging in as student ${options.studentId}`);
    await openStudent("/student/login", options.session);
    await waitForSelector('[data-testid="student-login-submit"]', options.session);
    await runBrowser(["fill", '[data-testid="student-login-username"]', options.studentId], {}, options.session);
    await runBrowser(["fill", '[data-testid="student-login-password"]', options.password], {}, options.session);
    await runBrowser(["click", '[data-testid="student-login-submit"]'], {}, options.session);
    await waitForPath(expectedPath, 15000, options.session);
    await runBrowser(["wait", "500"], {}, options.session);
}

async function loginExpectError(options: {
    studentId: string;
    password: string;
    expectedText: string;
    session: string;
}) {
    await openStudent("/student/login", options.session);
    await waitForSelector('[data-testid="student-login-submit"]', options.session);
    await runBrowser(["fill", '[data-testid="student-login-username"]', options.studentId], {}, options.session);
    await runBrowser(["fill", '[data-testid="student-login-password"]', options.password], {}, options.session);
    await runBrowser(["click", '[data-testid="student-login-submit"]'], {}, options.session);
    await waitForText(options.expectedText, options.session);
    assert(await currentPath(options.session) === "/student/login", `Expected login error to stay on /student/login for ${options.studentId}`);
}

async function logoutStudent(session = mainSession) {
    const response = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", { method: "POST" }, session);
    assert(response.status === 200, `Student logout returned status ${response.status}`);
    await openStudent("/student/login", session);
    await waitForPath("/student/login", 15000, session);
}

async function closeBrowser(session: string) {
    await runBrowser(["close"], { allowFailure: true }, session);
}

async function openStudentMenu(session = mainSession) {
    const opened = await browserJson<boolean>(`
        const avatar = document.querySelector('[data-testid="student-avatar"]');
        const button = avatar?.closest("button");
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
    `, session);
    assert(opened, "Could not open student account menu");
}

async function snapshotInteractive(session = mainSession) {
    const result = await runBrowser(["snapshot", "-i"], {}, session);
    return result.stdout;
}

function findSnapshotRef(snapshot: string, label: string) {
    const line = snapshot.split("\n").find((entry) => entry.includes(`"${label}"`) && entry.includes("[ref="));
    const match = line?.match(/\[ref=(e\d+)\]/);
    return match ? `@${match[1]}` : null;
}

async function setRichTextEditorContent(testId: string, html: string, session = mainSession) {
    const result = await browserJson<{ ok: boolean; length: number }>(`
        const editor = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        if (!(editor instanceof HTMLElement)) {
            return { ok: false, length: 0 };
        }
        editor.innerHTML = ${JSON.stringify(html)};
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " " }));
        editor.dispatchEvent(new Event("blur", { bubbles: true }));
        return { ok: true, length: (editor.textContent ?? "").trim().length };
    `, session);
    assert(result.ok, `Could not set rich text editor ${testId}`);
    assert(result.length > 100, `Expected rich text editor ${testId} to contain enough text`);
}

async function downloadByLabel(label: string, destination: string, session = mainSession) {
    const snapshot = await snapshotInteractive(session);
    const ref = findSnapshotRef(snapshot, label);
    assert(ref, `Could not find snapshot ref for "${label}"`);
    await runBrowser(["download", ref, destination], {}, session);
}

async function expectFileDownloaded(filePath: string) {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    assert(exists, `Expected downloaded file ${filePath} to exist`);
    assert(file.size > 0, `Expected downloaded file ${filePath} to be non-empty`);
}

async function hasCommand(command: string) {
    const lookup = await runCommand(["bash", "-lc", `command -v ${JSON.stringify(command)}`], { allowFailure: true });
    return lookup.exitCode === 0 && Boolean(lookup.stdout.trim());
}

async function ensureTooling() {
    const available = await hasCommand("agent-browser");
    assert(available, "Missing required tool: agent-browser");
}

async function resetDatabase() {
    if (!shouldResetDb) return;
    log("Resetting database");
    await runCommand(["bun", "run", "db:reset"]);
}

async function reseedDatabase() {
    if (!shouldReseedDb) return;
    log("Restoring seed data");
    await runCommand(["bun", "run", "db:seed"]);
}

async function startServer() {
    if (useExistingServer) return;

    log("Starting server");
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
                const response = await fetch(`${baseUrl}/student/login`);
                return response.ok ? true : false;
            } catch {
                if (serverProcess && (await Promise.race([serverProcess.exited.then(() => true), delay(0).then(() => false)]))) {
                    throw new Error(await collectServerLogs());
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
    if (!serverProcess) return;

    const proc = serverProcess;
    serverProcess = null;
    proc.kill();
    await proc.exited;
}

async function getStudentMe(session = mainSession) {
    const response = await browserFetch<ApiEnvelope<StudentUser>>("/api/student/me", undefined, session);
    assert(response.status === 200, `Student me returned status ${response.status}`);
    assert(response.body?.success, "Student me did not return success");
    assert(response.body.data, "Student me should return data");
    return response.body.data;
}

async function listStudentTasks(session = mainSession) {
    const response = await browserFetch<ApiEnvelope<StudentTask[]>>("/api/student/tasks", undefined, session);
    assert(response.status === 200, `Student tasks returned status ${response.status}`);
    assert(response.body?.success, "Student tasks did not return success");
    return response.body.data ?? [];
}

async function getTaskDetail(taskId: number, session = mainSession) {
    const response = await browserFetch<ApiEnvelope<TaskDetailResponse>>(`/api/student/tasks/${taskId}`, undefined, session);
    assert(response.status === 200, `Task detail ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Task detail ${taskId} did not return success`);
    assert(response.body.data, `Task detail ${taskId} should return data`);
    return response.body.data;
}

async function getExperiment(taskId: number, session = mainSession) {
    const response = await browserFetch<ApiEnvelope<ExperimentData>>(`/api/student/tasks/${taskId}/experiment`, undefined, session);
    assert(response.status === 200, `Experiment ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Experiment ${taskId} did not return success`);
    assert(response.body.data, `Experiment ${taskId} should return data`);
    return response.body.data;
}

async function listSubmissions(taskId: number, session = mainSession) {
    const response = await browserFetch<ApiEnvelope<SubmissionSummary[]>>(`/api/student/tasks/${taskId}/submissions`, undefined, session);
    assert(response.status === 200, `Student submissions for task ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Student submissions for task ${taskId} did not return success`);
    return response.body.data ?? [];
}

async function getSubmissionDetail(submissionId: number, session = mainSession) {
    const response = await browserFetch<ApiEnvelope<SubmissionDetail>>(`/api/student/submissions/${submissionId}`, undefined, session);
    assert(response.status === 200, `Student submission detail ${submissionId} returned status ${response.status}`);
    assert(response.body?.success, `Student submission detail ${submissionId} did not return success`);
    assert(response.body.data, `Student submission detail ${submissionId} should return data`);
    return response.body.data;
}

async function listNotifications(session = mainSession) {
    const response = await browserFetch<ApiEnvelope<NotificationsPayload>>("/api/student/notifications", undefined, session);
    assert(response.status === 200, `Student notifications returned status ${response.status}`);
    assert(response.body?.success, "Student notifications did not return success");
    assert(response.body.data, "Student notifications should return data");
    return response.body.data;
}

async function listAnnouncements(session = mainSession) {
    const response = await browserFetch<ApiEnvelope<Announcement[]>>("/api/student/announcements", undefined, session);
    assert(response.status === 200, `Student announcements returned status ${response.status}`);
    assert(response.body?.success, "Student announcements did not return success");
    return response.body.data ?? [];
}

function isTaskNotOpenYet(publishedAt: string) {
    const publishedTime = new Date(publishedAt).getTime();
    return Number.isFinite(publishedTime) && publishedTime > Date.now();
}

function isTaskDeadlinePassed(deadline: string | null) {
    if (!deadline) return false;
    const deadlineAt = new Date(deadline).getTime();
    return Number.isFinite(deadlineAt) && Date.now() > deadlineAt;
}

function isTaskActionable(task: Pick<StudentTask, "status" | "deadline" | "publishedAt">) {
    return ["not_started", "in_progress", "rejected"].includes(task.status)
        && !isTaskDeadlinePassed(task.deadline)
        && !isTaskNotOpenYet(task.publishedAt);
}

function isTaskOngoing(task: Pick<StudentTask, "status" | "deadline" | "publishedAt">) {
    return (task.status === "in_progress" || task.status === "rejected") && isTaskActionable(task);
}

function sortNumberList(values: number[]) {
    return [...values].sort((left, right) => left - right);
}

async function getVisibleTaskCardIds(session = mainSession) {
    return browserJson<number[]>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        return Array.from(document.querySelectorAll('[data-testid^="student-task-card-"]'))
            .filter((element) => isVisible(element))
            .map((element) => Number(element.getAttribute("data-testid")?.replace("student-task-card-", "") ?? "0"))
            .filter((id) => Number.isFinite(id) && id > 0);
    `, session);
}

async function waitForVisibleTaskCards(expectedIds: number[], session = mainSession) {
    const normalized = sortNumberList(expectedIds);
    await waitFor(
        `visible task cards ${normalized.join(",") || "empty"}`,
        async () => {
            const visible = sortNumberList(await getVisibleTaskCardIds(session));
            return JSON.stringify(visible) === JSON.stringify(normalized) ? true : false;
        },
        10000,
        250,
    );
}

async function getTaskCardState(taskId: number, session = mainSession) {
    return browserJson<{ disabled: boolean; text: string }>(`
        const card = document.querySelector('[data-testid="student-task-card-${taskId}"]');
        if (!(card instanceof HTMLElement)) {
            return { disabled: true, text: "" };
        }
        const button = card.querySelector('[data-testid="student-task-primary-${taskId}"]');
        return {
            disabled: button instanceof HTMLButtonElement ? button.disabled : true,
            text: card.innerText,
        };
    `, session);
}

async function getTaskHallStats(session = mainSession) {
    return browserJson<{ inProgress: string; graded: string; average: string }>(`
        const readValue = (testId) => {
            const card = document.querySelector('[data-testid="' + testId + '"]');
            if (!(card instanceof HTMLElement)) return "";
            return card.querySelector(".text-3xl")?.textContent?.trim() ?? "";
        };
        return {
            inProgress: readValue("student-stat-in-progress"),
            graded: readValue("student-stat-graded"),
            average: readValue("student-stat-average"),
        };
    `, session);
}

async function clickAnnouncementByTitle(title: string, session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const buttons = Array.from(document.querySelectorAll('[role="dialog"] button'));
        const target = buttons.find((element) => {
            return element.textContent?.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(title)}) ?? false;
        });
        if (!(target instanceof HTMLElement)) return false;
        target.click();
        return true;
    `, session);
    assert(clicked, `Could not click announcement "${title}"`);
}

async function clickNotificationByTitle(title: string, session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const buttons = Array.from(document.querySelectorAll('[role="dialog"] button'));
        const target = buttons.find((element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.getAttribute("title") === "删除通知") return false;
            return element.textContent?.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(title)}) ?? false;
        });
        if (!(target instanceof HTMLElement)) return false;
        target.click();
        return true;
    `, session);
    assert(clicked, `Could not click notification "${title}"`);
}

async function deleteFirstNotification(session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const button = document.querySelector('[role="dialog"] button[title="删除通知"]');
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
    `, session);
    assert(clicked, "Could not delete first notification");
}

async function openAttachmentPreview(fileName: string, session = mainSession) {
    const clicked = await browserJson<boolean>(`
        const containers = Array.from(document.querySelectorAll("div"));
        const row = containers.find((element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (!(element.textContent?.includes(${JSON.stringify(fileName)}) ?? false)) return false;
            return !!element.querySelector('button[title="预览"]');
        });
        const button = row?.querySelector('button[title="预览"]');
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
    `, session);
    assert(clicked, `Could not open preview for attachment "${fileName}"`);
}

async function logoutStudentViaUi(session = mainSession) {
    await openStudentMenu(session);
    await clickByTestId("student-logout-trigger", session);
    await waitForText("确认退出登录？", session);
    await clickButtonByText("退出登录", session);
    await waitForPath("/student/login", 15000, session);
}

async function expectFileTextContains(filePath: string, expectedText: string) {
    const file = Bun.file(filePath);
    assert(await file.exists(), `Expected file ${filePath} to exist`);
    const text = await file.text();
    assert(text.includes(expectedText), `Expected file ${filePath} to contain "${expectedText}"`);
}

async function clickAllVisibleButtonsByText(label: string, session = mainSession) {
    return browserJson<number>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const buttons = Array.from(document.querySelectorAll("button"))
            .filter((element) => isVisible(element) && (element.textContent?.trim().includes(${JSON.stringify(label)}) ?? false));
        buttons.forEach((button) => button.click());
        return buttons.length;
    `, session);
}

async function getInputValue(selector: string, session = mainSession) {
    return browserJson<string>(`
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!(input instanceof HTMLInputElement)) return "";
        return input.value;
    `, session);
}

async function completeImmersiveQuestionnairePreview(session = mainSession) {
    let guard = 0;

    while (guard < 80) {
        const state = await browserJson<{
            action: "start" | "answer" | "next" | "submit" | "return" | "closed";
        }>(`
            const start = document.querySelector('[data-testid="immersive-preview-start"]');
            if (start instanceof HTMLButtonElement) {
                return { action: "start" };
            }

            const submit = document.querySelector('[data-testid="immersive-preview-submit"]');
            if (submit instanceof HTMLButtonElement) {
                return { action: "submit" };
            }

            const done = document.querySelector('[data-testid="immersive-preview-return"]');
            if (done instanceof HTMLButtonElement) {
                return { action: "return" };
            }

            const next = document.querySelector('[data-testid="immersive-preview-next"]');
            if (next instanceof HTMLButtonElement) {
                return { action: next.disabled ? "answer" : "next" };
            }

            return { action: "closed" };
        `, session);

        if (state.action === "closed") {
            return;
        }

        if (state.action === "start") {
            await clickByTestId("immersive-preview-start", session);
        } else if (state.action === "submit") {
            await clickByTestId("immersive-preview-submit", session);
        } else if (state.action === "return") {
            await clickByTestId("immersive-preview-return", session);
            await waitFor(
                "immersive questionnaire preview to close",
                async () => {
                    const open = await browserJson<boolean>(
                        "return !!document.querySelector('[data-testid=\"immersive-questionnaire-preview\"]');",
                        session,
                    );
                    return open ? false : true;
                },
                10000,
                200,
            );
            return;
        } else if (state.action === "next") {
            await clickByTestId("immersive-preview-next", session);
        } else if (state.action === "answer") {
            const answered = await browserJson<boolean>(`
                const candidates = Array.from(document.querySelectorAll('.max-w-lg button'))
                    .filter((element) => {
                        if (!(element instanceof HTMLButtonElement)) return false;
                        const testId = element.getAttribute("data-testid");
                        if (testId === "immersive-preview-start" || testId === "immersive-preview-submit" || testId === "immersive-preview-return") {
                            return false;
                        }
                        return !element.disabled;
                    });
                const target = candidates[0];
                if (!(target instanceof HTMLButtonElement)) return false;
                target.click();
                return true;
            `, session);
            assert(answered, "Could not answer immersive questionnaire preview");
        }

        guard += 1;
        await runBrowser(["wait", "120"], {}, session);
    }

    throw new Error("Immersive questionnaire preview did not finish within the expected number of steps");
}

async function completeSamplingAnimation(session = mainSession) {
    await waitForSelector('[data-testid="immersive-sampling-animation"]', session);
    await waitFor(
        "immersive sampling animation to close",
        async () => {
            const open = await browserJson<boolean>(
                "return !!document.querySelector('[data-testid=\"immersive-sampling-animation\"]');",
                session,
            );
            return open ? false : true;
        },
        30000,
        200,
    );
}

async function completeExperimentLaunch(session = mainSession) {
    await waitFor(
        "experiment launch proceed button",
        async () => {
            const visible = await browserJson<boolean>(`
                const isVisible = (element) => {
                    if (!(element instanceof HTMLElement)) return false;
                    if (element.hidden) return false;
                    const style = window.getComputedStyle(element);
                    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
                };
                return Array.from(document.querySelectorAll("button")).some((element) => {
                    return isVisible(element) && (element.textContent?.includes("进入抽样执行") ?? false);
                });
            `, session);
            return visible ? true : false;
        },
        15000,
        250,
    );
    await clickButtonByText("进入抽样执行", session);
}

async function testLoginErrors() {
    log("Checking student login error states");

    await loginExpectError({
        studentId: "NO_SUCH_STUDENT",
        password: "123456",
        expectedText: "账号或密码错误",
        session: invalidSession,
    });

    await loginExpectError({
        studentId: lockedStudentId,
        password: "123456",
        expectedText: "账号已被锁定",
        session: lockedSession,
    });

    await loginExpectError({
        studentId: disabledStudentId,
        password: "123456",
        expectedText: "账号已被停用",
        session: disabledSession,
    });

    const lockedApi = await httpJson<ApiEnvelope<{ user: StudentUser }>>("/api/student/login", {
        method: "POST",
        body: { studentId: lockedStudentId, password: "123456" },
    });
    assert(lockedApi.status === 403, `Locked student API login should return 403, got ${lockedApi.status}`);
    assert(lockedApi.body?.error?.code === "ACCOUNT_LOCKED", `Expected ACCOUNT_LOCKED, got ${lockedApi.body?.error?.code ?? "unknown"}`);
}

async function testFirstLoginPasswordChange() {
    log("Checking first-login student password change");

    await loginAsStudent({
        studentId: firstLoginStudentId,
        password: firstLoginStudentPassword,
        session: firstLoginSession,
    });
    await waitForText("首次登录需完成密码更新", firstLoginSession);
    await waitForSelector('[data-testid="student-password-save"]', firstLoginSession);

    await runBrowser(["fill", '[data-testid="student-password-current"]', firstLoginStudentPassword], {}, firstLoginSession);
    await runBrowser(["fill", '[data-testid="student-password-new"]', firstLoginNewPassword], {}, firstLoginSession);
    await runBrowser(["fill", '[data-testid="student-password-confirm"]', firstLoginNewPassword], {}, firstLoginSession);
    await runBrowser(["click", '[data-testid="student-password-save"]'], {}, firstLoginSession);

    await waitFor(
        "student first-login password dialog to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"student-password-save\"]');", firstLoginSession);
            return open ? false : true;
        },
        15000,
    );

    const me = await getStudentMe(firstLoginSession);
    assert(me.studentId === firstLoginStudentId, `Expected first-login me to be ${firstLoginStudentId}, got ${me.studentId}`);
    assert(me.isFirstLogin === 0, "First-login flag should be cleared after password update");

    await logoutStudent(firstLoginSession);
    await loginAsStudent({
        studentId: firstLoginStudentId,
        password: firstLoginNewPassword,
        session: firstLoginSession,
    });
    const reloginMe = await getStudentMe(firstLoginSession);
    assert(reloginMe.studentId === firstLoginStudentId, "Updated first-login password should allow relogin");
    await logoutStudent(firstLoginSession);
}

async function testQuestionnaireStageFlow() {
    log("Checking questionnaire stage e2e flow");

    await loginAsStudent({
        studentId: questionnaireStudentId,
        password: questionnaireStudentPassword,
        session: questionnaireSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', questionnaireSession);

    const tasks = await listStudentTasks(questionnaireSession);
    const targetTask = tasks.find((task) => task.status === "in_progress" && task.currentStage === 1);
    assert(targetTask, `Expected a stage 1 in-progress task for ${questionnaireStudentId}`);

    await openStudent(`/student/task/${targetTask.id}/experiment`, questionnaireSession);
    await waitForPath(`/student/task/${targetTask.id}/experiment`, 15000, questionnaireSession);
    await waitForSelector('[data-testid="student-stage-questionnaire"]', questionnaireSession);
    await waitForSelector('[data-testid="student-questionnaire-title"]', questionnaireSession);

    await runBrowser(["fill", '[data-testid="student-questionnaire-title"]', "社区餐饮消费调查问卷"], {}, questionnaireSession);
    await setRichTextEditorContent(
        "student-questionnaire-welcome-editor",
        "<p>您好，感谢参加本次社区餐饮消费调查。本问卷用于统计学实验教学，将从用餐频率、餐饮偏好、价格敏感度和满意度等方面了解您的真实体验。问卷预计耗时约 3 分钟，所有数据仅用于课堂分析与抽样方法比较，不会用于任何商业用途。请根据您最近一个月的实际经历认真作答，您的回答将帮助我们比较不同抽样方案在社区餐饮研究中的差异。</p>",
        questionnaireSession,
    );

    await waitFor(
        "questionnaire step 1 next button to enable",
        async () => (await isButtonEnabled("student-questionnaire-next", questionnaireSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-questionnaire-next", questionnaireSession);
    await waitFor(
        "questionnaire to enter step 2",
        async () => {
            const text = await bodyText(questionnaireSession);
            return text.includes("题目列表") ? true : false;
        },
        10000,
        250,
    );

    const usedRecommendCount = await clickAllVisibleButtonsByText("使用此题", questionnaireSession);
    assert(usedRecommendCount >= 3, `Expected to use at least 3 recommended questions, got ${usedRecommendCount}`);
    await waitForText("已添加 5 道题目", questionnaireSession);
    await waitFor(
        "questionnaire step 2 next button to enable",
        async () => (await isButtonEnabled("student-questionnaire-next", questionnaireSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-questionnaire-next", questionnaireSession);

    await waitFor(
        "questionnaire to enter step 3",
        async () => {
            const text = await bodyText(questionnaireSession);
            return text.includes("结束语设置") ? true : false;
        },
        10000,
        250,
    );
    await setRichTextEditorContent(
        "student-questionnaire-ending-editor",
        "<p>问卷到此结束，再次感谢您的参与和配合。您的回答将帮助我们比较不同抽样方法在社区餐饮研究中的效果，并形成后续分析报告，为社区餐饮服务改进提供依据。请在提交前再次确认答案是否符合您的真实情况，祝您生活愉快、学习顺利，也欢迎继续关注后续的实验分析结果。</p>",
        questionnaireSession,
    );

    await waitFor(
        "questionnaire step 3 next button to enable",
        async () => (await isButtonEnabled("student-questionnaire-next", questionnaireSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-questionnaire-next", questionnaireSession);
    await waitFor(
        "questionnaire to enter step 4",
        async () => {
            const text = await bodyText(questionnaireSession);
            return text.includes("校验清单") ? true : false;
        },
        10000,
        250,
    );

    await clickByTestId("student-questionnaire-start-preview", questionnaireSession);
    await waitForSelector('[data-testid="immersive-questionnaire-preview"]', questionnaireSession);
    await completeImmersiveQuestionnairePreview(questionnaireSession);

    await waitFor(
        "questionnaire complete button to enable",
        async () => (await isButtonEnabled("student-questionnaire-complete", questionnaireSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-questionnaire-complete", questionnaireSession);
    await waitForSelector('[data-testid="student-questionnaire-complete-dialog"]', questionnaireSession);
    await clickByTestId("student-questionnaire-complete-confirm", questionnaireSession);
    await waitForSelector('[data-testid="student-stage-sample-plan"]', questionnaireSession, 15000);

    const experiment = await getExperiment(targetTask.id, questionnaireSession);
    assert(experiment.currentStage === 2, `Expected questionnaire flow to advance to stage 2, got ${experiment.currentStage}`);

    await logoutStudent(questionnaireSession);
}

async function testSamplePlanStageFlow() {
    log("Checking sample plan stage e2e flow");

    await loginAsStudent({
        studentId: samplePlanStudentId,
        password: samplePlanStudentPassword,
        session: samplePlanSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', samplePlanSession);

    const tasks = await listStudentTasks(samplePlanSession);
    const targetTask = tasks.find((task) => task.status === "in_progress" && task.currentStage === 2);
    assert(targetTask, `Expected a stage 2 in-progress task for ${samplePlanStudentId}`);

    await openStudent(`/student/task/${targetTask.id}/experiment`, samplePlanSession);
    await waitForPath(`/student/task/${targetTask.id}/experiment`, 15000, samplePlanSession);
    await waitForSelector('[data-testid="student-stage-sample-plan"]', samplePlanSession);

    await runBrowser(["fill", '[data-testid="student-sample-plan-final-size"]', "29"], {}, samplePlanSession);
    await waitFor(
        "sample plan next button to disable for invalid sample size",
        async () => (await isButtonEnabled("student-sample-plan-next", samplePlanSession)) ? false : true,
        10000,
        250,
    );

    await runBrowser(["fill", '[data-testid="student-sample-plan-final-size"]', "360"], {}, samplePlanSession);
    await waitFor(
        "sample plan next button to enable for valid sample size",
        async () => (await isButtonEnabled("student-sample-plan-next", samplePlanSession)) ? true : false,
        10000,
        250,
    );
    assert(await getInputValue('[data-testid="student-sample-plan-final-size"]', samplePlanSession) === "360", "Expected final sample size input to keep the custom value");

    await clickByTestId("student-sample-plan-next", samplePlanSession);
    await waitForSelector('[data-testid="student-sample-plan-confirm-dialog"]', samplePlanSession);
    await clickByTestId("student-sample-plan-confirm", samplePlanSession);
    await completeExperimentLaunch(samplePlanSession);
    await waitForSelector('[data-testid="student-stage-sampling"]', samplePlanSession, 15000);

    const experiment = await getExperiment(targetTask.id, samplePlanSession);
    assert(experiment.currentStage === 3, `Expected sample plan flow to advance to stage 3, got ${experiment.currentStage}`);
    const samplePlan = experiment.samplePlan as Record<string, unknown> | null;
    assert(samplePlan && Number(samplePlan.finalSampleSize) === 360, `Expected saved final sample size 360, got ${samplePlan ? String(samplePlan.finalSampleSize) : "null"}`);

    await logoutStudent(samplePlanSession);
}

async function testSamplingStageFlow() {
    log("Checking sampling stage e2e flow");

    await loginAsStudent({
        studentId: samplingStudentId,
        password: samplingStudentPassword,
        session: samplingSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', samplingSession);

    const tasks = await listStudentTasks(samplingSession);
    const targetTask = tasks.find((task) => task.status === "in_progress" && task.currentStage === 3);
    assert(targetTask, `Expected a stage 3 in-progress task for ${samplingStudentId}`);

    await openStudent(`/student/task/${targetTask.id}/experiment`, samplingSession);
    await waitForPath(`/student/task/${targetTask.id}/experiment`, 15000, samplingSession);
    await waitForSelector('[data-testid="student-stage-sampling"]', samplingSession);

    await runBrowser(["fill", '[data-testid="student-sampling-simple-seed"]', "2026"], {}, samplingSession);
    await clickByTestId("student-sampling-simple-run", samplingSession);
    await completeSamplingAnimation(samplingSession);
    await waitForSelector('[data-testid="student-sampling-simple-rerun"]', samplingSession, 15000);

    await runBrowser(["click", '[data-testid="student-sampling-tab-systematic"]'], {}, samplingSession);
    await waitForSelector('[data-testid="student-sampling-systematic-k"]', samplingSession, 10000);
    await runBrowser(["fill", '[data-testid="student-sampling-systematic-k"]', "25"], {}, samplingSession);
    await waitFor(
        "systematic sampling run button to enable",
        async () => (await isButtonEnabled("student-sampling-systematic-run", samplingSession)) ? true : false,
        10000,
        250,
    );
    await runBrowser(["fill", '[data-testid="student-sampling-systematic-seed"]', "2026"], {}, samplingSession);
    await clickByTestId("student-sampling-systematic-run", samplingSession);
    await completeSamplingAnimation(samplingSession);
    await waitForSelector('[data-testid="student-sampling-systematic-rerun"]', samplingSession, 15000);

    await runBrowser(["click", '[data-testid="student-sampling-tab-stratified"]'], {}, samplingSession);
    await clickByTestId("student-sampling-alloc-proportional", samplingSession);
    await waitFor(
        "stratified sampling run button to enable",
        async () => (await isButtonEnabled("student-sampling-stratified-run", samplingSession)) ? true : false,
        10000,
        250,
    );
    await runBrowser(["fill", '[data-testid="student-sampling-stratified-seed"]', "2026"], {}, samplingSession);
    await clickByTestId("student-sampling-stratified-run", samplingSession);
    await completeSamplingAnimation(samplingSession);
    await waitForSelector('[data-testid="student-sampling-stratified-rerun"]', samplingSession, 15000);

    await waitFor(
        "sampling next button to enable after all methods complete",
        async () => (await isButtonEnabled("student-sampling-next", samplingSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-sampling-next", samplingSession);
    await waitForSelector('[data-testid="student-sampling-confirm-dialog"]', samplingSession);
    await clickByTestId("student-sampling-confirm", samplingSession);
    await waitForSelector('[data-testid="student-stage-analysis-report"]', samplingSession, 15000);

    const experiment = await getExperiment(targetTask.id, samplingSession);
    assert(experiment.currentStage === 4, `Expected sampling flow to advance to stage 4, got ${experiment.currentStage}`);
    const samplingResults = experiment.samplingResults as Record<string, { completed?: boolean } | undefined> | null;
    assert(samplingResults?.simple?.completed, "Expected simple sampling result to be completed");
    assert(samplingResults?.systematic?.completed, "Expected systematic sampling result to be completed");
    assert(samplingResults?.stratified?.completed, "Expected stratified sampling result to be completed");

    await logoutStudent(samplingSession);
}

async function testMainStudentExperience() {
    log("Checking main student hall, route guards, attachments, and submission detail");

    await loginAsStudent({
        studentId: normalStudentId,
        password: normalStudentPassword,
        session: mainSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', mainSession);

    const me = await getStudentMe(mainSession);
    assert(me.studentId === normalStudentId, `Expected me to be ${normalStudentId}, got ${me.studentId}`);

    const tasks = await listStudentTasks(mainSession);
    assert(tasks.length >= 4, `Expected seeded student tasks, got ${tasks.length}`);
    assert(tasks.some((task) => task.status === "submitted"), "Expected at least one submitted task");
    assert(tasks.some((task) => task.status === "in_progress"), "Expected at least one in-progress task");
    const submittedTask = tasks.find((task) => task.status === "submitted") ?? tasks.find((task) => task.status === "grading");
    const expiredTask = tasks.find((task) => task.status === "not_started" && isTaskDeadlinePassed(task.deadline));
    const futureTask = tasks.find((task) => task.status === "not_started" && isTaskNotOpenYet(task.publishedAt));
    assert(submittedTask, "Expected a submitted task for history coverage");
    assert(expiredTask, "Expected an expired task to cover disabled task states");
    assert(futureTask, "Expected a future task to cover unopened task states");

    const hallText = await bodyText(mainSession);
    assert(hallText.includes("我的任务"), "Task hall should render the task section");
    assert(hallText.includes("最新公告"), "Task hall should surface the latest announcement");

    const stats = await getTaskHallStats(mainSession);
    const expectedAverage = tasks
        .filter((task) => task.status === "graded" && task.score !== undefined)
        .reduce((sum, task, _, array) => sum + (task.score ?? 0) / array.length, 0)
        .toFixed(0);
    assert(stats.inProgress === String(tasks.filter(isTaskOngoing).length), `Expected in-progress stat ${tasks.filter(isTaskOngoing).length}, got ${stats.inProgress}`);
    assert(stats.graded === String(tasks.filter((task) => task.status === "graded").length), `Expected graded stat ${tasks.filter((task) => task.status === "graded").length}, got ${stats.graded}`);
    assert(stats.average === expectedAverage, `Expected average stat ${expectedAverage}, got ${stats.average}`);

    await waitForVisibleTaskCards(tasks.map((task) => task.id), mainSession);
    await clickByTestId("student-filter-in-progress", mainSession);
    await waitForVisibleTaskCards(tasks.filter(isTaskOngoing).map((task) => task.id), mainSession);
    await clickByTestId("student-filter-submitted", mainSession);
    await waitForVisibleTaskCards(tasks.filter((task) => task.status === "submitted" || task.status === "grading").map((task) => task.id), mainSession);
    await clickByTestId("student-filter-graded", mainSession);
    await waitForVisibleTaskCards(tasks.filter((task) => task.status === "graded").map((task) => task.id), mainSession);
    await waitForText("暂无相关任务", mainSession);
    await clickByTestId("student-filter-all", mainSession);
    await waitForVisibleTaskCards(tasks.map((task) => task.id), mainSession);

    const expiredTaskCard = await getTaskCardState(expiredTask.id, mainSession);
    assert(expiredTaskCard.disabled, `Expected expired task ${expiredTask.id} to be disabled`);
    assert(expiredTaskCard.text.includes("已截止，无法继续操作"), "Expired task should show deadline hint");

    const futureTaskCard = await getTaskCardState(futureTask.id, mainSession);
    assert(futureTaskCard.disabled, `Expected future task ${futureTask.id} to be disabled`);
    assert(futureTaskCard.text.includes("任务尚未开放，暂不可操作"), "Future task should show unopened hint");

    await openStudent(`/student/task/${submittedTask.id}/experiment`, mainSession);
    await waitForPath(`/student/task/${submittedTask.id}/history`, 15000, mainSession);
    await openStudent(`/student/task/${expiredTask.id}/experiment`, mainSession);
    await waitForPath(`/student/task/${expiredTask.id}`, 15000, mainSession);
    await openStudent(`/student/task/${futureTask.id}/experiment`, mainSession);
    await waitForPath(`/student/task/${futureTask.id}`, 15000, mainSession);
    await openStudent("/student", mainSession);
    await waitForPath("/student", 15000, mainSession);

    const announcements = await listAnnouncements(mainSession);
    const unreadAnnouncement = announcements.find((announcement) => !announcement.isRead);
    assert(unreadAnnouncement, "Expected one unread announcement for the main student");
    await clickButtonByText("查看详情", mainSession);
    await waitForText("系统公告", mainSession);
    await clickAnnouncementByTitle(unreadAnnouncement.title, mainSession);
    await waitForText(unreadAnnouncement.title, mainSession);
    await waitFor(
        `announcement ${unreadAnnouncement.id} marked as read`,
        async () => {
            const current = await listAnnouncements(mainSession);
            return current.find((announcement) => announcement.id === unreadAnnouncement.id)?.isRead ? true : false;
        },
        10000,
        250,
    );
    await runBrowser(["press", "Escape"], {}, mainSession);

    await openStudentMenu(mainSession);
    await clickByTestId("student-nav-profile", mainSession);
    await waitForPath("/student/profile", 15000, mainSession);
    await waitForSelector('[data-testid="student-profile-id"]', mainSession);

    const profile = await browserJson<{ name: string; studentId: string; className: string }>(`
        return {
            name: document.querySelector('[data-testid="student-profile-name"]')?.textContent?.trim() ?? "",
            studentId: document.querySelector('[data-testid="student-profile-id"]')?.textContent?.trim() ?? "",
            className: document.querySelector('[data-testid="student-profile-class"]')?.textContent?.trim() ?? "",
        };
    `, mainSession);
    assert(profile.name === me.name, `Expected profile name ${me.name}, got ${profile.name}`);
    assert(profile.studentId === me.studentId, `Expected profile id ${me.studentId}, got ${profile.studentId}`);
    assert(profile.className === me.className, `Expected profile class ${me.className ?? ""}, got ${profile.className}`);

    await openStudent(`/student/task/${submittedTask.id}`, mainSession);
    await waitForPath(`/student/task/${submittedTask.id}`, 15000, mainSession);
    await waitForSelector('[data-testid="student-task-detail"]', mainSession);

    const taskDetail = await getTaskDetail(submittedTask.id, mainSession);
    assert(taskDetail.status === "submitted" || taskDetail.status === "grading", `Expected submitted/grading task detail, got ${taskDetail.status}`);
    assert(taskDetail.attachments.length > 0, "Expected task detail to include topic attachments");
    const pdfAttachment = taskDetail.attachments.find((attachment) => {
        const lowerName = attachment.name.toLowerCase();
        const lowerType = attachment.type.toLowerCase();
        return lowerType.includes("pdf") || lowerName.endsWith(".pdf");
    });
    assert(pdfAttachment, "Expected a previewable PDF attachment");

    await openAttachmentPreview(pdfAttachment.name, mainSession);
    await waitForText("附件预览", mainSession);
    await waitForSelector("iframe", mainSession);
    const attachmentMeta = await browserFetchMeta(`/api/student/attachments/${pdfAttachment.id}/download?mode=preview`, mainSession);
    assert(attachmentMeta.ok, "Attachment preview should download successfully");
    assert(attachmentMeta.contentType?.includes("application/pdf") ?? false, `Expected PDF attachment content type, got ${attachmentMeta.contentType ?? "unknown"}`);
    assert(attachmentMeta.size > 0, "Expected attachment preview response to be non-empty");
    await runBrowser(["press", "Escape"], {}, mainSession);

    const actionState = await browserJson<{ disabled: boolean; text: string | null }>(`
        const button = Array.from(document.querySelectorAll("button"))
            .find((element) => element.textContent?.includes("查看提交内容"));
        if (!(button instanceof HTMLButtonElement)) {
            return { disabled: true, text: null };
        }
        return { disabled: button.disabled, text: button.textContent?.trim() ?? null };
    `, mainSession);
    assert(actionState.text?.includes("查看提交内容") ?? false, "Task detail should render the submission history action");
    assert(actionState.disabled === false, "Task detail submission history action should be enabled");

    await clickButtonByText("查看提交内容", mainSession);
    await waitForPath(`/student/task/${submittedTask.id}/history`, 15000, mainSession);
    await waitForSelector('[data-testid="student-submission-history"]', mainSession);

    const submissions = await listSubmissions(submittedTask.id, mainSession);
    assert(submissions.length > 0, `Expected submissions for task ${submittedTask.id}`);
    const latestSubmission = submissions[0]!;

    await openStudent(`/student/submissions/${latestSubmission.id}`, mainSession);
    await waitForPath(`/student/submissions/${latestSubmission.id}`, 15000, mainSession);
    await waitForSelector('[data-testid="student-submission-detail"]', mainSession);

    const detail = await waitFor(
        `submission ${latestSubmission.id} pdf ready`,
        async () => {
            const current = await getSubmissionDetail(latestSubmission.id, mainSession);
            return current.pdfStatus === "ready" ? current : false;
        },
        15000,
        500,
    );
    assert(detail.questionnairePdfPath && detail.reportPdfPath, "Expected seeded submission PDFs to exist");

    const questionnaireMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=questionnaire`, mainSession);
    assert(questionnaireMeta.ok, "Questionnaire PDF should download successfully");
    assert(questionnaireMeta.contentType?.includes("application/pdf") ?? false, `Expected questionnaire PDF content type, got ${questionnaireMeta.contentType ?? "unknown"}`);
    assert(questionnaireMeta.size > 0, "Questionnaire PDF response should be non-empty");

    const reportMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=report`, mainSession);
    assert(reportMeta.ok, "Report PDF should download successfully");
    assert(reportMeta.contentType?.includes("application/pdf") ?? false, `Expected report PDF content type, got ${reportMeta.contentType ?? "unknown"}`);
    assert(reportMeta.size > 0, "Report PDF response should be non-empty");

    const questionnairePath = `${downloadDir}/submission-${latestSubmission.id}-questionnaire.pdf`;
    const reportPath = `${downloadDir}/submission-${latestSubmission.id}-report.pdf`;
    await downloadByLabel("下载问卷 PDF", questionnairePath, mainSession);
    await downloadByLabel("下载报告 PDF", reportPath, mainSession);
    await expectFileDownloaded(questionnairePath);
    await expectFileDownloaded(reportPath);

    await logoutStudentViaUi(mainSession);
}

async function testNotificationCenter() {
    log("Checking notification read, mark-all, and delete flow");

    await loginAsStudent({
        studentId: notificationStudentId,
        password: notificationStudentPassword,
        session: notificationSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', notificationSession);

    const initial = await listNotifications(notificationSession);
    assert(initial.unreadCount >= 2, `Expected unread notifications for ${notificationStudentId}, got ${initial.unreadCount}`);
    const firstUnread =
        initial.notifications.find((notification) => notification.isRead === 0 && notification.title.includes("截止日期提醒"))
        ?? initial.notifications.find((notification) => notification.isRead === 0);
    assert(firstUnread, "Expected at least one unread notification");

    await clickByTestId("student-open-notifications", notificationSession);
    await waitForText("查看任务与批改提醒", notificationSession);
    await clickNotificationByTitle(firstUnread.title, notificationSession);
    await waitFor(
        `notification ${firstUnread.id} to become read`,
        async () => {
            const current = await listNotifications(notificationSession);
            const updated = current.notifications.find((notification) => notification.id === firstUnread.id);
            return updated?.isRead === 1 && current.unreadCount === initial.unreadCount - 1 ? true : false;
        },
        10000,
        250,
    );

    await clickByTestId("student-notification-read-all", notificationSession);
    await waitFor(
        "all notifications to become read",
        async () => {
            const current = await listNotifications(notificationSession);
            return current.unreadCount === 0 && current.notifications.every((notification) => notification.isRead === 1) ? true : false;
        },
        10000,
        250,
    );

    const beforeDelete = await listNotifications(notificationSession);
    await deleteFirstNotification(notificationSession);
    await waitFor(
        "notification list to shrink after delete",
        async () => {
            const current = await listNotifications(notificationSession);
            return current.notifications.length === beforeDelete.notifications.length - 1 ? true : false;
        },
        10000,
        250,
    );

    await runBrowser(["press", "Escape"], {}, notificationSession);
    await logoutStudent(notificationSession);
}

async function testGradedSubmissionDetail() {
    log("Checking graded task history and disabled PDF actions");

    await loginAsStudent({
        studentId: gradedStudentId,
        password: gradedStudentPassword,
        session: gradedSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', gradedSession);

    const tasks = await listStudentTasks(gradedSession);
    const gradedTasks = tasks.filter((task) => task.status === "graded");
    assert(gradedTasks.length > 0, `Expected graded tasks for ${gradedStudentId}`);

    await clickByTestId("student-filter-graded", gradedSession);
    await waitForVisibleTaskCards(gradedTasks.map((task) => task.id), gradedSession);

    const gradedTask = gradedTasks[0]!;
    await clickByTestId(`student-task-primary-${gradedTask.id}`, gradedSession);
    await waitForPath(`/student/task/${gradedTask.id}`, 15000, gradedSession);
    await waitForSelector('[data-testid="student-task-detail"]', gradedSession);
    const detailText = await bodyText(gradedSession);
    assert(detailText.includes(String(gradedTask.score ?? "")), "Graded task detail should show the final score");

    await clickButtonByText("查看成绩", gradedSession);
    await waitForPath(`/student/task/${gradedTask.id}/history`, 15000, gradedSession);
    await waitForSelector('[data-testid="student-submission-history"]', gradedSession);

    const submissions = await listSubmissions(gradedTask.id, gradedSession);
    assert(submissions.length > 0, `Expected graded submissions for task ${gradedTask.id}`);
    const latestSubmission = submissions[0]!;
    const submissionDetail = await getSubmissionDetail(latestSubmission.id, gradedSession);
    assert(submissionDetail.status === 2, `Expected graded submission status 2, got ${submissionDetail.status}`);
    assert(Boolean(submissionDetail.teacherComment), "Expected teacher comment on graded submission");
    assert(Boolean(submissionDetail.graderName), "Expected grader name on graded submission");

    await openStudent(`/student/submissions/${latestSubmission.id}`, gradedSession);
    await waitForPath(`/student/submissions/${latestSubmission.id}`, 15000, gradedSession);
    await waitForSelector('[data-testid="student-submission-detail"]', gradedSession);

    const pageText = await bodyText(gradedSession);
    assert(pageText.includes(submissionDetail.teacherComment ?? ""), "Submission detail should render teacher comment");
    assert(pageText.includes(submissionDetail.graderName ?? ""), "Submission detail should render grader name");

    const downloadState = await browserJson<{ questionnaireDisabled: boolean; reportDisabled: boolean }>(`
        const buttons = Array.from(document.querySelectorAll("button"));
        const questionnaire = buttons.find((element) => element.textContent?.includes("下载问卷 PDF"));
        const report = buttons.find((element) => element.textContent?.includes("下载报告 PDF"));
        return {
            questionnaireDisabled: questionnaire instanceof HTMLButtonElement ? questionnaire.disabled : true,
            reportDisabled: report instanceof HTMLButtonElement ? report.disabled : true,
        };
    `, gradedSession);
    assert(downloadState.questionnaireDisabled === !submissionDetail.questionnairePdfPath, "Questionnaire PDF button state should match API availability");
    assert(downloadState.reportDisabled === !submissionDetail.reportPdfPath, "Report PDF button state should match API availability");

    if (submissionDetail.questionnairePdfPath) {
        const questionnaireMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=questionnaire`, gradedSession);
        assert(questionnaireMeta.ok, "Questionnaire PDF should download when API marks it ready");
        assert(questionnaireMeta.contentType?.includes("application/pdf") ?? false, `Expected graded questionnaire PDF content type, got ${questionnaireMeta.contentType ?? "unknown"}`);
    }

    if (submissionDetail.reportPdfPath) {
        const reportMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=report`, gradedSession);
        assert(reportMeta.ok, "Report PDF should download when API marks it ready");
        assert(reportMeta.contentType?.includes("application/pdf") ?? false, `Expected graded report PDF content type, got ${reportMeta.contentType ?? "unknown"}`);
    }

    await logoutStudent(gradedSession);
}

async function testProfilePasswordChange() {
    log("Checking profile password change and relogin");

    await loginAsStudent({
        studentId: passwordStudentId,
        password: passwordStudentPassword,
        session: passwordSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', passwordSession);

    await openStudentMenu(passwordSession);
    await clickByTestId("student-nav-profile", passwordSession);
    await waitForPath("/student/profile", 15000, passwordSession);
    await waitForSelector('[data-testid="student-profile-password-save"]', passwordSession);

    const invalidPassword = `${passwordStudentId}!Aa`;
    await runBrowser(["fill", '[data-testid="student-profile-password-current"]', passwordStudentPassword], {}, passwordSession);
    await runBrowser(["fill", '[data-testid="student-profile-password-new"]', invalidPassword], {}, passwordSession);
    await runBrowser(["fill", '[data-testid="student-profile-password-confirm"]', invalidPassword], {}, passwordSession);
    await runBrowser(["click", '[data-testid="student-profile-password-save"]'], {}, passwordSession);
    await waitForText("新密码不能包含学号", passwordSession);

    await runBrowser(["fill", '[data-testid="student-profile-password-current"]', passwordStudentPassword], {}, passwordSession);
    await runBrowser(["fill", '[data-testid="student-profile-password-new"]', passwordStudentNewPassword], {}, passwordSession);
    await runBrowser(["fill", '[data-testid="student-profile-password-confirm"]', passwordStudentNewPassword], {}, passwordSession);
    await runBrowser(["click", '[data-testid="student-profile-password-save"]'], {}, passwordSession);
    await waitFor(
        "profile password form to reset after successful save",
        async () => {
            const state = await browserJson<{
                current: string;
                next: string;
                confirm: string;
                text: string;
            }>(`
                return {
                    current: document.querySelector('[data-testid="student-profile-password-current"]')?.value ?? "",
                    next: document.querySelector('[data-testid="student-profile-password-new"]')?.value ?? "",
                    confirm: document.querySelector('[data-testid="student-profile-password-confirm"]')?.value ?? "",
                    text: document.body.innerText,
                };
            `, passwordSession);
            if (state.text.includes("当前密码不正确") || state.text.includes("修改失败")) {
                throw new Error(state.text);
            }
            return state.current === "" && state.next === "" && state.confirm === "" ? true : false;
        },
        15000,
        250,
    );

    const me = await getStudentMe(passwordSession);
    assert(me.studentId === passwordStudentId, `Expected password-change session to remain logged in as ${passwordStudentId}`);

    await logoutStudentViaUi(passwordSession);
    await loginExpectError({
        studentId: passwordStudentId,
        password: passwordStudentPassword,
        expectedText: "账号或密码错误",
        session: passwordSession,
    });
    await loginAsStudent({
        studentId: passwordStudentId,
        password: passwordStudentNewPassword,
        session: passwordSession,
    });
    const reloginMe = await getStudentMe(passwordSession);
    assert(reloginMe.studentId === passwordStudentId, "Updated password should allow relogin from profile flow");
    await logoutStudent(passwordSession);
}

async function testSingleDeviceSessionEnforcement() {
    log("Checking single-device login enforcement");

    await loginAsStudent({
        studentId: singleDeviceStudentId,
        password: singleDeviceStudentPassword,
        session: devicePrimarySession,
    });
    const primaryMe = await getStudentMe(devicePrimarySession);
    assert(primaryMe.studentId === singleDeviceStudentId, `Expected first device to log in as ${singleDeviceStudentId}`);

    await loginAsStudent({
        studentId: singleDeviceStudentId,
        password: singleDeviceStudentPassword,
        session: deviceSecondarySession,
    });
    const secondaryMe = await getStudentMe(deviceSecondarySession);
    assert(secondaryMe.studentId === singleDeviceStudentId, `Expected second device to log in as ${singleDeviceStudentId}`);

    const invalidated = await browserFetch<ApiEnvelope<StudentUser>>("/api/student/me", undefined, devicePrimarySession);
    assert(invalidated.status === 401, `Expected invalidated session to return 401, got ${invalidated.status}`);
    assert(invalidated.body?.error?.code === "AUTH_005", `Expected AUTH_005 after second login, got ${invalidated.body?.error?.code ?? "unknown"}`);

    await openStudent("/student", devicePrimarySession);
    await waitForPath("/student/login", 15000, devicePrimarySession);
    await logoutStudent(deviceSecondarySession);
}

async function testRejectedTaskRestart() {
    log("Checking rejected student restart flow");

    await loginAsStudent({
        studentId: rejectedStudentId,
        password: rejectedStudentPassword,
        session: rejectedSession,
    });
    await waitForSelector('[data-testid="student-task-grid"]', rejectedSession);

    const tasks = await listStudentTasks(rejectedSession);
    const rejectedTask = tasks.find((task) => task.status === "rejected");
    assert(rejectedTask, "Expected a rejected task for restart coverage");

    await clickByTestId(`student-task-primary-${rejectedTask.id}`, rejectedSession);
    await waitForText("确认重新开始实验", rejectedSession);
    await clickButtonByText("确认重新开始", rejectedSession);
    await waitForPath(`/student/task/${rejectedTask.id}/experiment`, 15000, rejectedSession);
    await waitForSelector('[data-testid="student-experiment-layout"]', rejectedSession);

    const experiment = await getExperiment(rejectedTask.id, rejectedSession);
    assert(experiment.currentStage === 1, `Expected rejected restart to reset to stage 1, got ${experiment.currentStage}`);
    assert(experiment.questionnaire === null, "Expected rejected restart to clear questionnaire content");

    await logoutStudent(rejectedSession);
}

async function testStageFourSubmitFlow() {
    log("Checking stage 4 preview and submit flow");

    await loginAsStudent({
        studentId: stageFourStudentId,
        password: stageFourStudentPassword,
        session: submitSession,
    });

    const tasks = await listStudentTasks(submitSession);
    const targetTask = tasks.find((task) => task.status === "in_progress" && task.currentStage === 4);
    assert(targetTask, "Expected an in-progress stage 4 task for submit coverage");

    await openStudent(`/student/task/${targetTask.id}/experiment`, submitSession);
    await waitForPath(`/student/task/${targetTask.id}/experiment`, 15000, submitSession);
    await waitForSelector('[data-testid="student-stage-analysis-report"]', submitSession);

    const exportMeta = await browserFetchMeta(`/api/student/tasks/${targetTask.id}/export?type=all`, submitSession);
    assert(exportMeta.ok, "Sampling export should succeed before submission");
    assert(exportMeta.contentType?.includes("text/csv") ?? false, `Expected CSV export content type, got ${exportMeta.contentType ?? "unknown"}`);
    assert(exportMeta.size > 0, "Sampling export should be non-empty");

    const exportPath = `${downloadDir}/task-${targetTask.id}-sampling-all.csv`;
    await downloadByLabel("导出全部数据", exportPath, submitSession);
    await expectFileDownloaded(exportPath);
    await expectFileTextContains(exportPath, "__method");

    await setRichTextEditorContent(
        "student-analysis-report-editor",
        "<h2>实验报告</h2><p>本次实验围绕抽样统计流程展开，对简单随机抽样、系统抽样和分层抽样三种方法进行了对比。结果显示三种方法的均值估计总体接近，但分层抽样在结构代表性上更稳定，能够更准确反映总体特征。</p><p>从误差控制角度看，系统抽样受起始点影响更明显，简单随机抽样实现成本较低但波动更大。综合效率、误差和代表性，本次任务更适合采用分层抽样。后续若继续优化，可增加分层变量并结合更细粒度的样本分配方案，以提升结论可靠性。</p>",
        submitSession,
    );

    await waitFor(
        "analysis preview button to enable",
        async () => (await isButtonEnabled("student-analysis-preview", submitSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-analysis-preview", submitSession);
    await waitForPath(`/student/task/${targetTask.id}/preview`, 15000, submitSession);
    await waitForSelector('[data-testid="student-submission-preview"]', submitSession);

    await clickByTestId("student-preview-submit", submitSession);
    await waitForSelector('[data-testid="student-preview-submit-dialog"]', submitSession);
    await clickByTestId("student-preview-submit-confirm", submitSession);
    await waitForPath("/student", 15000, submitSession);

    const submittedTask = await waitFor(
        `task ${targetTask.id} to become submitted`,
        async () => {
            const currentTasks = await listStudentTasks(submitSession);
            const current = currentTasks.find((task) => task.id === targetTask.id);
            if (!current) return false;
            return current.status === "submitted" || current.status === "grading" || current.status === "graded" ? current : false;
        },
        15000,
        500,
    );
    assert(submittedTask.currentStage === 4, `Expected submitted task to remain at stage 4, got ${submittedTask.currentStage}`);

    const submissions = await waitFor(
        `new submission for task ${targetTask.id}`,
        async () => {
            const current = await listSubmissions(targetTask.id, submitSession);
            return current.length > 0 ? current : false;
        },
        15000,
        500,
    );

    const latestSubmission = submissions[0]!;
    const detail = await waitFor(
        `generated PDFs for submission ${latestSubmission.id}`,
        async () => {
            const current = await getSubmissionDetail(latestSubmission.id, submitSession);
            return current.pdfStatus === "ready" ? current : false;
        },
        20000,
        500,
    );
    assert(detail.questionnairePdfPath && detail.reportPdfPath, "Newly submitted experiment should generate both PDFs");

    const questionnaireMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=questionnaire`, submitSession);
    assert(questionnaireMeta.ok, "New questionnaire PDF should be downloadable");
    assert(questionnaireMeta.size > 0, "New questionnaire PDF should be non-empty");

    const reportMeta = await browserFetchMeta(`/api/student/submissions/${latestSubmission.id}/download?type=report`, submitSession);
    assert(reportMeta.ok, "New report PDF should be downloadable");
    assert(reportMeta.size > 0, "New report PDF should be non-empty");

    await logoutStudent(submitSession);
}

async function main() {
    log("Preparing student e2e suite");
    await ensureTooling();
    await mkdir(downloadDir, { recursive: true });
    await resetDatabase();
    await startServer();

    await testLoginErrors();
    await testFirstLoginPasswordChange();
    await testQuestionnaireStageFlow();
    await testSamplePlanStageFlow();
    await testSamplingStageFlow();
    await testMainStudentExperience();
    await testNotificationCenter();
    await testGradedSubmissionDetail();
    await testProfilePasswordChange();
    await testSingleDeviceSessionEnforcement();
    await testRejectedTaskRestart();
    await testStageFourSubmitFlow();

    log("Student e2e suite passed");
}

try {
    await main();
} finally {
    await reseedDatabase().catch((error) => {
        console.error("[student-e2e] Failed to reseed database:", error);
    });
    await Promise.all([
        closeBrowser(mainSession),
        closeBrowser(firstLoginSession),
        closeBrowser(rejectedSession),
        closeBrowser(submitSession),
        closeBrowser(questionnaireSession),
        closeBrowser(samplePlanSession),
        closeBrowser(samplingSession),
        closeBrowser(notificationSession),
        closeBrowser(gradedSession),
        closeBrowser(passwordSession),
        closeBrowser(devicePrimarySession),
        closeBrowser(deviceSecondarySession),
        closeBrowser(invalidSession),
        closeBrowser(lockedSession),
        closeBrowser(disabledSession),
    ]).catch(() => undefined);
    await stopServer().catch((error) => {
        console.error("[student-e2e] Failed to stop server:", error);
    });
    await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
}
