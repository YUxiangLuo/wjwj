import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Calendar,
    Users,
    GraduationCap,
    UserCog,
    Activity,
    ArrowRight,
    CheckCircle,
    AlertTriangle,
} from 'lucide-react'
import { mockDashboardStats, mockSystemMetrics, mockAlerts } from '@/data/mock'
import { Link } from 'react-router-dom'

function StatCard({
    title,
    value,
    icon: Icon,
    description,
}: {
    title: string
    value: string | number
    icon: React.ElementType
    description?: string
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </CardContent>
        </Card>
    )
}

function MetricGauge({
    label,
    value,
    color,
}: {
    label: string
    value: number
    color: string
}) {
    const status =
        value < 70 ? 'normal' : value < 85 ? 'warning' : 'critical'
    const statusColors = {
        normal: 'bg-green-500',
        warning: 'bg-yellow-500',
        critical: 'bg-red-500',
    }

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-20">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <path
                        className="text-muted stroke-current"
                        strokeWidth="3"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                        className={`${color} stroke-current`}
                        strokeWidth="3"
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${value}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{value}%</span>
                </div>
            </div>
            <div className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${statusColors[status]}`} />
                <span className="text-sm font-medium">{label}</span>
            </div>
        </div>
    )
}

export function DashboardPage() {
    const stats = mockDashboardStats
    const metrics = mockSystemMetrics
    const alerts = mockAlerts

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">系统概览</h1>
                <p className="text-muted-foreground">
                    欢迎回来，管理员！以下是系统概览。
                </p>
            </div>

            {/* Stats Cards - Row 1 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="当前学期"
                    value={stats.currentSemester}
                    icon={Calendar}
                    description="进行中"
                />
                <StatCard
                    title="教师总数"
                    value={stats.totalTeachers}
                    icon={Users}
                />
                <StatCard
                    title="班级总数"
                    value={stats.totalClasses}
                    icon={GraduationCap}
                />
                <StatCard
                    title="学生总数"
                    value={stats.totalStudents}
                    icon={GraduationCap}
                />
            </div>

            {/* Stats Cards - Row 2 */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="助教总数"
                    value={stats.totalAssistants}
                    icon={UserCog}
                />
                <StatCard
                    title="今日活跃用户"
                    value={stats.todayActiveUsers}
                    icon={Activity}
                    description="来自登录日志统计"
                />
                <StatCard
                    title="今日登录次数"
                    value={stats.todayLogins}
                    icon={Activity}
                />
            </div>

            {/* System Status */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>系统状态</CardTitle>
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/monitoring">
                            查看详情 <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-around">
                        <MetricGauge label="CPU" value={metrics.cpu} color="text-blue-500" />
                        <MetricGauge label="内存" value={metrics.memory} color="text-green-500" />
                        <MetricGauge label="磁盘" value={metrics.disk} color="text-yellow-500" />
                    </div>
                </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
                <CardHeader>
                    <CardTitle>系统告警</CardTitle>
                </CardHeader>
                <CardContent>
                    {alerts.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            <span>系统运行正常，暂无告警</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="flex items-center justify-between rounded-lg border p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                        <span>{alert.message}</span>
                                    </div>
                                    <Badge variant="outline">{alert.time}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
