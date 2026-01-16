import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { AppHeader } from '@/components/app-header'

export function AdminLayout() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <AppHeader unreadCount={2} />
                <main className="flex-1 p-6">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
