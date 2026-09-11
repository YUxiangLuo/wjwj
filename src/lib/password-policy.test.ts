import { expect, test } from "bun:test";
import { ADMIN_PASSWORD_POLICY, STUDENT_PASSWORD_POLICY, TEACHER_PASSWORD_POLICY, evaluatePasswordRules, passwordFieldsForMessage, validatePasswordChange } from "./password-policy";

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

test("password change errors name the field they belong to", () => {
    const policy = { minLength: 8, forbiddenLabel: "学号", errorMessage: "x" };
    const base = { policy, forbiddenSubstrings: ["S2601"] };

    expect(validatePasswordChange({ ...base, currentPassword: "", newPassword: "", confirmPassword: "" }).errorFields)
        .toEqual(["currentPassword", "newPassword", "confirmPassword"]);
    expect(validatePasswordChange({ ...base, currentPassword: "old", newPassword: "short", confirmPassword: "short" }).errorFields)
        .toEqual(["newPassword"]);
    expect(validatePasswordChange({ ...base, currentPassword: "OldPass!1", newPassword: "OldPass!1", confirmPassword: "OldPass!1" }).errorFields)
        .toEqual(["currentPassword", "newPassword"]);
    expect(validatePasswordChange({ ...base, currentPassword: "old", newPassword: "NewPass!123", confirmPassword: "NewPass!124" }).errorFields)
        .toEqual(["confirmPassword"]);
    expect(validatePasswordChange({ ...base, currentPassword: "old", newPassword: "NewPass!123", confirmPassword: "NewPass!123" }).errorFields)
        .toEqual([]);

    expect(passwordFieldsForMessage("当前密码不正确")).toEqual(["currentPassword"]);
    expect(passwordFieldsForMessage("新密码需包含字母、数字和特殊字符")).toEqual(["newPassword", "confirmPassword"]);
    expect(passwordFieldsForMessage("网络错误")).toEqual([]);
});
