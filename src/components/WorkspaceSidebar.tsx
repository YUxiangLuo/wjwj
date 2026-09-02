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
        <aside className="flex w-64 shrink-0 flex-col border-r border-navigation-border bg-navigation text-navigation-foreground">
            <div className="flex h-16 items-center border-b border-navigation-border px-5">
                <div className="flex items-center gap-2.5 text-subheading font-semibold">
                    <span className="rounded-control border border-navigation-border bg-navigation-active p-2 text-navigation-active-foreground">
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
                            className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-control px-3 py-2 text-label font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-navigation-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-navigation ${isActive ? "bg-navigation-active text-navigation-active-foreground" : "text-navigation-muted hover:bg-navigation-active hover:text-navigation-active-foreground"}`}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>
            <div className="border-t border-navigation-border p-4 text-navigation-foreground">{footer}</div>
        </aside>
    );
}
