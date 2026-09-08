import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

test("formatting works through button activation without a pointer press", async () => {
    const { RichTextEditor } = await import("./RichTextEditor");
    const onChange = mock(() => undefined);
    const view = render(<RichTextEditor value="<p>报告结论</p>" onChange={onChange} ariaLabel="报告正文" editorTestId="editor"/>);
    await waitFor(() => expect(view.getByRole("textbox", { name: "报告正文" })).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "标题 2" }));
    await waitFor(() => expect(view.getByTestId("editor").querySelector("h2")?.textContent).toBe("报告结论"));
    expect(onChange).toHaveBeenCalled();
});
