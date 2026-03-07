import { useCallback, useMemo, useState } from "react";
import {
    type PasswordChangeValidationResult,
    type PasswordPolicySpec,
    validatePasswordChange,
} from "@/lib/password-policy";

export interface PasswordFormState {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

interface PasswordChangeResponse {
    success: boolean;
    error?: {
        message?: string;
    };
}

interface UsePasswordChangeOptions {
    policy: PasswordPolicySpec;
    forbiddenSubstrings?: Array<string | null | undefined>;
    onSubmit: (payload: { currentPassword: string; newPassword: string }) => Promise<PasswordChangeResponse>;
    onSuccess: () => Promise<void> | void;
    fallbackErrorMessage?: string;
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
};

export function usePasswordChange(options: UsePasswordChangeOptions) {
    const {
        policy,
        forbiddenSubstrings,
        onSubmit,
        onSuccess,
        fallbackErrorMessage = "修改失败",
    } = options;
    const [form, setForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validation = useMemo<PasswordChangeValidationResult>(() => validatePasswordChange({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
        policy,
        forbiddenSubstrings,
    }), [forbiddenSubstrings, form.confirmPassword, form.currentPassword, form.newPassword, policy]);

    const setField = useCallback((field: keyof PasswordFormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const reset = useCallback(() => {
        setForm(EMPTY_PASSWORD_FORM);
        setError(null);
    }, []);

    const submit = useCallback(async () => {
        setError(null);

        if (validation.errorMessage) {
            setError(validation.errorMessage);
            return false;
        }

        setSaving(true);
        try {
            const result = await onSubmit({
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            });
            if (!result.success) {
                setError(result.error?.message ?? fallbackErrorMessage);
                return false;
            }

            reset();
            await onSuccess();
            return true;
        } catch (error) {
            setError(error instanceof Error ? error.message : fallbackErrorMessage);
            return false;
        } finally {
            setSaving(false);
        }
    }, [fallbackErrorMessage, form.currentPassword, form.newPassword, onSubmit, onSuccess, reset, validation.errorMessage]);

    return {
        form,
        saving,
        error,
        rules: validation.rules,
        setField,
        clearError,
        reset,
        submit,
    };
}
