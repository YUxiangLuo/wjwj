import type { LucideIcon } from "lucide-react";
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
}

export function WorkspaceSidebar({
    title,
    titleIcon: TitleIcon,
    items,
    footer,
}: WorkspaceSidebarProps) {
    return (
        <aside className="w-60 shrink-0 border-r border-navigation-border bg-navigation text-navigation-foreground">
            <div className="sticky top-0 flex h-dvh flex-col overflow-hidden">
                <div className="flex h-16 shrink-0 items-center border-b border-navigation-border px-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-navigation-border bg-navigation-active text-navigation-active-foreground">
                            <TitleIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <span className="block truncate text-subheading font-semibold leading-tight text-navigation-foreground">{title}</span>
                            <span className="block truncate text-meta text-navigation-muted">商务统计虚拟仿真系统</span>
                        </div>
                    </div>
                </div>
                <div className="px-4 pt-4 pb-1.5">
                    <span className="text-meta font-semibold tracking-wider text-navigation-muted">工作台导航</span>
                </div>
                <nav aria-label={`${title}主导航`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
                    {items.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.path === "/"}
                                className="workspace-nav-link"
                            >
                                <Icon className="pointer-events-none h-4 w-4 shrink-0" />
                                <span className="pointer-events-none truncate">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>
                <div className="shrink-0 border-t border-navigation-border bg-navigation-hover px-4 py-3 text-navigation-foreground">
                    {footer}
                </div>
            </div>
        </aside>
    );
}
