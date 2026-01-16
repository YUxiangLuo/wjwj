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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Eye, Clock, ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mockTasks, mockTopics, mockClasses } from '@/data/mock'
import type { Task } from '@/types'
import { toast } from 'sonner'

export function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>(mockTasks)
    const [publishOpen, setPublishOpen] = useState(false)
    const [filterTopic, setFilterTopic] = useState<string>('all')
    const [filterClass, setFilterClass] = useState<string>('all')

    const [newTask, setNewTask] = useState({
        topicId: '',
        classIds: [] as string[],
        openTime: '',
        deadline: '',
    })

    const publishedTopics = mockTopics.filter((t) => t.status === 1)

    const filteredTasks = tasks.filter((t) => {
        if (filterTopic !== 'all' && t.topicId.toString() !== filterTopic) return false
        if (filterClass !== 'all' && t.classId.toString() !== filterClass) return false
        return true
    })

    const handleClassToggle = (classId: string) => {
        setNewTask((prev) => ({
            ...prev,
            classIds: prev.classIds.includes(classId)
                ? prev.classIds.filter((id) => id !== classId)
                : [...prev.classIds, classId],
        }))
    }

    const handlePublish = () => {
        if (!newTask.topicId || newTask.classIds.length === 0) return
        const topic = publishedTopics.find((t) => t.id.toString() === newTask.topicId)

        newTask.classIds.forEach((classId) => {
            const cls = mockClasses.find((c) => c.id.toString() === classId)
            const newItem: Task = {
                id: tasks.length + 1,
                topicId: Number(newTask.topicId),
                topicName: topic?.name || '',
                classId: Number(classId),
                className: cls?.name || '',
                openTime: newTask.openTime || null,
                deadline: newTask.deadline || null,
                totalStudents: cls?.studentCount || 0,
                completedStudents: 0,
                pendingGrading: 0,
            }
            setTasks((prev) => [newItem, ...prev])
        })

        toast.success('发布成功', { description: `任务已发布到 ${newTask.classIds.length} 个班级` })
        setNewTask({ topicId: '', classIds: [], openTime: '', deadline: '' })
        setPublishOpen(false)
    }

    const getProgressPercentage = (task: Task) => {
        return Math.round((task.completedStudents / task.totalStudents) * 100)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">任务管理</h1>
                    <p className="text-muted-foreground">管理课题任务发布</p>
                </div>
                <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            发布任务
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>发布新任务</DialogTitle>
                            <DialogDescription>选择课题和班级发布任务</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>选择课题</Label>
                                <Select
                                    value={newTask.topicId}
                                    onValueChange={(v) => setNewTask({ ...newTask, topicId: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择已发布的课题" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {publishedTopics.map((topic) => (
                                            <SelectItem key={topic.id} value={topic.id.toString()}>
                                                {topic.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>选择班级</Label>
                                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-auto">
                                    {mockClasses.map((cls) => (
                                        <div key={cls.id} className="flex items-center gap-2">
                                            <Checkbox
                                                id={`class-${cls.id}`}
                                                checked={newTask.classIds.includes(cls.id.toString())}
                                                onCheckedChange={() => handleClassToggle(cls.id.toString())}
                                            />
                                            <label htmlFor={`class-${cls.id}`} className="text-sm cursor-pointer">
                                                {cls.name} ({cls.studentCount}人)
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="openTime">开放时间（可选）</Label>
                                <Input
                                    id="openTime"
                                    type="datetime-local"
                                    value={newTask.openTime}
                                    onChange={(e) => setNewTask({ ...newTask, openTime: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="deadline">截止时间（可选）</Label>
                                <Input
                                    id="deadline"
                                    type="datetime-local"
                                    value={newTask.deadline}
                                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setPublishOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handlePublish}>发布</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <Select value={filterTopic} onValueChange={setFilterTopic}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="筛选课题" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">所有课题</SelectItem>
                        {mockTopics.map((topic) => (
                            <SelectItem key={topic.id} value={topic.id.toString()}>
                                {topic.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={filterClass} onValueChange={setFilterClass}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="筛选班级" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">所有班级</SelectItem>
                        {mockClasses.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id.toString()}>
                                {cls.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>任务列表</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>课题</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>开放时间</TableHead>
                                <TableHead>截止时间</TableHead>
                                <TableHead>进度</TableHead>
                                <TableHead>待批改</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTasks.map((task) => (
                                <TableRow key={task.id}>
                                    <TableCell className="font-medium">{task.topicName}</TableCell>
                                    <TableCell>{task.className}</TableCell>
                                    <TableCell>
                                        {task.openTime || <span className="text-muted-foreground">立即</span>}
                                    </TableCell>
                                    <TableCell>
                                        {task.deadline || <span className="text-muted-foreground">无</span>}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{ width: `${getProgressPercentage(task)}%` }}
                                                />
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                                {task.completedStudents}/{task.totalStudents}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {task.pendingGrading > 0 ? (
                                            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                                                {task.pendingGrading}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">0</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link to={`/tasks/${task.id}/progress`}>
                                                    <Eye className="mr-1 h-4 w-4" />
                                                    进度
                                                </Link>
                                            </Button>
                                            <Button variant="outline" size="sm">
                                                <Clock className="mr-1 h-4 w-4" />
                                                延期
                                            </Button>
                                            <Button variant="outline" size="sm" asChild>
                                                <Link to={`/grading?task=${task.id}`}>
                                                    <ClipboardCheck className="mr-1 h-4 w-4" />
                                                    批改
                                                </Link>
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
