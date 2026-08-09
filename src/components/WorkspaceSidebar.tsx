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
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
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
    );
}
