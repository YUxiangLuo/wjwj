import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { useWorkspaceAuth } from "./useWorkspaceAuth";

let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); mock.restore(); dom?.restore(); });

test("loads one identity per document; retry reloads rather than mutating it", async () => {
    dom = installDomGlobals("http://localhost/teacher/task/1");
    const reload = spyOn(window.location, "reload").mockImplementation(() => {});
    const fetchUser = mock(async () => ({ success: true, data: { id: 1 } }));
    const { result } = renderHook(() => useWorkspaceAuth(fetchUser));
    await waitFor(() => expect(result.current.user?.id).toBe(1));
    act(() => result.current.retry());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/teacher/task/1");
});

for (const code of ["UNAUTHORIZED", "ACCOUNT_NOT_FOUND", "SESSION_CHANGED"]) {
    test(`${code} at startup is logged out, not a network failure`, async () => {
        dom = installDomGlobals();
        const fetchUser = async () => ({ success: false, error: { code, message: code } });
        const { result } = renderHook(() => useWorkspaceAuth(fetchUser));
        await waitFor(() => expect(result.current.checking).toBe(false));
        expect(result.current.user).toBeNull();
        expect(result.current.error).toBeNull();
    });
}

test("an unavailable identity service preserves the URL and local drafts", async () => {
    dom = installDomGlobals("http://localhost/admin/student");
    localStorage.setItem("draft", "keep");
    const fetchUser = async () => { throw new TypeError("offline"); };
    const { result } = renderHook(() => useWorkspaceAuth(fetchUser));
    await waitFor(() => expect(result.current.error).toContain("暂时无法确认登录状态"));
    expect(window.location.pathname).toBe("/admin/student");
    expect(localStorage.getItem("draft")).toBe("keep");
});

test("unmount cancels bootstrap and ignores its late response", async () => {
    dom = installDomGlobals();
    let signal: AbortSignal | undefined;
    let resolve!: (response: { success: boolean; data: { id: number } }) => void;
    const fetchUser = (input?: AbortSignal) => { signal = input; return new Promise<{ success: boolean; data: { id: number } }>(r => { resolve = r; }); };
    const { result, unmount } = renderHook(() => useWorkspaceAuth(fetchUser));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ success: true, data: { id: 1 } }));
    expect(result.current.user).toBeNull();
});
