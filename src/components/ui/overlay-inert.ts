import * as React from "react";

let activeModalCount = 0;
let observer: MutationObserver | null = null;
const addedInert = new Set<HTMLElement>();

function synchronizeInertBackground() {
  if (typeof document === "undefined") return;
  for (const element of [...addedInert]) {
    if (element.getAttribute("aria-hidden") !== "true") {
      element.inert = false;
      element.removeAttribute("inert");
      addedInert.delete(element);
    }
  }
  if (activeModalCount < 1) return;
  for (const element of document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')) {
    if (element.inert && element.hasAttribute("inert")) continue;
    // Only inert top-level application siblings hidden by modal/menu portals,
    // never decorative SVG icons inside active controls.
    if (element.parentElement !== document.body && !element.hasAttribute("data-aria-hidden")) {
      continue;
    }
    element.inert = true;
    element.setAttribute("inert", "");
    addedInert.add(element);
  }
}

function acquireModalInert() {
  activeModalCount += 1;
  if (!observer && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    observer = new MutationObserver(synchronizeInertBackground);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "data-aria-hidden"],
    });
  }
  synchronizeInertBackground();
  queueMicrotask(synchronizeInertBackground);
  return () => {
    activeModalCount = Math.max(0, activeModalCount - 1);
    synchronizeInertBackground();
    if (activeModalCount === 0) {
      observer?.disconnect();
      observer = null;
      for (const element of addedInert) {
        element.inert = false;
        element.removeAttribute("inert");
      }
      addedInert.clear();
    }
  };
}

export function useModalBackgroundInert(open: boolean | undefined) {
  React.useEffect(() => (open ? acquireModalInert() : undefined), [open]);
}

type EscapeHandler = (event: KeyboardEvent) => void;
const escapeStack: EscapeHandler[] = [];

/**
 * Handles Escape key events dispatched directly on `document` or `document.body`
 * (e.g. when focus briefly sits on document or in synthetic tests), complementing
 * MUI Modal's internal subtree `onKeyDown` (which calls `stopPropagation()`).
 */
export function useDocumentEscapeDismiss(open: boolean | undefined, onEscape: EscapeHandler) {
  const callbackRef = React.useRef(onEscape);
  callbackRef.current = onEscape;

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const entry: EscapeHandler = (event) => callbackRef.current(event);
    escapeStack.push(entry);

    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (escapeStack.at(-1) !== entry) return;
      entry(event);
    };

    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      const index = escapeStack.lastIndexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [open]);
}
