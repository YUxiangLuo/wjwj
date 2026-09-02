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

test("open Select content makes the Radix-hidden application background inert", async () => {
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
  const applicationBackground = application.closest<HTMLElement>(
    '[data-aria-hidden="true"][aria-hidden="true"]',
  );
  expect(applicationBackground).not.toBeNull();
  await waitFor(() => expect(applicationBackground?.inert).toBe(true));

  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(view.queryByRole("listbox")).toBeNull());
  await waitFor(() => expect(applicationBackground?.inert).toBe(false));
});
