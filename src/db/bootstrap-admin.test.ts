import { expect, test } from "bun:test";
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "../lib/password-policy";
import { generateBootstrapPassword } from "./bootstrap-admin";

test("bootstrap password is readable and policy compliant", () => {
    const password = generateBootstrapPassword(new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(password).toHaveLength(12);
    expect(evaluatePasswordRules({ password, minLength: ADMIN_PASSWORD_POLICY.minLength }).isPolicyValid).toBeTrue();
    expect(password).not.toMatch(/[0OIl1]/);
});
