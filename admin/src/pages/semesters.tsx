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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { mockSemesters } from '@/data/mock'
import type { Semester } from '@/types'

export function SemestersPage() {
    const [semesters, setSemesters] = useState<Semester[]>(mockSemesters)
    const [open, setOpen] = useState(false)
    const [newSemester, setNewSemester] = useState('')

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
        setOpen(false)
    }

    const handleSetCurrent = (id: number) => {
        setSemesters(
            semesters.map((s) => ({
                ...s,
                isCurrent: s.id === id,
            }))
        )
    }

    const handleDelete = (id: number) => {
        setSemesters(semesters.filter((s) => s.id !== id))
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">学期管理</h1>
                    <p className="text-muted-foreground">管理系统学期配置</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
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
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handleCreate}>创建</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

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
                                            <Button variant="ghost" size="icon">
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(semester.id)}
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
