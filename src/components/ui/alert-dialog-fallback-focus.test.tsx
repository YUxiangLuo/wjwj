import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals().restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

/**
 * O-5 回归：开启弹窗的元素可能在关闭前被卸载（例如开启它的是随菜单关闭的菜单项）。
 * 此时焦点应回退到 fallbackFocusRef 指向的常驻元素，而不是落到 body。
 */
test("an alert dialog falls back to a surviving element when its opener unmounts", async () => {
    const {
        AlertDialog,
        AlertDialogAction,
        AlertDialogContent,
        AlertDialogDescription,
        AlertDialogTitle,
    } = await import(`./alert-dialog?fallback=${crypto.randomUUID()}`);

    function MenuOpenedAlert() {
        const [open, setOpen] = useState(false);
        const [menuOpen, setMenuOpen] = useState(false);
        const triggerRef = useRef<HTMLButtonElement>(null);
        return (
            <>
                <button ref={triggerRef} type="button" onClick={() => setMenuOpen(true)}>打开账户菜单</button>
                {menuOpen ? (
                    <button
                        type="button"
                        onClick={() => {
                            // 菜单项关闭菜单并打开弹窗：菜单项随之下线
                            setMenuOpen(false);
                            setOpen(true);
                        }}
                    >
                        退出登录
                    </button>
                ) : null}
                <AlertDialog open={open} onOpenChange={setOpen} fallbackFocusRef={triggerRef}>
                    <AlertDialogContent>
                        <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                        <AlertDialogDescription>退出后需要重新登录。</AlertDialogDescription>
                        <AlertDialogAction className="h-11" variant="destructive" onClick={() => setOpen(false)}>退出</AlertDialogAction>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    }

    const view = render(<MenuOpenedAlert />);
    const survivingTrigger = view.getByRole("button", { name: "打开账户菜单" });
    fireEvent.click(survivingTrigger);
    const menuItem = view.getByRole("button", { name: "退出登录" });
    menuItem.focus();
    fireEvent.click(menuItem);

    const action = await view.findByRole("button", { name: "退出" });
    // 菜单项已卸载，说明原始 opener 确实不在了
    expect(view.queryByRole("button", { name: "退出登录" })).toBeNull();
    fireEvent.click(action);

    await waitFor(() => expect(document.activeElement).toBe(survivingTrigger));
});
