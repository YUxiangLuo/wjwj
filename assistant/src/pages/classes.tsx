import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { School, Eye, ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const mockAssignedClasses = [
    {
        id: 1,
        name: '统计101-A班',
        semester: '2024-Spring',
        teacherName: '张老师',
        tasks: [
            { id: 1, topicName: '消费者行为调查', deadline: '2024-03-31', progress: 32, total: 45, pending: 8 },
            { id: 2, topicName: '市场调研方法', deadline: '2024-04-15', progress: 15, total: 45, pending: 3 },
        ],
    },
    {
        id: 2,
        name: '统计101-B班',
        semester: '2024-Spring',
        teacherName: '张老师',
        tasks: [
            { id: 3, topicName: '消费者行为调查', deadline: '2024-03-31', progress: 28, total: 42, pending: 5 },
        ],
    },
    {
        id: 3,
        name: '统计102-A班',
        semester: '2024-Spring',
        teacherName: '李老师',
        tasks: [],
    },
]

export function ClassesPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">班级作业</h1>
                <p className="text-muted-foreground">查看分配给您的班级及任务进度</p>
            </div>

            <div className="space-y-4">
                {mockAssignedClasses.map((cls) => (
                    <Card key={cls.id}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <School className="h-5 w-5 text-primary" />
                                    {cls.name}
                                </CardTitle>
                                <Badge variant="secondary">{cls.semester}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">授课教师: {cls.teacherName}</p>
                        </CardHeader>
                        <CardContent>
                            {cls.tasks.length > 0 ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-medium">进行中的任务：</p>
                                    {cls.tasks.map((task) => (
                                        <div key={task.id} className="p-4 border rounded-lg space-y-3">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-medium">{task.topicName}</p>
                                                    <p className="text-sm text-muted-foreground">截止: {task.deadline}</p>
                                                </div>
                                                {task.pending > 0 && (
                                                    <Badge className="bg-orange-500">{task.pending} 待批改</Badge>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">进度</span>
                                                    <span>{task.progress}/{task.total}</span>
                                                </div>
                                                <Progress value={(task.progress / task.total) * 100} className="h-2" />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link to={`/classes/${cls.id}/progress/${task.id}`}>
                                                        <Eye className="mr-1 h-4 w-4" />
                                                        查看进度
                                                    </Link>
                                                </Button>
                                                <Button size="sm" asChild>
                                                    <Link to={`/grading?classId=${cls.id}&taskId=${task.id}`}>
                                                        <ClipboardCheck className="mr-1 h-4 w-4" />
                                                        批改
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground">
                                    暂无进行中的任务
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {mockAssignedClasses.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <School className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">暂无分配班级</h3>
                        <p className="text-muted-foreground">请联系授课教师为您分配班级</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
