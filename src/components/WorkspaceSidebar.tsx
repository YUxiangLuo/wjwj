import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export interface WorkspaceMenuItem {
    path: string;
    label: string;
    icon: LucideIcon;
}

interface WorkspaceSidebarProps {
    title: string;
    titleIcon: LucideIcon;
    items: WorkspaceMenuItem[];
    footer: ReactNode;
    mobileOpen?: boolean;
    onMobileOpenChange?: (open: boolean) => void;
}

export function WorkspaceSidebar({
    title,
    titleIcon: TitleIcon,
    items,
    footer,
    mobileOpen = false,
    onMobileOpenChange,
}: WorkspaceSidebarProps) {
    return (
        <>
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="关闭导航"
                    className="fixed inset-0 z-40 bg-overlay/40 lg:hidden"
                    onClick={() => onMobileOpenChange?.(false)}
                />
            )}
            <aside data-slot="workspace-sidebar" className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border bg-card transition-transform lg:static lg:z-auto lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <div className="flex items-center gap-2.5 font-semibold">
                    <span className="rounded-xl bg-primary p-2 text-primary-foreground">
                        <TitleIcon className="h-5 w-5" />
                    </span>
                    {title}
                </div>
                <button type="button" aria-label="关闭导航" className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => onMobileOpenChange?.(false)}>
                    <X className="h-4 w-4" />
                </button>
            </div>
            <nav aria-label={`${title}主导航`} className="flex-1 space-y-1 p-3">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === "/"}
                            onClick={() => onMobileOpenChange?.(false)}
                            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>
            <div className="border-t border-border p-4">{footer}</div>
        </aside>
        </>
    );
}
