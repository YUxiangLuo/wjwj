import { expect, test } from "bun:test";
import { installDomGlobals } from "../test-utils/dom";
import { AUTH_EXPIRED_EVENT, notifyAuthExpired, notifyAuthExpiredFromResponse } from "./auth-expired";

test("only an authentication-expiry 401 emits the shared event", () => {
    const dom = installDomGlobals();
    try {
        let calls = 0;
        window.addEventListener(AUTH_EXPIRED_EVENT, () => calls++);
        notifyAuthExpired({ status: 401 }, "INVALID_CREDENTIALS");
        notifyAuthExpired({ status: 403 }, "UNAUTHORIZED");
        notifyAuthExpired({ status: 401 }, "UNAUTHORIZED");
        expect(calls).toBe(1);
    } finally {
        dom.restore();
    }
});

test("binary responses parse a cloned 401 body before expiring authentication", async () => {
    const dom = installDomGlobals();
    try {
        let calls = 0;
        window.addEventListener(AUTH_EXPIRED_EVENT, () => calls++);
        const response = Response.json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "登录已过期" },
        }, { status: 401 });

        await notifyAuthExpiredFromResponse(response);

        expect(calls).toBe(1);
        expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    } finally {
        dom.restore();
    }
});
