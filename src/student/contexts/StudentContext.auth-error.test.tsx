import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentProvider, useStudent } from "./StudentContext";
import { readExperimentDraft, writeExperimentDraft } from "../experiment/experiment-draft";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); mock.restore(); globalThis.fetch = originalFetch; dom?.restore(); });
function Account() {
    const { currentUser, isLoading, authError, retry } = useStudent();
    return <><output data-testid="state">{JSON.stringify({ currentUser, isLoading, authError })}</output><button onClick={retry}>重试</button></>;
}
for (const kind of ["500", "503", "network", "malformed"]) {
    test(`${kind} preserves drafts and retries by full reload`, async () => {
        dom = installDomGlobals();
        const reload = spyOn(window.location, "reload").mockImplementation(() => {});
        globalThis.fetch = (async () => {
            if (kind === "network") throw new TypeError("offline");
            if (kind === "malformed") return new Response("upstream error", { status: 502 });
            return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "错误" } }, { status: Number(kind) });
        }) as unknown as typeof fetch;
        const identity = { experimentId: 18, experimentVersion: 4, stage: 4 };
        const draft = { reportContent: "<p>需要恢复的报告草稿</p>" };
        writeExperimentDraft(identity, draft);
        const view = render(<StudentProvider><Account /></StudentProvider>);
        await waitFor(() => expect(view.getByTestId("state").textContent).toContain("暂时无法确认登录状态"));
        fireEvent.click(view.getByText("重试"));
        expect(reload).toHaveBeenCalledTimes(1);
        expect(readExperimentDraft<typeof draft>(identity)).toEqual(draft);
    });
}
