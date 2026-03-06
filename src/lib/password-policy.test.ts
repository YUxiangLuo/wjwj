import { expect, test } from "bun:test";
import {
    ADMIN_PASSWORD_POLICY,
    STUDENT_PASSWORD_POLICY,
    TEACHER_PASSWORD_POLICY,
    evaluatePasswordRules,
} from "./password-policy";

test("admin password policy rejects username and short passwords", () => {
    const result = evaluatePasswordRules({
        password: "admin123!",
        minLength: ADMIN_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: ["admin"],
    });

    expect(result.minLength).toBe(false);
    expect(result.noForbiddenSubstring).toBe(false);
    expect(result.isPolicyValid).toBe(false);
});

test("teacher password policy accepts valid password with confirmation", () => {
    const result = evaluatePasswordRules({
        password: "Teacher@2026",
        confirmPassword: "Teacher@2026",
        minLength: TEACHER_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: ["T2026001"],
    });

    expect(result.isPolicyValid).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.isValid).toBe(true);
});

test("student password strength counts account exclusion as part of score", () => {
    const result = evaluatePasswordRules({
        password: "Aa1!",
        confirmPassword: "Aa1!",
        minLength: STUDENT_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: ["20230001"],
    });

    expect(result.score).toBe(4);
    expect(result.strengthLabel).toBe("中");
    expect(result.isPolicyValid).toBe(false);
});
