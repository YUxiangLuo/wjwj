import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { TeacherUser } from "./api-client";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

const retry = mock(() => {});
let authState: { user: TeacherUser | null; checking: boolean; error: string | null } = {
    user: null,
    checking: false,
    error: null,
};

mock.module("@/hooks/useWorkspaceAuth", () => ({
    useWorkspaceAuth: () => ({ ...authState, retry }),
}));
mock.module("./api-client", () => ({
    authApi: {
        me: async () => ({ success: false }),
        logout: async () => ({ success: true }),
        changePassword: async () => ({ success: true }),
    },
}));
mock.module("./pages/Login", () => ({ Login: () => <div>教师登录页</div> }));
mock.module("./pages/Dashboard", () => ({ Dashboard: () => <div>教学概览页</div> }));

const { TeacherApp } = await import("./TeacherApp");
bootstrapDom.restore();

const teacher: TeacherUser = { id: 9, type: "teacher", name: "张岚", employeeId: "T001" };

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    authState = { user: null, checking: false, error: null };
    retry.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <TeacherApp />
        </MemoryRouter>,
    );
}

test("shows the verification placeholder while the session is being checked", () => {
    authState = { user: null, checking: true, error: null };
    const view = renderAt("/");

    expect(view.getByText("正在验证教师登录状态")).toBeTruthy();
});

test("a failed session check offers a retry instead of the login form", async () => {
    authState = { user: null, checking: false, error: "会话校验失败" };
    const view = renderAt("/");

    expect(view.getByRole("alert").textContent).toContain("会话校验失败");
    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
    expect(retry).toHaveBeenCalledTimes(1);
});

test("an unauthenticated teacher is redirected to the login page", async () => {
    const view = renderAt("/topic");

    await waitFor(() => expect(view.getByText("教师登录页")).toBeTruthy());
});

test("an authenticated teacher visiting /login is redirected into the workspace", async () => {
    authState = { user: teacher, checking: false, error: null };
    const view = renderAt("/login");

    await waitFor(() => expect(view.getByText("教师工作台")).toBeTruthy());
});

test("the workspace renders the shell, the teacher identity and the landing page", async () => {
    authState = { user: teacher, checking: false, error: null };
    const view = renderAt("/");

    expect(view.getByText("教师工作台")).toBeTruthy();
    expect(view.getByText("张岚")).toBeTruthy();
    expect(view.getByText("T001")).toBeTruthy();
    await waitFor(() => expect(view.getByText("教学概览页")).toBeTruthy());
});
