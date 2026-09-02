import * as React from "react";

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
      const target = opener?.isConnected ? opener : fallbackFocusRef?.current;
      if (target?.isConnected) target.focus();
      restoreFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [fallbackFocusRef, open]);
}
