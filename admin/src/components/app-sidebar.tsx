import {
    Calendar,
    Users,
    GraduationCap,
    UserCog,
    School,
    Activity,
    Bell,
    LayoutDashboard,
} from 'lucide-react'

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar'
import { NavLink, useLocation } from 'react-router-dom'

const menuItems = [
    { title: '系统概览', url: '/', icon: LayoutDashboard },
    { title: '学期管理', url: '/semesters', icon: Calendar },
    { title: '教师管理', url: '/teachers', icon: Users },
    { title: '助教管理', url: '/assistants', icon: UserCog },
    { title: '班级管理', url: '/classes', icon: School },
    { title: '学生管理', url: '/students', icon: GraduationCap },
    { title: '系统监控', url: '/monitoring', icon: Activity },
    { title: '公告管理', url: '/announcements', icon: Bell },
]

export function AppSidebar() {
    const location = useLocation()

    return (
        <Sidebar>
            <SidebarHeader className="border-b px-6 py-4">
                <div>
                    <h2 className="text-base font-semibold">抽样统计虚拟仿真系统</h2>
                    <p className="text-xs text-muted-foreground">管理员控制台</p>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {menuItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={location.pathname === item.url}
                                    >
                                        <NavLink to={item.url}>
                                            <item.icon className="h-4 w-4" />
                                            <span>{item.title}</span>
                                        </NavLink>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    )
}
