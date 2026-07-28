import { expect, test } from "bun:test";
import {
    ADMIN_PASSWORD_POLICY,
    STUDENT_PASSWORD_POLICY,
    TEACHER_PASSWORD_POLICY,
    evaluatePasswordRules,
    validatePasswordChange,
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

test("password policy rejects forbidden substrings regardless of case", () => {
    const result = evaluatePasswordRules({
        password: "SafeAdmin!2026",
        minLength: ADMIN_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: ["admin"],
    });

    expect(result.noForbiddenSubstring).toBe(false);
    expect(result.isPolicyValid).toBe(false);
});

test("password policy applies Unicode NFKC normalization for comparison", () => {
    const result = evaluatePasswordRules({
        password: "SafeＡＤＭＩＮ!2026",
        minLength: ADMIN_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: ["admin"],
    });

    expect(result.noForbiddenSubstring).toBe(false);
});

test("password policy ignores empty forbidden values without trimming the password", () => {
    const result = evaluatePasswordRules({
        password: " ValidPass!9 ",
        minLength: 8,
        forbiddenSubstrings: ["", "   ", null, undefined],
    });

    expect(result.noForbiddenSubstring).toBe(true);
    expect(result.isPolicyValid).toBe(true);
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

test("validatePasswordChange returns forbidden label specific error messages", () => {
    expect(validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "Teacher@T001",
        confirmPassword: "Teacher@T001",
        policy: TEACHER_PASSWORD_POLICY,
        forbiddenSubstrings: ["T001"],
    }).errorMessage).toBe("新密码不能包含工号/账号");

    expect(validatePasswordChange({
        currentPassword: "old-pass",
        newPassword: "Student@2024006",
        confirmPassword: "Student@2024006",
        policy: STUDENT_PASSWORD_POLICY,
        forbiddenSubstrings: ["2024006"],
    }).errorMessage).toBe("新密码不能包含学号");
});
