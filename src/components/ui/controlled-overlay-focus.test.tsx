import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";
import { useControlledOverlayFocusRestore } from "./controlled-overlay-focus";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
  restoreDom = installDomGlobals().restore;
});

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
});

function OverlayHarness({ replaceTrigger }: { replaceTrigger: boolean }) {
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useControlledOverlayFocusRestore(open, triggerRef);

  return (
    <>
      {completed ? (
        <button ref={triggerRef} type="button">重新预试</button>
      ) : (
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          开始认知预试
        </button>
      )}
      {open ? (
        <div role="dialog" aria-label="认知预试">
          <button
            type="button"
            onClick={() => {
              if (replaceTrigger) setCompleted(true);
              setOpen(false);
            }}
          >
            {replaceTrigger ? "完成预试" : "关闭预览"}
          </button>
        </div>
      ) : null}
    </>
  );
}

test("a controlled overlay restores focus to its surviving opener", async () => {
  const view = render(<OverlayHarness replaceTrigger={false} />);
  const opener = view.getByRole("button", { name: "开始认知预试" });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(view.getByRole("button", { name: "关闭预览" }));

  await waitFor(() => expect(document.activeElement).toBe(opener));
});

test("a controlled overlay uses its fallback when completion replaces the opener", async () => {
  const view = render(<OverlayHarness replaceTrigger />);
  const opener = view.getByRole("button", { name: "开始认知预试" });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(view.getByRole("button", { name: "完成预试" }));

  const replacement = view.getByRole("button", { name: "重新预试" });
  await waitFor(() => expect(document.activeElement).toBe(replacement));
});
