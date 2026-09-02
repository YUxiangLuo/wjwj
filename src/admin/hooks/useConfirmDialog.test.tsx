import { afterAll, beforeAll, expect, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";

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
