import { setTimeout as delay } from "node:timers/promises";
import * as XLSX from "xlsx";

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
    isFirstLogin: number;
    type: "teacher" | "assistant";
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

type TeacherNotification = {
    id: number;
    type: string;
    title: string;
    content: string;
    isRead: number;
    createdAt: string;
};

type TeacherNotificationsResponse = {
    notifications: TeacherNotification[];
    unreadCount: number;
};

type TeacherClass = {
    id: number;
    name: string;
    semester: string | null;
    studentCount: number;
    createdAt: string;
};

type TopicSummary = {
    id: number;
    name: string;
    description: string | null;
    status: number;
    dataRows: number;
    createdAt: string;
};

type TopicDetail = {
    topic?: {
        id: number;
        name: string;
        description: string | null;
        fieldMapping?: unknown;
        weightConfig?: unknown;
        excelFilePath?: string | null;
        excelRowCount?: number | null;
    };
    attachments: Array<{
        id: number;
        fileName: string;
        filePath: string;
        fileType: string;
        fileSize: number;
        createdAt: string;
    }>;
    recommendQuestions: Array<{
        id: number;
        topicId: number;
        questionType: number;
        content: string;
        options?: unknown;
        sortOrder: number;
    }>;
    excelInfo?: {
        columns: string[];
        preview: Array<Record<string, unknown>>;
    } | null;
};

type StudentSummary = {
    id: number;
    studentId: string;
    name: string;
    email: string | null;
    status: number;
    isFirstLogin: number;
    lastLogin: string | null;
};

type TaskSummary = {
    id: number;
    topic: string;
    className: string;
    publishedAt: string | null;
    deadline: string | null;
    total: number;
    completed: number;
    pending: number;
};

