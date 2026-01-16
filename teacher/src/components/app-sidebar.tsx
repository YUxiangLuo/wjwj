import {
    LayoutDashboard,
    School,
    BookOpen,
    ListTodo,
    ClipboardCheck,
    Users,
    Download,
} from 'lucide-react'

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar'
import { NavLink, useLocation } from 'react-router-dom'

const menuItems = [
    { title: '首页概览', url: '/', icon: LayoutDashboard },
    { title: '班级管理', url: '/classes', icon: School },
    { title: '课题管理', url: '/topics', icon: BookOpen },
    { title: '任务管理', url: '/tasks', icon: ListTodo },
    { title: '作业批改', url: '/grading', icon: ClipboardCheck },
    { title: '助教管理', url: '/assistants', icon: Users },
    { title: '成绩导出', url: '/export', icon: Download },
]

export function AppSidebar() {
    const location = useLocation()

    return (
        <Sidebar>
            <SidebarHeader className="border-b px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">抽样统计仿真系统</span>
                        <span className="text-xs text-muted-foreground">教师端</span>
                    </div>
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
