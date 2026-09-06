import { expect, test } from "bun:test";
import { act, render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { StudentProvider, useStudent } from "./StudentContext";
import { readExperimentDraft, writeExperimentDraft } from "../experiment/experiment-draft";

function Account() {
    const { currentUser, clearAuthState, refreshUser } = useStudent();
    return <><span>{currentUser ? "已登录" : "未登录"}</span><button onClick={clearAuthState}>退出</button><button onClick={() => void refreshUser()}>重新登录</button></>;
}

test("logging out and session expiry preserve unfinished drafts for the next login", async () => {
    const dom = installDomGlobals();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ success: true, data: { id: 1, studentId: "S1", name: "学生", classId: 1, className: "班级" } })) as unknown as typeof fetch;
    const identity = { experimentId: 18, experimentVersion: 7, stage: 1 };
    try {
        writeExperimentDraft(identity, { title: "未完成问卷" });
        const view = render(<StudentProvider><Account /></StudentProvider>);
        await waitFor(() => expect(view.getByText("已登录")).toBeTruthy());
        fireEvent.click(view.getByText("退出"));
        expect(readExperimentDraft<{ title: string }>(identity)).toEqual({ title: "未完成问卷" });
        fireEvent.click(view.getByText("重新登录"));
        await waitFor(() => expect(view.getByText("已登录")).toBeTruthy());
        act(() => window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)));
        expect(view.getByText("未登录")).toBeTruthy();
        expect(readExperimentDraft<{ title: string }>(identity)).toEqual({ title: "未完成问卷" });
    } finally {
        await act(async () => cleanup());
        await new Promise((resolve) => setTimeout(resolve, 0));
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});
