import { afterEach, beforeEach, expect, test } from "bun:test";
import { StrictMode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentProvider } from "../contexts/StudentContext";
import { Profile } from "./Profile";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
beforeEach(() => {
    dom = installDomGlobals("http://localhost/student/profile");
    globalThis.fetch = (async () => Response.json({ success: true, data: {
        id: 6, studentId: "S2606", name: "测试学生", classId: 1, className: "测试班级",
    } })) as unknown as typeof fetch;
});
afterEach(async () => {
    await act(async () => cleanup());
    globalThis.fetch = originalFetch;
    dom.restore();
});

function showProfile(url: string) {
    const router = createMemoryRouter([{ path: "/student/profile", element: <StudentProvider><Profile /></StudentProvider> }], { initialEntries: [url] });
    const view = render(<StrictMode><RouterProvider router={router} /></StrictMode>);
    return { router, view };
}

test("password success survives the new document, consumes its marker, and is not replayed", async () => {
    const { router, view } = showProfile("/student/profile?keep=value&passwordChanged=1#security");
    await waitFor(() => expect(view.getByRole("status").textContent).toContain("密码已更新"));
    await waitFor(() => expect(router.state.location.search).toBe("?keep=value"));
    expect(router.state.location.hash).toBe("#security");
    expect(String(router.state.historyAction)).toBe("REPLACE");
    expect(view.container.querySelectorAll("input[type=password]")).toHaveLength(3);
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=password]")) expect(input.value).toBe("");
    const cleanUrl = router.state.location.pathname + router.state.location.search + router.state.location.hash;
    await act(async () => view.unmount());
    router.dispose();
    const refreshed = showProfile(cleanUrl);
    await waitFor(() => expect(refreshed.view.getByTestId("student-profile-id").textContent).toBe("S2606"));
    expect(refreshed.view.queryByText("密码已更新")).toBeNull();
    refreshed.router.dispose();
});

test("an unrecognized password marker does not display success", async () => {
    const { view, router } = showProfile("/student/profile?passwordChanged=0");
    await waitFor(() => expect(view.getByTestId("student-profile-id").textContent).toBe("S2606"));
    expect(view.queryByText("密码已更新")).toBeNull();
    router.dispose();
});
