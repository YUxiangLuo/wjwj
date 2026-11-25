import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { MemoryRouter } from "react-router-dom";

const bootstrap = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrap.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals> | null = null;

afterEach(async () => {
    await act(async () => cleanup());
    await Bun.sleep(0);
    globalThis.fetch = originalFetch;
    dom?.restore();
    dom = null;
});

test("AuthLoginScreen keeps two inputs, toggles password visibility, and resets type=password on submit", async () => {
    dom = installDomGlobals();
    const { AuthLoginScreen } = await import("@/components/AuthLoginScreen");
    let submitted = 0;

    const view = render(
        <AuthLoginScreen
            portal="admin"
            heading="管理员登录"
            description="使用管理员用户名和密码登录"
            accountLabel="用户名"
            accountPlaceholder="请输入用户名"
            resetHint="忘记密码？请通过服务器运维命令重置"
            username="admin"
            password="Secret123!"
            loading={false}
            error={null}
            alternateLinks={[
                { href: "/teacher/login", label: "教师登录" },
                { href: "/student/login", label: "学生登录" },
            ]}
            onUsernameChange={() => undefined}
            onPasswordChange={() => undefined}
            onSubmit={(event) => {
                event.preventDefault();
                submitted += 1;
            }}
        />,
    );

    expect(view.container.querySelectorAll("input").length).toBe(2);
    expect(view.container.querySelectorAll("input:not([type=password])").length).toBe(1);
    const passwordInput = view.getByTestId("admin-login-password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggle = view.getByTestId("admin-login-password-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("显示密码");
    fireEvent.click(toggle);
    expect(passwordInput.type).toBe("text");
    expect(toggle.getAttribute("aria-label")).toBe("隐藏密码");

    fireEvent.click(view.getByTestId("admin-login-submit"));
    expect(submitted).toBe(1);
    expect(passwordInput.type).toBe("password");
});

test("AdminApp renders explicit 404 fallback on unknown route and wires 12-char password policy hints", async () => {
    dom = installDomGlobals();
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/me")) {
            return Response.json({ success: true, data: { id: 1, username: "admin" } });
        }
        return Response.json({ success: true, data: [] });
    }) as unknown as typeof fetch;

    const { AdminApp } = await import("./AdminApp");
    const view = render(
        <MemoryRouter initialEntries={["/nonexistent-route"]}>
            <AdminApp />
        </MemoryRouter>,
    );

    const notFound = await view.findByTestId("admin-not-found");
    expect(notFound.textContent).toContain("/admin/nonexistent-route");
    expect(view.getByRole("link", { name: "返回首页概览" }).getAttribute("href")).toBe("/");

    fireEvent.click(view.getByRole("button", { name: "修改密码" }));
    const dialog = await view.findByRole("dialog");
    expect(dialog.textContent).toContain("至少12个字符");
    expect(dialog.textContent).toContain("不包含用户名");

    fireEvent.change(view.getByLabelText("新密码"), { target: { value: "adminPass123!" } });
    fireEvent.click(view.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("请填写完整信息"));

    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));

    fireEvent.click(view.getByRole("button", { name: "修改密码" }));
    const reopenedDialog = await view.findByRole("dialog");
    expect(reopenedDialog.querySelector('[role="alert"]') === null).toBe(true);
    expect((view.getByLabelText("新密码") as HTMLInputElement).value).toBe("");
});

test("SemesterManagement resets dirty create input on cancel and recovers from empty search filter", async () => {
    dom = installDomGlobals();
    globalThis.fetch = mock(async () => Response.json({
        success: true,
        data: [{ id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 2, createdAt: "2026-09-01T00:00:00.000Z" }],
    })) as unknown as typeof fetch;

    const { SemesterManagement } = await import("./pages/SemesterManagement");
    const view = render(<SemesterManagement />);
    await waitFor(() => expect(view.getAllByText("2026-2027-1").length).toBe(2));

    fireEvent.click(view.getByTestId("semester-create-open"));
    const createInput = await view.findByTestId("semester-create-name") as HTMLInputElement;
    fireEvent.change(createInput, { target: { value: "2028-2029-1" } });
    expect(createInput.value).toBe("2028-2029-1");

    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));

    fireEvent.click(view.getByTestId("semester-create-open"));
    expect((await view.findByTestId("semester-create-name") as HTMLInputElement).value).toBe("");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));

    fireEvent.change(view.getByLabelText("搜索学期名称"), { target: { value: "不存在学期" } });
    expect(await view.findByText("未找到符合筛选条件的学期")).toBeTruthy();
    fireEvent.click(view.getAllByRole("button", { name: "清除筛选" })[0]!);
    await waitFor(() => expect(view.getAllByText("2026-2027-1").length).toBe(2));
});

