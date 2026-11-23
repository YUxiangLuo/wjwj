import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/SkipLink";
import { WorkspaceSidebar, type WorkspaceMenuItem } from "@/components/WorkspaceSidebar";

export interface WorkspaceShellProps {
    sidebarTitle: string;
    sidebarIcon: LucideIcon;
    menuItems: WorkspaceMenuItem[];
    sidebarFooter: ReactNode;
    pageTitle: string;
    pageSubtitle: string;
    headerActions: ReactNode;
    children: ReactNode;
}

export function WorkspaceShell({
    sidebarTitle,
    sidebarIcon,
    menuItems,
    sidebarFooter,
    pageTitle,
    pageSubtitle,
    headerActions,
    children,
}: WorkspaceShellProps) {
    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <SkipLink />
            <WorkspaceSidebar
                title={sidebarTitle}
                titleIcon={sidebarIcon}
                items={menuItems}
                footer={sidebarFooter}
            />
            <main className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-7">
                    <div className="flex min-w-0 items-baseline gap-3">
                        <h1 className="truncate text-section-title font-bold tracking-tight text-foreground">{pageTitle}</h1>
                        <span aria-hidden="true" className="shrink-0 text-border">|</span>
                        <p className="truncate text-meta font-medium text-muted-foreground">{pageSubtitle}</p>
                    </div>
                    {headerActions}
                </header>
                <div id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-7 py-6 outline-none">
                    {children}
                </div>
            </main>
        </div>
    );
}
