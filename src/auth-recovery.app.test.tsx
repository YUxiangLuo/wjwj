import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act, useState } from "react";
import { type AuthResponseLike, useAuthBootstrap, useLoginSuccessRecovery } from "@/hooks/useAuthRecovery";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals();
    restoreDom = dom.restore;
});

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    restoreDom?.();
    restoreDom = null;
});

function AdminLikeShell(props: {
    path: "/login" | "/";
    loginSuccessKey: string;
    fetchCurrentUser: () => Promise<AuthResponseLike<{ name: string }>>;
}) {
    const { path, loginSuccessKey, fetchCurrentUser } = props;
    const isLoginPage = path === "/login";
    const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");

    useAuthBootstrap({
        enabled: authState === "checking",
        fetchCurrentUser,
        onAuthenticated: () => setAuthState("authed"),
        onUnauthenticated: () => setAuthState("guest"),
    });

    const isRecovering = useLoginSuccessRecovery({
        enabled: !isLoginPage && authState === "guest",
        loginSuccessKey,
        onRecover: () => {
            setAuthState("checking");
        },
    });

    if (isLoginPage) {
        if (authState === "checking") return <div data-testid="checking-page">checking</div>;
        if (authState === "authed") return <div data-testid="redirect-home-page">redirect-home</div>;
        return <div data-testid="login-page">login</div>;
    }

    if (authState === "checking") return <div data-testid="checking-page">checking</div>;
    if (isRecovering) return <div data-testid="recovering-page">recovering</div>;
    if (authState !== "authed") return <div data-testid="redirect-login-page">redirect-login</div>;
    return <div data-testid="home-page">home</div>;
}

function RecoveryStatusProbe(props: {
    enabled: boolean;
    loginSuccessKey: string;
    refreshUser: () => Promise<void>;
    refreshNotifications: () => Promise<void>;
    refreshSession: () => Promise<void>;
}) {
    const { enabled, loginSuccessKey, refreshUser, refreshNotifications, refreshSession } = props;

    const isRecovering = useLoginSuccessRecovery({
        enabled,
        loginSuccessKey,
        onRecover: async () => {
            await refreshUser();
            await Promise.all([refreshNotifications(), refreshSession()]);
        },
    });

    return <div data-testid="recovery-status">{isRecovering ? "recovering" : "idle"}</div>;
}

test("admin-like shell enters recovery synchronously after leaving login with a success flag", async () => {
    const fetchCurrentUser = mock(async () => {
        if (fetchCurrentUser.mock.calls.length === 1) {
            return {
                success: false,
                error: { code: "UNAUTHORIZED", message: "未登录" },
            };
        }

        return {
            success: true,
            data: { name: "admin" },
        };
    });

    const view = render(
        <AdminLikeShell
            path="/login"
            loginSuccessKey="admin_login_success"
            fetchCurrentUser={fetchCurrentUser}
        />
    );

    await view.findByTestId("login-page");

    await act(async () => {
        sessionStorage.setItem("admin_login_success", "1");
        view.rerender(
            <AdminLikeShell
                path="/"
                loginSuccessKey="admin_login_success"
                fetchCurrentUser={fetchCurrentUser}
            />
        );
    });

    expect(view.queryByTestId("redirect-login-page")).toBeNull();

    await waitFor(() => {
        expect(view.getByTestId("home-page")).toBeTruthy();
    });

    expect(fetchCurrentUser.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sessionStorage.getItem("admin_login_success")).toBeNull();
});

test("async recovery stays active until student-style restore work finishes", async () => {
    let resolveRestore: (() => void) | null = null;
    const restoreDone = new Promise<void>((resolve) => {
        resolveRestore = resolve;
    });

    const refreshUser = mock(async () => {
        await restoreDone;
    });
    const refreshNotifications = mock(async () => {
        await restoreDone;
    });
    const refreshSession = mock(async () => {
        await restoreDone;
    });

    const view = render(
        <RecoveryStatusProbe
            enabled={false}
            loginSuccessKey="student_login_success"
            refreshUser={refreshUser}
            refreshNotifications={refreshNotifications}
            refreshSession={refreshSession}
        />
    );

    await view.findByTestId("recovery-status");
    expect(view.getByTestId("recovery-status").textContent).toBe("idle");

    await act(async () => {
        sessionStorage.setItem("student_login_success", "1");
        view.rerender(
            <RecoveryStatusProbe
                enabled={true}
                loginSuccessKey="student_login_success"
                refreshUser={refreshUser}
                refreshNotifications={refreshNotifications}
                refreshSession={refreshSession}
            />
        );
    });

    await waitFor(() => {
        expect(view.getByTestId("recovery-status").textContent).toBe("recovering");
    });

    await act(async () => {
        resolveRestore?.();
        await restoreDone;
    });

    await waitFor(() => {
        expect(view.getByTestId("recovery-status").textContent).toBe("idle");
    });

    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("student_login_success")).toBeNull();
});
