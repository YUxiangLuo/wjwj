export const PASSWORD_SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/;

export interface PasswordPolicySpec {
    minLength: number;
    forbiddenLabel: string;
    errorMessage: string;
}

export interface PasswordRuleOptions {
    password: string;
    confirmPassword?: string;
    minLength: number;
    forbiddenSubstrings?: Array<string | null | undefined>;
}

export interface PasswordRuleResult {
    minLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
    noForbiddenSubstring: boolean;
    matched: boolean | null;
    score: number;
    strengthLabel: "弱" | "中" | "强";
    isPolicyValid: boolean;
    isValid: boolean;
}

export const ADMIN_PASSWORD_POLICY: PasswordPolicySpec = {
    minLength: 12,
    forbiddenLabel: "用户名",
    errorMessage: "新密码需至少12位且包含字母、数字和特殊字符，且不包含用户名",
};

export const TEACHER_PASSWORD_POLICY: PasswordPolicySpec = {
    minLength: 8,
    forbiddenLabel: "工号/账号",
    errorMessage: "新密码需至少8位且包含字母、数字、特殊字符，且不包含工号/账号",
};

export const STUDENT_PASSWORD_POLICY: PasswordPolicySpec = {
    minLength: 8,
    forbiddenLabel: "学号",
    errorMessage: "新密码需至少8位且包含字母、数字、特殊字符，且不包含学号",
};

export function evaluatePasswordRules(options: PasswordRuleOptions): PasswordRuleResult {
    const password = options.password ?? "";
    const forbiddenSubstrings = (options.forbiddenSubstrings ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const minLength = password.length >= options.minLength;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = PASSWORD_SPECIAL_CHAR_REGEX.test(password);
    const noForbiddenSubstring = forbiddenSubstrings.every((value) => !password.includes(value));
    const matched = options.confirmPassword === undefined
        ? null
        : options.confirmPassword.length > 0 && password === options.confirmPassword;

    const score = [
        minLength,
        hasLetter,
        hasNumber,
        hasSpecial,
        noForbiddenSubstring,
    ].filter(Boolean).length;

    const strengthLabel = score <= 2 ? "弱" : score <= 4 ? "中" : "强";
    const isPolicyValid = minLength && hasLetter && hasNumber && hasSpecial && noForbiddenSubstring;
    const isValid = isPolicyValid && (matched === null || matched);

    return {
        minLength,
        hasLetter,
        hasNumber,
        hasSpecial,
        noForbiddenSubstring,
        matched,
        score,
        strengthLabel,
        isPolicyValid,
        isValid,
    };
}