type TaskProgressData = {
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

type GradingItem = {
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

type SubmissionDetail = GradingItem & {
    reportPdfPath?: string | null;
    questionnairePdfPath?: string | null;
    pdfStatus?: "pending" | "generating" | "ready" | "failed" | null;
    pdfStatusMessage?: string | null;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    rejectReason?: string | null;
    readonly?: boolean;
    isAssistant?: boolean;
    weights?: {
        questionnaire: number;
        process: number;
        report: number;
    };
};

type AssistantSummary = {
    id: number;
    name: string;
    studentId: string;
    email: string;
    assignedClasses: string[];
    assignedClassIds: number[];
    status?: number;
    lastLogin?: string | null;
};

type GradeExportPreviewItem = {
    taskId: number;
    topicId: number;
    topic: string;
    classId: number;
    className: string;
    graded: number;
    total: number;
    avgScore: number;
};

type GradeExportRow = {
    studentId: string;
    name: string;
    className: string;
    topicName: string;
    submittedAt: string;
    scoreQuestionnaire: string | number;
    scoreProcess: string | number;
    scoreReport: string | number;
    totalScore: string | number;
    status: string;
    gradedAt: string;
    gradedBy: string;
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
const teacherBrowserSession = process.env.E2E_BROWSER_SESSION ?? `teacher-e2e-${runId}`;
const teacherKickBrowserSession = process.env.E2E_KICK_BROWSER_SESSION ?? `teacher-kick-e2e-${runId}`;
const teacherFirstLoginBrowserSession = process.env.E2E_FIRST_LOGIN_BROWSER_SESSION ?? `teacher-first-login-e2e-${runId}`;
const teacherPeerBrowserSession = process.env.E2E_PEER_BROWSER_SESSION ?? `teacher-peer-e2e-${runId}`;
const assistantSeedBrowserSession = process.env.E2E_ASSISTANT_BROWSER_SESSION ?? `assistant-e2e-${runId}`;
const createdAssistantBrowserSession = process.env.E2E_CREATED_ASSISTANT_BROWSER_SESSION ?? `assistant-created-e2e-${runId}`;
const studentBrowserSession = process.env.E2E_STUDENT_BROWSER_SESSION ?? `student-e2e-${runId}`;

const teacherUsername = process.env.E2E_TEACHER_USERNAME ?? "teacher";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "123456";
const teacherChangedPassword = process.env.E2E_TEACHER_NEW_PASSWORD ?? `Teacher#${runId}Aa!`;
const teacherPeerUsername = process.env.E2E_TEACHER_PEER_USERNAME ?? "T002";
const teacherPeerPassword = process.env.E2E_TEACHER_PEER_PASSWORD ?? "123456";
const teacherFirstLoginUsername = process.env.E2E_TEACHER_FIRST_LOGIN_USERNAME ?? "T004";
const teacherFirstLoginPassword = process.env.E2E_TEACHER_FIRST_LOGIN_PASSWORD ?? "123456";
const teacherFirstLoginChangedPassword = process.env.E2E_TEACHER_FIRST_LOGIN_NEW_PASSWORD ?? `TeacherFirst#${runId}Aa!`;
const teacherDisabledUsername = process.env.E2E_TEACHER_DISABLED_USERNAME ?? "T005";
const teacherLockedUsername = process.env.E2E_TEACHER_LOCKED_USERNAME ?? "T006";
const assistantSeedUsername = process.env.E2E_ASSISTANT_USERNAME ?? "assistant";
const assistantSeedPassword = process.env.E2E_ASSISTANT_PASSWORD ?? "123456";
const assistantLockedUsername = process.env.E2E_ASSISTANT_LOCKED_USERNAME ?? "A005";
const createdAssistantAccount = process.env.E2E_CREATED_ASSISTANT_ACCOUNT ?? `AE2E${runId}`;
const createdAssistantName = process.env.E2E_CREATED_ASSISTANT_NAME ?? `助教E2E${runId}`;
const createdAssistantPassword = process.env.E2E_CREATED_ASSISTANT_PASSWORD ?? `Assist#${runId}Aa!`;
const createdAssistantResetPassword = process.env.E2E_CREATED_ASSISTANT_RESET_PASSWORD ?? `AssistReset#${runId}Aa!`;
const createdStudentId = process.env.E2E_CREATED_STUDENT_ID ?? `29${runId}`;
const createdStudentName = process.env.E2E_CREATED_STUDENT_NAME ?? `学生E2E${runId}`;
const createdStudentEmail = process.env.E2E_CREATED_STUDENT_EMAIL ?? `student-${runId}@example.com`;
const importedStudentId = process.env.E2E_IMPORTED_STUDENT_ID ?? `28${runId}`;
const importedStudentName = process.env.E2E_IMPORTED_STUDENT_NAME ?? `导入学生${runId}`;
const importedStudentEmail = process.env.E2E_IMPORTED_STUDENT_EMAIL ?? `import-${runId}@example.com`;
const resetStudentChangedPassword = process.env.E2E_RESET_STUDENT_NEW_PASSWORD ?? `Student#${runId}Aa!`;
const topicName = process.env.E2E_TOPIC_NAME ?? `教师课题E2E${runId}`;
const topicDescription = process.env.E2E_TOPIC_DESCRIPTION ?? `教师端 e2e 课题描述 ${runId}`;
const recommendQuestionContent = process.env.E2E_TOPIC_QUESTION ?? `你对本次抽样设计的总体体验如何？${runId}`;
const shouldResetDb = process.env.E2E_SKIP_DB_RESET !== "1";
const shouldReseedDb = process.env.E2E_SKIP_DB_RESEED !== "1";
const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === "1";
const downloadDir = `${projectRoot}/tmp`;

let serverProcess: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
let currentTeacherPassword = teacherPassword;

const state: {
    targetClass: TeacherClass | null;
    createdTopicId: number | null;
    createdTaskId: number | null;
    createdAssistantId: number | null;
    exportTask: GradeExportPreviewItem | null;
    lockSubmissionId: number | null;
    assistantDraftCandidateId: number | null;
    assistantDraftClassName: string | null;
    rejectCandidateId: number | null;
} = {
    targetClass: null,
    createdTopicId: null,
    createdTaskId: null,
    createdAssistantId: null,
    exportTask: null,
    lockSubmissionId: null,
    assistantDraftCandidateId: null,
    assistantDraftClassName: null,
    rejectCandidateId: null,
};

function log(message: string) {
    console.log(`[teacher-e2e] ${message}`);
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

function normalizeToken(value: string) {
    return value.toLowerCase().replace(/[\s_-]/g, "");
}

function normalizeKeyword(value: string) {
    return value.trim().toLowerCase();
}

function chooseTopicMapping(columns: string[]) {
    assert(columns.length >= 3, `Expected at least 3 columns for topic mapping, got ${columns.length}`);

    const idHints = ["id", "uid", "userid", "studentid", "编号", "编码", "序号", "样本号", "学号"];
    const stratifiedHints = ["gender", "sex", "education", "province", "city", "grade", "major", "class", "status", "性别", "学历", "专业", "年级", "地区", "城市", "省份"];
    const numericHints = ["age", "income", "score", "amount", "count", "rate", "price", "satisfaction", "满意", "次数", "分数", "金额", "收入", "年龄", "价格", "消费"];

    const identifier = columns.find((column) => {
        const normalized = normalizeToken(column);
        return idHints.some((hint) => normalized.includes(normalizeToken(hint)));
    }) ?? columns[0]!;

    const remaining = columns.filter((column) => column !== identifier);
    const stratified = remaining.find((column) => {
        const normalized = normalizeToken(column);
        return stratifiedHints.some((hint) => normalized.includes(normalizeToken(hint)));
    }) ?? remaining[0]!;

    const numeric = remaining.find((column) => {
        if (column === stratified) return false;
        const normalized = normalizeToken(column);
        return numericHints.some((hint) => normalized.includes(normalizeToken(hint)));
    }) ?? remaining.find((column) => column !== stratified) ?? columns[2]!;

    assert(identifier !== stratified && identifier !== numeric && stratified !== numeric, "Topic mapping fields must be distinct");

    return { identifier, stratified, numeric };
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

async function runBrowser(args: string[], options: RunCommandOptions = {}, session = teacherBrowserSession) {
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

async function browserEval<T>(source: string, session = teacherBrowserSession): Promise<T> {
    const result = await runBrowser(["eval", source], {}, session);
    return parseBrowserValue<T>(result.stdout);
}

async function browserJson<T>(body: string, session = teacherBrowserSession): Promise<T> {
    const source = `(async () => {
        const value = await (async () => {
${body}
        })();
        return JSON.stringify(value);
    })()`;
    return browserEval<T>(source, session);
}

async function snapshot(label: string, session = teacherBrowserSession) {
    log(`Snapshot: ${label}`);
    await runBrowser(["snapshot", "-i"], {}, session);
}

async function currentPath(session = teacherBrowserSession) {
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

async function waitForPath(pathname: string, timeoutMs = 15000, session = teacherBrowserSession) {
    await waitFor(
        `path ${pathname}`,
        async () => ((await currentPath(session)) === pathname ? true : false),
        timeoutMs,
    );
}

async function waitForSelector(selector: string, session = teacherBrowserSession, timeoutMs = 15000) {
    await waitFor(
        `selector ${selector}`,
        async () => {
            const exists = await browserJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`, session);
            return exists ? true : false;
        },
        timeoutMs,
    );
}

async function waitForSelectorGone(selector: string, session = teacherBrowserSession, timeoutMs = 15000) {
    await waitFor(
        `selector ${selector} to disappear`,
        async () => {
            const exists = await browserJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`, session);
            return exists ? false : true;
        },
        timeoutMs,
    );
}

async function browserFetch<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
    session = teacherBrowserSession,
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

async function browserFileFetch<T>(
    path: string,
    file: { fileName: string; content: string; mimeType: string; fieldName?: string },
    session = teacherBrowserSession,
) {
    const payload = JSON.stringify({
        path,
        file: {
            fileName: file.fileName,
            content: file.content,
            mimeType: file.mimeType,
            fieldName: file.fieldName ?? "file",
        },
    });

    return browserJson<ApiResponse<T>>(`
        const payload = ${payload};
        const formData = new FormData();
        const file = new File([payload.file.content], payload.file.fileName, { type: payload.file.mimeType });
        formData.append(payload.file.fieldName, file);

        const response = await fetch(payload.path, {
            method: "POST",
            body: formData,
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

async function browserFetchMeta(path: string, session = teacherBrowserSession) {
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

async function clickButtonByText(label: string, session = teacherBrowserSession) {
    const result = await browserJson<{ clicked: boolean }>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const button = Array.from(document.querySelectorAll("button")).find((element) => {
            return isVisible(element) && (element.textContent?.trim().includes(${JSON.stringify(label)}) ?? false);
        });
        if (!button) return { clicked: false };
        button.click();
        return { clicked: true };
    `, session);
    assert(result.clicked, `Could not find visible button containing "${label}"`);
}

async function clickByTestId(testId: string, session = teacherBrowserSession) {
    const result = await browserJson<{ clicked: boolean }>(`
        const element = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        if (!(element instanceof HTMLElement)) return { clicked: false };
        element.click();
        return { clicked: true };
    `, session);
    assert(result.clicked, `Could not click element with data-testid="${testId}"`);
}

async function closeVisibleDialog(session = teacherBrowserSession) {
    const closed = await browserJson<boolean>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const closeButton = Array.from(document.querySelectorAll("button")).find((element) => {
            return element.getAttribute("aria-label") === "Close" && isVisible(element);
        });
        if (!(closeButton instanceof HTMLElement)) return false;
        closeButton.click();
        return true;
    `, session);
    if (!closed) {
        await runBrowser(["press", "Escape"], { allowFailure: true }, session);
    }
    await runBrowser(["wait", "250"], {}, session);
}

async function selectOptionByText(triggerSelector: string, optionText: string, session = teacherBrowserSession) {
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

async function setFileInputFromText(
    selector: string,
    fileName: string,
    content: string,
    mimeType: string,
    session = teacherBrowserSession,
) {
    const result = await browserJson<{ ok: boolean; size: number }>(`
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!(input instanceof HTMLInputElement)) {
            return { ok: false, size: 0 };
        }
        const file = new File([${JSON.stringify(content)}], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mimeType)} });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, size: file.size };
    `, session);
    assert(result.ok, `Could not attach text file to ${selector}`);
    assert(result.size > 0, `Attached file for ${selector} should not be empty`);
}

async function setFileInputFromUrl(
    selector: string,
    url: string,
    fileName: string,
    session = teacherBrowserSession,
) {
    const result = await browserJson<{ ok: boolean; size: number; status?: number }>(`
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!(input instanceof HTMLInputElement)) {
            return { ok: false, size: 0 };
        }
        const response = await fetch(${JSON.stringify(url)}, { credentials: "include" });
        if (!response.ok) {
            return { ok: false, size: 0, status: response.status };
        }
        const blob = await response.blob();
        const file = new File([blob], ${JSON.stringify(fileName)}, { type: blob.type || "application/octet-stream" });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, size: file.size, status: response.status };
    `, session);
    assert(result.ok, `Could not attach ${url} to ${selector} (status ${result.status ?? "unknown"})`);
    assert(result.size > 0, `Attached file from ${url} should not be empty`);
}

async function fillRecommendQuestion(
    content: string,
    optionA: string,
    optionB: string,
    session = teacherBrowserSession,
) {
    await runBrowser(["fill", '[data-testid="teacher-recommend-question-content"]', content], {}, session);
    await runBrowser(["fill", '[placeholder="选项 1"]', optionA], {}, session);
    await runBrowser(["fill", '[placeholder="选项 2"]', optionB], {}, session);
    const enabled = await waitFor(
        "recommend question save button to enable",
        async () => (await isButtonEnabled("teacher-recommend-question-save", session)) ? true : false,
        5000,
        200,
    ).catch(() => false);
    assert(enabled, "Recommend question save button should become enabled");
}

async function isButtonEnabled(testId: string, session = teacherBrowserSession) {
    return browserJson<boolean>(`
        const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
        return button instanceof HTMLButtonElement && !button.disabled;
    `, session);
}

async function fillPasswordDialog(current: string, next: string, session = teacherBrowserSession) {
    await runBrowser(["fill", "#currentPassword", current], {}, session);
    await runBrowser(["fill", "#newPassword", next], {}, session);
    await runBrowser(["fill", "#confirmPassword", next], {}, session);
    await runBrowser(["click", '[data-testid="teacher-password-submit"]'], {}, session);
}

async function fillStudentPasswordDialog(current: string, next: string, session = studentBrowserSession) {
    await runBrowser(["fill", '[data-testid="student-password-current"]', current], {}, session);
    await runBrowser(["fill", '[data-testid="student-password-new"]', next], {}, session);
    await runBrowser(["fill", '[data-testid="student-password-confirm"]', next], {}, session);
    await runBrowser(["click", '[data-testid="student-password-save"]'], {}, session);
}

async function hasCommand(command: string) {
    const lookup = await runCommand(["bash", "-lc", `command -v ${JSON.stringify(command)}`], { allowFailure: true });
    return lookup.exitCode === 0 && Boolean(lookup.stdout.trim());
}

async function ensureTooling() {
    const requiredTools = [
        { command: "agent-browser", purpose: "browser automation" },
    ];

    const missingTools: string[] = [];
    for (const tool of requiredTools) {
        if (!(await hasCommand(tool.command))) {
            missingTools.push(`${tool.command} (${tool.purpose})`);
        }
    }

    assert(
        missingTools.length === 0,
        `Missing required teacher e2e tools: ${missingTools.join(", ")}. Install them before running teacher e2e.`,
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

    log("Starting teacher server");
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
                const response = await fetch(`${baseUrl}/teacher/login`);
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

async function closeBrowser(session = teacherBrowserSession) {
    await runBrowser(["close"], { allowFailure: true }, session);
}

async function cleanupFile(filePath: string) {
    await runCommand(["rm", "-f", filePath], { allowFailure: true });
}

async function ensureDownloadDir() {
    await runCommand(["mkdir", "-p", downloadDir]);
}

async function readWorkbookRows(filePath: string) {
    const buffer = await Bun.file(filePath).arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    assert(firstSheetName, `Workbook ${filePath} should contain at least one sheet`);
    const sheet = workbook.Sheets[firstSheetName];
    assert(sheet, `Workbook ${filePath} should contain a readable first sheet`);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

async function getTeacherMe(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TeacherUser>>("/api/teacher/me", undefined, session);
    assert(response.status === 200, `Teacher me returned status ${response.status}`);
    assert(response.body?.success, "Teacher me did not return success");
    assert(response.body.data, "Teacher me should return current user");
    return response.body.data;
}

async function getStudentMe(session = studentBrowserSession) {
    const response = await browserFetch<ApiEnvelope<{ id: number; studentId: string; name: string; isFirstLogin: number }>>("/api/student/me", undefined, session);
    assert(response.status === 200, `Student me returned status ${response.status}`);
    assert(response.body?.success, "Student me did not return success");
    assert(response.body.data, "Student me should return current user");
    return response.body.data;
}

async function listClasses(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TeacherClass[]>>("/api/teacher/classes", undefined, session);
    assert(response.status === 200, `Teacher classes returned status ${response.status}`);
    assert(response.body?.success, "Teacher classes did not return success");
    return response.body.data ?? [];
}

async function listTopics(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TopicSummary[]>>("/api/teacher/topics", undefined, session);
    assert(response.status === 200, `Teacher topics returned status ${response.status}`);
    assert(response.body?.success, "Teacher topics did not return success");
    return response.body.data ?? [];
}

async function getTopicDetail(id: number, session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TopicDetail>>(`/api/teacher/topics/${id}/detail`, undefined, session);
    assert(response.status === 200, `Teacher topic detail ${id} returned status ${response.status}`);
    assert(response.body?.success, `Teacher topic detail ${id} did not return success`);
    assert(response.body.data, `Teacher topic detail ${id} should return data`);
    return response.body.data;
}

async function listStudents(classId: number, session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<StudentSummary[]>>(`/api/teacher/classes/${classId}/students`, undefined, session);
    assert(response.status === 200, `Teacher students for class ${classId} returned status ${response.status}`);
    assert(response.body?.success, `Teacher students for class ${classId} did not return success`);
    return response.body.data ?? [];
}

async function listTasks(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TaskSummary[]>>("/api/teacher/tasks", undefined, session);
    assert(response.status === 200, `Teacher tasks returned status ${response.status}`);
    assert(response.body?.success, "Teacher tasks did not return success");
    return response.body.data ?? [];
}

async function getTaskProgress(taskId: number, session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TaskProgressData>>(`/api/teacher/tasks/${taskId}/progress`, undefined, session);
    assert(response.status === 200, `Task progress ${taskId} returned status ${response.status}`);
    assert(response.body?.success, `Task progress ${taskId} did not return success`);
    assert(response.body.data, `Task progress ${taskId} should return data`);
    return response.body.data;
}

async function listGrading(status?: string, session = teacherBrowserSession) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await browserFetch<ApiEnvelope<GradingItem[]>>(`/api/teacher/grading${query}`, undefined, session);
    assert(response.status === 200, `Teacher grading list returned status ${response.status}`);
    assert(response.body?.success, "Teacher grading list did not return success");
    return response.body.data ?? [];
}

async function getSubmissionDetail(id: number, session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<SubmissionDetail>>(`/api/teacher/grading/${id}`, undefined, session);
    assert(response.status === 200, `Teacher grading detail ${id} returned status ${response.status}`);
    assert(response.body?.success, `Teacher grading detail ${id} did not return success`);
    assert(response.body.data, `Teacher grading detail ${id} should return data`);
    return response.body.data;
}

async function listAssistants(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<AssistantSummary[]>>("/api/teacher/assistants", undefined, session);
    assert(response.status === 200, `Teacher assistants returned status ${response.status}`);
    assert(response.body?.success, "Teacher assistants did not return success");
    return response.body.data ?? [];
}

async function getNotifications(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TeacherNotificationsResponse>>("/api/teacher/notifications", undefined, session);
    assert(response.status === 200, `Teacher notifications returned status ${response.status}`);
    assert(response.body?.success, "Teacher notifications did not return success");
    assert(response.body.data, "Teacher notifications should return data");
    return response.body.data;
}

async function getStats(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<TeacherStats>>("/api/teacher/dashboard", undefined, session);
    assert(response.status === 200, `Teacher dashboard returned status ${response.status}`);
    assert(response.body?.success, "Teacher dashboard did not return success");
    assert(response.body.data, "Teacher dashboard should return data");
    return response.body.data;
}

async function getGradeExportPreview(params: { semester?: string; classId?: string | number; topicId?: string | number }, session = teacherBrowserSession) {
    const search = new URLSearchParams();
    if (params.semester !== undefined) search.set("semester", String(params.semester));
    if (params.classId !== undefined) search.set("classId", String(params.classId));
    if (params.topicId !== undefined) search.set("topicId", String(params.topicId));
    const response = await browserFetch<ApiEnvelope<GradeExportPreviewItem[]>>(`/api/teacher/grade-export/preview?${search.toString()}`, undefined, session);
    assert(response.status === 200, `Teacher export preview returned status ${response.status}`);
    assert(response.body?.success, "Teacher export preview did not return success");
    return response.body.data ?? [];
}

async function getGradeExportData(params: { semester?: string; classId?: string | number; topicId?: string | number; taskId?: string | number }, session = teacherBrowserSession) {
    const search = new URLSearchParams();
    if (params.semester !== undefined) search.set("semester", String(params.semester));
    if (params.classId !== undefined) search.set("classId", String(params.classId));
    if (params.topicId !== undefined) search.set("topicId", String(params.topicId));
    if (params.taskId !== undefined) search.set("taskId", String(params.taskId));
    const response = await browserFetch<ApiEnvelope<GradeExportRow[]>>(`/api/teacher/grade-export/data?${search.toString()}`, undefined, session);
    assert(response.status === 200, `Teacher export data returned status ${response.status}`);
    assert(response.body?.success, "Teacher export data did not return success");
    return response.body.data ?? [];
}

async function loginAsTeacher(options: {
    username: string;
    password: string;
    session?: string;
    expectedPath?: string;
}) {
    const session = options.session ?? teacherBrowserSession;
    const expectedPath = options.expectedPath ?? "/teacher";

    log(`Logging in as ${options.username}`);
    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, session);
    await runBrowser(["wait", "800"], {}, session);

    const loginPage = await browserJson<{
        pathname: string;
        username: boolean;
        password: boolean;
        submit: boolean;
    }>(`
        return {
            pathname: location.pathname,
            username: !!document.querySelector('[data-testid="teacher-login-username"]'),
            password: !!document.querySelector('[data-testid="teacher-login-password"]'),
            submit: !!document.querySelector('[data-testid="teacher-login-submit"]'),
        };
    `, session);

    assert(loginPage.pathname === "/teacher/login", `Expected /teacher/login, got ${loginPage.pathname}`);
    assert(loginPage.username && loginPage.password && loginPage.submit, "Teacher login form is incomplete");

    await runBrowser(["fill", '[data-testid="teacher-login-username"]', options.username], {}, session);
    await runBrowser(["fill", '[data-testid="teacher-login-password"]', options.password], {}, session);
    await runBrowser(["click", '[data-testid="teacher-login-submit"]'], {}, session);

    await waitFor(
        `login redirect for ${options.username}`,
        async () => {
            const path = await currentPath(session);
            return path === expectedPath ? true : false;
        },
        15000,
    );
    await runBrowser(["wait", "900"], {}, session);
}

async function loginAsStudent(options: {
    studentId: string;
    password: string;
    session?: string;
    expectedPath?: string;
}) {
    const session = options.session ?? studentBrowserSession;
    const expectedPath = options.expectedPath ?? "/student";

    log(`Logging in as student ${options.studentId}`);
    await runBrowser(["open", `${baseUrl}/student/login`], {}, session);
    await runBrowser(["wait", "800"], {}, session);

    await runBrowser(["fill", '[data-testid="student-login-username"]', options.studentId], {}, session);
    await runBrowser(["fill", '[data-testid="student-login-password"]', options.password], {}, session);
    await runBrowser(["click", '[data-testid="student-login-submit"]'], {}, session);
    await waitFor(
        `student login redirect for ${options.studentId}`,
        async () => {
            const path = await currentPath(session);
            return path === expectedPath ? true : false;
        },
        15000,
    );
    await runBrowser(["wait", "900"], {}, session);
}

async function logoutTeacher(session = teacherBrowserSession) {
    await clickByTestId("teacher-logout", session);
    await waitForPath("/teacher/login", 15000, session);
}

async function logoutTeacherByApi(session = teacherBrowserSession) {
    const response = await browserFetch<ApiEnvelope<{ success?: boolean }>>("/api/teacher/logout", { method: "POST" }, session);
    assert(response.status === 200, `Teacher logout returned status ${response.status}`);
    await runBrowser(["open", `${baseUrl}/teacher/login`], {}, session);
    await waitForPath("/teacher/login", 15000, session);
}

async function logoutStudent(session = studentBrowserSession) {
    const response = await browserFetch<ApiEnvelope<{ ok: boolean }>>("/api/student/logout", { method: "POST" }, session);
    assert(response.status === 200, `Student logout returned status ${response.status}`);
    await runBrowser(["open", `${baseUrl}/student/login`], {}, session);
    await waitForPath("/student/login", 15000, session);
}

async function testTeacherLoginEdgeCases() {
    log("Checking teacher login edge cases");

    const invalidCredentials = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: "NO_SUCH_TEACHER",
            password: "123456",
        },
    });
    assert(invalidCredentials.status === 401, `Invalid teacher login should return 401, got ${invalidCredentials.status}`);
    assert(invalidCredentials.body?.success === false, "Invalid teacher login should fail");
    assert(invalidCredentials.body.error?.code === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${invalidCredentials.body.error?.code ?? "unknown"}`);

    const disabledTeacher = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: teacherDisabledUsername,
            password: teacherPassword,
        },
    });
    assert(disabledTeacher.status === 403, `Disabled teacher login should return 403, got ${disabledTeacher.status}`);
    assert(disabledTeacher.body?.success === false, "Disabled teacher login should fail");
    assert(disabledTeacher.body.error?.code === "ACCOUNT_DISABLED", `Expected ACCOUNT_DISABLED, got ${disabledTeacher.body.error?.code ?? "unknown"}`);

    const lockedTeacher = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: teacherLockedUsername,
            password: teacherPassword,
        },
    });
    assert(lockedTeacher.status === 403, `Locked teacher login should return 403, got ${lockedTeacher.status}`);
    assert(lockedTeacher.body?.success === false, "Locked teacher login should fail");
    assert(lockedTeacher.body.error?.code === "ACCOUNT_LOCKED", `Expected ACCOUNT_LOCKED, got ${lockedTeacher.body.error?.code ?? "unknown"}`);

    const lockedAssistant = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: assistantLockedUsername,
            password: assistantSeedPassword,
        },
    });
    assert(lockedAssistant.status === 403, `Locked assistant login should return 403, got ${lockedAssistant.status}`);
    assert(lockedAssistant.body?.success === false, "Locked assistant login should fail");
    assert(lockedAssistant.body.error?.code === "ACCOUNT_LOCKED", `Expected ACCOUNT_LOCKED, got ${lockedAssistant.body.error?.code ?? "unknown"}`);

    await loginAsTeacher({
        username: teacherFirstLoginUsername,
        password: teacherFirstLoginPassword,
        session: teacherFirstLoginBrowserSession,
        expectedPath: "/teacher",
    });
    await waitForSelector('[data-testid="teacher-password-submit"]', teacherFirstLoginBrowserSession);

    const firstLoginMe = await getTeacherMe(teacherFirstLoginBrowserSession);
    assert(firstLoginMe.employeeId === teacherFirstLoginUsername, `Expected first-login teacher ${teacherFirstLoginUsername}, got ${firstLoginMe.employeeId ?? "unknown"}`);
    assert(firstLoginMe.isFirstLogin === 1, "First-login teacher should be forced to change password");

    await fillPasswordDialog(teacherFirstLoginPassword, teacherFirstLoginChangedPassword, teacherFirstLoginBrowserSession);
    await waitFor(
        "teacher first-login password modal to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"teacher-password-submit\"]');", teacherFirstLoginBrowserSession);
            return open ? false : true;
        },
    );

    const firstLoginUpdatedMe = await getTeacherMe(teacherFirstLoginBrowserSession);
    assert(firstLoginUpdatedMe.isFirstLogin === 0, "First-login teacher should clear first-login flag after changing password");
    await logoutTeacher(teacherFirstLoginBrowserSession);

    const firstLoginOldPassword = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: teacherFirstLoginUsername,
            password: teacherFirstLoginPassword,
        },
    });
    assert(firstLoginOldPassword.status === 401, `Old first-login teacher password should return 401, got ${firstLoginOldPassword.status}`);

    const firstLoginNewPassword = await httpJson<ApiEnvelope<{ user: TeacherUser }>>("/api/teacher/login", {
        method: "POST",
        body: {
            employeeId: teacherFirstLoginUsername,
            password: teacherFirstLoginChangedPassword,
        },
    });
    assert(firstLoginNewPassword.status === 200, `Changed first-login teacher password should return 200, got ${firstLoginNewPassword.status}`);
    assert(firstLoginNewPassword.body?.success, "Changed first-login teacher password should succeed");
    assert(firstLoginNewPassword.body.data?.user.employeeId === teacherFirstLoginUsername, "Changed first-login teacher login should return the expected teacher");
}

