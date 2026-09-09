import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { StudentProvider, useStudent } from "./StudentContext";
import { readExperimentDraft, writeExperimentDraft } from "../experiment/experiment-draft";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); globalThis.fetch = originalFetch; dom?.restore(); });
const user = { id: 1, studentId: "S1", name: "学生", classId: 1, className: "班级" };
const success = () => Response.json({ success: true, data: user });
function Account() {
    const { currentUser, isLoading, authError, refreshUser, clearAuthState } = useStudent();
    return <><output data-testid="state">{JSON.stringify({ currentUser, isLoading, authError })}</output><button onClick={() => void refreshUser()}>刷新</button><button onClick={clearAuthState}>退出</button></>;
}
function setup(fetcher: () => Promise<Response>) {
    dom = installDomGlobals(); globalThis.fetch = fetcher as unknown as typeof fetch;
    const view = render(<StudentProvider><Account /></StudentProvider>);
    return { view, state: () => JSON.parse(view.getByTestId("state").textContent!) };
}

for (const kind of ["500", "503", "network", "malformed"]) {
    test(`${kind} is retryable; successful retry preserves the exact report draft`, async () => {
        let attempts = 0;
        const { view, state } = setup(async () => {
            if (++attempts > 1) return success();
            if (kind === "network") throw new TypeError("offline");
            if (kind === "malformed") return new Response("upstream error", { status: 502 });
            return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "错误" } }, { status: Number(kind) });
        });
        const identity = { experimentId: 18, experimentVersion: 4, stage: 4 };
        const draft = { reportContent: "<p>需要恢复的报告草稿</p>" };
        writeExperimentDraft(identity, draft);
        await waitFor(() => expect(state().authError).toContain("暂时无法确认登录状态"));
        expect(state().isLoading).toBe(false);
        fireEvent.click(view.getByText("刷新"));
        await waitFor(() => expect(state().currentUser).toEqual(user));
        expect(state().authError).toBeNull();
        expect(readExperimentDraft<typeof draft>(identity)).toEqual(draft);
    });
}

for (const expire of ["logout", "event"]) {
    test(`late successful auth lookup cannot undo ${expire}`, async () => {
        let resolve!: (response: Response) => void;
        const { view, state } = setup(() => new Promise(r => { resolve = r; }));
        if (expire === "logout") fireEvent.click(view.getByText("退出"));
        else act(() => window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)));
        await act(async () => { resolve(success()); await Promise.resolve(); });
        expect(state()).toEqual({ currentUser: null, isLoading: false, authError: null });
    });
}

for (const status of [500, 401]) test(`older ${status} cannot overwrite a newer successful refresh`, async () => {
    let resolve!: (response: Response) => void;
    let attempts = 0;
    const { view, state } = setup(() => ++attempts === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(success()));
    fireEvent.click(view.getByText("刷新"));
    await waitFor(() => expect(state().currentUser).toEqual(user));
    await act(async () => { resolve(Response.json({ success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", message: "旧错误" } }, { status })); });
    expect(state().authError).toBeNull();
    expect(state().currentUser).toEqual(user);
});
