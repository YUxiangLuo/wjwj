import * as React from "react";

function isRestorableFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element || !element.isConnected) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  if (element.closest("[inert]")) return false;
  return true;
}

/**
 * Controlled application overlays often have no Radix Trigger, so preserve
 * their external opener explicitly. A fallback covers flows that replace the
 * original opener while the overlay is closing.
 */
export function useControlledOverlayFocusRestore(
  open: boolean | undefined,
  fallbackFocusRef?: React.RefObject<HTMLElement | null>,
) {
  const wasOpenRef = React.useRef(Boolean(open));
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  React.useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = Boolean(open);
    if (open || !wasOpen) return;

    const opener = restoreFocusRef.current;
    const frame = requestAnimationFrame(() => {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const movedIntoActiveOverlay =
        active instanceof HTMLElement
        && active !== document.body
        && active.isConnected
        && !active.closest("[inert]")
        && Boolean(active.closest('[role="dialog"], [role="alertdialog"], [role="listbox"]'));
      if (!movedIntoActiveOverlay) {
        const target = isRestorableFocusTarget(opener)
          ? opener
          : isRestorableFocusTarget(fallbackFocusRef?.current)
            ? fallbackFocusRef.current
            : null;
        if (target) target.focus();
      }
      restoreFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [fallbackFocusRef, open]);
}
