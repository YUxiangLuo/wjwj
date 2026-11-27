import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
  restoreDom = installDomGlobals().restore;
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  restoreDom?.();
  restoreDom = null;
});

test("falls back to fallbackFocusRef when original opener stays connected but becomes disabled", async () => {
  const {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
  } = await import(`./alert-dialog?disabled-opener=${crypto.randomUUID()}`);

  function DisabledOpenerHarness() {
    const [open, setOpen] = useState(false);
    const [openerDisabled, setOpenerDisabled] = useState(false);
    const fallbackRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={fallbackRef} type="button">页面主入口</button>
        <button
          type="button"
          disabled={openerDisabled}
          onClick={() => setOpen(true)}
        >
          查看已完成阶段
        </button>
        <AlertDialog open={open} onOpenChange={setOpen} fallbackFocusRef={fallbackRef}>
          <AlertDialogContent>
            <AlertDialogTitle>重置阶段？</AlertDialogTitle>
            <AlertDialogDescription>确认后该阶段将变为当前阶段。</AlertDialogDescription>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpenerDisabled(true);
                setOpen(false);
              }}
            >
              确认重置
            </AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const view = render(<DisabledOpenerHarness />);
  const fallback = view.getByRole("button", { name: "页面主入口" });
  const opener = view.getByRole("button", { name: "查看已完成阶段" });
  opener.focus();
  fireEvent.click(opener);

  const confirmBtn = await view.findByRole("button", { name: "确认重置" });
  fireEvent.click(confirmBtn);

  await waitFor(() => expect(document.activeElement === fallback).toBe(true));
});

test("Dialog -> AlertDialog handoff keeps focus inside AlertDialog and restores to fallbackFocusRef on Escape", async () => {
  const { Dialog, DialogContent, DialogTitle } = await import(`./dialog?handoff=${crypto.randomUUID()}`);
  const {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
  } = await import(`./alert-dialog?handoff=${crypto.randomUUID()}`);

  function HandoffHarness() {
    const [inspectOpen, setInspectOpen] = useState(false);
    const [reopenOpen, setReopenOpen] = useState(false);
    const stageBtnRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button ref={stageBtnRef} type="button" onClick={() => setInspectOpen(true)}>
          阶段步骤按钮
        </button>
        <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
          <DialogContent>
            <DialogTitle>只读快照</DialogTitle>
            <button
              type="button"
              onClick={() => {
                setInspectOpen(false);
                setReopenOpen(true);
              }}
            >
              重新编辑此阶段
            </button>
          </DialogContent>
        </Dialog>
        <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen} fallbackFocusRef={stageBtnRef}>
          <AlertDialogContent>
            <AlertDialogTitle>确认重开？</AlertDialogTitle>
            <AlertDialogDescription>重开将清理后续阶段。</AlertDialogDescription>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const view = render(<HandoffHarness />);
  const stageBtn = view.getByRole("button", { name: "阶段步骤按钮" });
  stageBtn.focus();
  fireEvent.click(stageBtn);

  const reopenTrigger = await view.findByRole("button", { name: "重新编辑此阶段" });
  reopenTrigger.focus();
  fireEvent.click(reopenTrigger);

  const cancelBtn = await view.findByRole("button", { name: "取消" });
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  expect(document.activeElement === cancelBtn).toBe(true);

  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(view.queryByRole("alertdialog") === null).toBe(true));
  await waitFor(() => expect(document.activeElement === stageBtn).toBe(true));
});
