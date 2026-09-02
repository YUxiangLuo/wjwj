import * as React from "react";

let activeModalCount = 0;
let observer: MutationObserver | null = null;
const addedInert = new Set<HTMLElement>();

function synchronizeInertBackground() {
  if (typeof document === "undefined") return;
  for (const element of [...addedInert]) {
    if (element.getAttribute("aria-hidden") !== "true") {
      element.removeAttribute("inert");
      addedInert.delete(element);
    }
  }
  if (activeModalCount < 1) return;
  for (const element of document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')) {
    if (element.hasAttribute("inert")) continue;
    element.setAttribute("inert", "");
    addedInert.add(element);
  }
}

function acquireModalInert() {
  activeModalCount += 1;
  if (!observer && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    observer = new MutationObserver(synchronizeInertBackground);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-hidden"] });
  }
  queueMicrotask(synchronizeInertBackground);
  return () => {
    activeModalCount = Math.max(0, activeModalCount - 1);
    synchronizeInertBackground();
    if (activeModalCount === 0) {
      observer?.disconnect();
      observer = null;
      for (const element of addedInert) element.removeAttribute("inert");
      addedInert.clear();
    }
  };
}

export function useModalBackgroundInert(open: boolean | undefined) {
  React.useEffect(() => open ? acquireModalInert() : undefined, [open]);
}
