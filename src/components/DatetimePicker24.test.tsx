import { afterEach, beforeEach, expect, test } from "bun:test";
import { useState } from "react";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals("http://localhost/teacher");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { DatetimePicker24 } = await import("./DatetimePicker24");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("DatetimePicker24 provides an explicit 确定 button to close the popover cleanly without leaving dialog CTAs covered", async () => {
    function Harness({ allowClear }: { allowClear: boolean }) {
        const [value, setValue] = useState("2026-12-20T18:00");
        return (
            <DatetimePicker24
                id="extend-deadline"
                data-testid="picker-trigger"
                value={value}
                onChange={setValue}
                allowClear={allowClear}
            />
        );
    }

    const view = render(<Harness allowClear={false} />);
    const trigger = view.getByTestId("picker-trigger");
    trigger.focus();
    fireEvent.click(trigger);

    const popover = await view.findByRole("dialog", { name: "日期与时间选择器" });
    expect(popover !== null).toBe(true);

    const confirmBtn = view.queryByRole("button", { name: "确定" });
    expect(confirmBtn !== null).toBe(true);
    expect(view.queryByRole("button", { name: "清除" }) === null).toBe(true);

    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(view.queryByRole("dialog", { name: "日期与时间选择器" }) === null).toBe(true));
    await waitFor(() => expect(document.activeElement === trigger).toBe(true));

    // Reopen with allowClear=true and confirm both 清除 and 确定 work cleanly
    cleanup();
    const clearableView = render(<Harness allowClear />);
    const clearableTrigger = clearableView.getByTestId("picker-trigger");
    fireEvent.click(clearableTrigger);
    await clearableView.findByRole("dialog", { name: "日期与时间选择器" });

    fireEvent.click(clearableView.getByRole("button", { name: "清除" }));
    expect(clearableTrigger.textContent).toContain("选择日期与时间");
    fireEvent.click(clearableView.getByRole("button", { name: "确定" }));
    await waitFor(() => expect(clearableView.queryByRole("dialog", { name: "日期与时间选择器" }) === null).toBe(true));
});
