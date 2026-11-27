import MuiAppBar from "@mui/material/AppBar";
import MuiToolbar from "@mui/material/Toolbar";
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
            <main className="min-w-0 flex-1 bg-background">
                <MuiAppBar
                    component="header"
                    position="sticky"
                    elevation={0}
                    color="inherit"
                    className="top-0 z-30 border-b border-border bg-card text-foreground shadow-none"
                >
                    <MuiToolbar
                        disableGutters
                        className="flex h-16 min-h-16 items-center justify-between gap-4 px-6"
                    >
                        <div className="flex min-w-0 items-baseline gap-3">
                            <h1 className="truncate text-section-title font-medium tracking-normal text-foreground">
                                {pageTitle}
                            </h1>
                            <p className="truncate text-meta text-muted-foreground">{pageSubtitle}</p>
                        </div>
                        {headerActions}
                    </MuiToolbar>
                </MuiAppBar>
                <div id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-6 py-5 outline-none">
                    {children}
                </div>
            </main>
        </div>
    );
}
