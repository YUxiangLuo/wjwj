import { afterEach, expect, mock, test } from "bun:test";
import { authApi, shouldDispatchStudentSessionExpired, tasksApi } from "./api-client";

const originalFetch = globalThis.fetch;
type WindowDispatchStub = Pick<Window, "dispatchEvent">;
const globalWithWindow = globalThis as unknown as { window?: WindowDispatchStub };
const originalWindow = globalWithWindow.window;

function installWindowMock() {
    const dispatchEvent = mock((event: Event) => true);
    globalWithWindow.window = { dispatchEvent };
    return dispatchEvent;
}

function installJsonFetchMock(body: unknown, status: number) {
    globalThis.fetch = mock(async () =>
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    ) as unknown as typeof fetch;
}

afterEach(() => {
    globalThis.fetch = originalFetch;
    globalWithWindow.window = originalWindow;
});

test("student invalid credential 401 responses do not trigger session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "当前密码不正确",
        },
    }, 401);

    const response = await authApi.changePassword({
        currentPassword: "wrong-pass",
        newPassword: "Student#2468Pass",
    });

    expect(response.error?.code).toBe("INVALID_CREDENTIALS");
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("student unauthorized responses trigger session-expired event", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "AUTH_004",
            message: "会话已过期，请重新登录",
        },
    }, 401);

    const response = await tasksApi.list();

    expect(response.error?.code).toBe("AUTH_004");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: "student:session-expired" });
});

test("student login endpoint 401 responses never trigger session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "账号或密码错误",
        },
    }, 401);

    const response = await authApi.login({
        studentId: "2024001",
        password: "wrong-pass",
    });

    expect(response.error?.code).toBe("INVALID_CREDENTIALS");
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("student session-expired helper only matches real auth expiry responses", () => {
    expect(shouldDispatchStudentSessionExpired("/api/student/password", 401, {
        error: { code: "INVALID_CREDENTIALS", message: "当前密码不正确" },
    })).toBe(false);

    expect(shouldDispatchStudentSessionExpired("/api/student/tasks", 401, {
        error: { code: "AUTH_004", message: "会话已过期，请重新登录" },
    })).toBe(true);

    expect(shouldDispatchStudentSessionExpired("/api/student/tasks", 401, {
        error: { code: "AUTH_005", message: "您的账号已在其他设备登录" },
    })).toBe(true);

    expect(shouldDispatchStudentSessionExpired("/api/student/login", 401, {
        error: { code: "AUTH_005", message: "您的账号已在其他设备登录" },
    })).toBe(false);
});
