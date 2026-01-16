import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { mockSemesters } from '@/data/mock'
import type { Semester } from '@/types'
import { toast } from 'sonner'

export function SemestersPage() {
    const [semesters, setSemesters] = useState<Semester[]>(mockSemesters)
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [newSemester, setNewSemester] = useState('')
    const [editingSemester, setEditingSemester] = useState<Semester | null>(null)
    const [deletingSemester, setDeletingSemester] = useState<Semester | null>(null)

    const handleCreate = () => {
        if (!newSemester.trim()) return
        const newItem: Semester = {
            id: semesters.length + 1,
            name: newSemester,
            isCurrent: false,
            classCount: 0,
            createdAt: new Date().toISOString().split('T')[0],
        }
        setSemesters([newItem, ...semesters])
        setNewSemester('')
        setAddOpen(false)
        toast.success('创建成功', { description: `学期 ${newItem.name} 已创建` })
    }

    const handleEdit = () => {
        if (!editingSemester) return
        setSemesters(
            semesters.map((s) =>
                s.id === editingSemester.id ? editingSemester : s
            )
        )
        setEditOpen(false)
        setEditingSemester(null)
        toast.success('修改成功', { description: '学期信息已更新' })
    }

    const openEdit = (semester: Semester) => {
        setEditingSemester({ ...semester })
        setEditOpen(true)
    }

    const handleSetCurrent = (id: number) => {
        setSemesters(
            semesters.map((s) => ({
                ...s,
                isCurrent: s.id === id,
            }))
        )
        const semester = semesters.find((s) => s.id === id)
        toast.success('设置成功', { description: `${semester?.name} 已设为当前学期` })
    }

    const openDelete = (semester: Semester) => {
        setDeletingSemester(semester)
        setDeleteOpen(true)
    }

    const handleDelete = () => {
        if (!deletingSemester) return
        setSemesters(semesters.filter((s) => s.id !== deletingSemester.id))
        toast.success('删除成功', { description: `学期 ${deletingSemester.name} 已删除` })
        setDeleteOpen(false)
        setDeletingSemester(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">学期管理</h1>
                    <p className="text-muted-foreground">管理系统学期配置</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            创建学期
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>创建新学期</DialogTitle>
                            <DialogDescription>
                                输入学期名称，格式建议：YYYY-Spring 或 YYYY-Fall
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">学期名称</Label>
                                <Input
                                    id="name"
                                    placeholder="例如：2024-Spring"
                                    value={newSemester}
                                    onChange={(e) => setNewSemester(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handleCreate}>创建</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑学期</DialogTitle>
                        <DialogDescription>修改学期名称</DialogDescription>
                    </DialogHeader>
                    {editingSemester && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="editName">学期名称</Label>
                                <Input
                                    id="editName"
                                    value={editingSemester.name}
                                    onChange={(e) =>
                                        setEditingSemester({ ...editingSemester, name: e.target.value })
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

            {/* Delete Alert */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除学期</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除学期 <span className="font-medium text-foreground">{deletingSemester?.name}</span> 吗？
                            {deletingSemester?.classCount ? (
                                <span className="block mt-2 text-destructive">
                                    该学期下有 {deletingSemester.classCount} 个班级，删除后相关数据将不可恢复。
                                </span>
                            ) : null}
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
                    <CardTitle>学期列表</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>学期名称</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>班级数</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {semesters.map((semester) => (
                                <TableRow key={semester.id}>
                                    <TableCell className="font-medium">{semester.name}</TableCell>
                                    <TableCell>
                                        {semester.isCurrent ? (
                                            <Badge className="bg-green-500">当前学期</Badge>
                                        ) : (
                                            <Badge variant="secondary">历史</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{semester.classCount}</TableCell>
                                    <TableCell>{semester.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {!semester.isCurrent && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleSetCurrent(semester.id)}
                                                >
                                                    设为当前
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEdit(semester)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openDelete(semester)}
                                                disabled={semester.isCurrent}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
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