async function testTeacherDashboard() {
    log("Checking teacher dashboard and shell");

    await loginAsTeacher({
        username: teacherUsername,
        password: currentTeacherPassword,
        session: teacherBrowserSession,
        expectedPath: "/teacher",
    });
    await snapshot("teacher dashboard");

    const me = await getTeacherMe();
    assert(me.type === "teacher", `Expected teacher session, got ${me.type}`);
    assert(me.employeeId === teacherUsername, `Expected teacher employeeId ${teacherUsername}, got ${me.employeeId ?? "unknown"}`);

    const stats = await getStats();
    const statMap = new Map(stats.stats.map((item) => [item.label, item.value]));
    assert((statMap.get("我的班级") ?? 0) > 0, "Teacher dashboard should show at least one class");
    assert((statMap.get("我的课题") ?? 0) > 0, "Teacher dashboard should show at least one topic");
    assert(stats.recentSubmissions.length > 0, "Teacher dashboard should include recent submissions");
    assert(stats.recentGradings.length > 0, "Teacher dashboard should include recent gradings");

    const dashboardState = await browserJson<{
        hasCards: boolean;
        hasTeacherNav: boolean;
    }>(`
        const text = document.body.textContent ?? "";
        return {
            hasCards: ["我的班级", "我的课题", "待批改作业", "进行中任务"].every((label) => text.includes(label)),
            hasTeacherNav: ["首页概览", "班级管理", "课题管理", "任务管理", "作业批改", "助教管理", "成绩导出"].every((label) => text.includes(label)),
        };
    `);
    assert(dashboardState.hasCards, "Teacher dashboard cards are incomplete");
    assert(dashboardState.hasTeacherNav, "Teacher navigation is incomplete");
}

async function testTeacherNotifications() {
    log("Checking teacher notifications");

    const before = await getNotifications();
    assert(before.notifications.length > 0, "Seeded teacher notifications should exist");
    assert(before.unreadCount > 0, "Teacher should start with unread notifications");

    await clickByTestId("teacher-open-notifications");
    await waitForSelector('[data-testid="teacher-notification-read-all"]');
    await snapshot("teacher notifications");

    const clickedFirstUnread = await browserJson<{ clicked: boolean }>(`
        const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const button = Array.from(document.querySelectorAll("button"))
            .find((element) => isVisible(element) && (element.textContent?.trim() === "标记已读"));
        if (!(button instanceof HTMLElement)) {
            return { clicked: false };
        }
        button.click();
        return { clicked: true };
    `);
    assert(clickedFirstUnread.clicked, "Expected at least one visible unread notification action");

    await waitFor(
        "teacher unread count to decrease after single read",
        async () => {
            const current = await getNotifications();
            return current.unreadCount === before.unreadCount - 1 ? current : false;
        },
    );

    await clickByTestId("teacher-notification-read-all");
    await waitFor(
        "teacher unread count to become zero",
        async () => {
            const current = await getNotifications();
            return current.unreadCount === 0 ? current : false;
        },
    );

    await runBrowser(["press", "Escape"]);
}

