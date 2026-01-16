import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Search, MoreHorizontal, KeyRound, Ban, CheckCircle, Pencil } from 'lucide-react'
import { mockTeachers } from '@/data/mock'
import type { Teacher } from '@/types'
import { toast } from 'sonner'

export function TeachersPage() {
    const [teachers, setTeachers] = useState<Teacher[]>(mockTeachers)
    const [search, setSearch] = useState('')
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
    const [newTeacher, setNewTeacher] = useState({ employeeId: '', name: '' })

    // Alert dialog states
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [toggleStatusOpen, setToggleStatusOpen] = useState(false)
    const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)

    const filteredTeachers = teachers.filter(
        (t) =>
            t.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            t.name.toLowerCase().includes(search.toLowerCase())
    )

    const handleAdd = () => {
        if (!newTeacher.employeeId.trim() || !newTeacher.name.trim()) return
        const newItem: Teacher = {
            id: teachers.length + 1,
            employeeId: newTeacher.employeeId,
            name: newTeacher.name,
            status: 1,
            classCount: 0,
            lastLogin: '-',
            createdAt: new Date().toISOString().split('T')[0],
        }
        setTeachers([newItem, ...teachers])
        setNewTeacher({ employeeId: '', name: '' })
        setAddOpen(false)
        toast.success('添加成功', { description: `教师 ${newItem.name} 已添加` })
    }

    const handleEdit = () => {
        if (!editingTeacher) return
        setTeachers(
            teachers.map((t) =>
                t.id === editingTeacher.id ? editingTeacher : t
            )
        )
        setEditOpen(false)
        setEditingTeacher(null)
        toast.success('修改成功', { description: '教师信息已更新' })
    }

    const openEdit = (teacher: Teacher) => {
        setEditingTeacher({ ...teacher })
        setEditOpen(true)
    }

    const handleResetPassword = () => {
        if (!selectedTeacher) return
        // In real app, call API here
        toast.success('密码已重置', { description: `${selectedTeacher.name} 的密码已重置为工号` })
        setResetPasswordOpen(false)
        setSelectedTeacher(null)
    }

    const handleToggleStatus = () => {
        if (!selectedTeacher) return
        const newStatus = selectedTeacher.status === 1 ? 0 : 1
        setTeachers(
            teachers.map((t) =>
                t.id === selectedTeacher.id ? { ...t, status: newStatus } : t
            )
        )
        toast.success(
            newStatus === 1 ? '已启用' : '已停用',
            { description: `${selectedTeacher.name} 的账号已${newStatus === 1 ? '启用' : '停用'}` }
        )
        setToggleStatusOpen(false)
        setSelectedTeacher(null)
    }

    const openResetPassword = (teacher: Teacher) => {
        setSelectedTeacher(teacher)
        setResetPasswordOpen(true)
    }

    const openToggleStatus = (teacher: Teacher) => {
        setSelectedTeacher(teacher)
        setToggleStatusOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">教师管理</h1>
                    <p className="text-muted-foreground">管理系统中的教师账号</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            添加教师
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>添加新教师</DialogTitle>
                            <DialogDescription>
                                初始密码将设置为工号
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="employeeId">工号</Label>
                                <Input
                                    id="employeeId"
                                    placeholder="例如：T2024005"
                                    value={newTeacher.employeeId}
                                    onChange={(e) =>
                                        setNewTeacher({ ...newTeacher, employeeId: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input
                                    id="name"
                                    placeholder="输入教师姓名"
                                    value={newTeacher.name}
                                    onChange={(e) =>
                                        setNewTeacher({ ...newTeacher, name: e.target.value })
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
                        <DialogTitle>编辑教师</DialogTitle>
                        <DialogDescription>修改教师信息</DialogDescription>
                    </DialogHeader>
                    {editingTeacher && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>工号</Label>
                                <Input value={editingTeacher.employeeId} disabled />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="editName">姓名</Label>
                                <Input
                                    id="editName"
                                    value={editingTeacher.name}
                                    onChange={(e) =>
                                        setEditingTeacher({ ...editingTeacher, name: e.target.value })
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

            {/* Reset Password Alert */}
            <AlertDialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重置密码</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要重置 <span className="font-medium text-foreground">{selectedTeacher?.name}</span> 的密码吗？
                            新密码将被设置为工号。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetPassword}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Toggle Status Alert */}
            <AlertDialog open={toggleStatusOpen} onOpenChange={setToggleStatusOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {selectedTeacher?.status === 1 ? '停用账号' : '启用账号'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedTeacher?.status === 1 ? (
                                <>
                                    确定要停用 <span className="font-medium text-foreground">{selectedTeacher?.name}</span> 的账号吗？
                                    停用后该教师将无法登录系统。
                                </>
                            ) : (
                                <>
                                    确定要启用 <span className="font-medium text-foreground">{selectedTeacher?.name}</span> 的账号吗？
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleToggleStatus}
                            className={selectedTeacher?.status === 1 ? 'bg-destructive hover:bg-destructive/90' : ''}
                        >
                            {selectedTeacher?.status === 1 ? '停用' : '启用'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>教师列表</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索工号或姓名..."
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
                                <TableHead>工号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>班级数</TableHead>
                                <TableHead>最后登录</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTeachers.map((teacher) => (
                                <TableRow key={teacher.id}>
                                    <TableCell className="font-medium">
                                        {teacher.employeeId}
                                    </TableCell>
                                    <TableCell>{teacher.name}</TableCell>
                                    <TableCell>
                                        {teacher.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{teacher.classCount}</TableCell>
                                    <TableCell>{teacher.lastLogin}</TableCell>
                                    <TableCell>{teacher.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEdit(teacher)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    编辑
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openResetPassword(teacher)}>
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    重置密码
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => openToggleStatus(teacher)}>
                                                    {teacher.status === 1 ? (
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
