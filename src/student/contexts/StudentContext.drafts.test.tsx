import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { authApi } from "../api-client";
import { StudentProvider, useStudent } from "./StudentContext";
import { readExperimentDraft, writeExperimentDraft } from "../experiment/experiment-draft";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); mock.restore(); globalThis.fetch = originalFetch; dom?.restore(); });
function Account() { return <output>{useStudent().currentUser?.studentId}</output>; }

for (const change of ["logout", "other-tab"]) {
    test(`${change} leaves the document without deleting local drafts`, async () => {
        dom = installDomGlobals("http://localhost/student");
        const navigate = spyOn(window.location, "replace").mockImplementation(() => {});
        globalThis.fetch = (async () => Response.json({ success: true, data: { id: 1, studentId: "S1" } })) as unknown as typeof fetch;
        const identity = { experimentId: 18, experimentVersion: 1, stage: 1 };
        writeExperimentDraft(identity, { title: "保留的草稿" });
        const view = render(<StudentProvider><Account /></StudentProvider>);
        await waitFor(() => expect(view.getByText("S1")).toBeTruthy());
        if (change === "logout") await authApi.logout();
        else window.dispatchEvent(new window.StorageEvent("storage", { key: "wj:auth-change:student" }));
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(readExperimentDraft<{ title: string }>(identity)).toEqual({ title: "保留的草稿" });
    });
}
