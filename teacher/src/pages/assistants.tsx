import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
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
import { Plus, MoreHorizontal, Pencil, Link2, KeyRound, Ban, CheckCircle, Trash2 } from 'lucide-react'
import { mockAssistants, mockClasses } from '@/data/mock'
import type { Assistant } from '@/types'
import { toast } from 'sonner'

type AlertType = 'resetPassword' | 'toggleStatus' | 'delete' | null

export function AssistantsPage() {
    const [assistants, setAssistants] = useState<Assistant[]>(mockAssistants)
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [bindOpen, setBindOpen] = useState(false)
    const [alertType, setAlertType] = useState<AlertType>(null)
    const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)
    const [newAssistant, setNewAssistant] = useState({ account: '', name: '' })
    const [selectedClasses, setSelectedClasses] = useState<string[]>([])

    const handleAdd = () => {
        if (!newAssistant.account.trim() || !newAssistant.name.trim()) return
        const newItem: Assistant = {
            id: assistants.length + 1,
            account: newAssistant.account,
            name: newAssistant.name,
            status: 1,
            classNames: [],
            createdAt: new Date().toISOString().split('T')[0],
        }
        setAssistants([newItem, ...assistants])
        setNewAssistant({ account: '', name: '' })
        setAddOpen(false)
        toast.success('添加成功', { description: `助教 ${newItem.name} 已添加` })
    }

    const openEdit = (assistant: Assistant) => {
        setSelectedAssistant({ ...assistant })
        setEditOpen(true)
    }

    const handleEdit = () => {
        if (!selectedAssistant) return
        setAssistants(
            assistants.map((a) =>
                a.id === selectedAssistant.id ? selectedAssistant : a
            )
        )
        setEditOpen(false)
        toast.success('修改成功', { description: '助教信息已更新' })
    }

    const openBind = (assistant: Assistant) => {
        setSelectedAssistant(assistant)
        setSelectedClasses(assistant.classNames)
        setBindOpen(true)
    }

    const handleBind = () => {
        if (!selectedAssistant) return
        setAssistants(
            assistants.map((a) =>
                a.id === selectedAssistant.id ? { ...a, classNames: selectedClasses } : a
            )
        )
        setBindOpen(false)
        toast.success('绑定成功', { description: '班级分配已更新' })
    }

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
        toast.success('密码已重置', { description: `${selectedAssistant.name} 的密码已重置为账号` })
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
        toast.success(newStatus === 1 ? '已启用' : '已停用', {
            description: `${selectedAssistant.name} 的账号已${newStatus === 1 ? '启用' : '停用'}`,
        })
        closeAlert()
    }

    const handleDelete = () => {
        if (!selectedAssistant) return
        setAssistants(assistants.filter((a) => a.id !== selectedAssistant.id))
        toast.success('删除成功', { description: `助教 ${selectedAssistant.name} 已删除` })
        closeAlert()
    }

    const toggleClass = (className: string) => {
        setSelectedClasses((prev) =>
            prev.includes(className)
                ? prev.filter((c) => c !== className)
                : [...prev, className]
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">助教管理</h1>
                    <p className="text-muted-foreground">管理您的教学助手</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            添加助教
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>添加助教</DialogTitle>
                            <DialogDescription>初始密码将设置为账号</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="account">账号</Label>
                                <Input
                                    id="account"
                                    placeholder="例如：ta_zhang"
                                    value={newAssistant.account}
                                    onChange={(e) =>
                                        setNewAssistant({ ...newAssistant, account: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input
                                    id="name"
                                    placeholder="输入助教姓名"
                                    value={newAssistant.name}
                                    onChange={(e) =>
                                        setNewAssistant({ ...newAssistant, name: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handleAdd}>添加</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑助教</DialogTitle>
                    </DialogHeader>
                    {selectedAssistant && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>账号</Label>
                                <Input value={selectedAssistant.account} disabled />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="editName">姓名</Label>
                                <Input
                                    id="editName"
                                    value={selectedAssistant.name}
                                    onChange={(e) =>
                                        setSelectedAssistant({ ...selectedAssistant, name: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleEdit}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bind Classes Dialog */}
            <Dialog open={bindOpen} onOpenChange={setBindOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>管理班级分配</DialogTitle>
                        <DialogDescription>
                            选择 {selectedAssistant?.name} 可以管理的班级
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="space-y-3">
                            {mockClasses.map((cls) => (
                                <div key={cls.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`bind-${cls.id}`}
                                        checked={selectedClasses.includes(cls.name)}
                                        onCheckedChange={() => toggleClass(cls.name)}
                                    />
                                    <label htmlFor={`bind-${cls.id}`} className="text-sm cursor-pointer">
                                        {cls.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBindOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleBind}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Alert Dialogs */}
            <AlertDialog open={alertType === 'resetPassword'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重置密码</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要重置 {selectedAssistant?.name} 的密码吗？新密码将设置为账号。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetPassword}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={alertType === 'toggleStatus'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {selectedAssistant?.status === 1 ? '停用账号' : '启用账号'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedAssistant?.status === 1
                                ? `确定要停用 ${selectedAssistant?.name} 的账号吗？停用后将无法登录。`
                                : `确定要启用 ${selectedAssistant?.name} 的账号吗？`}
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

            <AlertDialog open={alertType === 'delete'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除助教</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除助教 {selectedAssistant?.name} 吗？此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <CardTitle>助教列表</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>账号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>绑定班级</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assistants.map((assistant) => (
                                <TableRow key={assistant.id}>
                                    <TableCell className="font-medium">{assistant.account}</TableCell>
                                    <TableCell>{assistant.name}</TableCell>
                                    <TableCell>
                                        {assistant.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {assistant.classNames.length > 0 ? (
                                                assistant.classNames.map((c) => (
                                                    <Badge key={c} variant="outline" className="text-xs">
                                                        {c}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-muted-foreground">未分配</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{assistant.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEdit(assistant)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    编辑
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openBind(assistant)}>
                                                    <Link2 className="mr-2 h-4 w-4" />
                                                    绑定班级
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openAlert('resetPassword', assistant)}>
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    重置密码
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => openAlert('toggleStatus', assistant)}>
                                                    {assistant.status === 1 ? (
                                                        <>
                                                            <Ban className="mr-2 h-4 w-4" />
                                                            停用
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle className="mr-2 h-4 w-4" />
                                                            启用
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
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
