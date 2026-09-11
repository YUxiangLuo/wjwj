import { afterAll, beforeAll, expect, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals().restore;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("controlled alert dialogs restore focus to their external opener", async () => {
    const {
        AlertDialog,
        AlertDialogAction,
        AlertDialogContent,
        AlertDialogDescription,
        AlertDialogTitle,
    } = await import(`./alert-dialog?focus=${crypto.randomUUID()}`);

    function ControlledAlertWithoutRadixTrigger() {
        const [open, setOpen] = useState(false);
        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>删除任务</button>
                <AlertDialog open={open} onOpenChange={setOpen}>
                    <AlertDialogContent>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>删除后无法恢复。</AlertDialogDescription>
                        <AlertDialogAction className="h-11" variant="destructive" onClick={() => setOpen(false)}>确认删除</AlertDialogAction>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    }

    const view = render(<ControlledAlertWithoutRadixTrigger />);
    const opener = view.getByRole("button", { name: "删除任务" });
    opener.focus();
    fireEvent.click(opener);
    const action = await view.findByRole("button", { name: "确认删除" });
    fireEvent.click(action);

    await waitFor(() => expect(document.activeElement).toBe(opener));
});
