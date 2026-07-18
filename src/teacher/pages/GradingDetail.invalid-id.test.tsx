import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { GradingDetail } from "./GradingDetail";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/teacher/grading/foo").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("invalid grading IDs render a terminal not-found state without requesting data", async () => {
    const fetchMock = mock(async () => {
        throw new Error("invalid ID must not trigger a request");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/grading/foo"]}>
            <Routes>
                <Route path="/grading/:submissionId" element={<GradingDetail />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => {
        expect(view.getByText("未找到提交记录")).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
});
