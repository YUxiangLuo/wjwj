import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep stage actions within reach while leaving room to scroll past the content. */
export function StageActions({ children }: { children: ReactNode }) {
    const footerRef = useRef<HTMLElement>(null);
    const [spacerHeight, setSpacerHeight] = useState(64);

    // The footer wraps on narrow widths, so a fixed spacer can under-reserve and
    // let sticky actions cover the last content row. Mirror its real height.
    useEffect(() => {
        const footer = footerRef.current;
        if (!footer || typeof ResizeObserver === "undefined") return;
        const update = () => setSpacerHeight(Math.ceil(footer.getBoundingClientRect().height));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(footer);
        return () => observer.disconnect();
    }, []);

    return <>
        <div aria-hidden="true" style={{ height: spacerHeight }} data-testid="student-stage-actions-spacer" />
        <footer ref={footerRef} className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-4" data-testid="student-stage-actions">
            {children}
        </footer>
    </>;
}