async function testClassAndStudentManagement() {
    log("Checking class and student management");

    await clickByTestId("teacher-nav-class");
    await waitForPath("/teacher/class");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher class page");

    const classes = await listClasses();
    assert(classes.length > 0, "Teacher should own at least one class");

    const targetClass = classes.find((item) => item.studentCount > 0) ?? classes[0]!;
    state.targetClass = targetClass;

    await runBrowser(["fill", '[data-testid="teacher-class-search"]', targetClass.name], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-class-row-${targetClass.id}"]`);
    if (targetClass.semester) {
        await selectOptionByText('[data-testid="teacher-class-semester-filter"]', targetClass.semester);
        await waitForSelector(`[data-testid="teacher-class-row-${targetClass.id}"]`);
        await selectOptionByText('[data-testid="teacher-class-semester-filter"]', "全部学期");
    }

    await clickByTestId(`teacher-class-manage-students-${targetClass.id}`);
    await waitForPath(`/teacher/class/${targetClass.id}/students`);
    await runBrowser(["wait", "500"]);
    await snapshot("teacher student page");

    const beforeStudents = await listStudents(targetClass.id);
    const resetCandidate = beforeStudents.find((student) => student.status === 1 && student.isFirstLogin === 0) ?? beforeStudents.find((student) => student.status === 1);
    assert(resetCandidate, `Class ${targetClass.name} should have at least one active student for reset verification`);

    await clickByTestId("teacher-student-add-open");
    await waitForSelector('[data-testid="teacher-student-add-submit"]');
    await runBrowser(["fill", '[data-testid="teacher-student-add-id"]', createdStudentId], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-student-add-name"]', createdStudentName], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-student-add-email"]', createdStudentEmail], {}, teacherBrowserSession);
    await clickByTestId("teacher-student-add-submit");

    const createdStudent = await waitFor(
        `student ${createdStudentId} to be created`,
        async () => (await listStudents(targetClass.id)).find((student) => student.studentId === createdStudentId) ?? false,
    );
    assert(createdStudent.name === createdStudentName, "Created student name mismatch");

    const duplicateResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(
        `/api/teacher/classes/${targetClass.id}/students`,
        {
            method: "POST",
            body: {
                studentId: createdStudentId,
                name: createdStudentName,
                email: createdStudentEmail,
            },
        },
    );
    assert(duplicateResponse.status === 400, `Duplicate student create should return 400, got ${duplicateResponse.status}`);
    assert(duplicateResponse.body?.success === false, "Duplicate student create should fail");
    assert(duplicateResponse.body.error?.code === "DUPLICATE_ERROR", `Expected DUPLICATE_ERROR, got ${duplicateResponse.body.error?.code ?? "unknown"}`);

    const templatePath = `${downloadDir}/teacher-students-template-${runId}.csv`;
    await ensureDownloadDir();
    try {
        await clickByTestId("teacher-student-import-open");
        await waitForSelector('[data-testid="teacher-student-import-submit"]');
        await runBrowser(["download", '[data-testid="teacher-student-template-download"]', templatePath], {}, teacherBrowserSession);
        const templateContent = await Bun.file(templatePath).text();
        assert(templateContent.includes("studentId,name,email"), "Student template should contain CSV headers");

        const importCsv = `\uFEFFstudentId,name,email\n${importedStudentId},${importedStudentName},${importedStudentEmail}\n`;
        await setFileInputFromText(
            '[data-testid="teacher-student-import-file"]',
            "students-import.csv",
            importCsv,
            "text/csv;charset=utf-8",
        );
        await clickByTestId("teacher-student-import-submit");

        await waitFor(
            `student ${importedStudentId} to be imported`,
            async () => (await listStudents(targetClass.id)).find((student) => student.studentId === importedStudentId) ?? false,
        );
        await runBrowser(["press", "Escape"], { allowFailure: true }, teacherBrowserSession);
    } finally {
        await cleanupFile(templatePath);
    }

    await clickByTestId(`teacher-student-reset-${resetCandidate.id}`);
    await waitForSelector('[data-testid="teacher-student-confirm-submit"]');
    await clickByTestId("teacher-student-confirm-submit");
    await waitFor(
        `student ${resetCandidate.studentId} reset state`,
        async () => {
            const refreshed = (await listStudents(targetClass.id)).find((student) => student.id === resetCandidate.id);
            return refreshed?.isFirstLogin === 1 ? refreshed : false;
        },
    );

    await clickByTestId(`teacher-student-toggle-${createdStudent.id}`);
    await waitForSelector('[data-testid="teacher-student-confirm-submit"]');
    await clickByTestId("teacher-student-confirm-submit");
    await waitFor(
        `student ${createdStudentId} to be disabled`,
        async () => {
            const refreshed = (await listStudents(targetClass.id)).find((student) => student.id === createdStudent.id);
            return refreshed?.status === 0 ? refreshed : false;
        },
    );

    const disabledStudentLogin = await httpJson<ApiEnvelope<{ user: { studentId: string } }>>("/api/student/login", {
        method: "POST",
        body: {
            studentId: createdStudentId,
            password: createdStudentId,
        },
    });
    assert(disabledStudentLogin.status === 403, `Disabled student login should return 403, got ${disabledStudentLogin.status}`);
    assert(disabledStudentLogin.body?.success === false, "Disabled student login should fail");
    assert(disabledStudentLogin.body.error?.code === "ACCOUNT_DISABLED", `Expected ACCOUNT_DISABLED, got ${disabledStudentLogin.body.error?.code ?? "unknown"}`);

    await clickByTestId(`teacher-student-toggle-${createdStudent.id}`);
    await waitForSelector('[data-testid="teacher-student-confirm-submit"]');
    await clickByTestId("teacher-student-confirm-submit");
    await waitFor(
        `student ${createdStudentId} to be re-enabled`,
        async () => {
            const refreshed = (await listStudents(targetClass.id)).find((student) => student.id === createdStudent.id);
            return refreshed?.status === 1 ? refreshed : false;
        },
    );

    const importedStudent = (await listStudents(targetClass.id)).find((student) => student.studentId === importedStudentId);
    assert(importedStudent, `Expected imported student ${importedStudentId} to exist before deletion`);
    await clickByTestId(`teacher-student-delete-${importedStudent.id}`);
    await waitForSelector('[data-testid="teacher-student-confirm-submit"]');
    await clickByTestId("teacher-student-confirm-submit");
    await waitFor(
        `student ${importedStudentId} to be deleted`,
        async () => {
            const refreshed = await listStudents(targetClass.id);
            return refreshed.some((student) => student.studentId === importedStudentId) ? false : true;
        },
    );

    await runBrowser(["fill", '[data-testid="teacher-student-search"]', createdStudentName], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-student-row-${createdStudent.id}"]`);

    await loginAsStudent({
        studentId: resetCandidate.studentId,
        password: resetCandidate.studentId,
        session: studentBrowserSession,
        expectedPath: "/student",
    });
    await waitForSelector('[data-testid="student-password-save"]', studentBrowserSession);
    await fillStudentPasswordDialog(resetCandidate.studentId, resetStudentChangedPassword, studentBrowserSession);
    await waitFor(
        "student first-login password modal to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"student-password-save\"]');", studentBrowserSession);
            return open ? false : true;
        },
    );
    const resetStudentMe = await getStudentMe(studentBrowserSession);
    assert(resetStudentMe.studentId === resetCandidate.studentId, `Expected reset student ${resetCandidate.studentId}, got ${resetStudentMe.studentId}`);
    assert(resetStudentMe.isFirstLogin === 0, "Reset student should clear first-login flag after changing password");
    await logoutStudent(studentBrowserSession);
}

