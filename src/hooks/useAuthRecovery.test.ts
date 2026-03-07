import { expect, test } from "bun:test";
import {
    clearLoginSuccess,
    consumeLoginRedirectReason,
    consumeLoginSuccess,
    hasLoginSuccess,
    markLoginSuccess,
    setLoginRedirectReason,
} from "./useAuthRecovery";

function createStorage() {
    const state = new Map<string, string>();

    return {
        getItem(key: string) {
            return state.has(key) ? state.get(key)! : null;
        },
        setItem(key: string, value: string) {
            state.set(key, value);
        },
        removeItem(key: string) {
            state.delete(key);
        },
    };
}

test("consumeLoginSuccess returns true once and clears the login flag", () => {
    const storage = createStorage();

    markLoginSuccess("admin_login_success", storage);

    expect(hasLoginSuccess("admin_login_success", storage)).toBe(true);
    expect(consumeLoginSuccess("admin_login_success", storage)).toBe(true);
    expect(hasLoginSuccess("admin_login_success", storage)).toBe(false);
    expect(consumeLoginSuccess("admin_login_success", storage)).toBe(false);
});

test("clearLoginSuccess removes the login flag before recovery", () => {
    const storage = createStorage();

    markLoginSuccess("teacher_login_success", storage);
    clearLoginSuccess("teacher_login_success", storage);

    expect(consumeLoginSuccess("teacher_login_success", storage)).toBe(false);
});

test("consumeLoginRedirectReason returns the message once and clears it", () => {
    const storage = createStorage();

    setLoginRedirectReason("student_login_redirect_reason", "会话已过期，请重新登录", storage);

    expect(consumeLoginRedirectReason("student_login_redirect_reason", storage)).toBe("会话已过期，请重新登录");
    expect(consumeLoginRedirectReason("student_login_redirect_reason", storage)).toBeNull();
});