import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Users, CheckCircle, Clock, AlertCircle, Eye } from 'lucide-react'
import { mockTasks } from '@/data/mock'

const mockStudentProgress = [
    { id: 1, studentId: '2024010001', name: '王小明', status: 'submitted', currentStage: '-', lastActivity: '2024-03-15 14:30' },
    { id: 2, studentId: '2024010002', name: '李华', status: 'in_progress', currentStage: '阶段3', lastActivity: '2024-03-15 10:20' },
    { id: 3, studentId: '2024010003', name: '张伟', status: 'not_started', currentStage: '-', lastActivity: '-' },
    { id: 4, studentId: '2024010004', name: '刘芳', status: 'graded', currentStage: '-', lastActivity: '2024-03-14 16:45' },
    { id: 5, studentId: '2024010005', name: '陈静', status: 'in_progress', currentStage: '阶段2', lastActivity: '2024-03-15 09:00' },
    { id: 6, studentId: '2024010006', name: '赵强', status: 'in_progress', currentStage: '阶段4', lastActivity: '2024-03-15 11:30' },
    { id: 7, studentId: '2024010007', name: '孙丽', status: 'submitted', currentStage: '-', lastActivity: '2024-03-14 15:20' },
    { id: 8, studentId: '2024010008', name: '周明', status: 'rejected', currentStage: '-', lastActivity: '2024-03-13 10:00' },
]

const stageStats = [
    { stage: '阶段1：问卷设计', completed: 35, color: 'bg-blue-500' },
    { stage: '阶段2：样本量规划', completed: 30, color: 'bg-green-500' },
    { stage: '阶段3：抽样执行', completed: 25, color: 'bg-yellow-500' },
    { stage: '阶段4：分析报告', completed: 20, color: 'bg-purple-500' },
]

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    not_started: { label: '未开始', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
    in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: Clock },
    submitted: { label: '已提交', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    graded: { label: '已批改', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    rejected: { label: '被驳回', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

export function TaskProgressPage() {
    const { taskId } = useParams()
    const task = mockTasks.find((t) => t.id === Number(taskId)) || mockTasks[0]
    const totalStudents = task.totalStudents
    const completed = mockStudentProgress.filter((s) => s.status === 'graded').length
    const inProgress = mockStudentProgress.filter((s) => s.status === 'in_progress' || s.status === 'submitted').length
    const notStarted = mockStudentProgress.filter((s) => s.status === 'not_started').length
    const progressPercent = Math.round((completed / totalStudents) * 100)

    const deadline = task.deadline ? new Date(task.deadline.replace(' ', 'T')) : null
    const daysRemaining = deadline ? Math.ceil((deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild><Link to="/tasks"><ArrowLeft className="h-5 w-5" /></Link></Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight">任务进度监控</h1>
                    <p className="text-muted-foreground">{task.topicName} - {task.className}</p>
                </div>
                {daysRemaining !== null && <Badge variant={daysRemaining <= 3 ? 'destructive' : 'secondary'}>{daysRemaining > 0 ? `还剩 ${daysRemaining} 天` : '已截止'}</Badge>}
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="p-3 rounded-full bg-primary/10"><Users className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">总人数</p><p className="text-2xl font-bold">{totalStudents}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="p-3 rounded-full bg-green-100"><CheckCircle className="h-6 w-6 text-green-600" /></div><div><p className="text-sm text-muted-foreground">已完成</p><p className="text-2xl font-bold text-green-600">{completed}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="p-3 rounded-full bg-blue-100"><Clock className="h-6 w-6 text-blue-600" /></div><div><p className="text-sm text-muted-foreground">进行中</p><p className="text-2xl font-bold text-blue-600">{inProgress}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="p-3 rounded-full bg-gray-100"><AlertCircle className="h-6 w-6 text-gray-600" /></div><div><p className="text-sm text-muted-foreground">未开始</p><p className="text-2xl font-bold text-gray-600">{notStarted}</p></div></div></CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle>整体进度</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">完成率</span><span className="font-medium">{progressPercent}%</span></div>
                        <Progress value={progressPercent} className="h-3" />
                        <div className="flex justify-between text-xs text-muted-foreground"><span>截止时间: {task.deadline || '无'}</span><span>{completed}/{totalStudents} 人已完成</span></div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>阶段完成统计</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        {stageStats.map((stage) => (
                            <div key={stage.stage} className="space-y-2">
                                <div className="flex justify-between text-sm"><span className="text-muted-foreground line-clamp-1">{stage.stage}</span><span className="font-medium">{stage.completed}人</span></div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full ${stage.color}`} style={{ width: `${(stage.completed / totalStudents) * 100}%` }} /></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>学生进度详情</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead>状态</TableHead><TableHead>当前阶段</TableHead><TableHead>最后活动时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {mockStudentProgress.map((student) => {
                                const status = statusConfig[student.status]
                                const StatusIcon = status.icon
                                return (
                                    <TableRow key={student.id}>
                                        <TableCell className="font-mono">{student.studentId}</TableCell>
                                        <TableCell className="font-medium">{student.name}</TableCell>
                                        <TableCell><Badge className={status.color}><StatusIcon className="mr-1 h-3 w-3" />{status.label}</Badge></TableCell>
                                        <TableCell>{student.currentStage}</TableCell>
                                        <TableCell className="text-muted-foreground">{student.lastActivity}</TableCell>
                                        <TableCell className="text-right"><Button variant="ghost" size="sm"><Eye className="mr-1 h-4 w-4" />查看</Button></TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
