import { expect, test } from "bun:test";
import { authApi as adminAuthApi } from "../admin/api-client";
import { authApi as studentAuthApi, meApi } from "../student/api-client";
import { authApi as teacherAuthApi } from "../teacher/api-client";
import { installDomGlobals } from "../test-utils/dom";
import { AUTH_EXPIRED_EVENT } from "./auth-expired";

test("all API clients parse the error code before expiring authentication", async () => {
    const dom = installDomGlobals();
    const originalFetch = globalThis.fetch;
    try {
        let events = 0;
        window.addEventListener(AUTH_EXPIRED_EVENT, () => events++);
        globalThis.fetch = (async () => new Response(JSON.stringify({
            success: false,
            error: { code: "INVALID_CREDENTIALS", message: "当前密码不正确" },
        }), { status: 401, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

        await Promise.all([
            adminAuthApi.changePassword({ currentPassword: "wrong", newPassword: "NewPassword123!" }),
            teacherAuthApi.changePassword({ currentPassword: "wrong", newPassword: "NewPassword123!" }),
            studentAuthApi.changePassword({ currentPassword: "wrong", newPassword: "NewPassword123!" }),
        ]);
        expect(events).toBe(0);

        globalThis.fetch = (async () => new Response(JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: "登录已过期" },
        }), { status: 401, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
        await meApi.get();
        expect(events).toBe(1);
    } finally {
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});
