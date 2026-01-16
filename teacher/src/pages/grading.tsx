import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { FileText, Clock, CheckCircle, XCircle, Edit } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mockSubmissions, mockClasses, mockTopics } from '@/data/mock'

const statusConfig = {
    0: { label: '批改草稿', icon: Edit, color: 'bg-gray-500' },
    1: { label: '待批改', icon: Clock, color: 'bg-yellow-500' },
    2: { label: '已批改', icon: CheckCircle, color: 'bg-green-500' },
    3: { label: '已驳回', icon: XCircle, color: 'bg-red-500' },
}

export function GradingPage() {
    const [filterClass, setFilterClass] = useState<string>('all')
    const [filterTopic, setFilterTopic] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<string>('1') // Default to pending

    const filteredSubmissions = mockSubmissions.filter((s) => {
        if (filterClass !== 'all' && !s.className.includes(filterClass)) return false
        if (filterTopic !== 'all' && !s.topicName.includes(filterTopic)) return false
        if (filterStatus !== 'all' && s.status.toString() !== filterStatus) return false
        return true
    })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">作业批改</h1>
                <p className="text-muted-foreground">批改学生提交的作业</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <Select value={filterClass} onValueChange={setFilterClass}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="班级" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">所有班级</SelectItem>
                        {mockClasses.map((cls) => (
                            <SelectItem key={cls.id} value={cls.name}>
                                {cls.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={filterTopic} onValueChange={setFilterTopic}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="课题" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">所有课题</SelectItem>
                        {mockTopics.map((topic) => (
                            <SelectItem key={topic.id} value={topic.name}>
                                {topic.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="1">待批改</SelectItem>
                        <SelectItem value="0">批改草稿</SelectItem>
                        <SelectItem value="2">已批改</SelectItem>
                        <SelectItem value="3">已驳回</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Submission Cards */}
            <div className="space-y-4">
                {filteredSubmissions.map((submission) => {
                    const status = statusConfig[submission.status as keyof typeof statusConfig]
                    const StatusIcon = status.icon

                    return (
                        <Card key={submission.id}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <FileText className="h-5 w-5 text-primary" />
                                        {submission.studentName} ({submission.studentId})
                                    </CardTitle>
                                    <Badge className={status.color}>
                                        <StatusIcon className="mr-1 h-3 w-3" />
                                        {status.label}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-2">
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">班级：</span>
                                        {submission.className}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">课题：</span>
                                        {submission.topicName}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">提交时间：</span>
                                        {submission.submittedAt}
                                    </div>
                                    {submission.machineScore !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">机器评分：</span>
                                            <span className="font-medium">{submission.machineScore}</span>
                                        </div>
                                    )}
                                    {submission.totalScore !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">最终得分：</span>
                                            <span className="font-medium text-green-600">{submission.totalScore}</span>
                                        </div>
                                    )}
                                </div>
                                {submission.comment && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        评语：{submission.comment}
                                    </p>
                                )}
                            </CardContent>
                            <CardFooter>
                                {submission.status === 1 ? (
                                    <Button asChild>
                                        <Link to={`/grading/${submission.id}`}>开始批改</Link>
                                    </Button>
                                ) : submission.status === 0 ? (
                                    <Button variant="secondary" asChild>
                                        <Link to={`/grading/${submission.id}`}>继续批改</Link>
                                    </Button>
                                ) : (
                                    <Button variant="outline" asChild>
                                        <Link to={`/grading/${submission.id}`}>查看详情</Link>
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>

            {filteredSubmissions.length === 0 && (
                <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">暂无作业</h3>
                    <p className="text-muted-foreground">当前筛选条件下没有作业</p>
                </div>
            )}
        </div>
    )
}
