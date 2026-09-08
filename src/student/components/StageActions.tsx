import type { ReactNode } from "react";

/** Keep stage actions within reach while leaving room to scroll past the content. */
export function StageActions({ children }: { children: ReactNode }) {
    return <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-4" data-testid="student-stage-actions">
        {children}
    </footer>;
}
