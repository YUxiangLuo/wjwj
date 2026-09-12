import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** User-initiated section changes reveal their navigation and restore keyboard focus. */
export function useSectionNavigation<T extends string>(initial: T | (() => T), stickyHeaderSelector?: string) {
    const [section, setSection] = useState(initial);
    const navigationRef = useRef<HTMLDivElement>(null);
    const requested = useRef(false);
    const selectSection = useCallback((next: T) => {
        if (next === section) return;
        requested.current = true;
        setSection(next);
    }, [section]);

    useLayoutEffect(() => {
        if (!requested.current) return;
        requested.current = false;
        const navigation = navigationRef.current;
        const header = stickyHeaderSelector ? document.querySelector<HTMLElement>(stickyHeaderSelector) : null;
        if (navigation && header) {
            const rect = header.getBoundingClientRect();
            const style = getComputedStyle(header);
            const top = Number.parseFloat(style.top);
            // A sticky header may not be pinned yet; use its eventual viewport position.
            const bottom = style.position === "sticky" && Number.isFinite(top) ? top + rect.height : rect.bottom;
            navigation.style.scrollMarginTop = `${Math.max(0, bottom) + 16}px`;
        }
        navigation?.scrollIntoView?.({ block: "start", behavior: "instant" });
        navigation?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus({ preventScroll: true });
    }, [section, stickyHeaderSelector]);

    return [section, selectSection, navigationRef] as const;
}
