import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Plus, Users, Trash2, Pencil } from 'lucide-react'
import { mockClasses, mockTeachers, mockSemesters } from '@/data/mock'
import type { Class } from '@/types'
import { toast } from 'sonner'

export function ClassesPage() {
    const [classes, setClasses] = useState<Class[]>(mockClasses)
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [filterSemester, setFilterSemester] = useState<string>('all')
    const [filterTeacher, setFilterTeacher] = useState<string>('all')
    const [newClass, setNewClass] = useState({
        name: '',
        semesterId: '',
        teacherId: '',
    })
    const [editingClass, setEditingClass] = useState<Class | null>(null)
    const [deletingClass, setDeletingClass] = useState<Class | null>(null)

    const activeTeachers = mockTeachers.filter((t) => t.status === 1)

    const filteredClasses = classes.filter((c) => {
        if (filterSemester !== 'all' && c.semesterId.toString() !== filterSemester)
            return false
        if (filterTeacher !== 'all' && c.teacherId.toString() !== filterTeacher)
            return false
        return true
    })

    const handleAdd = () => {
        if (!newClass.name || !newClass.semesterId || !newClass.teacherId) return
        const semester = mockSemesters.find(
            (s) => s.id.toString() === newClass.semesterId
        )
        const teacher = mockTeachers.find(
            (t) => t.id.toString() === newClass.teacherId
        )
        const newItem: Class = {
            id: classes.length + 1,
            name: newClass.name,
            semesterId: parseInt(newClass.semesterId),
            semesterName: semester?.name || '',
            teacherId: parseInt(newClass.teacherId),
            teacherName: teacher?.name || '',
            studentCount: 0,
            createdAt: new Date().toISOString().split('T')[0],
        }
        setClasses([newItem, ...classes])
        setNewClass({ name: '', semesterId: '', teacherId: '' })
        setAddOpen(false)
        toast.success('创建成功', { description: `班级 ${newItem.name} 已创建` })
    }

    const openEdit = (cls: Class) => {
        setEditingClass({ ...cls })
        setEditOpen(true)
    }

    const handleEdit = () => {
        if (!editingClass) return
        const teacher = mockTeachers.find((t) => t.id === editingClass.teacherId)
        setClasses(
            classes.map((c) =>
                c.id === editingClass.id
                    ? { ...editingClass, teacherName: teacher?.name || editingClass.teacherName }
                    : c
            )
        )
        setEditOpen(false)
        setEditingClass(null)
        toast.success('修改成功', { description: '班级信息已更新' })
    }

    const openDelete = (cls: Class) => {
        setDeletingClass(cls)
        setDeleteOpen(true)
    }

    const handleDelete = () => {
        if (!deletingClass) return
        setClasses(classes.filter((c) => c.id !== deletingClass.id))
        toast.success('删除成功', { description: `班级 ${deletingClass.name} 已删除` })
        setDeleteOpen(false)
        setDeletingClass(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">班级管理</h1>
                    <p className="text-muted-foreground">管理系统中的班级</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            创建班级
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>创建新班级</DialogTitle>
                            <DialogDescription>为指定学期和教师创建新班级</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="className">班级名称</Label>
                                <Input
                                    id="className"
                                    placeholder="例如：统计101-D班"
                                    value={newClass.name}
                                    onChange={(e) =>
                                        setNewClass({ ...newClass, name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>学期</Label>
                                <Select
                                    value={newClass.semesterId}
                                    onValueChange={(v) =>
                                        setNewClass({ ...newClass, semesterId: v })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择学期" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mockSemesters.map((s) => (
                                            <SelectItem key={s.id} value={s.id.toString()}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>授课教师</Label>
                                <Select
                                    value={newClass.teacherId}
                                    onValueChange={(v) =>
                                        setNewClass({ ...newClass, teacherId: v })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择教师" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeTeachers.map((t) => (
                                            <SelectItem key={t.id} value={t.id.toString()}>
                                                {t.name} ({t.employeeId})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handleAdd}>创建</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑班级</DialogTitle>
                        <DialogDescription>修改班级信息</DialogDescription>
                    </DialogHeader>
                    {editingClass && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="editClassName">班级名称</Label>
                                <Input
                                    id="editClassName"
                                    value={editingClass.name}
                                    onChange={(e) =>
                                        setEditingClass({ ...editingClass, name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>学期</Label>
                                <Input value={editingClass.semesterName} disabled />
                            </div>
                            <div className="grid gap-2">
                                <Label>授课教师</Label>
                                <Select
                                    value={editingClass.teacherId.toString()}
                                    onValueChange={(v) =>
                                        setEditingClass({ ...editingClass, teacherId: parseInt(v) })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeTeachers.map((t) => (
                                            <SelectItem key={t.id} value={t.id.toString()}>
                                                {t.name} ({t.employeeId})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                        <AlertDialogTitle>删除班级</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除班级 <span className="font-medium text-foreground">{deletingClass?.name}</span> 吗？
                            {deletingClass?.studentCount ? (
                                <span className="block mt-2 text-destructive">
                                    该班级下有 {deletingClass.studentCount} 名学生，删除后相关数据将不可恢复。
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
                    <div className="flex items-center justify-between">
                        <CardTitle>班级列表</CardTitle>
                        <div className="flex gap-4">
                            <Select value={filterSemester} onValueChange={setFilterSemester}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="所有学期" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">所有学期</SelectItem>
                                    {mockSemesters.map((s) => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="所有教师" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">所有教师</SelectItem>
                                    {mockTeachers.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>班级名称</TableHead>
                                <TableHead>学期</TableHead>
                                <TableHead>授课教师</TableHead>
                                <TableHead>学生数</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClasses.map((cls) => (
                                <TableRow key={cls.id}>
                                    <TableCell className="font-medium">{cls.name}</TableCell>
                                    <TableCell>{cls.semesterName}</TableCell>
                                    <TableCell>{cls.teacherName}</TableCell>
                                    <TableCell>{cls.studentCount}</TableCell>
                                    <TableCell>{cls.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm">
                                                <Users className="mr-2 h-4 w-4" />
                                                查看学生
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEdit(cls)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openDelete(cls)}
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
