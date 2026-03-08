import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

type ConfigValues = Record<string, number>;

function createJsonRequest(url: string, method: string, body?: unknown, headers?: HeadersInit) {
    return new Request(url, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function loadStudentAuthModule(options: {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
    config?: ConfigValues;
} = {}) {
    const { db, operations } = createMockDb(options);
    const config = options.config ?? {};

    mock.module("../../db", () => ({ db }));
    mock.module("../../server/system-config", () => ({
        getConfigNumber: async (key: string, fallback: number) => config[key] ?? fallback,
    }));

    const module = await import("./auth");
    return { module, operations };
}

test("student login succeeds and creates a single-device session", async () => {
    const password = "Student@2026";
    const hashed = await Bun.password.hash(password);
    const { module, operations } = await loadStudentAuthModule({
        select: [[{
            id: 11,
            studentId: "20230001",
            name: "Alice",
            classId: 7,
            status: 1,
            isFirstLogin: 1,
            password: hashed,
            loginFailCount: 0,
            lockedUntil: null,
        }]],
        config: {
            "session.student_timeout_minutes": 60,
        },
    });

    const response = await module.loginRoutes.POST!(createJsonRequest(
        "https://example.com/api/student/login",
        "POST",
        { studentId: "20230001", password },
        { "user-agent": "bun-test" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.user).toMatchObject({
        id: 11,
        studentId: "20230001",
        name: "Alice",
        classId: 7,
        isFirstLogin: 1,
    });
    expect(response.headers.get("Set-Cookie")).toContain("student_session=");

    const resetLoginState = operations.find((operation) => operation.kind === "update");
    expect(resetLoginState?.set).toEqual({ loginFailCount: 0, lockedUntil: null });

    const sessionInsert = operations.find((operation) => operation.kind === "insert" && (operation.values as any)?.sessionToken);
    expect(sessionInsert?.values).toMatchObject({
        userType: 4,
        userId: 11,
        deviceInfo: "bun-test",
    });

    const loginLogInsert = operations.find((operation) => operation.kind === "insert" && (operation.values as any)?.userAgent);
    expect(loginLogInsert?.values).toMatchObject({
        userType: 4,
        userId: 11,
        userAgent: "bun-test",
    });
});

test("student login with wrong password increments fail count and returns 401", async () => {
    const hashed = await Bun.password.hash("Student@2026");
    const { module, operations } = await loadStudentAuthModule({
        select: [[{
            id: 11,
            studentId: "20230001",
            name: "Alice",
            classId: 7,
            status: 1,
            isFirstLogin: 1,
            password: hashed,
            loginFailCount: 0,
            lockedUntil: null,
        }]],
    });

    const response = await module.loginRoutes.POST!(createJsonRequest(
        "https://example.com/api/student/login",
        "POST",
        { studentId: "20230001", password: "wrong-password" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "账号或密码错误，还剩4次尝试机会",
    });

    const failUpdate = operations.find((operation) => operation.kind === "update");
    expect(failUpdate?.set).toMatchObject({ loginFailCount: 1 });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});

test("student login returns a readable lockout duration when account is already locked", async () => {
    const hashed = await Bun.password.hash("Student@2026");
    const { module } = await loadStudentAuthModule({
        select: [[{
            id: 11,
            studentId: "20230001",
            name: "Alice",
            classId: 7,
            status: 1,
            isFirstLogin: 0,
            password: hashed,
            loginFailCount: 5,
            lockedUntil: new Date(Date.now() + 1_839 * 60 * 1000),
        }]],
    });

    const response = await module.loginRoutes.POST!(createJsonRequest(
        "https://example.com/api/student/login",
        "POST",
        { studentId: "20230001", password: "Student@2026" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(403);
    expect(payload.error).toMatchObject({
        code: "ACCOUNT_LOCKED",
        message: "账号已被锁定，请在1天7小时后重试",
    });
});

test("deleted student login returns account disabled after password verification", async () => {
    const password = "Student@2026";
    const hashed = await Bun.password.hash(password);
    const { module, operations } = await loadStudentAuthModule({
        select: [[{
            id: 11,
            studentId: "20230001",
            name: "Alice",
            classId: 7,
            status: 1,
            isFirstLogin: 0,
            deletedAt: new Date("2026-03-08T00:00:00.000Z"),
            password: hashed,
            loginFailCount: 0,
            lockedUntil: null,
        }]],
    });

    const response = await module.loginRoutes.POST!(createJsonRequest(
        "https://example.com/api/student/login",
        "POST",
        { studentId: "20230001", password }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(403);
    expect(payload.error).toMatchObject({
        code: "ACCOUNT_DISABLED",
        message: "账号已被停用，请联系教师",
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});

test("student me route returns profile and extends session expiry", async () => {
    const now = Date.now();
    const { module, operations } = await loadStudentAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "session-token",
                userType: 4,
                userId: 11,
                expiresAt: new Date(now + 60_000),
            }],
            [{
                id: 11,
                studentId: "20230001",
                name: "Alice",
                classId: 7,
                status: 1,
                isFirstLogin: 0,
            }],
            [{ className: "统计1班" }],
        ],
        config: {
            "session.student_timeout_minutes": 30,
        },
    });

    const response = await module.meRoutes.GET!(createJsonRequest(
        "https://example.com/api/student/me",
        "GET",
        undefined,
        { cookie: "student_session=session-token" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        id: 11,
        studentId: "20230001",
        name: "Alice",
        classId: 7,
        className: "统计1班",
        isFirstLogin: 0,
    });
    expect(payload.data.sessionExpiresAt).toBeString();

    const sessionUpdate = operations.find((operation) => operation.kind === "update");
    expect(sessionUpdate?.set).toMatchObject({
        lastActiveAt: expect.any(Date),
        expiresAt: expect.any(Date),
    });
});

test("student session route without token returns auth expired error", async () => {
    const { module } = await loadStudentAuthModule();
    const response = await module.sessionRoutes.GET!(createJsonRequest(
        "https://example.com/api/student/session",
        "GET"
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "AUTH_004",
            message: "会话已过期，请重新登录",
        },
    });
});

test("student logout clears cookie and removes current session", async () => {
    const { module, operations } = await loadStudentAuthModule();
    const response = await module.logoutRoutes.POST!(createJsonRequest(
        "https://example.com/api/student/logout",
        "POST",
        undefined,
        { cookie: "student_session=session-token" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(response.headers.get("Set-Cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(operations.find((operation) => operation.kind === "delete")).toBeDefined();
});