test("SemesterManagement restores focus inside create Dialog and allows Escape to close after nested AlertDialog confirm + duplicate error", async () => {
    dom = installDomGlobals();
    let postFinished = false;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/admin/semesters") && init?.method === "POST") {
            await new Promise((resolve) => setTimeout(resolve, 25));
            postFinished = true;
            return Response.json(
                { success: false, error: { code: "CONFLICT", message: "学期名称已存在" } },
                { status: 409 },
            );
        }
        return Response.json({
            success: true,
            data: [{ id: 1, name: "DF_ADM_2099-1", isCurrent: 1, classCount: 0, createdAt: "2026-09-01T00:00:00.000Z" }],
        });
    }) as unknown as typeof fetch;

    const { SemesterManagement } = await import("./pages/SemesterManagement");
    const view = render(<SemesterManagement />);
    await waitFor(() => expect(view.getAllByText("DF_ADM_2099-1").length).toBe(2));

    // Open outer Create Dialog
    fireEvent.click(view.getByTestId("semester-create-open"));
    const createInput = await view.findByTestId("semester-create-name") as HTMLInputElement;
    fireEvent.change(createInput, { target: { value: "DF_ADM_2099-1" } });

    // Submit non-standard name -> opens nested format warning AlertDialog; cancel keeps outer Dialog focused & Esc-dismissible
    const submitButton = view.getByTestId("semester-create-submit");
    submitButton.focus();
    fireEvent.click(submitButton);

    const cancelAlertBtn = await view.findByTestId("confirm-dialog-cancel");
    fireEvent.click(cancelAlertBtn);
    await waitFor(() => expect(view.queryByTestId("confirm-dialog-cancel") === null).toBe(true));
    expect(view.getByRole("dialog").contains(document.activeElement)).toBe(true);

    // Re-submit -> confirm nested AlertDialog -> API returns duplicate conflict
    submitButton.focus();
    fireEvent.click(submitButton);

    const continueBtn = await view.findByRole("button", { name: "继续创建" });
    fireEvent.click(continueBtn);

    // Wait for duplicate API rejection to finish and re-enable the input
    await waitFor(() => expect(postFinished && !createInput.disabled).toBe(true));
    const outerDialog = view.getByRole("dialog");
    expect(outerDialog.hasAttribute("inert")).toBe(false);
    await waitFor(() => expect(outerDialog.contains(document.activeElement)).toBe(true));

    // Pressing Escape must close the outer Create Dialog cleanly
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));
});

test("ClassManagement resets canceled create name and exposes filter recovery", async () => {
    dom = installDomGlobals();
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/semesters")) {
            return Response.json({ success: true, data: [{ id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }] });
        }
        if (url.includes("/teachers")) {
            return Response.json({ success: true, data: [{ id: 1, employeeId: "T001", name: "张岚", classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }] });
        }
        return Response.json({
            success: true,
            data: [{ id: 3, name: "2026级商务统计1班", semesterId: 1, semesterName: "2026-2027-1", teacherId: 1, teacherName: "张岚", studentCount: 10, taskCount: 2, createdAt: "2026-09-01T00:00:00.000Z" }],
        });
    }) as unknown as typeof fetch;

    const { ClassManagement } = await import("./pages/ClassManagement");
    const view = render(<MemoryRouter><ClassManagement /></MemoryRouter>);
    await view.findByText("2026级商务统计1班");
    expect(view.container.textContent).toContain("· 2 任务");

    fireEvent.click(view.getByTestId("class-create-open"));
    const nameInput = await view.findByTestId("class-create-name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "临时未保存班级" } });
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));

    fireEvent.click(view.getByTestId("class-create-open"));
    expect((await view.findByTestId("class-create-name") as HTMLInputElement).value).toBe("");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(view.queryByRole("dialog") === null).toBe(true));

    fireEvent.change(view.getByTestId("class-search-input"), { target: { value: "无此班级" } });
    expect(await view.findByText("未找到符合筛选条件的班级")).toBeTruthy();
    fireEvent.click(view.getAllByRole("button", { name: "清除筛选" })[0]!);
    await view.findByText("2026级商务统计1班");
});

test("TeacherManagement preserves appliedSearch empty recovery even when input text changes before submit", async () => {
    dom = installDomGlobals();
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("search=")) return Response.json({ success: true, data: [] });
        return Response.json({
            success: true,
            data: [{ id: 1, employeeId: "T001", name: "张岚", classCount: 1, topicCount: 2, createdAt: "2026-09-01T00:00:00.000Z" }],
        });
    }) as unknown as typeof fetch;

    const { TeacherManagement } = await import("./pages/TeacherManagement");
    const view = render(<TeacherManagement />);
    await view.findByText("张岚");

    const searchInput = view.getByLabelText("搜索教师工号或姓名") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "T999" } });
    fireEvent.click(view.getByRole("button", { name: "搜索教师" }));
    await view.findByText("未找到与“T999”匹配的教师");

    // Backspacing the input without pressing Enter must NOT hide the clear-search recovery button!
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(view.getByText("未找到与“T999”匹配的教师")).toBeTruthy();
    fireEvent.click(view.getAllByRole("button", { name: "清除搜索" })[0]!);
    await view.findByText("张岚");
});
