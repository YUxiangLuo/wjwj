import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Plus, Upload, MoreHorizontal, KeyRound, Trash2 } from 'lucide-react'
import { mockStudents, mockClasses } from '@/data/mock'
import type { Student } from '@/types'
import { toast } from 'sonner'

export function StudentsPage() {
    const { classId } = useParams()
    const cls = mockClasses.find((c) => c.id === Number(classId))
    const [students, setStudents] = useState<Student[]>(mockStudents)
    const [addOpen, setAddOpen] = useState(false)
    const [importOpen, setImportOpen] = useState(false)
    const [newStudent, setNewStudent] = useState({ studentId: '', name: '' })

    // Alert states
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [removeOpen, setRemoveOpen] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

    const handleAdd = () => {
        if (!newStudent.studentId.trim() || !newStudent.name.trim()) return
        const newItem: Student = {
            id: students.length + 1,
            studentId: newStudent.studentId,
            name: newStudent.name,
            status: 1,
            lastLogin: 'Never',
            createdAt: new Date().toISOString().split('T')[0],
        }
        setStudents([newItem, ...students])
        setNewStudent({ studentId: '', name: '' })
        setAddOpen(false)
        toast.success('添加成功', { description: `学生 ${newItem.name} 已添加` })
    }

    const openResetPassword = (student: Student) => {
        setSelectedStudent(student)
        setResetPasswordOpen(true)
    }

    const handleResetPassword = () => {
        if (!selectedStudent) return
        toast.success('密码已重置', { description: `${selectedStudent.name} 的密码已重置为学号` })
        setResetPasswordOpen(false)
        setSelectedStudent(null)
    }

    const openRemove = (student: Student) => {
        setSelectedStudent(student)
        setRemoveOpen(true)
    }

    const handleRemove = () => {
        if (!selectedStudent) return
        setStudents(students.filter((s) => s.id !== selectedStudent.id))
        toast.success('移除成功', { description: `学生 ${selectedStudent.name} 已从班级移除` })
        setRemoveOpen(false)
        setSelectedStudent(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/classes">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {cls?.name} - 学生管理
                    </h1>
                    <p className="text-muted-foreground">管理班级中的学生</p>
                </div>
            </div>

            {/* Alert Dialogs */}
            <AlertDialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重置密码</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要重置 <span className="font-medium text-foreground">{selectedStudent?.name}</span> 的密码吗？
                            新密码将被设置为学号。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetPassword}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>移除学生</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要将 <span className="font-medium text-foreground">{selectedStudent?.name}</span> 从班级中移除吗？
                            该学生的作业数据将保留。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} className="bg-destructive hover:bg-destructive/90">
                            移除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>学生列表</CardTitle>
                        <div className="flex gap-2">
                            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline">
                                        <Upload className="mr-2 h-4 w-4" />
                                        批量导入
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>批量导入学生</DialogTitle>
                                        <DialogDescription>
                                            上传CSV文件批量导入学生
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <div className="mb-4">
                                            <Button variant="link" className="p-0 h-auto">
                                                下载CSV模板
                                            </Button>
                                        </div>
                                        <div className="border-2 border-dashed rounded-lg p-8 text-center">
                                            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                            <p className="text-sm text-muted-foreground">
                                                拖拽文件到此处，或点击选择文件
                                            </p>
                                            <Input type="file" accept=".csv" className="hidden" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
                                        <Button>导入</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        添加学生
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>添加新学生</DialogTitle>
                                        <DialogDescription>
                                            初始密码将设置为学号
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="studentId">学号</Label>
                                            <Input
                                                id="studentId"
                                                placeholder="例如：2024010006"
                                                value={newStudent.studentId}
                                                onChange={(e) =>
                                                    setNewStudent({ ...newStudent, studentId: e.target.value })
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">姓名</Label>
                                            <Input
                                                id="name"
                                                placeholder="输入学生姓名"
                                                value={newStudent.name}
                                                onChange={(e) =>
                                                    setNewStudent({ ...newStudent, name: e.target.value })
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
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>学号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>最后登录</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {students.map((student) => (
                                <TableRow key={student.id}>
                                    <TableCell className="font-medium">{student.studentId}</TableCell>
                                    <TableCell>{student.name}</TableCell>
                                    <TableCell>
                                        {student.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className={student.lastLogin === 'Never' ? 'text-muted-foreground' : ''}>
                                        {student.lastLogin}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openResetPassword(student)}>
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    重置密码
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => openRemove(student)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    移除
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
