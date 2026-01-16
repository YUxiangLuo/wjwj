import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { School, BookOpen, ClipboardCheck, ListTodo, Plus, ArrowRight, X, FileText, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mockDashboardStats, mockRecentActivities, mockAnnouncements } from '@/data/mock'
import { useState } from 'react'

export function DashboardPage() {
    const stats = mockDashboardStats
    const activities = mockRecentActivities
    const [announcements, setAnnouncements] = useState(mockAnnouncements.filter(a => !a.isRead))

    const dismissAnnouncement = (id: number) => {
        setAnnouncements(announcements.filter(a => a.id !== id))
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">首页概览</h1>
                <p className="text-muted-foreground">欢迎回来，张老师</p>
            </div>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">我的班级</CardTitle>
                        <School className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.classCount}</div>
                        <p className="text-xs text-muted-foreground">当前学期</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">我的课题</CardTitle>
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.topicCount}</div>
                        <p className="text-xs text-muted-foreground">已创建</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">待批改</CardTitle>
                        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{stats.pendingGrading}</div>
                        <p className="text-xs text-muted-foreground">份作业</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">进行中任务</CardTitle>
                        <ListTodo className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeTasks}</div>
                        <p className="text-xs text-muted-foreground">个任务</p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4">
                <Button asChild>
                    <Link to="/topics/create">
                        <Plus className="mr-2 h-4 w-4" />
                        创建新课题
                    </Link>
                </Button>
                <Button variant="secondary" asChild>
                    <Link to="/grading">
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        去批改
                        {stats.pendingGrading > 0 && (
                            <Badge className="ml-2 bg-orange-500">{stats.pendingGrading}</Badge>
                        )}
                    </Link>
                </Button>
            </div>

            {/* Announcement Banner */}
            {announcements.length > 0 && (
                <div className="space-y-2">
                    {announcements.map((announcement) => (
                        <div
                            key={announcement.id}
                            className="flex items-center justify-between rounded-lg border bg-blue-50 dark:bg-blue-950 p-4"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg">📢</span>
                                <div>
                                    <p className="font-medium">{announcement.title}</p>
                                    <p className="text-sm text-muted-foreground">{announcement.createdAt}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm">查看</Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => dismissAnnouncement(announcement.id)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Recent Activity */}
            <div className="grid gap-4 md:grid-cols-2">
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
                            {activities
                                .filter((a) => a.type === 'submission')
                                .slice(0, 5)
                                .map((activity) => (
                                    <div
                                        key={activity.id}
                                        className="flex items-center justify-between text-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-blue-500" />
                                            <span className="font-medium">{activity.studentName}</span>
                                            <span className="text-muted-foreground">提交了</span>
                                            <span>{activity.topicName}</span>
                                        </div>
                                        <span className="text-muted-foreground">{activity.time}</span>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>最近批改</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                            <Link to="/grading?status=graded">
                                查看全部
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {activities
                                .filter((a) => a.type === 'grading')
                                .slice(0, 5)
                                .map((activity) => (
                                    <div
                                        key={activity.id}
                                        className="flex items-center justify-between text-sm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                            <span className="text-muted-foreground">已批改</span>
                                            <span className="font-medium">{activity.studentName}</span>
                                            <span className="text-muted-foreground">的</span>
                                            <span>{activity.topicName}</span>
                                        </div>
                                        <span className="text-muted-foreground">{activity.time}</span>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
