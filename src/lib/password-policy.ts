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

export interface PasswordChangeValidationOptions {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    policy: PasswordPolicySpec;
    forbiddenSubstrings?: Array<string | null | undefined>;
}

export interface PasswordChangeValidationResult {
    rules: PasswordRuleResult;
    errorMessage: string | null;
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

export function validatePasswordChange(options: PasswordChangeValidationOptions): PasswordChangeValidationResult {
    const rules = evaluatePasswordRules({
        password: options.newPassword,
        confirmPassword: options.confirmPassword,
        minLength: options.policy.minLength,
        forbiddenSubstrings: options.forbiddenSubstrings,
    });

    if (!options.currentPassword || !options.newPassword || !options.confirmPassword) {
        return { rules, errorMessage: "请填写完整信息" };
    }

    if (options.newPassword === options.currentPassword) {
        return { rules, errorMessage: "新密码不能与当前密码相同" };
    }

    if (!rules.minLength) {
        return { rules, errorMessage: `新密码长度至少为${options.policy.minLength}位` };
    }

    if (!rules.hasLetter || !rules.hasNumber || !rules.hasSpecial) {
        return { rules, errorMessage: "新密码需包含字母、数字和特殊字符" };
    }

    if (!rules.noForbiddenSubstring) {
        return { rules, errorMessage: `新密码不能包含${options.policy.forbiddenLabel}` };
    }

    if (!rules.matched) {
        return { rules, errorMessage: "两次输入的新密码不一致" };
    }

    return { rules, errorMessage: null };
}