async function testTopicManagement() {
    log("Checking topic management and six-step wizard");

    await clickByTestId("teacher-nav-topic");
    await waitForPath("/teacher/topic");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher topic page");

    await selectOptionByText('[data-testid="teacher-topic-status-filter"]', "草稿");
    await selectOptionByText('[data-testid="teacher-topic-status-filter"]', "全部状态");

    await clickByTestId("teacher-topic-create-open");
    await waitForSelector('[data-testid="teacher-topic-name"]');

    await runBrowser(["fill", '[data-testid="teacher-topic-name"]', topicName], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-topic-desc"]', topicDescription], {}, teacherBrowserSession);
    await clickByTestId("teacher-topic-next");

    const createdTopic = await waitFor(
        `topic ${topicName} to be created`,
        async () => (await listTopics()).find((topic) => topic.name === topicName) ?? false,
    );
    state.createdTopicId = createdTopic.id;

    await waitForSelector('[data-testid="teacher-topic-excel-file"]');
    await setFileInputFromUrl('[data-testid="teacher-topic-excel-file"]', "/templates/数据模板.csv", "数据模板.csv");
    const topicAfterUpload = await waitFor(
        `topic ${topicName} excel upload`,
        async () => {
            const detail = await getTopicDetail(createdTopic.id);
            return (detail.excelInfo?.columns?.length ?? 0) >= 3 ? detail : false;
        },
        20000,
        500,
    );
    assert((topicAfterUpload.excelInfo?.preview?.length ?? 0) > 0, "Uploaded topic should expose excel preview rows");
    await snapshot("teacher topic upload");

    await clickByTestId("teacher-topic-next");
    await waitForSelector('[data-testid="teacher-topic-mapping-identifier"]');

    await clickButtonByText("智能推荐映射");
    const smartMappingEnabled = await waitFor(
        "topic mapping button to settle",
        async () => (await isButtonEnabled("teacher-topic-next")) ? true : false,
        3000,
        250,
    ).catch(() => false);

    if (!smartMappingEnabled) {
        const columns = topicAfterUpload.excelInfo?.columns ?? [];
        const mapping = chooseTopicMapping(columns);
        await selectOptionByText('[data-testid="teacher-topic-mapping-identifier"]', mapping.identifier);
        await clickByTestId(`teacher-topic-mapping-stratified-${mapping.stratified}`);
        await clickByTestId(`teacher-topic-mapping-numeric-${mapping.numeric}`);
    }

    assert(await isButtonEnabled("teacher-topic-next"), "Topic mapping should be valid before continuing");
    await clickByTestId("teacher-topic-next");
    await waitForSelector('[data-testid="teacher-topic-attachment-file"]');

    await setFileInputFromUrl('[data-testid="teacher-topic-attachment-file"]', "/templates/数据上传规范.pdf", "数据上传规范.pdf");
    const topicAfterAttachment = await waitFor(
        `topic ${topicName} attachment upload`,
        async () => {
            const detail = await getTopicDetail(createdTopic.id);
            return detail.attachments.some((attachment) => attachment.fileName.includes("数据上传规范")) ? detail : false;
        },
        15000,
        500,
    );
    assert(topicAfterAttachment.attachments.length > 0, "Topic attachment should be persisted");

    await clickByTestId("teacher-topic-next");
    await waitForSelector('[data-testid="teacher-topic-question-add"]');
    await clickByTestId("teacher-topic-question-add");
    await waitForSelector('[data-testid="teacher-recommend-question-editor"]');
    await fillRecommendQuestion(recommendQuestionContent, "非常满意", "一般");
    await clickByTestId("teacher-recommend-question-save");
    await waitFor(
        "recommend question editor to close",
        async () => {
            const open = await browserJson<boolean>(`return !!document.querySelector('[data-testid="teacher-recommend-question-editor"]');`);
            return open ? false : true;
        },
    );
    await waitFor(
        "recommend question to appear in wizard list",
        async () => {
            const state = await browserJson<{ count: number; matched: boolean }>(`
                const items = Array.from(document.querySelectorAll('[data-testid^="teacher-topic-question-content-"]'));
                const matched = items.some((node) => node.textContent?.includes(${JSON.stringify(recommendQuestionContent)}) ?? false);
                return { count: items.length, matched };
            `);
            return state.count > 0 && state.matched ? state : false;
        },
    );

    await clickByTestId("teacher-topic-next");
    await waitForSelector('[data-testid="teacher-topic-weight-questionnaire"]');
    await runBrowser(["fill", '[data-testid="teacher-topic-weight-questionnaire"]', "30"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-topic-weight-process"]', "30"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-topic-weight-report"]', "40"], {}, teacherBrowserSession);
    await clickByTestId("teacher-topic-finish");

    await waitFor(
        `topic wizard modal to close for ${topicName}`,
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"teacher-topic-name\"]');");
            return open ? false : true;
        },
    );

    const finalizedTopic = await waitFor(
        `topic ${topicName} final detail`,
        async () => {
            const detail = await getTopicDetail(createdTopic.id);
            return detail.recommendQuestions.length > 0 && detail.attachments.length > 0 ? detail : false;
        },
    );
    const weightConfig = finalizedTopic.topic?.weightConfig;
    const parsedWeights = typeof weightConfig === "string" ? JSON.parse(weightConfig) as { questionnaire: number; process: number; report: number } : weightConfig as { questionnaire: number; process: number; report: number } | undefined;
    assert(parsedWeights?.questionnaire === 30 && parsedWeights.process === 30 && parsedWeights.report === 40, "Topic weights should persist as 30/30/40");

    await runBrowser(["fill", '[data-testid="teacher-topic-search"]', topicName], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-topic-row-${createdTopic.id}"]`);

    await clickByTestId(`teacher-topic-view-${createdTopic.id}`);
    await waitFor(
        `topic ${createdTopic.id} view dialog`,
        async () => {
            const state = await browserJson<{ open: boolean; hasDescription: boolean }>(`
                const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
                    .find((element) => element.textContent?.includes(${JSON.stringify(topicName)}) ?? false);
                const text = dialog?.textContent ?? "";
                return {
                    open: !!dialog,
                    hasDescription: text.includes(${JSON.stringify(topicDescription)}),
                };
            `);
            return state.open && state.hasDescription ? state : false;
        },
    );
    await clickButtonByText("辅助资料");
    await waitFor(
        `topic ${createdTopic.id} attachment tab`,
        async () => {
            const text = await browserJson<string>(`
                const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
                    .find((element) => element.textContent?.includes(${JSON.stringify(topicName)}) ?? false);
                return dialog?.textContent ?? "";
            `);
            return text.includes("数据上传规范") ? true : false;
        },
    );
    await clickButtonByText("推荐题目");
    await waitFor(
        `topic ${createdTopic.id} question tab`,
        async () => {
            const text = await browserJson<string>(`
                const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
                    .find((element) => element.textContent?.includes(${JSON.stringify(topicName)}) ?? false);
                return dialog?.textContent ?? "";
            `);
            return text.includes(recommendQuestionContent) ? true : false;
        },
    );
    await closeVisibleDialog();
    await waitFor(
        `topic ${createdTopic.id} view dialog to close`,
        async () => {
            const open = await browserJson<boolean>(`
                return Array.from(document.querySelectorAll('[role="dialog"]'))
                    .some((element) => element.textContent?.includes(${JSON.stringify(topicName)}) ?? false);
            `);
            return open ? false : true;
        },
    );

    await clickByTestId(`teacher-topic-publish-${createdTopic.id}`);
    await clickButtonByText("确认");
    await waitFor(
        `topic ${topicName} publish`,
        async () => {
            const topic = (await listTopics()).find((item) => item.id === createdTopic.id);
            return topic?.status === 1 ? topic : false;
        },
    );

    const publishedExcelForbidden = await browserFileFetch<ApiEnvelope<{ filePath: string }>>(
        `/api/teacher/topics/${createdTopic.id}/excel`,
        {
            fileName: "blocked-update.csv",
            content: "id,name\n1,blocked\n",
            mimeType: "text/csv",
        },
    );
    assert(publishedExcelForbidden.status === 403, `Published topic excel update should return 403, got ${publishedExcelForbidden.status}`);
    assert(publishedExcelForbidden.body?.success === false, "Published topic excel update should fail");
    assert(publishedExcelForbidden.body?.error?.code === "FORBIDDEN", `Expected FORBIDDEN for published topic excel update, got ${publishedExcelForbidden.body?.error?.code ?? "unknown"}`);

    const publishedMappingForbidden = await browserFetch<ApiEnvelope<{ success: boolean }>>(
        `/api/teacher/topics/${createdTopic.id}/mapping`,
        {
            method: "PUT",
            body: {
                fieldMapping: {
                    identifier: "样本编号",
                    stratified: ["性别"],
                    numeric: ["月均消费"],
                    others: [],
                },
            },
        },
    );
    assert(publishedMappingForbidden.status === 403, `Published topic mapping update should return 403, got ${publishedMappingForbidden.status}`);
    assert(publishedMappingForbidden.body?.success === false, "Published topic mapping update should fail");
    assert(publishedMappingForbidden.body?.error?.code === "FORBIDDEN", `Expected FORBIDDEN for published topic mapping update, got ${publishedMappingForbidden.body?.error?.code ?? "unknown"}`);

    await clickByTestId(`teacher-topic-copy-${createdTopic.id}`);
    const copiedTopic = await waitFor(
        `copied topic for ${topicName}`,
        async () => (await listTopics()).find((topic) => topic.name === `${topicName} (副本)`) ?? false,
    );
    assert(copiedTopic.status === 0, `Copied topic should be draft, got status ${copiedTopic.status}`);

    const editedCopiedTopicName = `${topicName} 副本编辑 ${runId}`;
    const editedCopiedTopicDescription = `复制课题编辑描述 ${runId}`;
    await runBrowser(["open", `${baseUrl}/teacher/topic`], {}, teacherBrowserSession);
    await waitForPath("/teacher/topic");
    await runBrowser(["wait", "500"]);
    await runBrowser(["fill", '[data-testid="teacher-topic-search"]', copiedTopic.name], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-topic-row-${copiedTopic.id}"]`);
    await clickByTestId(`teacher-topic-edit-${copiedTopic.id}`);
    await waitForSelector('[data-testid="teacher-topic-name"]');

    const copiedTopicForm = await browserJson<{ name: string; description: string }>(`
        const nameInput = document.querySelector('[data-testid="teacher-topic-name"]');
        const descriptionInput = document.querySelector('[data-testid="teacher-topic-desc"]');
        return {
            name: nameInput instanceof HTMLInputElement ? nameInput.value : "",
            description: descriptionInput instanceof HTMLTextAreaElement ? descriptionInput.value : "",
        };
    `);
    assert(copiedTopicForm.name === copiedTopic.name, `Expected copied topic name ${copiedTopic.name}, got ${copiedTopicForm.name}`);
    assert(copiedTopicForm.description === topicDescription, `Expected copied topic description ${topicDescription}, got ${copiedTopicForm.description}`);

    await runBrowser(["fill", '[data-testid="teacher-topic-name"]', editedCopiedTopicName], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-topic-desc"]', editedCopiedTopicDescription], {}, teacherBrowserSession);
    await clickByTestId("teacher-topic-next");
    await waitForSelector('[data-testid="teacher-topic-excel-file"]');

    const editedCopiedTopic = await waitFor(
        `copied topic ${copiedTopic.id} edit`,
        async () => {
            const topic = (await listTopics()).find((item) => item.id === copiedTopic.id);
            return topic?.name === editedCopiedTopicName ? topic : false;
        },
    );
    assert(editedCopiedTopic.name === editedCopiedTopicName, `Expected edited copied topic name ${editedCopiedTopicName}, got ${editedCopiedTopic.name}`);

    const copiedDetailBeforeDelete = await getTopicDetail(copiedTopic.id);
    const copiedAttachment = copiedDetailBeforeDelete.attachments[0];
    assert(copiedAttachment, "Copied topic should include at least one attachment before deletion");

    const deleteAttachmentResponse = await browserFetch<ApiEnvelope<{ success: boolean }>>(
        `/api/teacher/topics/${copiedTopic.id}/attachments/${copiedAttachment.id}`,
        { method: "DELETE" },
    );
    assert(deleteAttachmentResponse.status === 200, `Copied topic attachment delete should return 200, got ${deleteAttachmentResponse.status}`);
    assert(deleteAttachmentResponse.body?.success, "Copied topic attachment delete should succeed");

    const copiedDetailAfterDelete = await waitFor(
        `copied topic ${copiedTopic.id} attachment deletion`,
        async () => {
            const detail = await getTopicDetail(copiedTopic.id);
            return detail.attachments.some((attachment) => attachment.id === copiedAttachment.id) ? false : detail;
        },
    );
    assert(
        copiedDetailAfterDelete.topic?.description === editedCopiedTopicDescription,
        `Expected copied topic description ${editedCopiedTopicDescription}, got ${copiedDetailAfterDelete.topic?.description ?? "unknown"}`,
    );

    await closeVisibleDialog();
    await waitForSelectorGone('[data-testid="teacher-topic-name"]');
    await runBrowser(["open", `${baseUrl}/teacher/topic`], {}, teacherBrowserSession);
    await waitForPath("/teacher/topic");
    await runBrowser(["wait", "500"]);
    await runBrowser(["fill", '[data-testid="teacher-topic-search"]', editedCopiedTopicName], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-topic-row-${copiedTopic.id}"]`);
    await clickByTestId(`teacher-topic-delete-${copiedTopic.id}`);
    await clickButtonByText("确认");
    await waitFor(
        `copied topic ${copiedTopic.id} deletion`,
        async () => (await listTopics()).some((topic) => topic.id === copiedTopic.id) ? false : true,
    );
}

async function testTaskManagement() {
    log("Checking task publish, progress, and extend flow");

    assert(state.targetClass, "Target class should be set before task management test");
    assert(state.createdTopicId, "Created topic should be set before task management test");

    const topic = (await listTopics()).find((item) => item.id === state.createdTopicId);
    assert(topic?.status === 1, "Created topic should be published before task creation");

    await clickByTestId("teacher-nav-task");
    await waitForPath("/teacher/task");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher task page");

    await runBrowser(["fill", '[data-testid="teacher-task-search"]', topicName], {}, teacherBrowserSession);
    await clickByTestId("teacher-task-publish-open");
    await waitForSelector('[data-testid="teacher-task-topic-select"]');
    await selectOptionByText('[data-testid="teacher-task-topic-select"]', topicName);
    await clickByTestId(`teacher-task-class-check-${state.targetClass.id}`);
    await runBrowser(["fill", '[data-testid="teacher-task-deadline"]', toDateTimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))], {}, teacherBrowserSession);
    await clickByTestId("teacher-task-publish-submit");

    const createdTask = await waitFor(
        `task for ${topicName} / ${state.targetClass.name}`,
        async () => (await listTasks()).find((task) => task.topic === topicName && task.className === state.targetClass?.name) ?? false,
    );
    state.createdTaskId = createdTask.id;

    const progress = await getTaskProgress(createdTask.id);
    assert(progress.task.topicName === topicName, `Expected task progress topic ${topicName}, got ${progress.task.topicName}`);
    assert(progress.task.className === state.targetClass.name, `Expected task progress class ${state.targetClass.name}, got ${progress.task.className}`);
    const currentStudents = await listStudents(state.targetClass.id);
    assert(progress.students.length === currentStudents.length, `Task progress should cover all current students in the target class (${currentStudents.length}), got ${progress.students.length}`);

    await runBrowser(["open", `${baseUrl}/teacher/task/${createdTask.id}/progress`], {}, teacherBrowserSession);
    await waitForPath(`/teacher/task/${createdTask.id}/progress`);
    await snapshot("teacher task progress");
    await runBrowser(["open", `${baseUrl}/teacher/task`], {}, teacherBrowserSession);
    await waitForPath("/teacher/task");

    const originalDeadline = createdTask.deadline;
    await clickByTestId(`teacher-task-extend-open-${createdTask.id}`);
    await waitForSelector('[data-testid="teacher-task-extend-submit"]');
    await runBrowser(["fill", '[data-testid="teacher-task-extend-deadline"]', toDateTimeLocal(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))], {}, teacherBrowserSession);
    await clickByTestId("teacher-task-extend-submit");

    const extendedTask = await waitFor(
        `task ${createdTask.id} deadline extension`,
        async () => {
            const refreshed = (await listTasks()).find((task) => task.id === createdTask.id);
            if (!refreshed?.deadline) return false;
            if (!originalDeadline) return refreshed;
            return new Date(refreshed.deadline).getTime() > new Date(originalDeadline).getTime() ? refreshed : false;
        },
    );
    assert(Boolean(extendedTask.deadline), "Extended task should have a deadline");
}

async function testGradingAndLocks() {
    log("Checking grading workflow, lock contention, and PDF access");

    await loginAsTeacher({
        username: assistantSeedUsername,
        password: assistantSeedPassword,
        session: assistantSeedBrowserSession,
        expectedPath: "/teacher/grading",
    });
    const assistantMe = await getTeacherMe(assistantSeedBrowserSession);
    assert(assistantMe.type === "assistant", `Expected assistant seed session, got ${assistantMe.type}`);

    const assistantPending = await listGrading("pending", assistantSeedBrowserSession);
    assert(assistantPending.length > 0, "Assistant fixture should have at least one pending submission");
    const lockTarget = assistantPending[0]!;
    state.lockSubmissionId = lockTarget.id;
    const assistantDraftCandidate = assistantPending.find((item) => item.id !== lockTarget.id) ?? null;
    state.assistantDraftCandidateId = assistantDraftCandidate?.id ?? null;
    state.assistantDraftClassName = assistantDraftCandidate?.className ?? null;

    const teacherPending = await listGrading("pending");
    const reservedPendingIds = new Set<number>([lockTarget.id]);
    if (assistantDraftCandidate) {
        reservedPendingIds.add(assistantDraftCandidate.id);
    }
    const rejectCandidate = teacherPending.find((item) => !reservedPendingIds.has(item.id)) ?? null;
    state.rejectCandidateId = rejectCandidate?.id ?? null;

    await clickByTestId("teacher-nav-grading");
    await waitForPath("/teacher/grading");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher grading page");

    await runBrowser(["fill", '[data-testid="teacher-grading-search"]', lockTarget.studentId], {}, teacherBrowserSession);
    await waitForSelector(`[data-testid="teacher-grading-card-${lockTarget.id}"]`);
    await clickByTestId(`teacher-grading-open-${lockTarget.id}`);
    await waitForPath(`/teacher/grading/${lockTarget.id}`);
    await waitForSelector('[data-testid="teacher-grading-save-draft"]');
    await snapshot("teacher grading detail locked by teacher");

    await runBrowser(["open", `${baseUrl}/teacher/grading/${lockTarget.id}`], {}, assistantSeedBrowserSession);
    await waitForPath(`/teacher/grading/${lockTarget.id}`, 15000, assistantSeedBrowserSession);
    await waitForSelector('[data-testid="teacher-grading-readonly-banner"]', assistantSeedBrowserSession);
    const readonlyState = await browserJson<boolean>(`
        return !!document.querySelector('[data-testid="teacher-grading-readonly-banner"]');
    `, assistantSeedBrowserSession);
    assert(readonlyState, "Assistant should see readonly banner for a locked submission");

    const assistantLockedSave = await browserFetch<ApiEnvelope<{ success: boolean }>>(
        `/api/teacher/grading/${lockTarget.id}`,
        {
            method: "POST",
            body: {
                scoreQuestionnaire: 60,
                scoreProcess: 60,
                scoreReport: 60,
                totalScore: 60,
                comment: `助教锁冲突测试 ${runId}`,
                status: 0,
                action: "draft",
            },
        },
        assistantSeedBrowserSession,
    );
    assert(assistantLockedSave.status === 423, `Locked grading save should return 423, got ${assistantLockedSave.status}`);
    assert(assistantLockedSave.body?.success === false, "Locked grading save should fail");
    assert(assistantLockedSave.body?.error?.code === "LOCKED", `Expected LOCKED for concurrent grading save, got ${assistantLockedSave.body?.error?.code ?? "unknown"}`);

    await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', "92"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', "88"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', "94"], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', `教师端 e2e 草稿评语 ${runId}`], {}, teacherBrowserSession);
    await clickByTestId("teacher-grading-save-draft");

    const draftDetail = await waitFor(
        `submission ${lockTarget.id} draft save`,
        async () => {
            const detail = await getSubmissionDetail(lockTarget.id);
            return detail.status === 0 && detail.teacherComment?.includes(runId) ? detail : false;
        },
    );
    assert(Number(draftDetail.scoreQuestionnaire) === 92, `Expected questionnaire score 92, got ${draftDetail.scoreQuestionnaire ?? "unknown"}`);
    assert(Number(draftDetail.scoreProcess) === 88, `Expected process score 88, got ${draftDetail.scoreProcess ?? "unknown"}`);
    assert(Number(draftDetail.scoreReport) === 94, `Expected report score 94, got ${draftDetail.scoreReport ?? "unknown"}`);

    await clickByTestId("teacher-grading-submit");
    await waitForPath("/teacher/grading");
    const gradedSubmission = await waitFor(
        `submission ${lockTarget.id} final grading`,
        async () => {
            const graded = (await listGrading("graded")).find((item) => item.id === lockTarget.id);
            return graded ?? false;
        },
    );
    assert(!Number.isNaN(Number(gradedSubmission.score)), `Final graded submission should expose total score, got ${gradedSubmission.score ?? "unknown"}`);

    await runBrowser(["open", `${baseUrl}/teacher/grading/${lockTarget.id}`], {}, teacherBrowserSession);
    await waitForPath(`/teacher/grading/${lockTarget.id}`);
    const gradedDetail = await getSubmissionDetail(lockTarget.id);
    assert(gradedDetail.status === 2, `Expected graded submission status 2, got ${gradedDetail.status}`);

    const alreadyGradedSubmit = await browserFetch<ApiEnvelope<{ success: boolean }>>(
        `/api/teacher/grading/${lockTarget.id}`,
        {
            method: "POST",
            body: {
                scoreQuestionnaire: 91,
                scoreProcess: 87,
                scoreReport: 93,
                totalScore: 90.8,
                comment: `已批改后重复提交 ${runId}`,
                status: 2,
            },
        },
    );
    assert(alreadyGradedSubmit.status === 409, `Already graded submission should return 409, got ${alreadyGradedSubmit.status}`);
    assert(alreadyGradedSubmit.body?.success === false, "Already graded submission update should fail");
    assert(alreadyGradedSubmit.body?.error?.code === "ALREADY_GRADED", `Expected ALREADY_GRADED, got ${alreadyGradedSubmit.body?.error?.code ?? "unknown"}`);

    let reportPdfSubmissionId = gradedDetail.reportPdfPath ? gradedDetail.id : null;
    let questionnairePdfSubmissionId = gradedDetail.questionnairePdfPath ? gradedDetail.id : null;
    if (!reportPdfSubmissionId || !questionnairePdfSubmissionId) {
        const gradedItems = await listGrading("graded");
        for (const item of gradedItems) {
            const detail = await getSubmissionDetail(item.id);
            if (!reportPdfSubmissionId && detail.reportPdfPath) {
                reportPdfSubmissionId = detail.id;
            }
            if (!questionnairePdfSubmissionId && detail.questionnairePdfPath) {
                questionnairePdfSubmissionId = detail.id;
            }
            if (reportPdfSubmissionId && questionnairePdfSubmissionId) {
                break;
            }
        }
    }
    assert(reportPdfSubmissionId, "Expected at least one graded submission with report PDF");
    assert(questionnairePdfSubmissionId, "Expected at least one graded submission with questionnaire PDF");

    await runBrowser(["open", `${baseUrl}/teacher/grading/${reportPdfSubmissionId}`], {}, teacherBrowserSession);
    await waitForPath(`/teacher/grading/${reportPdfSubmissionId}`);
    await ensureDownloadDir();

    const pdfMeta = await browserFetchMeta(`/api/teacher/submissions/${reportPdfSubmissionId}/pdf/report`);
    assert(pdfMeta.status === 200, `Teacher report PDF fetch should return 200, got ${pdfMeta.status}`);
    assert(pdfMeta.ok, "Teacher report PDF fetch should be successful");
    assert(pdfMeta.contentType?.includes("application/pdf"), `Teacher report PDF content-type should be application/pdf, got ${pdfMeta.contentType ?? "unknown"}`);
    assert(pdfMeta.size > 0, "Teacher report PDF blob should not be empty");

    const reportPdfPath = `${downloadDir}/teacher-report-${runId}.pdf`;
    try {
        await runBrowser(
            ["download", `a[download][href="/api/teacher/submissions/${reportPdfSubmissionId}/pdf/report"]`, reportPdfPath],
            {},
            teacherBrowserSession,
        );
        const header = await Bun.file(reportPdfPath).slice(0, 4).text();
        assert(header === "%PDF", `Downloaded report PDF should start with %PDF, got ${header}`);
    } finally {
        await cleanupFile(reportPdfPath);
    }

    await runBrowser(["open", `${baseUrl}/teacher/grading/${questionnairePdfSubmissionId}`], {}, teacherBrowserSession);
    await waitForPath(`/teacher/grading/${questionnairePdfSubmissionId}`);

    const questionnairePdfMeta = await browserFetchMeta(`/api/teacher/submissions/${questionnairePdfSubmissionId}/pdf/questionnaire`);
    assert(questionnairePdfMeta.status === 200, `Teacher questionnaire PDF fetch should return 200, got ${questionnairePdfMeta.status}`);
    assert(questionnairePdfMeta.ok, "Teacher questionnaire PDF fetch should be successful");
    assert(questionnairePdfMeta.contentType?.includes("application/pdf"), `Teacher questionnaire PDF content-type should be application/pdf, got ${questionnairePdfMeta.contentType ?? "unknown"}`);
    assert(questionnairePdfMeta.size > 0, "Teacher questionnaire PDF blob should not be empty");

    const rejectedItems = await listGrading("rejected");
    assert(rejectedItems.length > 0, "Seeded teacher data should include rejected submissions");
    const rejected = rejectedItems[0]!;
    await runBrowser(["open", `${baseUrl}/teacher/grading/${rejected.id}`], {}, teacherBrowserSession);
    await waitForPath(`/teacher/grading/${rejected.id}`);
    await waitForSelector('[data-testid="teacher-grading-reject-reason-banner"]');

    if (state.rejectCandidateId) {
        const rejectReason = `教师端 e2e 驳回原因需要补充抽样说明 ${runId}`;
        await runBrowser(["open", `${baseUrl}/teacher/grading/${state.rejectCandidateId}`], {}, teacherBrowserSession);
        await waitForPath(`/teacher/grading/${state.rejectCandidateId}`);
        await clickByTestId("teacher-grading-reject-open");
        await waitForSelector('[data-testid="teacher-grading-reject-submit"]');
        await runBrowser(["fill", '[data-testid="teacher-grading-reject-reason"]', rejectReason], {}, teacherBrowserSession);
        await clickByTestId("teacher-grading-reject-submit");
        await waitForPath("/teacher/grading");

        const newlyRejected = await waitFor(
            `submission ${state.rejectCandidateId} rejected by teacher`,
            async () => (await listGrading("rejected")).find((item) => item.id === state.rejectCandidateId) ?? false,
        );
        assert(newlyRejected.status === 3, `Expected rejected submission status 3, got ${newlyRejected.status}`);

        await runBrowser(["open", `${baseUrl}/teacher/grading/${state.rejectCandidateId}`], {}, teacherBrowserSession);
        await waitForPath(`/teacher/grading/${state.rejectCandidateId}`);
        await waitForSelector('[data-testid="teacher-grading-reject-reason-banner"]');
        const rejectBannerText = await browserJson<string>(`
            const node = document.querySelector('[data-testid="teacher-grading-reject-reason-banner"]');
            return node?.textContent?.trim() ?? "";
        `);
        assert(rejectBannerText.includes(runId), "Teacher-created reject reason should be visible in detail banner");
    } else {
        log("Skipping active teacher reject flow because no additional pending submission was available after reserving conflict coverage");
    }
}

