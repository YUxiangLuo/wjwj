import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { installDomGlobals } from "@/test-utils/dom";
import { AppToaster } from "./AppToaster";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/admin").restore;
});

afterEach(async () => {
    toast.dismiss();
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("AppToaster renders at bottom-right so toasts never intercept top-right PageHeader CTAs", async () => {
    const view = render(<AppToaster />);
    toast.success("学期已创建");

    await waitFor(() => {
        const list = view.container.querySelector("[data-sonner-toaster]");
        expect(list !== null).toBe(true);
        expect(list?.getAttribute("data-y-position")).toBe("bottom");
        expect(list?.getAttribute("data-x-position")).toBe("right");
    });
});
