import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, MoreHorizontal, KeyRound, Ban, CheckCircle, Trash2 } from 'lucide-react'
import { mockAssistants } from '@/data/mock'
import type { Assistant } from '@/types'
import { toast } from 'sonner'

type AlertType = 'resetPassword' | 'toggleStatus' | 'delete' | null

export function AssistantsPage() {
    const [assistants, setAssistants] = useState<Assistant[]>(mockAssistants)
    const [search, setSearch] = useState('')
    const [alertType, setAlertType] = useState<AlertType>(null)
    const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)

    const filteredAssistants = assistants.filter(
        (a) =>
            a.account.toLowerCase().includes(search.toLowerCase()) ||
            a.name.toLowerCase().includes(search.toLowerCase())
    )

    const openAlert = (type: AlertType, assistant: Assistant) => {
        setSelectedAssistant(assistant)
        setAlertType(type)
    }

    const closeAlert = () => {
        setAlertType(null)
        setSelectedAssistant(null)
    }

    const handleResetPassword = () => {
        if (!selectedAssistant) return
        toast.success('密码已重置', { description: `${selectedAssistant.name} 的密码已重置` })
        closeAlert()
    }

    const handleToggleStatus = () => {
        if (!selectedAssistant) return
        const newStatus = selectedAssistant.status === 1 ? 0 : 1
        setAssistants(
            assistants.map((a) =>
                a.id === selectedAssistant.id ? { ...a, status: newStatus } : a
            )
        )
        toast.success(
            newStatus === 1 ? '已启用' : '已停用',
            { description: `${selectedAssistant.name} 的账号已${newStatus === 1 ? '启用' : '停用'}` }
        )
        closeAlert()
    }

    const handleDelete = () => {
        if (!selectedAssistant) return
        setAssistants(assistants.filter((a) => a.id !== selectedAssistant.id))
        toast.success('删除成功', { description: `助教 ${selectedAssistant.name} 已删除` })
        closeAlert()
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">助教管理</h1>
                <p className="text-muted-foreground">
                    助教由教师创建，管理员可以管理现有账号
                </p>
            </div>

            {/* Reset Password Alert */}
            <AlertDialog open={alertType === 'resetPassword'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重置密码</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要重置 <span className="font-medium text-foreground">{selectedAssistant?.name}</span> 的密码吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetPassword}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Toggle Status Alert */}
            <AlertDialog open={alertType === 'toggleStatus'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {selectedAssistant?.status === 1 ? '停用账号' : '启用账号'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedAssistant?.status === 1 ? (
                                <>
                                    确定要停用 <span className="font-medium text-foreground">{selectedAssistant?.name}</span> 的账号吗？
                                    停用后该助教将无法登录系统。
                                </>
                            ) : (
                                <>
                                    确定要启用 <span className="font-medium text-foreground">{selectedAssistant?.name}</span> 的账号吗？
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleToggleStatus}
                            className={selectedAssistant?.status === 1 ? 'bg-destructive hover:bg-destructive/90' : ''}
                        >
                            {selectedAssistant?.status === 1 ? '停用' : '启用'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Alert */}
            <AlertDialog open={alertType === 'delete'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除助教</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除助教 <span className="font-medium text-foreground">{selectedAssistant?.name}</span> 吗？
                            此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>助教列表</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索账号或姓名..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>账号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>创建者</TableHead>
                                <TableHead>绑定班级</TableHead>
                                <TableHead>最后登录</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAssistants.map((assistant) => (
                                <TableRow key={assistant.id}>
                                    <TableCell className="font-medium">
                                        {assistant.account}
                                    </TableCell>
                                    <TableCell>{assistant.name}</TableCell>
                                    <TableCell>
                                        {assistant.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{assistant.creatorName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {assistant.classNames.map((c) => (
                                                <Badge key={c} variant="outline" className="text-xs">
                                                    {c}
                                                </Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>{assistant.lastLogin}</TableCell>
                                    <TableCell>{assistant.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openAlert('resetPassword', assistant)}>
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    重置密码
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openAlert('toggleStatus', assistant)}>
                                                    {assistant.status === 1 ? (
                                                        <>
                                                            <Ban className="mr-2 h-4 w-4" />
                                                            停用账号
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle className="mr-2 h-4 w-4" />
                                                            启用账号
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => openAlert('delete', assistant)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    删除
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
