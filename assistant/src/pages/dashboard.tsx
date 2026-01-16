import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { School, ClipboardCheck, ArrowRight, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'

const recentSubmissions = [
    { id: 1, studentName: '王小明', studentId: '2024010001', topicName: '消费者行为调查', time: '2小时前' },
    { id: 2, studentName: '李华', studentId: '2024010002', topicName: '消费者行为调查', time: '5小时前' },
    { id: 3, studentName: '张伟', studentId: '2024010003', topicName: '市场调研方法', time: '昨天' },
]

export function DashboardPage() {
    const stats = {
        classCount: 3,
        pendingGrading: 12,
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">首页概览</h1>
                <p className="text-muted-foreground">欢迎回来，王芳</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">我的班级</CardTitle>
                        <School className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.classCount}</div>
                        <p className="text-xs text-muted-foreground">分配给您的班级</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">待批改</CardTitle>
                        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{stats.pendingGrading}</div>
                        <p className="text-xs text-muted-foreground">等待批改的作业</p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>快捷操作</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <Button asChild>
                        <Link to="/grading">
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            开始批改 ({stats.pendingGrading})
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link to="/classes">
                            <School className="mr-2 h-4 w-4" />
                            查看班级
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            {/* Announcement Banner */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Bell className="h-5 w-5 text-blue-600" />
                        <span className="text-sm">新公告：系统将于本周日进行维护升级...</span>
                    </div>
                    <Button variant="ghost" size="sm">查看</Button>
                </CardContent>
            </Card>

            {/* Recent Submissions */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>最近提交</CardTitle>
                    <Button variant="ghost" size="sm" asChild>
                        <Link to="/grading">
                            查看全部
                            <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {recentSubmissions.map((submission) => (
                            <div key={submission.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                <div>
                                    <p className="font-medium">{submission.studentName} ({submission.studentId})</p>
                                    <p className="text-sm text-muted-foreground">{submission.topicName}</p>
                                </div>
                                <span className="text-sm text-muted-foreground">{submission.time}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
