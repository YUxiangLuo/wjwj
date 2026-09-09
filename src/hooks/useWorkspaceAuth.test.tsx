import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { useWorkspaceAuth } from "./useWorkspaceAuth";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); dom?.restore(); });
type Result = { success: boolean; data?: { id: number }; error?: { code: string; message: string } };
test("role-scoped expiry preserves the other workspace identity", async () => {
    dom = installDomGlobals();
    const fetchUser = async (): Promise<Result> => ({ success: true, data: { id: 1 } });
    const teacher = renderHook(() => useWorkspaceAuth(fetchUser, "teacher"));
    const admin = renderHook(() => useWorkspaceAuth(fetchUser, "admin"));
    await waitFor(() => { expect(teacher.result.current.user?.id).toBe(1); expect(admin.result.current.user?.id).toBe(1); });
    act(() => window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { role: "teacher" } })));
    expect(teacher.result.current.user).toBeNull();
    expect(teacher.result.current.error).toBeNull();
    expect(admin.result.current.user?.id).toBe(1);
});
function deferred() { let resolve!: (value: Result) => void; const promise = new Promise<Result>(r => { resolve = r; }); return { promise, resolve }; }
test("clear invalidates a pending identity response", async () => {
    dom = installDomGlobals(); const pending = deferred(); const fetchUser = () => pending.promise;
    const { result } = renderHook(() => useWorkspaceAuth(fetchUser, "teacher"));
    act(() => result.current.clearUser());
    await act(async () => pending.resolve({ success: true, data: { id: 1 } }));
    expect(result.current.user).toBeNull(); expect(result.current.checking).toBe(false); expect(result.current.error).toBeNull();
});
test("an older failure cannot replace a newer successful retry", async () => {
    dom = installDomGlobals(); const first = deferred(), second = deferred(); let calls = 0;
    const fetchUser = () => ++calls === 1 ? first.promise : second.promise;
    const { result } = renderHook(() => useWorkspaceAuth(fetchUser, "teacher"));
    act(() => { void result.current.retry(); });
    await act(async () => second.resolve({ success: true, data: { id: 2 } }));
    await act(async () => first.resolve({ success: false, error: { code: "NETWORK_ERROR", message: "offline" } }));
    expect(result.current.user?.id).toBe(2); expect(result.current.error).toBeNull(); expect(result.current.checking).toBe(false);
});
test("a failed recheck does not erase a known identity; retry recovers", async () => {
    dom = installDomGlobals(); let calls = 0;
    const fetchUser = async (): Promise<Result> => { if (++calls === 2) throw new TypeError("offline"); return { success: true, data: { id: 3 } }; };
    const { result } = renderHook(() => useWorkspaceAuth(fetchUser, "admin"));
    await waitFor(() => expect(result.current.user?.id).toBe(3));
    await act(async () => { await result.current.retry(); });
    expect(result.current.user?.id).toBe(3); expect(result.current.error).toContain("暂时无法确认登录状态");
    await act(async () => { await result.current.retry(); });
    expect(result.current.error).toBeNull(); expect(result.current.checking).toBe(false);
});
