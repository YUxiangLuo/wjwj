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

test("open Select content makes the modal-hidden application background inert", async () => {
  const {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } = await import(`./select?inert=${crypto.randomUUID()}`);

  function ControlledSelect() {
    const [open, setOpen] = useState(true);
    return (
      <div data-testid="application">
        <button type="button">背景操作</button>
        <Select open={open} onOpenChange={setOpen} defaultValue="all">
          <SelectTrigger aria-label="筛选状态">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="active">进行中</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  const view = render(<ControlledSelect />);
  const application = view.getByTestId("application");
  await view.findByRole("listbox");
  const applicationBackground = application.closest<HTMLElement>('[aria-hidden="true"]');
  expect(applicationBackground).not.toBeNull();
  await waitFor(() => expect(applicationBackground?.inert).toBe(true));

  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(view.queryByRole("listbox")).toBeNull());
  await waitFor(() => expect(applicationBackground?.inert).toBe(false));
  view.unmount();
});

test("SelectValue applies single-line ellipsis truncation without SelectTrigger flex/line-clamp conflict", async () => {
  const {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } = await import(`./select?ellipsis=${crypto.randomUUID()}`);

  const view = render(
    <Select defaultValue="prior">
      <SelectTrigger aria-label="选择方差来源" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="prior">行业经验先验标准差 σ₀（真实试投常用）</SelectItem>
      </SelectContent>
    </Select>,
  );

  const trigger = view.getByRole("combobox", { name: "选择方差来源" });
  const valueSlot = trigger.querySelector<HTMLElement>('[data-slot="select-value"]');
  expect(valueSlot).not.toBeNull();
  expect(valueSlot?.classList.contains("min-w-0")).toBe(true);
  expect(valueSlot?.classList.contains("flex-1")).toBe(true);
  expect(valueSlot?.classList.contains("truncate")).toBe(true);
  expect(valueSlot?.classList.contains("text-left")).toBe(true);
  expect(trigger.className).not.toContain("*:data-[slot=select-value]:line-clamp-1");
  expect(trigger.className).not.toContain("*:data-[slot=select-value]:flex");
  view.unmount();
});