async function testTeacherOwnershipIsolation() {
    log("Checking teacher ownership isolation and guarded detail access");

    assert(state.targetClass, "Target class should be set before isolation checks");
    assert(state.createdTopicId, "Created topic should be set before isolation checks");
    assert(state.createdTaskId, "Created task should be set before isolation checks");

    await loginAsTeacher({
        username: teacherPeerUsername,
        password: teacherPeerPassword,
        session: teacherPeerBrowserSession,
        expectedPath: "/teacher",
    });

    const peerMe = await getTeacherMe(teacherPeerBrowserSession);
    assert(peerMe.type === "teacher", `Expected peer session to be a teacher, got ${peerMe.type}`);
    assert(peerMe.employeeId === teacherPeerUsername, `Expected peer teacher ${teacherPeerUsername}, got ${peerMe.employeeId ?? "unknown"}`);

    const peerClasses = await listClasses(teacherPeerBrowserSession);
    assert(peerClasses.every((item) => item.id !== state.targetClass!.id), `Peer teacher should not see class ${state.targetClass.name}`);

    const peerTopics = await listTopics(teacherPeerBrowserSession);
    assert(peerTopics.every((item) => item.id !== state.createdTopicId!), `Peer teacher should not see topic ${state.createdTopicId}`);

    const peerTasks = await listTasks(teacherPeerBrowserSession);
    assert(peerTasks.every((item) => item.id !== state.createdTaskId!), `Peer teacher should not see task ${state.createdTaskId}`);

    const forbiddenStudents = await browserFetch<ApiEnvelope<StudentSummary[]>>(
        `/api/teacher/classes/${state.targetClass.id}/students`,
        undefined,
        teacherPeerBrowserSession,
    );
    assert(forbiddenStudents.status === 403, `Peer teacher class student list should return 403, got ${forbiddenStudents.status}`);
    assert(forbiddenStudents.body?.success === false, "Peer teacher class student list should fail");
    assert(forbiddenStudents.body?.error?.code === "FORBIDDEN", `Expected FORBIDDEN for peer class access, got ${forbiddenStudents.body?.error?.code ?? "unknown"}`);

    const hiddenTopic = await browserFetch<ApiEnvelope<TopicDetail>>(
        `/api/teacher/topics/${state.createdTopicId}/detail`,
        undefined,
        teacherPeerBrowserSession,
    );
    assert(hiddenTopic.status === 404, `Peer teacher topic detail should return 404, got ${hiddenTopic.status}`);
    assert(hiddenTopic.body?.success === false, "Peer teacher topic detail should fail");
    assert(hiddenTopic.body?.error?.code === "NOT_FOUND", `Expected NOT_FOUND for peer topic detail, got ${hiddenTopic.body?.error?.code ?? "unknown"}`);

    const hiddenTask = await browserFetch<ApiEnvelope<TaskProgressData>>(
        `/api/teacher/tasks/${state.createdTaskId}/progress`,
        undefined,
        teacherPeerBrowserSession,
    );
    assert(hiddenTask.status === 404, `Peer teacher task progress should return 404, got ${hiddenTask.status}`);
    assert(hiddenTask.body?.success === false, "Peer teacher task progress should fail");
    assert(hiddenTask.body?.error?.code === "NOT_FOUND", `Expected NOT_FOUND for peer task progress, got ${hiddenTask.body?.error?.code ?? "unknown"}`);

    if (state.lockSubmissionId) {
        const hiddenSubmission = await browserFetch<ApiEnvelope<SubmissionDetail>>(
            `/api/teacher/grading/${state.lockSubmissionId}`,
            undefined,
            teacherPeerBrowserSession,
        );
        assert(hiddenSubmission.status === 404, `Peer teacher grading detail should return 404, got ${hiddenSubmission.status}`);
        assert(hiddenSubmission.body?.success === false, "Peer teacher grading detail should fail");
        assert(hiddenSubmission.body?.error?.code === "NOT_FOUND", `Expected NOT_FOUND for peer grading detail, got ${hiddenSubmission.body?.error?.code ?? "unknown"}`);
    }

    const peerScopedExport = await getGradeExportPreview({ classId: state.targetClass.id }, teacherPeerBrowserSession);
    assert(
        peerScopedExport.every((item) => item.classId !== state.targetClass!.id),
        `Peer teacher export preview should not include class ${state.targetClass.name}`,
    );

    await logoutTeacherByApi(teacherPeerBrowserSession);
}

