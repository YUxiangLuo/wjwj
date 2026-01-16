import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, Calendar, Clock, History, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const mockTasks = [
    {
        id: 1,
        topicName: '消费者行为调查',
        description: '研究城市地区消费者的购买行为和偏好...',
        status: 'in_progress',
        publishedAt: '2024-03-01',
        deadline: '2024-03-31',
        daysRemaining: 16,
        currentStage: 2,
    },
    {
        id: 2,
        topicName: '市场调研方法',
        description: '通过实践学习不同的抽样技术和方法...',
        status: 'not_started',
        publishedAt: '2024-03-10',
        deadline: '2024-04-15',
        daysRemaining: 31,
        currentStage: 0,
    },
    {
        id: 3,
        topicName: '医疗服务可及性调查',
        description: '研究农村社区医疗服务的可及性问题...',
        status: 'submitted',
        publishedAt: '2024-02-15',
        deadline: '2024-03-15',
        daysRemaining: 0,
        currentStage: 4,
    },
    {
        id: 4,
        topicName: '教育质量调查',
        description: '调查教育资源分配和教学质量...',
        status: 'graded',
        publishedAt: '2024-02-01',
        deadline: '2024-02-28',
        score: 87,
        currentStage: 4,
    },
]

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    not_started: { label: '未开始', color: 'text-gray-600', bgColor: 'bg-gray-100' },
    in_progress: { label: '进行中', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    submitted: { label: '已提交', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
    graded: { label: '已批改', color: 'text-green-600', bgColor: 'bg-green-100' },
    rejected: { label: '被驳回', color: 'text-red-600', bgColor: 'bg-red-100' },
}

export function TaskHallPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">任务大厅</h1>
                <p className="text-muted-foreground">查看并完成您的实验任务</p>
            </div>

            {/* Announcement Banner */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Bell className="h-5 w-5 text-blue-600" />
                        <span className="text-sm">新公告：系统将于本周日进行维护升级...</span>
                    </div>
                    <Button variant="ghost" size="sm">查看全部</Button>
                </CardContent>
            </Card>

            {/* Task Cards Grid */}
            <div className="grid gap-6 md:grid-cols-2">
                {mockTasks.map((task) => {
                    const status = statusConfig[task.status]
                    return (
                        <Card key={task.id} className="flex flex-col">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <CardTitle className="text-lg">{task.topicName}</CardTitle>
                                    <Badge className={`${status.bgColor} ${status.color}`}>
                                        {status.label}
                                    </Badge>
                                </div>
                                <CardDescription className="line-clamp-2">{task.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        <span>发布: {task.publishedAt}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        <span>截止: {task.deadline}</span>
                                    </div>
                                    {task.status === 'graded' && task.score !== undefined && (
                                        <div className="text-lg font-bold text-green-600">
                                            得分: {task.score} 分
                                        </div>
                                    )}
                                    {task.status !== 'graded' && task.daysRemaining !== undefined && task.daysRemaining > 0 && (
                                        <div className="text-sm">还剩 {task.daysRemaining} 天</div>
                                    )}
                                    {task.status === 'submitted' && (
                                        <div className="text-sm text-yellow-600">等待批改中...</div>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex gap-2 pt-0">
                                {task.status === 'not_started' && (
                                    <Button asChild className="flex-1">
                                        <Link to={`/topic/${task.id}`}>
                                            开始实验
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Link>
                                    </Button>
                                )}
                                {task.status === 'in_progress' && (
                                    <Button asChild className="flex-1">
                                        <Link to={`/topic/${task.id}`}>
                                            继续实验
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Link>
                                    </Button>
                                )}
                                {task.status === 'submitted' && (
                                    <Button variant="outline" asChild className="flex-1">
                                        <Link to={`/experiment/${task.id}/preview`}>查看提交</Link>
                                    </Button>
                                )}
                                {task.status === 'graded' && (
                                    <Button variant="outline" asChild className="flex-1">
                                        <Link to={`/topic/${task.id}/score`}>查看成绩</Link>
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon">
                                    <History className="h-4 w-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
