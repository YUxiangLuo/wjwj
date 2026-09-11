import { useCallback, useMemo, useState } from "react";
import {
    type PasswordChangeField,
    type PasswordChangeValidationResult,
    type PasswordPolicySpec,
    passwordFieldsForMessage,
    validatePasswordChange,
} from "@/lib/password-policy";

export type { PasswordChangeField };

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
    const [errorFields, setErrorFields] = useState<PasswordChangeField[]>([]);

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
        setErrorFields([]);
    }, []);

    const reset = useCallback(() => {
        setForm(EMPTY_PASSWORD_FORM);
        setError(null);
        setErrorFields([]);
    }, []);

    const submit = useCallback(async () => {
        setError(null);

        if (validation.errorMessage) {
            setError(validation.errorMessage);
            setErrorFields(validation.errorFields);
            return false;
        }

        setSaving(true);
        try {
            const result = await onSubmit({
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            });
            if (!result.success) {
                const message = result.error?.message ?? fallbackErrorMessage;
                setError(message);
                setErrorFields(passwordFieldsForMessage(message));
                return false;
            }

            reset();
            await onSuccess();
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : fallbackErrorMessage;
        setError(message);
        setErrorFields(passwordFieldsForMessage(message));
            return false;
        } finally {
            setSaving(false);
        }
    }, [fallbackErrorMessage, form.currentPassword, form.newPassword, onSubmit, onSuccess, reset, validation.errorMessage]);

    return {
        form,
        saving,
        error,
        errorFields,
        rules: validation.rules,
        setField,
        clearError,
        reset,
        submit,
    };
}
