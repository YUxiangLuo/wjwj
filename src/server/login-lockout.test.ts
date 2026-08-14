import { expect, test } from "bun:test";
import { failedLoginMessage, nextFailedLoginState } from "./login-lockout";

test("login failure messages never expose remaining attempts or lock state", () => {
    const ordinaryFailure = nextFailedLoginState({ loginFailCount: 1 });
    const thresholdFailure = nextFailedLoginState({ loginFailCount: 4 });

    expect(failedLoginMessage(ordinaryFailure)).toBe("账号或密码错误");
    expect(failedLoginMessage(thresholdFailure)).toBe("账号或密码错误");
    expect(failedLoginMessage(thresholdFailure, "工号或密码错误")).toBe("工号或密码错误");
});
