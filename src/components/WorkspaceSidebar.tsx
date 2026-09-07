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
        <aside className="sticky top-0 flex h-dvh w-64 shrink-0 self-start flex-col overflow-hidden border-r border-navigation-border bg-navigation text-navigation-foreground">
            <div className="flex h-16 shrink-0 items-center border-b border-navigation-border px-5">
                <div className="flex items-center gap-2.5 text-subheading font-semibold">
                    <span className="rounded-control border border-navigation-border bg-navigation-active p-2 text-navigation-active-foreground">
                        <TitleIcon className="h-5 w-5" />
                    </span>
                    {title}
                </div>
            </div>
            <nav aria-label={`${title}主导航`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
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
                            <span className="pointer-events-none">{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>
            <div className="shrink-0 border-t border-navigation-border p-4 text-navigation-foreground">{footer}</div>
        </aside>
    );
}
