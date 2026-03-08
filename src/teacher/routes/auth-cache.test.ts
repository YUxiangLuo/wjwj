import { expect, mock, test } from "bun:test";
import { userSession } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function loadTeacherAuthModule(options: {
    select?: unknown[];
    update?: unknown[];
    config?: Record<string, number>;
} = {}) {
    const { db, operations } = createMockDb(options);
    const config = options.config ?? {};

    mock.module("../../db", () => ({ db }));
    mock.module("../../server/system-config", () => ({
        getConfigNumber: async (key: string, fallback: number) => config[key] ?? fallback,
    }));

    const module = await import(`./auth?teacher-auth-cache-test=${Math.random()}`);
    return { module, operations };
}

test("teacher auth cache avoids duplicate DB work across layered teacher auth helpers", async () => {
    const { module, operations } = await loadTeacherAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "teacher-session",
                userType: 2,
                userId: 11,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 11,
                employeeId: "T001",
                name: "教师甲",
                isFirstLogin: 0,
                status: 1,
            }],
        ],
        config: {
            "session.teacher_timeout_minutes": 120,
        },
    });

    const request = new Request("https://example.com/api/teacher/topics", {
        headers: { cookie: "teacher_session=teacher-session" },
    });
    const firstAuth = await module.requireTeacherAuth(request);
    const secondAuth = await module.requirePrimaryTeacher(request);

    expect(firstAuth.error).toBeNull();
    expect(firstAuth.user).toMatchObject({ id: 11, type: "teacher" });
    expect(secondAuth).toEqual({ teacherId: 11, error: null });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(1);
});

test("withPrimaryTeacherAuth injects teacher auth context for wrapped handlers", async () => {
    const { module, operations } = await loadTeacherAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "teacher-session",
                userType: 2,
                userId: 11,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 11,
                employeeId: "T001",
                name: "教师甲",
                isFirstLogin: 0,
                status: 1,
            }],
        ],
        config: {
            "session.teacher_timeout_minutes": 120,
        },
    });

    const routes = module.withPrimaryTeacherAuth({
        async GET(req: Request) {
            const auth = module.getTeacherAuth(req);
            return Response.json({
                teacherId: module.getPrimaryTeacherIdOrThrow(req),
                userId: auth.user?.id,
                sessionExpiresAt: auth.session?.expiresAt ?? null,
            });
        },
    });

    const request = new Request("https://example.com/api/teacher/topics", {
        headers: { cookie: "teacher_session=teacher-session" },
    });
    const response = await routes.GET!(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ teacherId: 11, userId: 11 });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(1);
});

test("lockout duration formatter uses readable minute hour and day units", async () => {
    const { module } = await loadTeacherAuthModule();

    expect(module.formatLockoutRetryDuration(5)).toBe("5分钟");
    expect(module.formatLockoutRetryDuration(61)).toBe("1小时1分钟");
    expect(module.formatLockoutRetryDuration(120)).toBe("2小时");
    expect(module.formatLockoutRetryDuration(1839)).toBe("1天7小时");
});

test("requireTeacherAuth returns a kicked-offline error when the session token no longer exists", async () => {
    const { module } = await loadTeacherAuthModule();

    const request = new Request("https://example.com/api/teacher/me", {
        headers: { cookie: "teacher_session=missing-session-token" },
    });
    const auth = await module.requireTeacherAuth(request);
    const payload = await auth.error?.json() as any;

    expect(auth.user).toBeNull();
    expect(payload).toEqual({
        success: false,
        error: {
            code: "AUTH_005",
            message: "您的账号已在其他设备登录",
        },
    });
});

