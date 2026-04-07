import { afterEach, expect, mock, test } from "bun:test";
import { authApi, shouldDispatchAdminSessionExpired, systemApi } from "./api-client";

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

test("invalid credential 401 responses do not trigger admin session-expired", async () => {
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
        newPassword: "Root#2468Pass",
    });

    expect(response).toEqual({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "当前密码不正确",
        },
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("unauthorized 401 responses still trigger admin session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "UNAUTHORIZED",
            message: "未登录或登录已过期",
        },
    }, 401);

    const response = await systemApi.getNotifications();

    expect(response).toEqual({
        success: false,
        error: {
            code: "UNAUTHORIZED",
            message: "未登录或登录已过期",
        },
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: "admin:session-expired" });
});

test("account-not-found 401 responses still trigger admin session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "ACCOUNT_NOT_FOUND",
            message: "账户不存在",
        },
    }, 401);

    const response = await systemApi.getNotifications();

    expect(response).toEqual({
        success: false,
        error: {
            code: "ACCOUNT_NOT_FOUND",
            message: "账户不存在",
        },
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: "admin:session-expired" });
});

test("login endpoint 401 responses never trigger admin session-expired", async () => {
    const dispatchEvent = installWindowMock();
    installJsonFetchMock({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "用户名或密码错误",
        },
    }, 401);

    const response = await authApi.login({
        username: "admin",
        password: "wrong-pass",
    });

    expect(response).toEqual({
        success: false,
        error: {
            code: "INVALID_CREDENTIALS",
            message: "用户名或密码错误",
        },
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
});

test("session-expired helper only matches real auth expiry responses", () => {
    expect(shouldDispatchAdminSessionExpired("/api/admin/password", 401, {
        error: { code: "INVALID_CREDENTIALS", message: "当前密码不正确" },
    })).toBe(false);

    expect(shouldDispatchAdminSessionExpired("/api/admin/settings", 401, {
        error: { code: "ACCOUNT_NOT_FOUND", message: "账户不存在" },
    })).toBe(true);

    expect(shouldDispatchAdminSessionExpired("/api/admin/settings", 401, {
        error: { code: "UNAUTHORIZED", message: "未登录或登录已过期" },
    })).toBe(true);

    expect(shouldDispatchAdminSessionExpired("/api/admin/login", 401, {
        error: { code: "UNAUTHORIZED", message: "未登录或登录已过期" },
    })).toBe(false);
});
