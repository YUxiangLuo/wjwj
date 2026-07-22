import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
const originalWarn = console.warn;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
    console.warn = originalWarn;
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    restoreDom?.();
    restoreDom = null;
});

test("registers each TipTap extension only once", async () => {
    const { RichTextEditor } = await import("./RichTextEditor");
    const warning = mock(() => undefined);
    console.warn = warning;
    const view = render(<RichTextEditor value="<p>报告</p>" onChange={() => undefined} editorTestId="editor" />);

    await waitFor(() => expect(view.getByTestId("editor")).toBeTruthy());
    const messages = warning.mock.calls.flat().map((value) => String(value));
    expect(messages.some((message) => message.includes("Duplicate extension names"))).toBe(false);
});