test("requireTeacherAuth clears disabled teacher sessions", async () => {
    const { module, operations } = await loadTeacherAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "teacher-session",
                userType: 2,
                userId: 11,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 11,
                employeeId: "T001",
                name: "教师甲",
                isFirstLogin: 0,
                status: 0,
            }],
        ],
    });

    const request = new Request("https://example.com/api/teacher/me", {
        headers: { cookie: "teacher_session=teacher-session" },
    });
    const auth = await module.requireTeacherAuth(request);
    const payload = await auth.error?.json() as any;

    expect(auth.user).toBeNull();
    expect(payload).toEqual({
        success: false,
        error: {
            code: "ACCOUNT_DISABLED",
            message: "账号已停用，请联系管理员",
        },
    });
    expect(operations.find((operation) => operation.kind === "delete" && operation.table === userSession)).toBeDefined();
});

test("requireTeacherAuth clears disabled assistant sessions", async () => {
    const { module, operations } = await loadTeacherAuthModule({
        select: [
            [],
            [{
                id: 6,
                sessionToken: "assistant-session",
                userType: 3,
                userId: 21,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 21,
                account: "A900",
                name: "助教浏览器",
                isFirstLogin: 0,
                creatorTeacherId: 11,
                status: 0,
            }],
        ],
    });

    const request = new Request("https://example.com/api/teacher/me", {
        headers: { cookie: "teacher_session=assistant-session" },
    });
    const auth = await module.requireTeacherAuth(request);
    const payload = await auth.error?.json() as any;

    expect(auth.user).toBeNull();
    expect(payload).toEqual({
        success: false,
        error: {
            code: "ACCOUNT_DISABLED",
            message: "账号已被停用，请联系教师",
        },
    });
    expect(operations.find((operation) => operation.kind === "delete" && operation.table === userSession)).toBeDefined();
});

test("requireTeacherAuth blocks teacher protected access before first password change", async () => {
    const { module } = await loadTeacherAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "teacher-session",
                userType: 2,
                userId: 11,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 11,
                employeeId: "T001",
                name: "教师甲",
                isFirstLogin: 1,
                status: 1,
            }],
        ],
        config: {
            "session.teacher_timeout_minutes": 120,
        },
    });

    const request = new Request("https://example.com/api/teacher/topics", {
        headers: { cookie: "teacher_session=teacher-session" },
    });
    const auth = await module.requireTeacherAuth(request);
    const payload = await auth.error?.json() as any;

    expect(auth.user).toBeNull();
    expect(payload).toEqual({
        success: false,
        error: {
            code: "PASSWORD_CHANGE_REQUIRED",
            message: "首次登录请先修改密码",
        },
    });
});

test("requireTeacherAuth allows first-login bootstrap when explicitly requested", async () => {
    const { module } = await loadTeacherAuthModule({
        select: [
            [{
                id: 5,
                sessionToken: "teacher-session",
                userType: 2,
                userId: 11,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 11,
                employeeId: "T001",
                name: "教师甲",
                isFirstLogin: 1,
                status: 1,
            }],
        ],
        config: {
            "session.teacher_timeout_minutes": 120,
        },
    });

    const request = new Request("https://example.com/api/teacher/me", {
        headers: { cookie: "teacher_session=teacher-session" },
    });
    const auth = await module.requireTeacherAuth(request, { allowFirstLogin: true });

    expect(auth.error).toBeNull();
    expect(auth.user).toMatchObject({ employeeId: "T001", isFirstLogin: 1, type: "teacher" });
});

test("requireTeacherAuth blocks assistant protected access before first password change", async () => {
    const { module } = await loadTeacherAuthModule({
        select: [
            [],
            [{
                id: 6,
                sessionToken: "assistant-session",
                userType: 3,
                userId: 21,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 21,
                account: "A001",
                name: "助教甲",
                isFirstLogin: 1,
                creatorTeacherId: 11,
                status: 1,
            }],
        ],
        config: {
            "session.teacher_timeout_minutes": 120,
        },
    });

    const request = new Request("https://example.com/api/teacher/grading", {
        headers: { cookie: "teacher_session=assistant-session" },
    });
    const auth = await module.requireTeacherAuth(request);
    const payload = await auth.error?.json() as any;

    expect(auth.user).toBeNull();
    expect(payload).toEqual({
        success: false,
        error: {
            code: "PASSWORD_CHANGE_REQUIRED",
            message: "首次登录请先修改密码",
        },
    });
});