async function testAssistantManagement() {
    log("Checking assistant management, assistant permissions, and reset flow");

    assert(state.targetClass, "Target class should be set before assistant management test");

    await clickByTestId("teacher-nav-assistant");
    await waitForPath("/teacher/assistant");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher assistant page");

    await clickByTestId("teacher-assistant-add-open");
    await waitForSelector('[data-testid="teacher-assistant-add-submit"]');
    await runBrowser(["fill", '[data-testid="teacher-assistant-add-account"]', createdAssistantAccount], {}, teacherBrowserSession);
    await runBrowser(["fill", '[data-testid="teacher-assistant-add-name"]', createdAssistantName], {}, teacherBrowserSession);
    await clickByTestId("teacher-assistant-add-submit");

    const createdAssistant = await waitFor(
        `assistant ${createdAssistantAccount} to be created`,
        async () => (await listAssistants()).find((assistant) => assistant.studentId === createdAssistantAccount) ?? false,
    );
    state.createdAssistantId = createdAssistant.id;

    await clickByTestId(`teacher-assistant-assign-open-${createdAssistant.id}`);
    await waitForSelector('[data-testid="teacher-assistant-assign-submit"]');
    await clickByTestId(`teacher-assistant-assign-check-${state.targetClass.id}`);
    await clickByTestId("teacher-assistant-assign-submit");
    await waitFor(
        `assistant ${createdAssistantAccount} class assignment`,
        async () => {
            const refreshed = (await listAssistants()).find((assistant) => assistant.id === createdAssistant.id);
            return refreshed?.assignedClassIds.includes(state.targetClass!.id) ? refreshed : false;
        },
    );

    await clickByTestId(`teacher-assistant-toggle-${createdAssistant.id}`);
    await waitFor(
        `assistant ${createdAssistantAccount} disable`,
        async () => {
            const refreshed = (await listAssistants()).find((assistant) => assistant.id === createdAssistant.id);
            return refreshed?.status === 0 ? refreshed : false;
        },
    );
    await clickByTestId(`teacher-assistant-toggle-${createdAssistant.id}`);
    await waitFor(
        `assistant ${createdAssistantAccount} enable`,
        async () => {
            const refreshed = (await listAssistants()).find((assistant) => assistant.id === createdAssistant.id);
            return refreshed?.status === 1 ? refreshed : false;
        },
    );

    await loginAsTeacher({
        username: createdAssistantAccount,
        password: createdAssistantAccount,
        session: createdAssistantBrowserSession,
        expectedPath: "/teacher/grading",
    });
    await waitForSelector('[data-testid="teacher-password-submit"]', createdAssistantBrowserSession);
    await fillPasswordDialog(createdAssistantAccount, createdAssistantPassword, createdAssistantBrowserSession);
    await waitFor(
        "created assistant password modal to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"teacher-password-submit\"]');", createdAssistantBrowserSession);
            return open ? false : true;
        },
    );

    const createdAssistantMe = await getTeacherMe(createdAssistantBrowserSession);
    assert(createdAssistantMe.type === "assistant", `Expected created assistant session, got ${createdAssistantMe.type}`);
    assert(createdAssistantMe.account === createdAssistantAccount, `Expected assistant account ${createdAssistantAccount}, got ${createdAssistantMe.account ?? "unknown"}`);

    const assistantForbiddenClasses = await browserFetch<ApiEnvelope<TeacherClass[]>>("/api/teacher/classes", undefined, createdAssistantBrowserSession);
    assert(assistantForbiddenClasses.status === 403, `Assistant teacher-only classes API should return 403, got ${assistantForbiddenClasses.status}`);
    assert(assistantForbiddenClasses.body?.success === false, "Assistant teacher-only classes API should fail");
    assert(assistantForbiddenClasses.body.error?.code === "FORBIDDEN", `Expected FORBIDDEN, got ${assistantForbiddenClasses.body.error?.code ?? "unknown"}`);

    const assistantForbiddenExport = await browserFetch<ApiEnvelope<GradeExportPreviewItem[]>>("/api/teacher/grade-export/preview?semester=all&classId=all&topicId=all", undefined, createdAssistantBrowserSession);
    assert(assistantForbiddenExport.status === 403, `Assistant teacher-only export API should return 403, got ${assistantForbiddenExport.status}`);
    assert(assistantForbiddenExport.body?.success === false, "Assistant teacher-only export API should fail");
    assert(assistantForbiddenExport.body.error?.code === "FORBIDDEN", `Expected FORBIDDEN, got ${assistantForbiddenExport.body.error?.code ?? "unknown"}`);

    const assistantNavState = await browserJson<{
        hasDashboard: boolean;
        hasGrading: boolean;
        blockedTeacherNav: boolean;
    }>(`
        return {
            hasDashboard: !!document.querySelector('[data-testid="teacher-nav-dashboard"]'),
            hasGrading: !!document.querySelector('[data-testid="teacher-nav-grading"]'),
            blockedTeacherNav: !document.querySelector('[data-testid="teacher-nav-class"]')
                && !document.querySelector('[data-testid="teacher-nav-topic"]')
                && !document.querySelector('[data-testid="teacher-nav-task"]')
                && !document.querySelector('[data-testid="teacher-nav-assistant"]')
                && !document.querySelector('[data-testid="teacher-nav-export"]'),
        };
    `, createdAssistantBrowserSession);
    assert(assistantNavState.hasDashboard && assistantNavState.hasGrading, "Assistant should keep dashboard and grading navigation");
    assert(assistantNavState.blockedTeacherNav, "Assistant should not see teacher-only navigation");

    await runBrowser(["open", `${baseUrl}/teacher/class`], {}, createdAssistantBrowserSession);
    await waitForPath("/teacher/grading", 15000, createdAssistantBrowserSession);

    await logoutTeacher(createdAssistantBrowserSession);

    const seedAssistant = (await listAssistants()).find((assistant) => assistant.studentId === assistantSeedUsername);
    assert(seedAssistant, `Expected to find seed assistant ${assistantSeedUsername}`);

    if (state.assistantDraftCandidateId && state.assistantDraftClassName) {
        const draftClass = (await listClasses()).find((item) => item.name === state.assistantDraftClassName);
        assert(draftClass, `Expected to resolve assistant draft class ${state.assistantDraftClassName}`);
        assert(seedAssistant.assignedClassIds.includes(draftClass.id), `Seed assistant should be assigned to draft class ${draftClass.name}`);

        await runBrowser(["open", `${baseUrl}/teacher/grading/${state.assistantDraftCandidateId}`], {}, assistantSeedBrowserSession);
        await waitForPath(`/teacher/grading/${state.assistantDraftCandidateId}`, 15000, assistantSeedBrowserSession);
        await waitForSelector('[data-testid="teacher-grading-save-draft"]', assistantSeedBrowserSession);
        await runBrowser(["fill", '[data-testid="teacher-grading-score-questionnaire"]', "75"], {}, assistantSeedBrowserSession);
        await runBrowser(["fill", '[data-testid="teacher-grading-score-process"]', "78"], {}, assistantSeedBrowserSession);
        await runBrowser(["fill", '[data-testid="teacher-grading-score-report"]', "80"], {}, assistantSeedBrowserSession);
        await runBrowser(["fill", '[data-testid="teacher-grading-comment"]', `助教草稿待教师复核 ${runId}`], {}, assistantSeedBrowserSession);
        await clickByTestId("teacher-grading-save-draft", assistantSeedBrowserSession);

        const assistantDraftSaved = await waitFor(
            `assistant draft submission ${state.assistantDraftCandidateId}`,
            async () => {
                const detail = await getSubmissionDetail(state.assistantDraftCandidateId!, assistantSeedBrowserSession);
                return detail.status === 0 && detail.teacherComment?.includes(runId) ? detail : false;
            },
        );
        assert(Number(assistantDraftSaved.scoreQuestionnaire) === 75, `Expected assistant draft questionnaire score 75, got ${assistantDraftSaved.scoreQuestionnaire ?? "unknown"}`);

        await runBrowser(["open", `${baseUrl}/teacher/assistant`], {}, teacherBrowserSession);
        await waitForPath("/teacher/assistant");
        await waitForSelector(`[data-testid="teacher-assistant-assign-open-${seedAssistant.id}"]`);
        await clickByTestId(`teacher-assistant-assign-open-${seedAssistant.id}`);
        await waitForSelector('[data-testid="teacher-assistant-assign-submit"]');

        const assignedBeforeUnbind = await browserJson<boolean>(`
            const input = document.querySelector('[data-testid="teacher-assistant-assign-check-${draftClass.id}"]');
            return input instanceof HTMLInputElement && input.checked;
        `);
        assert(assignedBeforeUnbind, `Expected draft class ${draftClass.name} to be checked before unbind`);

        const unbindConflict = await browserFetch<ApiEnvelope<{ success: boolean }>>(
            `/api/teacher/assistants/${seedAssistant.id}/classes`,
            {
                method: "POST",
                body: {
                    classIds: seedAssistant.assignedClassIds.filter((id) => id !== draftClass.id),
                },
            },
        );
        assert(unbindConflict.status === 409, `Assistant class unbind with drafts should return 409, got ${unbindConflict.status}`);
        assert(unbindConflict.body?.success === false, "Assistant class unbind with drafts should fail");
        assert(unbindConflict.body?.error?.code === "HAS_DRAFTS", `Expected HAS_DRAFTS before force unbind, got ${unbindConflict.body?.error?.code ?? "unknown"}`);

        await clickByTestId(`teacher-assistant-assign-check-${draftClass.id}`);
        await clickByTestId("teacher-assistant-assign-submit");
        await waitForSelector('[data-testid="teacher-assistant-force-unbind-submit"]');
        await clickByTestId("teacher-assistant-force-unbind-submit");

        const seedAssistantAfterUnbind = await waitFor(
            `seed assistant ${assistantSeedUsername} forced unbind`,
            async () => {
                const refreshed = (await listAssistants()).find((assistant) => assistant.id === seedAssistant.id);
                return refreshed && !refreshed.assignedClassIds.includes(draftClass.id) ? refreshed : false;
            },
        );
        assert(!seedAssistantAfterUnbind.assignedClassIds.includes(draftClass.id), `Expected draft class ${draftClass.name} to be removed after force unbind`);
    } else {
        log("Skipping assistant force-unbind conflict because no additional assistant pending submission was available");
    }

    await clickByTestId(`teacher-assistant-reset-${createdAssistant.id}`);
    await loginAsTeacher({
        username: createdAssistantAccount,
        password: createdAssistantAccount,
        session: createdAssistantBrowserSession,
        expectedPath: "/teacher/grading",
    });
    const resetMe = await getTeacherMe(createdAssistantBrowserSession);
    assert(resetMe.isFirstLogin === 1, "Reset assistant should be forced to change password");
    await fillPasswordDialog(createdAssistantAccount, createdAssistantResetPassword, createdAssistantBrowserSession);
    await waitFor(
        "reset assistant password modal to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"teacher-password-submit\"]');", createdAssistantBrowserSession);
            return open ? false : true;
        },
    );
    await logoutTeacher(createdAssistantBrowserSession);

    await clickByTestId(`teacher-assistant-delete-${createdAssistant.id}`);
    await clickButtonByText("确认移除");
    await waitFor(
        `assistant ${createdAssistantAccount} deletion`,
        async () => (await listAssistants()).some((assistant) => assistant.id === createdAssistant.id) ? false : true,
    );
}

