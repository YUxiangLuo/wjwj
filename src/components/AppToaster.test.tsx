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

test("AppToaster renders at bottom-right with closeButton and 2500ms duration so toasts never trap right-column CTAs", async () => {
    const element = AppToaster();
    expect(element.props.position).toBe("bottom-right");
    expect(element.props.closeButton).toBe(true);
    expect(element.props.duration).toBe(2500);

    const view = render(<AppToaster />);
    toast.success("学期已创建");

    await waitFor(() => {
        const list = view.container.querySelector("[data-sonner-toaster]");
        expect(list !== null).toBe(true);
        expect(list?.getAttribute("data-y-position")).toBe("bottom");
        expect(list?.getAttribute("data-x-position")).toBe("right");
        const closeBtn = view.container.querySelector("[data-close-button]");
        expect(closeBtn !== null).toBe(true);
    });
});
