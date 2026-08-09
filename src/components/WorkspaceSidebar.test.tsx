import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
let defaultMatchMedia: typeof window.matchMedia;
let WorkspaceSidebar: typeof import("./WorkspaceSidebar").WorkspaceSidebar;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    defaultMatchMedia = window.matchMedia;
    ({ WorkspaceSidebar } = await import("./WorkspaceSidebar"));
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.matchMedia = defaultMatchMedia;
    globalThis.matchMedia = defaultMatchMedia;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function installDesktopQueryController() {
    let matches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueryList = {
        get matches() {
            return matches;
        },
        media: "(min-width: 64rem)",
        onchange: null,
        addListener(listener: (event: MediaQueryListEvent) => void) {
            listeners.add(listener);
        },
        removeListener(listener: (event: MediaQueryListEvent) => void) {
            listeners.delete(listener);
        },
        addEventListener(
            _type: string,
            listener: (event: MediaQueryListEvent) => void,
        ) {
            listeners.add(listener);
        },
        removeEventListener(
            _type: string,
            listener: (event: MediaQueryListEvent) => void,
        ) {
            listeners.delete(listener);
        },
        dispatchEvent() {
            return true;
        },
    } as unknown as MediaQueryList;

    const matchMedia = (() => mediaQueryList) as typeof window.matchMedia;
    window.matchMedia = matchMedia;
    globalThis.matchMedia = matchMedia;

    return {
        switchToDesktop() {
            matches = true;
            const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
            for (const listener of listeners) {
                listener(event);
            }
        },
    };
}

test("an open mobile drawer unmounts its modal overlay at the desktop breakpoint", async () => {
    const mediaQuery = installDesktopQueryController();

    function SidebarHarness() {
        const [mobileOpen, setMobileOpen] = useState(true);
        return (
            <>
                <output data-testid="mobile-open-state">{String(mobileOpen)}</output>
                <WorkspaceSidebar
                    title="测试工作台"
                    titleIcon={LayoutDashboard}
                    items={[{ path: "/", label: "概览", icon: LayoutDashboard }]}
                    footer={<span>测试用户</span>}
                    mobileOpen={mobileOpen}
                    onMobileOpenChange={setMobileOpen}
                />
            </>
        );
    }

    const view = render(<MemoryRouter><SidebarHarness /></MemoryRouter>);
    let usesRealDialog = false;
    await waitFor(() => {
        const realOverlay = document.querySelector('[data-slot="dialog-overlay"][data-state="open"]');
        usesRealDialog = realOverlay !== null;
        const openDrawer = realOverlay
            ?? document.querySelector('[data-testid="mock-dialog-root"]');
        expect(openDrawer).not.toBeNull();
    });

    act(() => mediaQuery.switchToDesktop());

    await waitFor(() => {
        expect(view.getByTestId("mobile-open-state").textContent).toBe("false");
        if (usesRealDialog) {
            expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
        }
    });
});
