import * as React from "react";

/**
 * Radix Select hides background siblings from the accessibility tree. Mirror
 * that state to native inert so their focusable descendants are unavailable too.
 */
export function useInertAriaHiddenBackground(content: HTMLElement | null) {
  React.useEffect(() => {
    if (!content || typeof document === "undefined") return;

    const inerted = new Set<HTMLElement>();
    const applyInert = () => {
      const hiddenElements = document.querySelectorAll<HTMLElement>(
        '[data-aria-hidden="true"][aria-hidden="true"]',
      );
      for (const element of hiddenElements) {
        if (
          element.hasAttribute("data-radix-focus-guard")
          || element.contains(content)
          || element.inert
          || inerted.has(element)
        ) continue;
        element.inert = true;
        inerted.add(element);
      }
    };

    applyInert();
    const frame = requestAnimationFrame(applyInert);
    const observer = new MutationObserver(applyInert);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-hidden", "data-aria-hidden"],
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const element of inerted) {
        if (element.isConnected) element.inert = false;
      }
    };
  }, [content]);
}
