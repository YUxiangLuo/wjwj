import MuiDrawer from "@mui/material/Drawer";
import MuiList from "@mui/material/List";
import MuiListItemButton from "@mui/material/ListItemButton";
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
        <MuiDrawer
            component="aside"
            variant="permanent"
            className="w-60 shrink-0"
            slotProps={{
                paper: {
                    className:
                        "sticky top-0 z-20 flex h-dvh w-60 flex-col overflow-hidden border-r border-navigation-border bg-navigation text-navigation-foreground shadow-none",
                },
            }}
        >
            <div className="flex h-16 shrink-0 items-center px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-surface bg-navigation-active text-navigation-active-foreground">
                        <TitleIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <span className="block truncate text-subheading font-medium leading-tight text-navigation-foreground">
                            {title}
                        </span>
                        <span className="block truncate text-meta text-navigation-muted">
                            商务统计虚拟仿真系统
                        </span>
                    </div>
                </div>
            </div>
            <div className="px-5 pt-2 pb-1.5">
                <span className="text-meta font-medium text-navigation-muted">工作台导航</span>
            </div>
            <MuiList
                component="nav"
                disablePadding
                aria-label={`${title}主导航`}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
            >
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <MuiListItemButton
                            key={item.path}
                            component={NavLink}
                            to={item.path}
                            end={item.path === "/"}
                            disableRipple
                            className="workspace-nav-link"
                        >
                            <Icon className="pointer-events-none h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="pointer-events-none truncate">{item.label}</span>
                        </MuiListItemButton>
                    );
                })}
            </MuiList>
            <div className="shrink-0 border-t border-navigation-border bg-navigation px-4 py-3 text-navigation-foreground">
                {footer}
            </div>
        </MuiDrawer>
    );
}