async function testGradeExport() {
    log("Checking grade export filters and downloads");

    await clickByTestId("teacher-nav-export");
    await waitForPath("/teacher/export");
    await runBrowser(["wait", "500"]);
    await snapshot("teacher export page");

    const preview = await getGradeExportPreview({ semester: "all", classId: "all", topicId: "all" });
    assert(preview.length > 0, "Teacher export preview should contain at least one task");

    const exportTask = preview.find((item) => item.total > 0 && item.graded > 0) ?? preview.find((item) => item.total > 0) ?? preview[0]!;
    state.exportTask = exportTask;

    const classes = await listClasses();
    const exportClass = classes.find((item) => item.id === exportTask.classId) ?? null;
    if (exportClass?.semester) {
        await selectOptionByText('[data-testid="teacher-export-semester-filter"]', exportClass.semester);
    }
    await selectOptionByText('[data-testid="teacher-export-class-filter"]', exportTask.className);
    await selectOptionByText('[data-testid="teacher-export-topic-filter"]', exportTask.topic);
    await waitForSelector(`[data-testid="teacher-export-row-${exportTask.taskId}"]`);

    const exportData = await getGradeExportData({
        semester: exportClass?.semester ?? "all",
        classId: exportTask.classId,
        topicId: exportTask.topicId,
        taskId: exportTask.taskId,
    });
    assert(exportData.length > 0, `Teacher export data for task ${exportTask.taskId} should not be empty`);

    await ensureDownloadDir();
    const singlePath = `${downloadDir}/teacher-export-single-${runId}.xlsx`;
    const batchPath = `${downloadDir}/teacher-export-batch-${runId}.xlsx`;

    try {
        await runBrowser(["download", `[data-testid="teacher-export-single-${exportTask.taskId}"]`, singlePath], {}, teacherBrowserSession);
        const singleRows = await readWorkbookRows(singlePath);
        assert(singleRows.length >= exportData.length, `Single export should contain at least ${exportData.length} rows, got ${singleRows.length}`);
        assert(
            singleRows.some((row) => row["班级"] === exportTask.className && row["课题名称"] === exportTask.topic),
            "Single export workbook should include the selected class/topic rows",
        );

        await clickByTestId(`teacher-export-check-${exportTask.taskId}`);
        await runBrowser(["download", '[data-testid="teacher-export-batch"]', batchPath], {}, teacherBrowserSession);
        const batchRows = await readWorkbookRows(batchPath);
        assert(batchRows.length > 0, "Batch export workbook should contain data rows");
    } finally {
        await cleanupFile(singlePath);
        await cleanupFile(batchPath);
    }
}

async function testTeacherChangePasswordAndSessionKick() {
    log("Checking teacher change-password flow and single-session kick");

    await runBrowser(["open", `${baseUrl}/teacher`], {}, teacherBrowserSession);
    await waitForPath("/teacher");
    await clickByTestId("teacher-change-password-open");
    await waitForSelector('[data-testid="teacher-password-submit"]');
    await fillPasswordDialog(currentTeacherPassword, teacherChangedPassword);

    await waitFor(
        "teacher password modal to close",
        async () => {
            const open = await browserJson<boolean>("return !!document.querySelector('[data-testid=\"teacher-password-submit\"]');");
            return open ? false : true;
        },
    );

    currentTeacherPassword = teacherChangedPassword;
    const meAfterPasswordChange = await getTeacherMe();
    assert(meAfterPasswordChange.employeeId === teacherUsername, "Teacher should remain logged in after password change");

    await logoutTeacher();

    const oldPasswordLogin = await browserFetch<ApiEnvelope<{ user: TeacherUser; expiresAt: string }>>(
        "/api/teacher/login",
        {
            method: "POST",
            body: {
                employeeId: teacherUsername,
                password: teacherPassword,
            },
        },
    );
    assert(oldPasswordLogin.status === 401, `Old teacher password should return 401, got ${oldPasswordLogin.status}`);
    assert(oldPasswordLogin.body?.success === false, "Old teacher password login should fail");

    await loginAsTeacher({
        username: teacherUsername,
        password: currentTeacherPassword,
        session: teacherBrowserSession,
        expectedPath: "/teacher",
    });

    await loginAsTeacher({
        username: teacherUsername,
        password: currentTeacherPassword,
        session: teacherKickBrowserSession,
        expectedPath: "/teacher",
    });

    const kickedMe = await browserFetch<ApiEnvelope<TeacherUser>>("/api/teacher/me", undefined, teacherBrowserSession);
    assert(kickedMe.status === 401, `Kicked teacher session should return 401, got ${kickedMe.status}`);
    assert(kickedMe.body?.success === false, "Kicked teacher session should fail");
    assert(kickedMe.body.error?.code === "AUTH_005", `Expected AUTH_005 after session kick, got ${kickedMe.body.error?.code ?? "unknown"}`);

    await runBrowser(["open", `${baseUrl}/teacher/task`], {}, teacherBrowserSession);
    await waitForPath("/teacher/login");
    await snapshot("teacher kicked to login");
}

async function main() {
    log(
        `Using browser sessions ${teacherBrowserSession} / ${teacherKickBrowserSession} / ${teacherFirstLoginBrowserSession} / ${teacherPeerBrowserSession} / ${assistantSeedBrowserSession} / ${createdAssistantBrowserSession} / ${studentBrowserSession}`,
    );
    await ensureTooling();

    try {
        await resetDatabase();
        await startServer();
        await testTeacherLoginEdgeCases();
        await testTeacherDashboard();
        await testTeacherNotifications();
        await testClassAndStudentManagement();
        await testTopicManagement();
        await testTaskManagement();
        await testGradingAndLocks();
        await testTeacherOwnershipIsolation();
        await testAssistantManagement();
        await testGradeExport();
        await testTeacherChangePasswordAndSessionKick();
        log("Teacher smoke e2e passed");
    } finally {
        await closeBrowser(teacherBrowserSession);
        await closeBrowser(teacherKickBrowserSession);
        await closeBrowser(teacherFirstLoginBrowserSession);
        await closeBrowser(teacherPeerBrowserSession);
        await closeBrowser(assistantSeedBrowserSession);
        await closeBrowser(createdAssistantBrowserSession);
        await closeBrowser(studentBrowserSession);
        await stopServer();
        await reseedDatabase();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[teacher-e2e] FAILED: ${message}`);
    process.exitCode = 1;
});
