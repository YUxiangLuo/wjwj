import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { act, useState } from "react";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { STUDENT_PASSWORD_POLICY } from "@/lib/password-policy";
import { installDomGlobals } from "@/test-utils/dom";

const inputChangeHandlers = new Map<string, React.ComponentProps<"input">["onChange"]>();

mock.module("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: unknown }) => <div data-testid="mock-dialog-root">{children}</div>,
    DialogContent: ({ children, className }: { children: unknown; className?: string }) => <div className={className}>{children}</div>,
    DialogFooter: ({ children, className }: { children: unknown; className?: string }) => <div className={className}>{children}</div>,
    DialogHeader: ({ children, className }: { children: unknown; className?: string }) => <div className={className}>{children}</div>,
    DialogTitle: ({ children, className }: { children: unknown; className?: string }) => <div className={className}>{children}</div>,
    DialogDescription: ({ children, className }: { children: unknown; className?: string }) => <div className={className}>{children}</div>,
}));

mock.module("@/components/ui/input", () => ({
    Input: (props: React.ComponentProps<"input">) => {
        const testId = typeof props["data-testid"] === "string"
            ? props["data-testid"]
            : props.id;
        if (testId) {
            inputChangeHandlers.set(testId, props.onChange);
        }

        return <input {...props} />;
    },
}));

const { PasswordChangeDialog } = await import("@/components/PasswordChangeDialog");

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
    inputChangeHandlers.clear();
    restoreDom?.();
    restoreDom = null;
});

function PasswordDialogHarness(props: {
    forbiddenSubstrings?: Array<string | null | undefined>;
    onSubmit: (payload: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean; error?: { message?: string } }>;
}) {
    const { forbiddenSubstrings, onSubmit } = props;
    const [open, setOpen] = useState(true);
    const [successCount, setSuccessCount] = useState(0);
    const passwordChange = usePasswordChange({
        policy: STUDENT_PASSWORD_POLICY,
        forbiddenSubstrings,
        onSubmit,
        onSuccess: () => {
            setSuccessCount((count) => count + 1);
            setOpen(false);
        },
    });

    return (
        <div>
            <button data-testid="reopen-password-dialog" onClick={() => setOpen(true)}>reopen</button>
            <div data-testid="password-dialog-state">{open ? "open" : "closed"}</div>
            <div data-testid="password-success-count">{successCount}</div>
            <PasswordChangeDialog
                open={open}
                onOpenChange={setOpen}
                allowClose={true}
                title="修改密码"
                description="请设置新密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
                submitTestId="student-password-save"
                fieldTestIds={{
                    currentPassword: "student-password-current",
                    newPassword: "student-password-new",
                    confirmPassword: "student-password-confirm",
                }}
                showPolicyHints={true}
                policyMinLength={STUDENT_PASSWORD_POLICY.minLength}
                rules={passwordChange.rules}
                forbiddenHintLabel="学号"
            />
        </div>
    );
}

async function setPasswordField(testId: string, value: string) {
    await act(async () => {
        const onChange = inputChangeHandlers.get(testId);
        if (!onChange) {
            throw new Error(`Missing input change handler for ${testId}`);
        }
        onChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
    });
}

test("student-style password dialog updates policy hints and shows forbidden substring validation", async () => {
    const submit = mock(async () => ({ success: true }));
    const view = render(
        <PasswordDialogHarness forbiddenSubstrings={["2024006"]} onSubmit={submit} />
    );

    expect(view.getByText("密码强度")).toBeTruthy();
    expect(view.getByText("弱")).toBeTruthy();
    expect(view.getByText((content) => content.includes("不包含") && content.includes("学号") && content.includes("✓"))).toBeTruthy();

    await setPasswordField("student-password-current", "old-pass!1");
    await setPasswordField("student-password-new", "2024006Ab!");
    await setPasswordField("student-password-confirm", "2024006Ab!");

    await waitFor(() => {
        expect(view.getByText("中")).toBeTruthy();
        expect(view.getByText((content) => content.includes("两次密码一致") && content.includes("✓"))).toBeTruthy();
        expect((view.getByTestId("student-password-new") as HTMLInputElement).value).toBe("2024006Ab!");
    });

    fireEvent.click(view.getByTestId("student-password-save"));

    await waitFor(() => {
        expect(view.getByText("新密码不能包含学号")).toBeTruthy();
    });

    expect(submit).toHaveBeenCalledTimes(0);
});

test("shared password dialog resets form and closes after successful submit", async () => {
    const submit = mock(async () => ({ success: true }));
    const view = render(
        <PasswordDialogHarness forbiddenSubstrings={["2024006"]} onSubmit={submit} />
    );

    await setPasswordField("student-password-current", "old-pass!1");
    await setPasswordField("student-password-new", "BrandNew!9");
    await setPasswordField("student-password-confirm", "BrandNew!9");
    fireEvent.click(view.getByTestId("student-password-save"));

    await waitFor(() => {
        expect(view.getByTestId("password-dialog-state").textContent).toBe("closed");
    });

    expect(view.getByTestId("password-success-count").textContent).toBe("1");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
        currentPassword: "old-pass!1",
        newPassword: "BrandNew!9",
    });

    fireEvent.click(view.getByTestId("reopen-password-dialog"));

    await waitFor(() => {
        expect((view.getByTestId("student-password-current") as HTMLInputElement).value).toBe("");
        expect((view.getByTestId("student-password-new") as HTMLInputElement).value).toBe("");
        expect((view.getByTestId("student-password-confirm") as HTMLInputElement).value).toBe("");
    });
});
