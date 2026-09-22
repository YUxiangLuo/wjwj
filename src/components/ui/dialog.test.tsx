import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

test("controlled dialogs restore focus to their external opener", async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    const { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } = await import(`./dialog?focus=${crypto.randomUUID()}`);

    function ControlledDialogWithoutRadixTrigger() {
        const [open, setOpen] = useState(false);
        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>打开测试弹窗</button>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent>
                        <DialogTitle>测试弹窗</DialogTitle>
                        <DialogDescription>用于验证关闭后的焦点恢复。</DialogDescription>
                        <DialogClose>完成并关闭</DialogClose>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    const view = render(<ControlledDialogWithoutRadixTrigger />);
    const opener = view.getByRole("button", { name: "打开测试弹窗" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = view.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100vh-2rem)]");
    expect(dialog.className).toContain("overflow-y-auto");
    const close = await view.findByRole("button", { name: "完成并关闭" });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(close);

    await waitFor(() => expect(document.activeElement).toBe(opener));
});
