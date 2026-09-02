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
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
                    <div>
                        <h1 className="text-section-title font-semibold">{pageTitle}</h1>
                        <p className="text-meta text-muted-foreground">{pageSubtitle}</p>
                    </div>
                    {headerActions}
                </header>
                <div id="main-content" tabIndex={-1} className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
