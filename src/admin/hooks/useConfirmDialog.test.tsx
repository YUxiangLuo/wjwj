import { afterAll, beforeAll, expect, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals().restore;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("destructive admin confirmations use the destructive button variant without primary classes", async () => {
    const { useConfirmDialog } = await import(`./useConfirmDialog?variant=${crypto.randomUUID()}`);

    function Harness() {
        const { confirm, dialog } = useConfirmDialog();
        return (
            <>
                <button
                    type="button"
                    onClick={() => void confirm({
                        title: "删除学期",
                        confirmLabel: "删除",
                        tone: "destructive",
                    })}
                >
                    打开确认框
                </button>
                {dialog}
            </>
        );
    }

    const view = render(<Harness />);
    const opener = view.getByRole("button", { name: "打开确认框" });
    opener.focus();
    fireEvent.click(opener);

    const action = await view.findByRole("button", { name: "删除" });
    expect(action.getAttribute("data-variant")).toBe("destructive");
    expect(action.className).toContain("bg-destructive");
    expect(action.className).not.toContain("bg-primary");

    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    view.unmount();
});

test("useConfirmDialog restores focus to fallbackFocusRef when opener becomes disabled on confirm", async () => {
    const { useConfirmDialog } = await import(`./useConfirmDialog?fallback=${crypto.randomUUID()}`);

    function Harness() {
        const { confirm, dialog } = useConfirmDialog();
        const [busy, setBusy] = useState(false);
        const fallbackRef = useRef<HTMLInputElement>(null);
        return (
            <>
                <input ref={fallbackRef} aria-label="学期名称输入" />
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        const ok = await confirm({
                            title: "格式确认",
                            confirmLabel: "继续创建",
                            fallbackFocusRef: fallbackRef,
                        });
                        if (ok) {
                            setBusy(true);
                        }
                    }}
                >
                    确认创建
                </button>
                {dialog}
            </>
        );
    }

    const view = render(<Harness />);
    const submitBtn = view.getByRole("button", { name: "确认创建" });
    const input = view.getByLabelText("学期名称输入");
    submitBtn.focus();
    fireEvent.click(submitBtn);

    const confirmBtn = await view.findByRole("button", { name: "继续创建" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(document.activeElement === input).toBe(true));
    view.unmount();
});
