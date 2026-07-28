import type { LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export interface WorkspaceMenuItem {
    path: string;
    label: string;
    icon: LucideIcon;
}

const DESKTOP_WORKSPACE_QUERY = "(min-width: 64rem)";

interface SidebarContentsProps {
    title: string;
    titleIcon: LucideIcon;
    items: WorkspaceMenuItem[];
    footer: ReactNode;
    onNavigate?: () => void;
}

function SidebarContents({
    title,
    titleIcon: TitleIcon,
    items,
    footer,
    onNavigate,
}: SidebarContentsProps) {
    return (
        <>
            <div className="flex h-16 items-center border-b border-border px-5">
                <div className="flex items-center gap-2.5 font-semibold">
                    <span className="rounded-xl bg-primary p-2 text-primary-foreground">
                        <TitleIcon className="h-5 w-5" />
                    </span>
                    {title}
                </div>
            </div>
            <nav aria-label={`${title}主导航`} className="flex-1 space-y-1 p-3">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === "/"}
                            onClick={onNavigate}
                            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>
            <div className="border-t border-border p-4">{footer}</div>
        </>
    );
}

export function WorkspaceSidebar({
    mobileOpen,
    onMobileOpenChange,
    ...contents
}: SidebarContentsProps & {
    mobileOpen: boolean;
    onMobileOpenChange: (open: boolean) => void;
}) {
    useEffect(() => {
        if (!mobileOpen) return;

        const desktopQuery = window.matchMedia(DESKTOP_WORKSPACE_QUERY);
        const closeDrawerOnDesktop = (
            event: MediaQueryList | MediaQueryListEvent,
        ) => {
            if (event.matches) {
                onMobileOpenChange(false);
            }
        };

        closeDrawerOnDesktop(desktopQuery);
        desktopQuery.addEventListener("change", closeDrawerOnDesktop);
        return () => {
            desktopQuery.removeEventListener("change", closeDrawerOnDesktop);
        };
    }, [mobileOpen, onMobileOpenChange]);

    return (
        <>
            <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
                <SidebarContents {...contents} />
            </aside>

            <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
                <DialogContent
                    showCloseButton
                    className="inset-y-0 left-0 top-0 h-dvh w-64 max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0 lg:hidden"
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>{contents.title}导航</DialogTitle>
                        <DialogDescription>选择要进入的工作区页面。</DialogDescription>
                    </DialogHeader>
                    <SidebarContents
                        {...contents}
                        onNavigate={() => onMobileOpenChange(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
