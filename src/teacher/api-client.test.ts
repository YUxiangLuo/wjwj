import { afterEach, expect, mock, test } from "bun:test";
import { authApi, shouldDispatchTeacherSessionExpired, teacherApi } from "./api-client";

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

test("invalid credential 401 responses do not trigger teacher session-expired", async () => {
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
        newPassword: "Teacher#2468Pass",
    });

    expect(response.error?.code).toBe("INVALID_CREDENTIALS");
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("teacher unauthorized responses trigger session-expired event", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "AUTH_005",
            message: "您的账号已在其他设备登录",
        },
    }, 401);

    const response = await teacherApi.getNotifications();

    expect(response.error?.code).toBe("AUTH_005");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: "teacher:session-expired" });
});

test("teacher login endpoint 401 responses never trigger session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "工号或密码错误",
        },
    }, 401);

    const response = await authApi.login({
        employeeId: "teacher",
        password: "wrong-pass",
    });

    expect(response.error?.code).toBe("INVALID_CREDENTIALS");
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("teacher session-expired helper only matches real auth expiry responses", () => {
    expect(shouldDispatchTeacherSessionExpired("/api/teacher/password", 401, {
        error: { code: "INVALID_CREDENTIALS", message: "当前密码不正确" },
    })).toBe(false);

    expect(shouldDispatchTeacherSessionExpired("/api/teacher/notifications", 401, {
        error: { code: "AUTH_004", message: "会话已过期，请重新登录" },
    })).toBe(true);

    expect(shouldDispatchTeacherSessionExpired("/api/teacher/notifications", 401, {
        error: { code: "AUTH_005", message: "您的账号已在其他设备登录" },
    })).toBe(true);

    expect(shouldDispatchTeacherSessionExpired("/api/teacher/login", 401, {
        error: { code: "AUTH_005", message: "您的账号已在其他设备登录" },
    })).toBe(false);
});
