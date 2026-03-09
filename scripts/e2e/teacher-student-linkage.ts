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

type TeacherUser = {
    id: number;
    employeeId?: string;
    account?: string;
    name: string;
    type: "teacher" | "assistant";
};

type TeacherClass = {
    id: number;
    name: string;
    semester: string | null;
    studentCount: number;
    createdAt: string;
};

type TeacherTopic = {
    id: number;
    name: string;
    description: string | null;
    status: number;
    dataRows: number;
    createdAt: string;
};

type StudentUser = {
    id: number;
    studentId: string;
    name: string;
    classId: number;
    className: string | null;
    isFirstLogin: number;
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

type SubmissionSummary = {
    id: number;
    submittedAt: string;
    status: number;
    totalScore: number | null;
    gradedAt: string | null;
    graderName: string | null;
    rejectReason: string | null;
};

type StudentSubmissionDetail = {
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

type TeacherNotification = {
    id: number;
    type: string;
    title: string;
    content: string;
    isRead: number;
    createdAt: string;
    relatedType: string | null;
    relatedId: number | null;
};

type TeacherNotificationsPayload = {
    notifications: TeacherNotification[];
    unreadCount: number;
};

type NotificationsPayload = {
    notifications: StudentNotification[];
    unreadCount: number;
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

type TeacherGradingItem = {
    id: number;
    studentName: string;
    studentId: string;
    topic: string;
    className: string;
    submittedAt: string;
    status: number;
    score: number | null;
    gradedByType?: number | null;
    gradedById?: number | null;
    gradedByName?: string | null;
    gradedAt?: string | null;
};

type TeacherSubmissionDetail = {
    id: number;
    studentName: string;
    studentId: string;
    className: string;
    topicName: string;
    status: number;
    teacherComment: string | null;
    rejectReason: string | null;
    gradedByName?: string | null;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
};

type TeacherStats = {
    stats: Array<{
        label: string;
        value: number;
    }>;
    recentSubmissions: Array<{
        student: string;
        class: string;
        topic: string;
        time: string;
    }>;
    recentGradings: Array<{
        student: string;
        class: string;
        topic: string;
        score: string | null;
        rejected: boolean;
        time: string;
    }>;
};

type TeacherTaskSummary = {
    id: number;
    topic: string;
    className: string;
    publishedAt: string | null;
    deadline: string | null;
    total: number;
    completed: number;
    pending: number;
};

type TeacherTaskProgressData = {
    task: {
        topicName: string;
        className: string;
        deadline: string | null;
    };
    counts: {
        not_started: number;
        stage1: number;
        stage2: number;
        stage3: number;
        stage4: number;
        submitted: number;
        graded: number;
        rejected: number;
    };
    students: Array<{
        studentId: string;
        name: string;
        status: string;
        stage: number | null;
        lastActivity: string | null;
        submissionId: number | null;
    }>;
};

const projectRoot = process.cwd();
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const runId = Date.now().toString().slice(-6);
const shouldResetDb = process.env.E2E_SKIP_DB_RESET !== "1";
const shouldReseedDb = process.env.E2E_SKIP_DB_RESEED !== "1";
const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === "1";

const teacherSession = process.env.E2E_TEACHER_STUDENT_TEACHER_SESSION ?? `teacher-student-teacher-e2e-${runId}`;
const assistantSession = process.env.E2E_TEACHER_STUDENT_ASSISTANT_SESSION ?? `teacher-student-assistant-e2e-${runId}`;
const studentGradeSession = process.env.E2E_TEACHER_STUDENT_GRADE_SESSION ?? `teacher-student-grade-e2e-${runId}`;
const studentAssistantGradeSession = process.env.E2E_TEACHER_STUDENT_ASSISTANT_GRADE_SESSION ?? `teacher-student-assistant-grade-e2e-${runId}`;
const studentAssistantRejectSession = process.env.E2E_TEACHER_STUDENT_ASSISTANT_REJECT_SESSION ?? `teacher-student-assistant-reject-e2e-${runId}`;
const studentRejectSession = process.env.E2E_TEACHER_STUDENT_REJECT_SESSION ?? `teacher-student-reject-e2e-${runId}`;
const studentPublishSession = process.env.E2E_TEACHER_STUDENT_PUBLISH_SESSION ?? `teacher-student-publish-e2e-${runId}`;

const teacherUsername = process.env.E2E_TEACHER_STUDENT_TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.E2E_TEACHER_STUDENT_TEACHER_PASSWORD ?? "123456";
const assistantUsername = process.env.E2E_TEACHER_STUDENT_ASSISTANT_USERNAME ?? "assistant";
const assistantPassword = process.env.E2E_TEACHER_STUDENT_ASSISTANT_PASSWORD ?? "123456";
const gradeStudentId = process.env.E2E_TEACHER_STUDENT_GRADE_ID ?? "2024006";
const gradeStudentPassword = process.env.E2E_TEACHER_STUDENT_GRADE_PASSWORD ?? "123456";
const publishStudentId = process.env.E2E_TEACHER_STUDENT_PUBLISH_ID ?? "2024001";
const publishStudentPassword = process.env.E2E_TEACHER_STUDENT_PUBLISH_PASSWORD ?? "123456";

const invalidRejectStudentIds = new Set(["2024013", "2024014", "2024204"]);

const draftComment = `教师联动草稿 ${runId}`;
const draftScores = {
    questionnaire: 78,
    process: 82,
    report: 84,
};
const assistantGradeComment = `助教联动评分 ${runId}`;
const assistantRejectComment = `助教联动驳回评语 ${runId}`;
const assistantRejectReason = `助教联动驳回原因 ${runId}，请补充抽样过程说明、指标解释和结论依据。`;
const gradeComment = `教师联动评分 ${runId}`;
const rejectComment = `教师联动驳回评语 ${runId}`;
const rejectReason = `教师联动驳回原因 ${runId}，请补充抽样说明、误差分析和结论依据。`;
const expectedAssistantScore = 88;
const expectedGradedScore = 90;

let serverProcess: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
let teacherLoggedIn = false;

function log(message: string) {
    console.log(`[teacher-student-e2e] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function formatCommand(cmd: string[]) {
    return cmd.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function toDateTimeLocal(value: Date) {
    const copy = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return copy.toISOString().slice(0, 16);
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

async function runBrowser(args: string[], options: RunCommandOptions = {}, session = teacherSession) {
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

async function browserJson<T>(body: string, session = teacherSession): Promise<T> {
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
    session = teacherSession,
) {
    const requestUrl = path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `${baseUrl}${path}`;
    const payload = JSON.stringify({
        url: requestUrl,
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

        const response = await fetch(payload.url, {
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

async function bodyText(session = teacherSession) {
    return browserJson<string>("return document.body.innerText;", session);
}

async function currentPath(session = teacherSession) {
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

async function waitForPath(pathname: string, timeoutMs = 15000, session = teacherSession) {
    await waitFor(
        `path ${pathname}`,
        async () => ((await currentPath(session)) === pathname ? true : false),
        timeoutMs,
    );
}

async function waitForText(text: string, session = teacherSession, timeoutMs = 15000) {
    await waitFor(
        `text ${text}`,
        async () => ((await bodyText(session)).includes(text) ? true : false),
        timeoutMs,
    );
}

async function waitForSelector(selector: string, session = teacherSession, timeoutMs = 15000) {
    await waitFor(
        `selector ${selector}`,
        async () => {
            const exists = await browserJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`, session);
            return exists ? true : false;
        },
        timeoutMs,
    );
}

async function hasSelector(selector: string, session = teacherSession) {
    return browserJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`, session);
}

async function clickByTestId(testId: string, session = teacherSession) {
    const clicked = await browserJson<boolean>(`
        const element = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        if (!(element instanceof HTMLElement)) return false;
        element.click();
        return true;
    `, session);
    assert(clicked, `Could not click data-testid="${testId}"`);
}

async function clickButtonByText(label: string, session = teacherSession) {
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

async function selectOptionByText(triggerSelector: string, optionText: string, session = teacherSession) {
    await runBrowser(["click", triggerSelector], {}, session);
    await waitFor(
        `select option ${optionText}`,
        async () => {
            const state = await browserJson<{ clicked: boolean }>(`
                const isVisible = (element) => {
                    if (!(element instanceof HTMLElement)) return false;
                    const style = window.getComputedStyle(element);
                    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
                };
                const option = Array.from(document.querySelectorAll('[role="option"], [data-radix-collection-item]'))
                    .find((element) => {
                        const text = element.textContent?.trim() ?? "";
                        return isVisible(element) && (text === ${JSON.stringify(optionText)} || text.includes(${JSON.stringify(optionText)}));
                    });
                if (!(option instanceof HTMLElement)) {
                    return { clicked: false };
                }
                option.click();
                return { clicked: true };
            `, session);
            return state.clicked ? state : false;
        },
        15000,
        250,
    );
    await runBrowser(["wait", "250"], {}, session);
}

async function isButtonEnabled(testId: string, session = teacherSession) {
    return browserJson<boolean>(`
        const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        return button instanceof HTMLButtonElement && !button.disabled;
    `, session);
}

async function setRichTextEditorContent(testId: string, html: string, session = teacherSession) {
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

async function hasCommand(command: string) {
    const lookup = await runCommand(["bash", "-lc", `command -v ${JSON.stringify(command)}`], { allowFailure: true });
    return lookup.exitCode === 0 && Boolean(lookup.stdout.trim());
}

async function ensureTooling() {
    assert(await hasCommand("agent-browser"), "Missing required tool: agent-browser");
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

async function stopServer() {
    if (!serverProcess) return;

    const proc = serverProcess;
    serverProcess = null;
    proc.kill();
    await proc.exited;
}

async function closeBrowser(session: string) {
    await runBrowser(["close"], { allowFailure: true }, session);
}

async function openTeacher(path: string, session = teacherSession) {
    await runBrowser(["open", `${baseUrl}${path}`], {}, session);
}

async function openStudent(path: string, session = studentGradeSession) {
    await runBrowser(["open", `${baseUrl}${path}`], {}, session);
}

async function getTeacherMe(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherUser>>("/api/teacher/me", undefined, session);
    assert(response.status === 200, `Teacher me returned status ${response.status}`);
    assert(response.body?.success, "Teacher me did not return success");
    assert(response.body.data, "Teacher me should return data");
    return response.body.data;
}

async function getTeacherDashboard(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherStats>>("/api/teacher/dashboard", undefined, session);
    assert(response.status === 200, `Teacher dashboard returned status ${response.status}`);
    assert(response.body?.success, "Teacher dashboard did not return success");
    assert(response.body.data, "Teacher dashboard should return data");
    return response.body.data;
}

async function listTeacherNotifications(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherNotificationsPayload>>("/api/teacher/notifications", undefined, session);
    assert(response.status === 200, `Teacher notifications returned status ${response.status}`);
    assert(response.body?.success, "Teacher notifications did not return success");
    assert(response.body.data, "Teacher notifications should return data");
    return response.body.data;
}

async function markTeacherNotificationAsRead(notificationId: number, session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<{ success: boolean }>>(`/api/teacher/notifications/${notificationId}/read`, { method: "PUT" }, session);
    assert(response.status === 200, `Teacher notification read ${notificationId} returned status ${response.status}`);
    assert(response.body?.success, `Teacher notification read ${notificationId} did not return success`);
}

async function listTeacherClasses(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherClass[]>>("/api/teacher/classes", undefined, session);
    assert(response.status === 200, `Teacher classes returned status ${response.status}`);
    assert(response.body?.success, "Teacher classes did not return success");
    return response.body.data ?? [];
}

async function listTeacherTopics(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherTopic[]>>("/api/teacher/topics", undefined, session);
    assert(response.status === 200, `Teacher topics returned status ${response.status}`);
    assert(response.body?.success, "Teacher topics did not return success");
    return response.body.data ?? [];
}

async function listTeacherTasks(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherTaskSummary[]>>("/api/teacher/tasks", undefined, session);
    assert(response.status === 200, `Teacher tasks returned status ${response.status}`);
    assert(response.body?.success, "Teacher tasks did not return success");
    return response.body.data ?? [];
}

async function listTeacherGrading(status?: string, session = teacherSession) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await browserFetch<ApiEnvelope<TeacherGradingItem[]>>(`/api/teacher/grading${query}`, undefined, session);
    assert(response.status === 200, `Teacher grading list returned status ${response.status}`);
    assert(response.body?.success, "Teacher grading list did not return success");
    return response.body.data ?? [];
}

async function getTeacherTaskProgress(taskId: number, session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherTaskProgressData>>(`/api/teacher/tasks/${taskId}/progress`, undefined, session);
    assert(response.status === 200, `Teacher task progress ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Teacher task progress ${taskId} did not return success`);
    assert(response.body.data, `Teacher task progress ${taskId} should return data`);
    return response.body.data;
}

async function getTeacherSubmissionDetail(submissionId: number, session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<TeacherSubmissionDetail>>(`/api/teacher/grading/${submissionId}`, undefined, session);
    assert(response.status === 200, `Teacher grading detail ${submissionId} returned status ${response.status}`);
    assert(response.body?.success, `Teacher grading detail ${submissionId} did not return success`);
    assert(response.body.data, `Teacher grading detail ${submissionId} should return data`);
    return response.body.data;
}

async function getStudentMe(session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<StudentUser>>("/api/student/me", undefined, session);
    assert(response.status === 200, `Student me returned status ${response.status}`);
    assert(response.body?.success, "Student me did not return success");
    assert(response.body.data, "Student me should return data");
    return response.body.data;
}

async function listStudentTasks(session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<StudentTask[]>>("/api/student/tasks", undefined, session);
    assert(response.status === 200, `Student tasks returned status ${response.status}`);
    assert(response.body?.success, "Student tasks did not return success");
    return response.body.data ?? [];
}

async function listStudentNotifications(session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<NotificationsPayload>>("/api/student/notifications", undefined, session);
    assert(response.status === 200, `Student notifications returned status ${response.status}`);
    assert(response.body?.success, "Student notifications did not return success");
    assert(response.body.data, "Student notifications should return data");
    return response.body.data;
}

async function listStudentSubmissions(taskId: number, session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<SubmissionSummary[]>>(`/api/student/tasks/${taskId}/submissions`, undefined, session);
    assert(response.status === 200, `Student submissions for task ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Student submissions for task ${taskId} did not return success`);
    return response.body.data ?? [];
}

async function getStudentSubmissionDetail(submissionId: number, session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<StudentSubmissionDetail>>(`/api/student/submissions/${submissionId}`, undefined, session);
    assert(response.status === 200, `Student submission detail ${submissionId} returned status ${response.status}`);
    assert(response.body?.success, `Student submission detail ${submissionId} did not return success`);
    assert(response.body.data, `Student submission detail ${submissionId} should return data`);
    return response.body.data;
}

async function getExperiment(taskId: number, session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<ExperimentData>>(`/api/student/tasks/${taskId}/experiment`, undefined, session);
    assert(response.status === 200, `Experiment ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Experiment ${taskId} did not return success`);
    assert(response.body.data, `Experiment ${taskId} should return data`);
    return response.body.data;
}

async function loginAsTeacher(options: {
    username: string;
    password: string;
    session?: string;
    expectedPath?: string;
}) {
    const session = options.session ?? teacherSession;
    const expectedPath = options.expectedPath ?? "/teacher";

    log(`Logging in as teacher ${options.username}`);
    await openTeacher("/teacher/login", session);
    const existing = await browserFetch<ApiEnvelope<TeacherUser>>("/api/teacher/me", undefined, session);
    if (
        existing.status === 200
        && existing.body?.success
        && existing.body.data
        && (existing.body.data.employeeId === options.username || existing.body.data.account === options.username)
    ) {
        await openTeacher(expectedPath, session);
        await waitForPath(expectedPath, 15000, session);
        await runBrowser(["wait", "500"], {}, session);
        return;
    }

    const loginState = await waitFor(
        `teacher login form or ${expectedPath}`,
        async () => {
            const path = await currentPath(session);
            if (path === expectedPath) {
                return { authenticated: true };
            }

            const hasForm = await browserJson<boolean>(`return !!document.querySelector('[data-testid="teacher-login-submit"]');`, session);
            return hasForm ? { authenticated: false } : false;
        },
        15000,
        250,
    );
    if (!loginState.authenticated) {
        await runBrowser(["fill", '[data-testid="teacher-login-username"]', options.username], {}, session);
        await runBrowser(["fill", '[data-testid="teacher-login-password"]', options.password], {}, session);
        await runBrowser(["click", '[data-testid="teacher-login-submit"]'], {}, session);
        await waitForPath(expectedPath, 15000, session);
    }
    await runBrowser(["wait", "500"], {}, session);
}

async function ensureTeacherSession() {
    if (teacherLoggedIn) {
        const response = await browserFetch<ApiEnvelope<TeacherUser>>("/api/teacher/me", undefined, teacherSession);
        if (response.status === 200 && response.body?.success && response.body.data?.employeeId === teacherUsername) {
            return;
        }
    }

    await loginAsTeacher({
        username: teacherUsername,
        password: teacherPassword,
        session: teacherSession,
        expectedPath: "/teacher",
    });
    const me = await getTeacherMe(teacherSession);
    assert(me.employeeId === teacherUsername, `Expected teacher session for ${teacherUsername}, got ${me.employeeId ?? "unknown"}`);
    teacherLoggedIn = true;
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
    const existing = await browserFetch<ApiEnvelope<StudentUser>>("/api/student/me", undefined, options.session);
    if (
        existing.status === 200
        && existing.body?.success
        && existing.body.data?.studentId === options.studentId
    ) {
        await openStudent(expectedPath, options.session);
        await waitForPath(expectedPath, 15000, options.session);
        await runBrowser(["wait", "500"], {}, options.session);
        return;
    }

    const loginState = await waitFor(
        `student login form or ${expectedPath}`,
        async () => {
            const path = await currentPath(options.session);
            if (path === expectedPath) {
                return { authenticated: true };
            }

            const hasForm = await browserJson<boolean>(`return !!document.querySelector('[data-testid="student-login-submit"]');`, options.session);
            return hasForm ? { authenticated: false } : false;
        },
        15000,
        250,
    );
    if (!loginState.authenticated) {
        await runBrowser(["fill", '[data-testid="student-login-username"]', options.studentId], {}, options.session);
        await runBrowser(["fill", '[data-testid="student-login-password"]', options.password], {}, options.session);
        await runBrowser(["click", '[data-testid="student-login-submit"]'], {}, options.session);
        await waitForPath(expectedPath, 15000, options.session);
    }
    await runBrowser(["wait", "500"], {}, options.session);
}

async function logoutTeacher(session = teacherSession) {
    const response = await browserFetch<ApiEnvelope<{ success?: boolean }>>("/api/teacher/logout", { method: "POST" }, session);
    assert(response.status === 200, `Teacher logout returned status ${response.status}`);
    await openTeacher("/teacher/login", session);
    await waitForPath("/teacher/login", 15000, session);
    if (session === teacherSession) {
        teacherLoggedIn = false;
    }
}

async function logoutStudent(session = studentGradeSession) {
    const response = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", { method: "POST" }, session);
    assert(response.status === 200, `Student logout returned status ${response.status}`);
    await openStudent("/student/login", session);
    await waitForPath("/student/login", 15000, session);
}

async function waitForStageFourTask(studentId: string, session: string) {
    const tasks = await listStudentTasks(session);
    const targetTask = tasks.find((task) => task.status === "in_progress" && task.currentStage === 4);
    assert(targetTask, `Expected an in-progress stage 4 task for ${studentId}`);
    return targetTask;
}

async function testTeacherPublishesTaskAndStudentStartsExperiment() {
    log("Checking teacher publish/extend -> student task visibility linkage");

    await ensureTeacherSession();
    await loginAsStudent({
        studentId: publishStudentId,
        password: publishStudentPassword,
        session: studentPublishSession,
    });

    const studentMe = await getStudentMe(studentPublishSession);
    const beforeNotifications = await listStudentNotifications(studentPublishSession);
    const beforeTasks = await listStudentTasks(studentPublishSession);

    const teacherClasses = await listTeacherClasses(teacherSession);
    const targetClass = teacherClasses.find((item) => item.name === studentMe.className);
    assert(targetClass, `Expected teacher class matching student class ${studentMe.className ?? "unknown"}`);

    const teacherTopics = await listTeacherTopics(teacherSession);
    const teacherTasks = await listTeacherTasks(teacherSession);
    const assignedTopicNames = new Set(
        teacherTasks
            .filter((task) => task.className === targetClass.name)
            .map((task) => task.topic),
    );
    const publishTopic = teacherTopics.find((topic) => topic.status === 1 && !assignedTopicNames.has(topic.name));
    assert(publishTopic, `Expected at least one published topic not assigned to class ${targetClass.name}`);

    await openTeacher("/teacher/task", teacherSession);
    await waitForPath("/teacher/task", 15000, teacherSession);
    await waitForSelector('[data-testid="teacher-task-publish-open"]', teacherSession);
    await clickByTestId("teacher-task-publish-open", teacherSession);
    await waitForSelector('[data-testid="teacher-task-topic-select"]', teacherSession);
    await selectOptionByText('[data-testid="teacher-task-topic-select"]', publishTopic.name, teacherSession);
    await clickByTestId(`teacher-task-class-check-${targetClass.id}`, teacherSession);

    const publishedDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await runBrowser(["fill", '[data-testid="teacher-task-deadline"]', toDateTimeLocal(publishedDeadline)], {}, teacherSession);
    await clickByTestId("teacher-task-publish-submit", teacherSession);

    const createdTask = await waitFor(
        `published task ${publishTopic.name} / ${targetClass.name}`,
        async () => {
            const tasks = await listTeacherTasks(teacherSession);
            return tasks.find((task) => task.topic === publishTopic.name && task.className === targetClass.name) ?? false;
        },
        15000,
        500,
    );
    assert(createdTask.total > 0, `Expected published task ${createdTask.id} to include class students`);
    assert(createdTask.completed === 0, `Expected new published task ${createdTask.id} to start with zero completed submissions, got ${createdTask.completed}`);
    assert(createdTask.pending === 0, `Expected new published task ${createdTask.id} to start with zero pending gradings, got ${createdTask.pending}`);

    const initialProgress = await getTeacherTaskProgress(createdTask.id, teacherSession);
    const initialStudentRow = initialProgress.students.find((item) => item.studentId === publishStudentId);
    assert(initialStudentRow, `Expected teacher progress row for newly published student ${publishStudentId}`);
    assert(initialStudentRow.status === "not_started", `Expected new task row for ${publishStudentId} to start as not_started, got ${initialStudentRow.status}`);

    const visibleTask = await waitFor(
        `student published task ${createdTask.id}`,
        async () => {
            const tasks = await listStudentTasks(studentPublishSession);
            return tasks.find((task) => task.id === createdTask.id && task.status === "not_started") ?? false;
        },
        15000,
        500,
    );
    assert(visibleTask.name === publishTopic.name, `Expected student published task name ${publishTopic.name}, got ${visibleTask.name}`);

    const publishNotifications = await listStudentNotifications(studentPublishSession);
    assert(
        publishNotifications.notifications.some((notification) =>
            notification.title === "新任务已发布"
            && notification.content.includes(publishTopic.name)
        ),
        `Expected published task notification for topic ${publishTopic.name}`,
    );
    assert(publishNotifications.notifications.length >= beforeNotifications.notifications.length + 1, "Expected student notifications to grow after task publish");

    const openedExperiment = await browserFetch<ApiEnvelope<ExperimentData>>(`/api/student/tasks/${createdTask.id}/experiment`, undefined, studentPublishSession);
    assert(openedExperiment.status === 200, `Expected experiment bootstrap for task ${createdTask.id} to return 200, got ${openedExperiment.status}`);
    assert(openedExperiment.body?.success, `Expected experiment bootstrap for task ${createdTask.id} to succeed`);
    assert(openedExperiment.body.data?.currentStage === 0, `Expected fresh experiment for task ${createdTask.id} to start at stage 0, got ${openedExperiment.body?.data?.currentStage ?? "unknown"}`);

    await openStudent(`/student/task/${createdTask.id}/experiment`, studentPublishSession);
    await waitForPath(`/student/task/${createdTask.id}/experiment`, 15000, studentPublishSession);
    await waitForSelector('[data-testid="student-experiment-layout"]', studentPublishSession);

    const inProgressTask = await waitFor(
        `student task ${createdTask.id} to become in_progress`,
        async () => {
            const tasks = await listStudentTasks(studentPublishSession);
            return tasks.find((task) => task.id === createdTask.id && task.status === "in_progress") ?? false;
        },
        15000,
        500,
    );
    assert(inProgressTask.currentStage === 0, `Expected fresh in-progress task ${createdTask.id} to stay at stage 0, got ${inProgressTask.currentStage}`);

    const stageOneProgress = await waitFor(
        `teacher task progress stage1 for ${publishStudentId}`,
        async () => {
            const progress = await getTeacherTaskProgress(createdTask.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === publishStudentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "stage1" ? { progress, studentRow } : false;
        },
        15000,
        500,
    );
    assert(stageOneProgress.progress.counts.not_started === initialProgress.counts.not_started - 1, `Expected not_started count to drop by 1 after opening experiment, got ${stageOneProgress.progress.counts.not_started}`);
    assert(stageOneProgress.progress.counts.stage1 === initialProgress.counts.stage1 + 1, `Expected stage1 count to rise by 1 after opening experiment, got ${stageOneProgress.progress.counts.stage1}`);

    await openTeacher("/teacher/task", teacherSession);
    await waitForPath("/teacher/task", 15000, teacherSession);
    await waitForSelector(`[data-testid="teacher-task-extend-open-${createdTask.id}"]`, teacherSession);
    await clickByTestId(`teacher-task-extend-open-${createdTask.id}`, teacherSession);
    await waitForSelector('[data-testid="teacher-task-extend-submit"]', teacherSession);

    const extendedDeadline = new Date(publishedDeadline.getTime() + 7 * 24 * 60 * 60 * 1000);
    await runBrowser(["fill", '[data-testid="teacher-task-extend-deadline"]', toDateTimeLocal(extendedDeadline)], {}, teacherSession);
    await clickByTestId("teacher-task-extend-submit", teacherSession);

    const extendedTask = await waitFor(
        `teacher extended task ${createdTask.id}`,
        async () => {
            const task = await getTeacherTaskSummary(createdTask.id, teacherSession);
            return task.deadline && new Date(task.deadline).getTime() > (createdTask.deadline ? new Date(createdTask.deadline).getTime() : 0) ? task : false;
        },
        15000,
        500,
    );
    assert(extendedTask.deadline, `Expected extended task ${createdTask.id} to keep a deadline`);

    const studentExtendedTask = await waitFor(
        `student extended task ${createdTask.id}`,
        async () => {
            const tasks = await listStudentTasks(studentPublishSession);
            const task = tasks.find((item) => item.id === createdTask.id);
            if (!task?.deadline || !extendedTask.deadline) {
                return false;
            }
            return new Date(task.deadline).getTime() === new Date(extendedTask.deadline).getTime() ? task : false;
        },
        15000,
        500,
    );
    assert(studentExtendedTask.deadline === extendedTask.deadline, "Student task deadline should match teacher extended deadline");

    const extendNotifications = await listStudentNotifications(studentPublishSession);
    assert(
        extendNotifications.notifications.some((notification) =>
            notification.title === "截止时间已延长"
            && notification.content.includes("截止时间已延长至")
        ),
        `Expected deadline extension notification for student ${publishStudentId}`,
    );
    assert(extendNotifications.notifications.length >= beforeNotifications.notifications.length + 2, "Expected student notifications to grow after publish and extend");

    const afterTasks = await listStudentTasks(studentPublishSession);
    assert(afterTasks.length >= beforeTasks.length + 1, "Expected student task list to grow after teacher publishes a task");

    await logoutStudent(studentPublishSession);
}

function getStatValue(stats: TeacherStats, label: string) {
    return stats.stats.find((item) => item.label === label)?.value ?? 0;
}

async function getTeacherTaskSummary(taskId: number, session = teacherSession) {
    const tasks = await listTeacherTasks(session);
    const task = tasks.find((item) => item.id === taskId);
    assert(task, `Expected teacher task summary for task ${taskId}`);
    return task;
}

async function findTeacherTaskProgressBySubmission(submissionId: number, studentId: string, session = teacherSession) {
    const tasks = await listTeacherTasks(session);
    for (const task of tasks) {
        const progress = await getTeacherTaskProgress(task.id, session);
        const studentRow = progress.students.find((item) => item.studentId === studentId && item.submissionId === submissionId);
        if (studentRow) {
            return { task, progress, studentRow };
        }
    }

    throw new Error(`Could not find teacher task progress row for submission ${submissionId} / student ${studentId}`);
}

async function submitStageFourExperiment() {
    log("Checking student submit -> teacher pending linkage");

    await loginAsStudent({
        studentId: gradeStudentId,
        password: gradeStudentPassword,
        session: studentGradeSession,
    });
    const me = await getStudentMe(studentGradeSession);
    assert(me.studentId === gradeStudentId, `Expected student session for ${gradeStudentId}, got ${me.studentId}`);

    const targetTask = await waitForStageFourTask(gradeStudentId, studentGradeSession);
    const beforeSubmissions = await listStudentSubmissions(targetTask.id, studentGradeSession);
    await ensureTeacherSession();
    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });
    const beforeDashboard = await getTeacherDashboard(teacherSession);
    const beforeTeacherNotifications = await listTeacherNotifications(teacherSession);
    const assistantMe = await getTeacherMe(assistantSession);
    assert(assistantMe.account === assistantUsername, `Expected assistant session for ${assistantUsername}, got ${assistantMe.account ?? "unknown"}`);
    const beforeAssistantNotifications = await listTeacherNotifications(assistantSession);
    const beforeTaskSummary = await getTeacherTaskSummary(targetTask.id, teacherSession);
    const beforeTaskProgress = await getTeacherTaskProgress(targetTask.id, teacherSession);
    const beforeStudentRow = beforeTaskProgress.students.find((item) => item.studentId === gradeStudentId);
    assert(beforeStudentRow, `Expected teacher task progress row for ${gradeStudentId} before submission`);
    assert(beforeStudentRow.status === "stage4", `Expected ${gradeStudentId} to be in teacher stage4 bucket before submission, got ${beforeStudentRow.status}`);

    await openStudent(`/student/task/${targetTask.id}/experiment`, studentGradeSession);
    await waitForPath(`/student/task/${targetTask.id}/experiment`, 15000, studentGradeSession);
    await waitForSelector('[data-testid="student-stage-analysis-report"]', studentGradeSession);

    await setRichTextEditorContent(
        "student-analysis-report-editor",
        `<h2>教师学生联动报告 ${runId}</h2><p>本次实验围绕抽样统计的完整流程展开，对样本设计、抽样执行和结果解释进行了系统分析。通过对比简单随机抽样、系统抽样和分层抽样的结果，可以看到不同方法在代表性、误差控制和实施成本上各有差异。</p><p>结合本轮实验数据，分层抽样在保持总体结构一致性方面表现更稳定，系统抽样在执行效率上更直接，而简单随机抽样更便于说明抽样原理。综合课堂任务目标、误差来源和样本结构，本次报告建议以分层抽样结论为主，并在最终解释中补充系统误差与样本偏差的说明。</p>`,
        studentGradeSession,
    );

    await waitFor(
        "analysis preview button to enable",
        async () => (await isButtonEnabled("student-analysis-preview", studentGradeSession)) ? true : false,
        10000,
        250,
    );
    await clickByTestId("student-analysis-preview", studentGradeSession);
    await waitForPath(`/student/task/${targetTask.id}/preview`, 15000, studentGradeSession);
    await waitForSelector('[data-testid="student-submission-preview"]', studentGradeSession);

    await clickByTestId("student-preview-submit", studentGradeSession);
    await waitForSelector('[data-testid="student-preview-submit-dialog"]', studentGradeSession);
    await clickByTestId("student-preview-submit-confirm", studentGradeSession);
    await waitForPath("/student", 15000, studentGradeSession);

    const submittedTask = await waitFor(
        `task ${targetTask.id} to become submitted`,
        async () => {
            const tasks = await listStudentTasks(studentGradeSession);
            const current = tasks.find((task) => task.id === targetTask.id);
            if (!current) return false;
            return current.status === "submitted" || current.status === "grading" || current.status === "graded" ? current : false;
        },
        15000,
        500,
    );
    assert(submittedTask.currentStage === 4, `Expected submitted task to remain at stage 4, got ${submittedTask.currentStage}`);

    const createdSubmission = await waitFor(
        `new submission for task ${targetTask.id}`,
        async () => {
            const current = await listStudentSubmissions(targetTask.id, studentGradeSession);
            const created = current.find((submission) => !beforeSubmissions.some((prev) => prev.id === submission.id));
            return created ?? false;
        },
        15000,
        500,
    );
    const pendingDetail = await getStudentSubmissionDetail(createdSubmission.id, studentGradeSession);
    assert(pendingDetail.status === 1, `Expected newly created submission ${createdSubmission.id} to be pending, got ${pendingDetail.status}`);

    const afterSubmitProgress = await waitFor(
        `teacher task progress for submitted task ${targetTask.id}`,
        async () => {
            const progress = await getTeacherTaskProgress(targetTask.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === gradeStudentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "submitted" && studentRow.submissionId === createdSubmission.id
                ? { progress, studentRow }
                : false;
        },
        15000,
        500,
    );
    assert(afterSubmitProgress.progress.counts.stage4 === beforeTaskProgress.counts.stage4 - 1, `Expected teacher stage4 count to drop by 1 after submission, got ${afterSubmitProgress.progress.counts.stage4}`);
    assert(afterSubmitProgress.progress.counts.submitted === beforeTaskProgress.counts.submitted + 1, `Expected teacher submitted count to rise by 1 after submission, got ${afterSubmitProgress.progress.counts.submitted}`);

    const afterSubmitTaskSummary = await waitFor(
        `teacher task summary for submitted task ${targetTask.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(targetTask.id, teacherSession);
            return summary.completed === beforeTaskSummary.completed + 1 && summary.pending === beforeTaskSummary.pending + 1 ? summary : false;
        },
        15000,
        500,
    );
    assert(afterSubmitTaskSummary.total === beforeTaskSummary.total, "Teacher task total student count should stay stable after submission");

    const afterSubmitDashboard = await waitFor(
        "teacher dashboard to reflect new submission",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(beforeDashboard, "待批改作业") + 1
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(
        afterSubmitDashboard.recentSubmissions.some((item) => item.student === me.name && item.topic === targetTask.name),
        `Expected teacher recent submissions to include ${me.name} / ${targetTask.name}`,
    );

    const teacherNotificationState = await waitFor(
        `teacher notification for submission ${createdSubmission.id}`,
        async () => {
            const payload = await listTeacherNotifications(teacherSession);
            const notification = payload.notifications.find((item) => item.relatedType === "submission" && item.relatedId === createdSubmission.id);
            if (!notification) {
                return false;
            }
            return notification.isRead === 0 ? { payload, notification } : false;
        },
        15000,
        500,
    );
    assert(
        teacherNotificationState.payload.unreadCount === beforeTeacherNotifications.unreadCount + 1,
        `Expected teacher unread notification count to rise by 1 after student submission, got ${teacherNotificationState.payload.unreadCount}`,
    );
    assert(teacherNotificationState.notification.title === "有新作业提交", `Expected teacher notification title "有新作业提交", got ${teacherNotificationState.notification.title}`);
    assert(
        teacherNotificationState.notification.content.includes(me.name) && teacherNotificationState.notification.content.includes(targetTask.name),
        `Expected teacher notification content to mention ${me.name} and ${targetTask.name}`,
    );

    await markTeacherNotificationAsRead(teacherNotificationState.notification.id, teacherSession);
    const afterReadTeacherNotifications = await waitFor(
        `teacher notification ${teacherNotificationState.notification.id} to become read`,
        async () => {
            const payload = await listTeacherNotifications(teacherSession);
            const notification = payload.notifications.find((item) => item.id === teacherNotificationState.notification.id);
            if (!notification) {
                return false;
            }
            return notification.isRead === 1 && payload.unreadCount === beforeTeacherNotifications.unreadCount
                ? { payload, notification }
                : false;
        },
        15000,
        500,
    );
    assert(afterReadTeacherNotifications.notification.isRead === 1, "Expected teacher submission notification to become read");

    const assistantNotificationState = await waitFor(
        `assistant notification for submission ${createdSubmission.id}`,
        async () => {
            const payload = await listTeacherNotifications(assistantSession);
            const notification = payload.notifications.find((item) => item.relatedType === "submission" && item.relatedId === createdSubmission.id);
            if (!notification) {
                return false;
            }
            return notification.isRead === 0 ? { payload, notification } : false;
        },
        15000,
        500,
    );
    assert(
        assistantNotificationState.payload.unreadCount === beforeAssistantNotifications.unreadCount + 1,
        `Expected assistant unread notification count to rise by 1 after student submission, got ${assistantNotificationState.payload.unreadCount}`,
    );
    assert(assistantNotificationState.notification.title === "有新作业提交", `Expected assistant notification title "有新作业提交", got ${assistantNotificationState.notification.title}`);
    assert(
        assistantNotificationState.notification.content.includes(me.name) && assistantNotificationState.notification.content.includes(targetTask.name),
        `Expected assistant notification content to mention ${me.name} and ${targetTask.name}`,
    );

    await markTeacherNotificationAsRead(assistantNotificationState.notification.id, assistantSession);
    const afterReadAssistantNotifications = await waitFor(
        `assistant notification ${assistantNotificationState.notification.id} to become read`,
        async () => {
            const payload = await listTeacherNotifications(assistantSession);
            const notification = payload.notifications.find((item) => item.id === assistantNotificationState.notification.id);
            if (!notification) {
                return false;
            }
            return notification.isRead === 1 && payload.unreadCount === beforeAssistantNotifications.unreadCount
                ? { payload, notification }
                : false;
        },
        15000,
        500,
    );
    assert(afterReadAssistantNotifications.notification.isRead === 1, "Expected assistant submission notification to become read");

    return {
        task: targetTask,
        submissionId: createdSubmission.id,
        studentName: me.name,
        beforeDashboard,
        beforeTaskSummary,
        afterSubmitTaskSummary,
        afterSubmitDashboard,
        beforeTaskProgress,
        afterSubmitTaskProgress: afterSubmitProgress.progress,
    };
}

async function testTeacherGradesStudentSubmission() {
    const {
        task,
        submissionId,
        studentName,
        beforeDashboard,
        beforeTaskSummary,
        afterSubmitDashboard,
        afterSubmitTaskSummary,
        afterSubmitTaskProgress,
    } = await submitStageFourExperiment();

    await ensureTeacherSession();
    await openTeacher("/teacher/grading", teacherSession);
    await waitForPath("/teacher/grading", 15000, teacherSession);
    await waitForSelector('[data-testid="teacher-grading-search"]', teacherSession);

    const pendingItem = await waitFor(
        `teacher pending item ${submissionId}`,
        async () => {
            const items = await listTeacherGrading("pending", teacherSession);
            return items.find((item) => item.id === submissionId) ?? false;
        },
        15000,
        500,
    );
    assert(pendingItem.studentId === gradeStudentId, `Expected pending submission ${submissionId} to belong to ${gradeStudentId}, got ${pendingItem.studentId}`);
    assert(pendingItem.topic === task.name, `Expected pending submission topic ${task.name}, got ${pendingItem.topic}`);

    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', gradeStudentId], {}, teacherSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${submissionId}"]`, teacherSession);
    await clickByTestId(`teacher-grading-open-${submissionId}`, teacherSession);
    await waitForPath(`/teacher/grading/${submissionId}`, 15000, teacherSession);
    await waitForSelector('[data-testid="teacher-grading-submit"]', teacherSession);

    const gradingTask = await waitFor(
        `student task ${task.id} to become grading`,
        async () => {
            const tasks = await listStudentTasks(studentGradeSession);
            return tasks.find((item) => item.id === task.id && item.status === "grading") ?? false;
        },
        15000,
        500,
    );
    assert(gradingTask.currentStage === 4, `Expected grading task ${task.id} to remain on stage 4 while locked, got ${gradingTask.currentStage}`);

    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });
    const assistantPendingItem = await waitFor(
        `assistant pending item ${submissionId}`,
        async () => {
            const items = await listTeacherGrading("pending", assistantSession);
            return items.find((item) => item.id === submissionId) ?? false;
        },
        15000,
        500,
    );
    assert(assistantPendingItem.studentId === gradeStudentId, `Expected assistant to see pending submission ${submissionId} for ${gradeStudentId}, got ${assistantPendingItem.studentId}`);

    await openTeacher("/teacher/grading", assistantSession);
    await waitForPath("/teacher/grading", 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-search"]', assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', gradeStudentId], {}, assistantSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${submissionId}"]`, assistantSession);
    await clickByTestId(`teacher-grading-open-${submissionId}`, assistantSession);
    await waitForPath(`/teacher/grading/${submissionId}`, 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-readonly-banner"]', assistantSession);
    const assistantReadonlyDetail = await getTeacherSubmissionDetail(submissionId, assistantSession);
    assert(assistantReadonlyDetail.status === 1, `Expected assistant readonly detail for ${submissionId} to remain pending, got ${assistantReadonlyDetail.status}`);
    const assistantReadonly = await browserJson<boolean>(`
        const questionnaire = document.querySelector('[data-testid="teacher-grading-score-questionnaire"]');
        const process = document.querySelector('[data-testid="teacher-grading-score-process"]');
        const report = document.querySelector('[data-testid="teacher-grading-score-report"]');
        return questionnaire instanceof HTMLInputElement
            && questionnaire.disabled
            && process instanceof HTMLInputElement
            && process.disabled
            && report instanceof HTMLInputElement
            && report.disabled;
    `, assistantSession);
    assert(assistantReadonly, "Expected assistant grading inputs to be disabled while teacher holds the grading lock");

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', String(draftScores.questionnaire)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', String(draftScores.process)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', String(draftScores.report)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', draftComment], {}, teacherSession);
    await clickByTestId("teacher-grading-save-draft", teacherSession);

    const teacherDraftDetail = await waitFor(
        `teacher draft submission ${submissionId}`,
        async () => {
            const detail = await getTeacherSubmissionDetail(submissionId, teacherSession);
            return detail.status === 0 && detail.teacherComment?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(teacherDraftDetail.teacherComment?.includes(draftComment) ?? false, `Expected teacher draft detail comment to include "${draftComment}"`);

    const pendingAfterDraft = await listTeacherGrading("pending", teacherSession);
    assert(!pendingAfterDraft.some((item) => item.id === submissionId), `Expected pending grading list to remove submission ${submissionId} after saving draft`);
    const draftAfterSave = await waitFor(
        `teacher draft list item ${submissionId}`,
        async () => {
            const items = await listTeacherGrading("draft", teacherSession);
            return items.find((item) => item.id === submissionId && item.status === 0) ?? false;
        },
        15000,
        500,
    );
    assert(draftAfterSave.studentId === gradeStudentId, `Expected draft submission ${submissionId} to remain associated with ${gradeStudentId}, got ${draftAfterSave.studentId}`);

    const afterDraftTaskSummary = await waitFor(
        `teacher task summary after draft save for task ${task.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(task.id, teacherSession);
            return summary.completed === beforeTaskSummary.completed && summary.pending === beforeTaskSummary.pending ? summary : false;
        },
        15000,
        500,
    );
    assert(afterDraftTaskSummary.completed === beforeTaskSummary.completed, `Expected teacher completed count to return to baseline after draft save, got ${afterDraftTaskSummary.completed}`);
    assert(afterDraftTaskSummary.pending === beforeTaskSummary.pending, `Expected teacher pending count to return to baseline after draft save, got ${afterDraftTaskSummary.pending}`);

    const afterDraftDashboard = await waitFor(
        "teacher dashboard to reflect saved draft",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(beforeDashboard, "待批改作业")
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(getStatValue(afterDraftDashboard, "待批改作业") === getStatValue(beforeDashboard, "待批改作业"), "Teacher pending grading dashboard count should return to baseline after draft save");

    const afterDraftProgress = await getTeacherTaskProgress(task.id, teacherSession);
    const draftStudentRow = afterDraftProgress.students.find((item) => item.studentId === gradeStudentId);
    assert(draftStudentRow, `Expected teacher task progress row for ${gradeStudentId} after draft save`);
    assert(draftStudentRow.status === "submitted", `Expected teacher task progress for ${gradeStudentId} to remain submitted after draft save, got ${draftStudentRow.status}`);
    assert(afterDraftProgress.counts.submitted === afterSubmitTaskProgress.counts.submitted, `Expected teacher submitted count to stay unchanged after draft save, got ${afterDraftProgress.counts.submitted}`);

    const studentTaskDuringDraft = await waitFor(
        `student task ${task.id} to stay grading after teacher draft save`,
        async () => {
            const tasks = await listStudentTasks(studentGradeSession);
            return tasks.find((item) => item.id === task.id && item.status === "grading") ?? false;
        },
        15000,
        500,
    );
    assert(studentTaskDuringDraft.currentStage === 4, `Expected student grading task ${task.id} to remain at stage 4 after draft save, got ${studentTaskDuringDraft.currentStage}`);

    await logoutTeacher(assistantSession);

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', String(expectedGradedScore)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', String(expectedGradedScore)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', String(expectedGradedScore)], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', gradeComment], {}, teacherSession);
    await clickByTestId("teacher-grading-submit", teacherSession);
    await waitForPath("/teacher/grading", 15000, teacherSession);

    const teacherDetail = await waitFor(
        `teacher graded submission ${submissionId}`,
        async () => {
            const detail = await getTeacherSubmissionDetail(submissionId, teacherSession);
            return detail.status === 2 && detail.teacherComment?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(Number(teacherDetail.totalScore) === expectedGradedScore, `Expected teacher total score ${expectedGradedScore}, got ${teacherDetail.totalScore ?? "unknown"}`);
    assert(teacherDetail.gradedByName, "Teacher detail should expose grader name after grading");

    const pendingAfterGrade = await listTeacherGrading("pending", teacherSession);
    assert(!pendingAfterGrade.some((item) => item.id === submissionId), `Expected pending grading list to remove submission ${submissionId} after grading`);
    const gradedAfterGrade = await listTeacherGrading("graded", teacherSession);
    const gradedItem = gradedAfterGrade.find((item) => item.id === submissionId);
    assert(gradedItem, `Expected graded list to include submission ${submissionId}`);
    assert(Number(gradedItem.score) === expectedGradedScore, `Expected graded list score ${expectedGradedScore}, got ${gradedItem?.score ?? "unknown"}`);

    const afterGradeProgress = await waitFor(
        `teacher task progress for graded task ${task.id}`,
        async () => {
            const progress = await getTeacherTaskProgress(task.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === gradeStudentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "graded" && studentRow.submissionId === submissionId
                ? { progress, studentRow }
                : false;
        },
        15000,
        500,
    );
    assert(afterGradeProgress.progress.counts.submitted === afterSubmitTaskProgress.counts.submitted - 1, `Expected teacher submitted count to drop by 1 after grading, got ${afterGradeProgress.progress.counts.submitted}`);
    assert(afterGradeProgress.progress.counts.graded === afterSubmitTaskProgress.counts.graded + 1, `Expected teacher graded count to rise by 1 after grading, got ${afterGradeProgress.progress.counts.graded}`);

    const afterGradeTaskSummary = await waitFor(
        `teacher task summary after grading task ${task.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(task.id, teacherSession);
            return summary.completed === afterSubmitTaskSummary.completed && summary.pending === beforeTaskSummary.pending ? summary : false;
        },
        15000,
        500,
    );
    assert(afterGradeTaskSummary.completed === beforeTaskSummary.completed + 1, `Expected teacher completed count to stay incremented after grading, got ${afterGradeTaskSummary.completed}`);

    const afterGradeDashboard = await waitFor(
        "teacher dashboard to reflect finished grading",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(afterSubmitDashboard, "待批改作业") - 1
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(getStatValue(afterGradeDashboard, "待批改作业") === getStatValue(beforeDashboard, "待批改作业"), "Teacher pending grading dashboard count should return to baseline after grading");
    assert(
        afterGradeDashboard.recentGradings.some((item) => item.student === studentName && item.topic === task.name && item.rejected === false),
        `Expected teacher recent gradings to include graded item ${studentName} / ${task.name}`,
    );

    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });
    await openTeacher(`/teacher/grading/${submissionId}`, assistantSession);
    await waitForPath(`/teacher/grading/${submissionId}`, 15000, assistantSession);
    await waitFor(
        `assistant view teacher graded detail ${submissionId}`,
        async () => {
            const text = await bodyText(assistantSession);
            const commentMatches = await browserJson<boolean>(`
                const field = document.querySelector('[data-testid="teacher-grading-comment"]');
                return field instanceof HTMLTextAreaElement && field.value.includes(${JSON.stringify(gradeComment)});
            `, assistantSession);
            return text.includes("教师") && text.includes(teacherDetail.gradedByName ?? "") && commentMatches ? text : false;
        },
        15000,
        500,
    );
    assert(!(await hasSelector('[data-testid="teacher-grading-readonly-banner"]', assistantSession)), "Expected finalized teacher-graded detail to no longer show readonly banner to assistant");
    await logoutTeacher(assistantSession);

    const gradedTask = await waitFor(
        `student task ${task.id} to become graded`,
        async () => {
            const tasks = await listStudentTasks(studentGradeSession);
            return tasks.find((item) => item.id === task.id && item.status === "graded" && Number(item.score) === expectedGradedScore) ?? false;
        },
        15000,
        500,
    );
    assert(gradedTask.status === "graded", `Expected task ${task.id} to be graded, got ${gradedTask.status}`);

    const notifications = await listStudentNotifications(studentGradeSession);
    assert(
        notifications.notifications.some((notification) =>
            notification.title === "作业已批改"
            && notification.content.includes(task.name)
            && notification.content.includes(`${expectedGradedScore}`)
        ),
        `Expected grading notification for task ${task.name}`,
    );

    await openStudent(`/student/task/${task.id}`, studentGradeSession);
    await waitForPath(`/student/task/${task.id}`, 15000, studentGradeSession);
    await waitForSelector('[data-testid="student-task-detail"]', studentGradeSession);
    const taskDetailText = await bodyText(studentGradeSession);
    assert(taskDetailText.includes(String(expectedGradedScore)), "Student task detail should show the graded total score");

    await clickButtonByText("查看成绩", studentGradeSession);
    await waitForPath(`/student/task/${task.id}/history`, 15000, studentGradeSession);
    await waitForSelector('[data-testid="student-submission-history"]', studentGradeSession);

    const submissions = await listStudentSubmissions(task.id, studentGradeSession);
    const gradedSubmission = submissions.find((submission) => submission.id === submissionId);
    assert(gradedSubmission, `Expected graded submission ${submissionId} in student history`);
    assert(gradedSubmission.status === 2, `Expected student history status 2 for ${submissionId}, got ${gradedSubmission.status}`);

    await openStudent(`/student/submissions/${submissionId}`, studentGradeSession);
    await waitForPath(`/student/submissions/${submissionId}`, 15000, studentGradeSession);
    await waitForSelector('[data-testid="student-submission-detail"]', studentGradeSession);

    const detail = await waitFor(
        `student graded submission detail ${submissionId}`,
        async () => {
            const current = await getStudentSubmissionDetail(submissionId, studentGradeSession);
            return current.status === 2 && current.teacherComment?.includes(runId) ? current : false;
        },
        15000,
        500,
    );
    assert(Number(detail.totalScore) === expectedGradedScore, `Expected student detail total score ${expectedGradedScore}, got ${detail.totalScore ?? "unknown"}`);
    assert(detail.graderName, "Student detail should expose grader name after grading");

    const pageText = await bodyText(studentGradeSession);
    assert(pageText.includes(gradeComment), "Student submission detail should render teacher comment");
    assert(pageText.includes(detail.graderName ?? ""), "Student submission detail should render grader name");

    await logoutStudent(studentGradeSession);
}

function isEligibleStudentCandidate(candidate: TeacherGradingItem) {
    // Students in the pending grading list have already submitted work, so they
    // cannot be first-login, locked, or disabled. We only need to exclude the
    // known problematic seed accounts.  Avoid POST /api/student/login here
    // because it creates a real server session that can kick out already-logged-in
    // students due to single-device enforcement.
    return !invalidRejectStudentIds.has(candidate.studentId);
}

async function pickPendingCandidate(options: {
    session?: string;
    excludedSubmissionIds?: number[];
    excludedStudentIds?: string[];
}) {
    const session = options.session ?? teacherSession;
    const excludedSubmissionIds = new Set(options.excludedSubmissionIds ?? []);
    const excludedStudentIds = new Set(options.excludedStudentIds ?? []);
    const pendingItems = await listTeacherGrading("pending", session);
    const candidates = pendingItems.filter((item) => !excludedSubmissionIds.has(item.id) && !excludedStudentIds.has(item.studentId));

    for (const candidate of candidates) {
        if (isEligibleStudentCandidate(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Could not find an eligible pending submission for session ${session}`);
}

async function pickRejectCandidate(excludedSubmissionIds: number[] = []) {
    return pickPendingCandidate({
        session: teacherSession,
        excludedSubmissionIds,
        excludedStudentIds: [gradeStudentId],
    });
}

async function testAssistantGradesStudentSubmission() {
    log("Checking assistant grade -> teacher and student linkage");

    await ensureTeacherSession();
    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });

    const assistantMe = await getTeacherMe(assistantSession);
    assert(assistantMe.type === "assistant", `Expected assistant session type, got ${assistantMe.type}`);

    const assistantCandidate = await pickPendingCandidate({
        session: assistantSession,
        excludedStudentIds: [gradeStudentId],
    });
    const beforeTeacherDashboard = await getTeacherDashboard(teacherSession);
    const beforeTaskLocation = await findTeacherTaskProgressBySubmission(assistantCandidate.id, assistantCandidate.studentId, teacherSession);
    assert(beforeTaskLocation.studentRow.status === "submitted", `Expected assistant grade candidate ${assistantCandidate.id} to be submitted before grading, got ${beforeTaskLocation.studentRow.status}`);

    await openTeacher("/teacher/grading", assistantSession);
    await waitForPath("/teacher/grading", 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-search"]', assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', assistantCandidate.studentId], {}, assistantSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${assistantCandidate.id}"]`, assistantSession);
    await clickByTestId(`teacher-grading-open-${assistantCandidate.id}`, assistantSession);
    await waitForPath(`/teacher/grading/${assistantCandidate.id}`, 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-submit"]', assistantSession);

    const assistantEditable = await browserJson<boolean>(`
        const banner = document.querySelector('[data-testid="teacher-grading-readonly-banner"]');
        const questionnaire = document.querySelector('[data-testid="teacher-grading-score-questionnaire"]');
        const process = document.querySelector('[data-testid="teacher-grading-score-process"]');
        const report = document.querySelector('[data-testid="teacher-grading-score-report"]');
        return !banner
            && questionnaire instanceof HTMLInputElement
            && !questionnaire.disabled
            && process instanceof HTMLInputElement
            && !process.disabled
            && report instanceof HTMLInputElement
            && !report.disabled;
    `, assistantSession);
    assert(assistantEditable, "Expected assistant grading page to be editable when no other grader holds the lock");

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', String(expectedAssistantScore)], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', String(expectedAssistantScore)], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', String(expectedAssistantScore)], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', assistantGradeComment], {}, assistantSession);
    await clickByTestId("teacher-grading-submit", assistantSession);
    await waitForPath("/teacher/grading", 15000, assistantSession);

    const assistantDetail = await waitFor(
        `assistant graded submission ${assistantCandidate.id}`,
        async () => {
            const detail = await getTeacherSubmissionDetail(assistantCandidate.id, assistantSession);
            return detail.status === 2 && detail.teacherComment?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(Number(assistantDetail.totalScore) === expectedAssistantScore, `Expected assistant graded total score ${expectedAssistantScore}, got ${assistantDetail.totalScore ?? "unknown"}`);

    const assistantGradedList = await waitFor(
        `assistant graded list item ${assistantCandidate.id}`,
        async () => {
            const items = await listTeacherGrading("graded", assistantSession);
            return items.find((item) => item.id === assistantCandidate.id && item.gradedByType === 3) ?? false;
        },
        15000,
        500,
    );
    assert(assistantGradedList.gradedByName === assistantMe.name, `Expected assistant graded list item to show grader ${assistantMe.name}, got ${assistantGradedList.gradedByName ?? "unknown"}`);

    const teacherViewOfAssistantGrade = await waitFor(
        `teacher view of assistant graded submission ${assistantCandidate.id}`,
        async () => {
            const items = await listTeacherGrading("graded", teacherSession);
            return items.find((item) => item.id === assistantCandidate.id && item.gradedByType === 3) ?? false;
        },
        15000,
        500,
    );
    assert(teacherViewOfAssistantGrade.gradedByName === assistantMe.name, `Expected teacher graded list item to show assistant grader ${assistantMe.name}, got ${teacherViewOfAssistantGrade.gradedByName ?? "unknown"}`);
    assert(Number(teacherViewOfAssistantGrade.score) === expectedAssistantScore, `Expected teacher graded list score ${expectedAssistantScore}, got ${teacherViewOfAssistantGrade.score ?? "unknown"}`);

    await openTeacher(`/teacher/grading/${assistantCandidate.id}`, teacherSession);
    await waitForPath(`/teacher/grading/${assistantCandidate.id}`, 15000, teacherSession);
    await waitFor(
        `teacher detail for assistant graded submission ${assistantCandidate.id}`,
        async () => {
            const text = await bodyText(teacherSession);
            const commentMatches = await browserJson<boolean>(`
                const field = document.querySelector('[data-testid="teacher-grading-comment"]');
                return field instanceof HTMLTextAreaElement && field.value.includes(${JSON.stringify(assistantGradeComment)});
            `, teacherSession);
            return text.includes("助教") && text.includes(assistantMe.name) && commentMatches ? text : false;
        },
        15000,
        500,
    );
    assert(!(await hasSelector('[data-testid="teacher-grading-readonly-banner"]', teacherSession)), "Expected teacher view of assistant-graded detail to be finalized, not readonly");

    const afterTeacherDashboard = await waitFor(
        "teacher dashboard to reflect assistant grading",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(beforeTeacherDashboard, "待批改作业") - 1
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(
        afterTeacherDashboard.recentGradings.some((item) => item.student === assistantCandidate.studentName && item.topic === assistantCandidate.topic && item.rejected === false),
        `Expected teacher recent gradings to include assistant-graded item ${assistantCandidate.studentName} / ${assistantCandidate.topic}`,
    );

    const afterTaskProgress = await waitFor(
        `teacher task progress for assistant graded submission ${assistantCandidate.id}`,
        async () => {
            const progress = await getTeacherTaskProgress(beforeTaskLocation.task.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === assistantCandidate.studentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "graded" && studentRow.submissionId === assistantCandidate.id
                ? { progress, studentRow }
                : false;
        },
        15000,
        500,
    );
    assert(afterTaskProgress.progress.counts.submitted === beforeTaskLocation.progress.counts.submitted - 1, `Expected submitted count to drop by 1 after assistant grading, got ${afterTaskProgress.progress.counts.submitted}`);
    assert(afterTaskProgress.progress.counts.graded === beforeTaskLocation.progress.counts.graded + 1, `Expected graded count to rise by 1 after assistant grading, got ${afterTaskProgress.progress.counts.graded}`);

    const afterTaskSummary = await waitFor(
        `teacher task summary after assistant grading ${beforeTaskLocation.task.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(beforeTaskLocation.task.id, teacherSession);
            return summary.completed === beforeTaskLocation.task.completed && summary.pending === beforeTaskLocation.task.pending - 1 ? summary : false;
        },
        15000,
        500,
    );
    assert(afterTaskSummary.completed === beforeTaskLocation.task.completed, `Expected teacher completed count to stay unchanged after assistant grading, got ${afterTaskSummary.completed}`);
    assert(afterTaskSummary.pending === beforeTaskLocation.task.pending - 1, `Expected teacher pending count to drop by 1 after assistant grading, got ${afterTaskSummary.pending}`);

    await loginAsStudent({
        studentId: assistantCandidate.studentId,
        password: "123456",
        session: studentAssistantGradeSession,
    });
    const gradedTask = await waitFor(
        `student task graded by assistant for ${assistantCandidate.studentId}`,
        async () => {
            const tasks = await listStudentTasks(studentAssistantGradeSession);
            return tasks.find((task) => task.name === assistantCandidate.topic && task.status === "graded" && Number(task.score) === expectedAssistantScore) ?? false;
        },
        15000,
        500,
    );
    const studentNotifications = await listStudentNotifications(studentAssistantGradeSession);
    assert(
        studentNotifications.notifications.some((notification) =>
            notification.title === "作业已批改"
            && notification.content.includes(assistantCandidate.topic)
            && notification.content.includes(`${expectedAssistantScore}`)
        ),
        `Expected student grading notification for assistant-graded task ${assistantCandidate.topic}`,
    );

    const studentSubmissions = await listStudentSubmissions(gradedTask.id, studentAssistantGradeSession);
    const gradedSubmission = studentSubmissions.find((item) => item.id === assistantCandidate.id);
    assert(gradedSubmission, `Expected assistant-graded submission ${assistantCandidate.id} in student history`);
    assert(gradedSubmission.status === 2, `Expected assistant-graded submission ${assistantCandidate.id} to have status 2, got ${gradedSubmission.status}`);

    const studentDetail = await waitFor(
        `student assistant-graded submission detail ${assistantCandidate.id}`,
        async () => {
            const detail = await getStudentSubmissionDetail(assistantCandidate.id, studentAssistantGradeSession);
            return detail.status === 2 && detail.teacherComment?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(Number(studentDetail.totalScore) === expectedAssistantScore, `Expected student detail total score ${expectedAssistantScore}, got ${studentDetail.totalScore ?? "unknown"}`);
    assert(studentDetail.graderName === assistantMe.name, `Expected student detail grader ${assistantMe.name}, got ${studentDetail.graderName ?? "unknown"}`);
    assert(studentDetail.teacherComment?.includes(assistantGradeComment) ?? false, `Expected student detail comment to include "${assistantGradeComment}"`);

    await logoutStudent(studentAssistantGradeSession);
    await logoutTeacher(assistantSession);
}

async function testAssistantRejectsStudentSubmission(excludedSubmissionIds: number[] = []) {
    log("Checking assistant reject -> teacher and student linkage");

    await ensureTeacherSession();
    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });

    const assistantMe = await getTeacherMe(assistantSession);
    assert(assistantMe.type === "assistant", `Expected assistant session type, got ${assistantMe.type}`);

    const rejectCandidate = await pickPendingCandidate({
        session: assistantSession,
        excludedSubmissionIds,
        excludedStudentIds: [gradeStudentId, publishStudentId],
    });
    const beforeTeacherDashboard = await getTeacherDashboard(teacherSession);
    const beforeTaskLocation = await findTeacherTaskProgressBySubmission(rejectCandidate.id, rejectCandidate.studentId, teacherSession);
    assert(beforeTaskLocation.studentRow.status === "submitted", `Expected assistant reject candidate ${rejectCandidate.id} to be submitted before reject, got ${beforeTaskLocation.studentRow.status}`);

    await openTeacher("/teacher/grading", assistantSession);
    await waitForPath("/teacher/grading", 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-search"]', assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', rejectCandidate.studentId], {}, assistantSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${rejectCandidate.id}"]`, assistantSession);
    await clickByTestId(`teacher-grading-open-${rejectCandidate.id}`, assistantSession);
    await waitForPath(`/teacher/grading/${rejectCandidate.id}`, 15000, assistantSession);
    await waitForSelector('[data-testid="teacher-grading-reject-open"]', assistantSession);

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', "66"], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', "64"], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', "62"], {}, assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', assistantRejectComment], {}, assistantSession);
    await clickByTestId("teacher-grading-reject-open", assistantSession);
    await waitForSelector('[data-testid="teacher-grading-reject-submit"]', assistantSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-reject-reason"]', assistantRejectReason], {}, assistantSession);
    await clickByTestId("teacher-grading-reject-submit", assistantSession);
    await waitForPath("/teacher/grading", 15000, assistantSession);

    const assistantDetail = await waitFor(
        `assistant rejected submission ${rejectCandidate.id}`,
        async () => {
            const detail = await getTeacherSubmissionDetail(rejectCandidate.id, assistantSession);
            return detail.status === 3 && detail.rejectReason?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(assistantDetail.teacherComment?.includes(assistantRejectComment) ?? false, `Expected assistant reject detail comment to include "${assistantRejectComment}"`);
    assert(assistantDetail.gradedByName === assistantMe.name, `Expected assistant reject detail grader ${assistantMe.name}, got ${assistantDetail.gradedByName ?? "unknown"}`);

    const assistantRejectedList = await waitFor(
        `assistant rejected list item ${rejectCandidate.id}`,
        async () => {
            const items = await listTeacherGrading("rejected", assistantSession);
            return items.find((item) => item.id === rejectCandidate.id && item.gradedByType === 3) ?? false;
        },
        15000,
        500,
    );
    assert(assistantRejectedList.gradedByName === assistantMe.name, `Expected assistant rejected list item to show grader ${assistantMe.name}, got ${assistantRejectedList.gradedByName ?? "unknown"}`);

    const teacherRejectedView = await waitFor(
        `teacher view of assistant rejected submission ${rejectCandidate.id}`,
        async () => {
            const items = await listTeacherGrading("rejected", teacherSession);
            return items.find((item) => item.id === rejectCandidate.id && item.gradedByType === 3) ?? false;
        },
        15000,
        500,
    );
    assert(teacherRejectedView.gradedByName === assistantMe.name, `Expected teacher rejected list item to show assistant grader ${assistantMe.name}, got ${teacherRejectedView.gradedByName ?? "unknown"}`);

    await openTeacher(`/teacher/grading/${rejectCandidate.id}`, teacherSession);
    await waitForPath(`/teacher/grading/${rejectCandidate.id}`, 15000, teacherSession);
    await waitFor(
        `teacher detail for assistant rejected submission ${rejectCandidate.id}`,
        async () => {
            const text = await bodyText(teacherSession);
            return text.includes("助教") && text.includes(assistantMe.name) && text.includes(assistantRejectReason) ? text : false;
        },
        15000,
        500,
    );
    assert(await hasSelector('[data-testid="teacher-grading-reject-reason-banner"]', teacherSession), "Expected teacher detail for assistant-rejected submission to show reject reason banner");

    const afterTeacherDashboard = await waitFor(
        "teacher dashboard to reflect assistant reject",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(beforeTeacherDashboard, "待批改作业") - 1
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(
        afterTeacherDashboard.recentGradings.some((item) => item.student === rejectCandidate.studentName && item.topic === rejectCandidate.topic && item.rejected === true),
        `Expected teacher recent gradings to include assistant-rejected item ${rejectCandidate.studentName} / ${rejectCandidate.topic}`,
    );

    const afterTaskLocation = await waitFor(
        `teacher task progress for assistant rejected submission ${rejectCandidate.id}`,
        async () => {
            const progress = await getTeacherTaskProgress(beforeTaskLocation.task.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === rejectCandidate.studentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "rejected" && studentRow.submissionId === rejectCandidate.id
                ? { progress, studentRow }
                : false;
        },
        15000,
        500,
    );
    assert(afterTaskLocation.progress.counts.submitted === beforeTaskLocation.progress.counts.submitted - 1, `Expected submitted count to drop by 1 after assistant reject, got ${afterTaskLocation.progress.counts.submitted}`);
    assert(afterTaskLocation.progress.counts.rejected === beforeTaskLocation.progress.counts.rejected + 1, `Expected rejected count to rise by 1 after assistant reject, got ${afterTaskLocation.progress.counts.rejected}`);

    const afterTaskSummary = await waitFor(
        `teacher task summary after assistant reject ${beforeTaskLocation.task.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(beforeTaskLocation.task.id, teacherSession);
            return summary.completed === beforeTaskLocation.task.completed && summary.pending === beforeTaskLocation.task.pending - 1 ? summary : false;
        },
        15000,
        500,
    );
    assert(afterTaskSummary.pending === beforeTaskLocation.task.pending - 1, `Expected teacher pending count to drop by 1 after assistant reject, got ${afterTaskSummary.pending}`);

    await loginAsStudent({
        studentId: rejectCandidate.studentId,
        password: "123456",
        session: studentAssistantRejectSession,
    });
    const rejectedTask = await waitFor(
        `student task rejected by assistant for ${rejectCandidate.studentId}`,
        async () => {
            const tasks = await listStudentTasks(studentAssistantRejectSession);
            return tasks.find((task) => task.status === "rejected" && task.name === rejectCandidate.topic && (task.rejectReason?.includes(runId) ?? false)) ?? false;
        },
        15000,
        500,
    );
    const notifications = await listStudentNotifications(studentAssistantRejectSession);
    assert(
        notifications.notifications.some((notification) =>
            notification.title === "作业被驳回"
            && notification.content.includes(rejectCandidate.topic)
        ),
        `Expected assistant reject notification for task ${rejectCandidate.topic}`,
    );

    const submissions = await listStudentSubmissions(rejectedTask.id, studentAssistantRejectSession);
    const rejectedSubmission = submissions.find((item) => item.id === rejectCandidate.id);
    assert(rejectedSubmission, `Expected assistant-rejected submission ${rejectCandidate.id} in student history`);
    assert(rejectedSubmission.status === 3, `Expected assistant-rejected submission ${rejectCandidate.id} to have status 3, got ${rejectedSubmission.status}`);
    assert(rejectedSubmission.graderName === assistantMe.name, `Expected assistant-rejected history grader ${assistantMe.name}, got ${rejectedSubmission.graderName ?? "unknown"}`);

    const studentDetail = await waitFor(
        `student assistant-rejected submission detail ${rejectCandidate.id}`,
        async () => {
            const detail = await getStudentSubmissionDetail(rejectCandidate.id, studentAssistantRejectSession);
            return detail.status === 3 && detail.rejectReason?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(studentDetail.graderName === assistantMe.name, `Expected assistant-rejected detail grader ${assistantMe.name}, got ${studentDetail.graderName ?? "unknown"}`);
    assert(studentDetail.teacherComment?.includes(assistantRejectComment) ?? false, `Expected assistant-rejected detail comment to include "${assistantRejectComment}"`);
    assert(studentDetail.rejectReason?.includes(assistantRejectReason) ?? false, `Expected assistant-rejected detail reason to include "${assistantRejectReason}"`);

    await logoutStudent(studentAssistantRejectSession);
    await logoutTeacher(assistantSession);

    return rejectCandidate.id;
}

async function testTeacherRejectsStudentSubmission(excludedSubmissionIds: number[] = []) {
    log("Checking teacher reject -> student feedback linkage");

    await ensureTeacherSession();
    await openTeacher("/teacher/grading", teacherSession);
    await waitForPath("/teacher/grading", 15000, teacherSession);
    await waitForSelector('[data-testid="teacher-grading-search"]', teacherSession);

    const rejectCandidate = await pickRejectCandidate(excludedSubmissionIds);
    const beforeRejectDashboard = await getTeacherDashboard(teacherSession);
    const beforeRejectTaskLocation = await findTeacherTaskProgressBySubmission(rejectCandidate.id, rejectCandidate.studentId, teacherSession);
    assert(beforeRejectTaskLocation.studentRow.status === "submitted", `Expected reject candidate ${rejectCandidate.id} to be submitted before reject, got ${beforeRejectTaskLocation.studentRow.status}`);

    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', rejectCandidate.studentId], {}, teacherSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${rejectCandidate.id}"]`, teacherSession);
    await clickByTestId(`teacher-grading-open-${rejectCandidate.id}`, teacherSession);
    await waitForPath(`/teacher/grading/${rejectCandidate.id}`, 15000, teacherSession);
    await waitForSelector('[data-testid="teacher-grading-reject-open"]', teacherSession);

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', "65"], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', "65"], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', "65"], {}, teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', rejectComment], {}, teacherSession);
    await clickByTestId("teacher-grading-reject-open", teacherSession);
    await waitForSelector('[data-testid="teacher-grading-reject-submit"]', teacherSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-reject-reason"]', rejectReason], {}, teacherSession);
    await clickByTestId("teacher-grading-reject-submit", teacherSession);
    await waitForPath("/teacher/grading", 15000, teacherSession);

    const teacherDetail = await waitFor(
        `teacher rejected submission ${rejectCandidate.id}`,
        async () => {
            const detail = await getTeacherSubmissionDetail(rejectCandidate.id, teacherSession);
            return detail.status === 3 && detail.rejectReason?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(teacherDetail.teacherComment?.includes(runId) ?? false, "Teacher reject detail should persist the rejection comment");

    await loginAsTeacher({
        username: assistantUsername,
        password: assistantPassword,
        session: assistantSession,
        expectedPath: "/teacher/grading",
    });
    await openTeacher(`/teacher/grading/${rejectCandidate.id}`, assistantSession);
    await waitForPath(`/teacher/grading/${rejectCandidate.id}`, 15000, assistantSession);
    await waitFor(
        `assistant view teacher rejected detail ${rejectCandidate.id}`,
        async () => {
            const text = await bodyText(assistantSession);
            return text.includes("教师") && text.includes(teacherDetail.gradedByName ?? "") && text.includes(rejectReason) ? text : false;
        },
        15000,
        500,
    );
    assert(await hasSelector('[data-testid="teacher-grading-reject-reason-banner"]', assistantSession), "Expected assistant view of teacher-rejected detail to show reject reason banner");
    assert(!(await hasSelector('[data-testid="teacher-grading-readonly-banner"]', assistantSession)), "Expected assistant view of teacher-rejected detail to be finalized, not readonly");
    await logoutTeacher(assistantSession);

    const pendingAfterReject = await listTeacherGrading("pending", teacherSession);
    assert(!pendingAfterReject.some((item) => item.id === rejectCandidate.id), `Expected pending grading list to remove rejected submission ${rejectCandidate.id}`);
    const rejectedAfterReject = await listTeacherGrading("rejected", teacherSession);
    const rejectedItem = rejectedAfterReject.find((item) => item.id === rejectCandidate.id);
    assert(rejectedItem, `Expected rejected list to include submission ${rejectCandidate.id}`);

    const afterRejectTaskLocation = await waitFor(
        `teacher task progress for rejected submission ${rejectCandidate.id}`,
        async () => {
            const progress = await getTeacherTaskProgress(beforeRejectTaskLocation.task.id, teacherSession);
            const studentRow = progress.students.find((item) => item.studentId === rejectCandidate.studentId);
            if (!studentRow) {
                return false;
            }
            return studentRow.status === "rejected" && studentRow.submissionId === rejectCandidate.id
                ? { progress, studentRow }
                : false;
        },
        15000,
        500,
    );
    assert(afterRejectTaskLocation.progress.counts.submitted === beforeRejectTaskLocation.progress.counts.submitted - 1, `Expected teacher submitted count to drop by 1 after reject, got ${afterRejectTaskLocation.progress.counts.submitted}`);
    assert(afterRejectTaskLocation.progress.counts.rejected === beforeRejectTaskLocation.progress.counts.rejected + 1, `Expected teacher rejected count to rise by 1 after reject, got ${afterRejectTaskLocation.progress.counts.rejected}`);

    const beforeRejectTaskSummary = beforeRejectTaskLocation.task;
    const afterRejectTaskSummary = await waitFor(
        `teacher task summary after reject ${beforeRejectTaskSummary.id}`,
        async () => {
            const summary = await getTeacherTaskSummary(beforeRejectTaskSummary.id, teacherSession);
            return summary.completed === beforeRejectTaskSummary.completed && summary.pending === beforeRejectTaskSummary.pending - 1 ? summary : false;
        },
        15000,
        500,
    );
    assert(afterRejectTaskSummary.pending === beforeRejectTaskSummary.pending - 1, `Expected teacher task pending count to drop by 1 after reject, got ${afterRejectTaskSummary.pending}`);

    const afterRejectDashboard = await waitFor(
        "teacher dashboard to reflect rejected grading",
        async () => {
            const dashboard = await getTeacherDashboard(teacherSession);
            return getStatValue(dashboard, "待批改作业") === getStatValue(beforeRejectDashboard, "待批改作业") - 1
                ? dashboard
                : false;
        },
        15000,
        500,
    );
    assert(
        afterRejectDashboard.recentGradings.some((item) => item.student === rejectCandidate.studentName && item.topic === rejectCandidate.topic && item.rejected === true),
        `Expected teacher recent gradings to include rejected item ${rejectCandidate.studentName} / ${rejectCandidate.topic}`,
    );

    await loginAsStudent({
        studentId: rejectCandidate.studentId,
        password: "123456",
        session: studentRejectSession,
    });
    const me = await getStudentMe(studentRejectSession);
    assert(me.studentId === rejectCandidate.studentId, `Expected rejected student session for ${rejectCandidate.studentId}, got ${me.studentId}`);

    const rejectedTask = await waitFor(
        `student task rejected by teacher for ${rejectCandidate.studentId}`,
        async () => {
            const tasks = await listStudentTasks(studentRejectSession);
            return tasks.find((task) => task.status === "rejected" && (task.rejectReason?.includes(runId) ?? false)) ?? false;
        },
        15000,
        500,
    );
    assert(rejectedTask.name === rejectCandidate.topic, `Expected rejected task topic ${rejectCandidate.topic}, got ${rejectedTask.name}`);

    const notifications = await listStudentNotifications(studentRejectSession);
    assert(
        notifications.notifications.some((notification) =>
            notification.title === "作业被驳回"
            && notification.content.includes(rejectCandidate.topic)
        ),
        `Expected reject notification for task ${rejectCandidate.topic}`,
    );

    const submissions = await listStudentSubmissions(rejectedTask.id, studentRejectSession);
    const rejectedSubmission = submissions.find((submission) => submission.id === rejectCandidate.id);
    assert(rejectedSubmission, `Expected rejected submission ${rejectCandidate.id} in student history`);
    assert(rejectedSubmission.status === 3, `Expected student history status 3 for ${rejectCandidate.id}, got ${rejectedSubmission.status}`);
    assert(rejectedSubmission.rejectReason?.includes(runId) ?? false, "Student history should expose the teacher reject reason");

    await openStudent(`/student/submissions/${rejectCandidate.id}`, studentRejectSession);
    await waitForPath(`/student/submissions/${rejectCandidate.id}`, 15000, studentRejectSession);
    await waitForSelector('[data-testid="student-submission-detail"]', studentRejectSession);

    const submissionDetail = await waitFor(
        `student rejected submission detail ${rejectCandidate.id}`,
        async () => {
            const detail = await getStudentSubmissionDetail(rejectCandidate.id, studentRejectSession);
            return detail.status === 3 && detail.rejectReason?.includes(runId) ? detail : false;
        },
        15000,
        500,
    );
    assert(submissionDetail.teacherComment?.includes(runId) ?? false, "Student rejected submission detail should show the rejection comment");

    const submissionText = await bodyText(studentRejectSession);
    assert(submissionText.includes(rejectReason), "Student rejected submission detail should render the reject reason");

    await openStudent(`/student/task/${rejectedTask.id}`, studentRejectSession);
    await waitForPath(`/student/task/${rejectedTask.id}`, 15000, studentRejectSession);
    await waitForSelector('[data-testid="student-task-detail"]', studentRejectSession);

    const taskDetailText = await bodyText(studentRejectSession);
    assert(taskDetailText.includes(rejectReason), "Student task detail should render the reject reason");

    await clickButtonByText("重新开始", studentRejectSession);
    await waitForText("确认重新开始实验", studentRejectSession);
    await clickButtonByText("确认重新开始", studentRejectSession);
    await waitForPath(`/student/task/${rejectedTask.id}/experiment`, 15000, studentRejectSession);
    await waitForSelector('[data-testid="student-experiment-layout"]', studentRejectSession);

    const experiment = await getExperiment(rejectedTask.id, studentRejectSession);
    assert(experiment.currentStage === 1, `Expected rejected task ${rejectedTask.id} to reset to stage 1, got ${experiment.currentStage}`);

    await logoutStudent(studentRejectSession);
}

async function main() {
    log("Preparing teacher/student linkage e2e suite");
    await ensureTooling();
    await resetDatabase();
    await startServer();

    await testTeacherPublishesTaskAndStudentStartsExperiment();
    await testTeacherGradesStudentSubmission();
    await testAssistantGradesStudentSubmission();
    const assistantRejectedSubmissionId = await testAssistantRejectsStudentSubmission();
    await testTeacherRejectsStudentSubmission([assistantRejectedSubmissionId]);

    if (teacherLoggedIn) {
        await logoutTeacher(teacherSession);
    }

    log("Teacher/student linkage e2e suite passed");
}

try {
    await main();
} finally {
    await reseedDatabase().catch((error) => {
        console.error("[teacher-student-e2e] Failed to reseed database:", error);
    });
    await Promise.all([
        closeBrowser(teacherSession),
        closeBrowser(assistantSession),
        closeBrowser(studentGradeSession),
        closeBrowser(studentAssistantGradeSession),
        closeBrowser(studentAssistantRejectSession),
        closeBrowser(studentRejectSession),
        closeBrowser(studentPublishSession),
    ]);
    await stopServer().catch((error) => {
        console.error("[teacher-student-e2e] Failed to stop server:", error);
    });
}
