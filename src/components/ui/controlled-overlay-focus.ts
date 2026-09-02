import * as React from "react";

/**
 * Radix restores focus through its Trigger. Most application overlays are
 * controlled without a Trigger, so preserve the external opener explicitly.
 */
export function useControlledOverlayFocusRestore(open: boolean | undefined) {
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
      if (opener?.isConnected) opener.focus();
      restoreFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
}
