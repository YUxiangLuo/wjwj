import * as React from "react";

/**
 * Mirrors `aria-hidden="true"` background siblings hidden by modal/menu portals
 * onto native `inert` so background descendants cannot receive focus.
 */
export function useInertAriaHiddenBackground(content: HTMLElement | null) {
  React.useEffect(() => {
    if (!content || typeof document === "undefined") return;

    const inerted = new Set<HTMLElement>();
    const applyInert = () => {
      const hiddenElements = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]');
      for (const element of hiddenElements) {
        if (
          (element.parentElement !== document.body && !element.hasAttribute("data-aria-hidden"))
          || element.contains(content)
          || element.inert
          || inerted.has(element)
        ) {
          continue;
        }
        element.inert = true;
        element.setAttribute("inert", "");
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
        if (element.isConnected) {
          element.inert = false;
          element.removeAttribute("inert");
        }
      }
    };
  }, [content]);
}
