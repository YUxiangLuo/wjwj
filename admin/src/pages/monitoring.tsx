import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { mockSystemMetrics, mockAlerts, mockDashboardStats } from '@/data/mock'

function MetricCard({
    label,
    value,
    unit,
}: {
    label: string
    value: number
    unit: string
}) {
    const status = value < 70 ? 'normal' : value < 85 ? 'warning' : 'critical'
    const statusColors = {
        normal: 'bg-green-500',
        warning: 'bg-yellow-500',
        critical: 'bg-red-500',
    }
    const statusLabels = {
        normal: '正常',
        warning: '警告',
        critical: '严重',
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-3xl font-bold">
                            {value}
                            <span className="text-lg text-muted-foreground">{unit}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            <div className={`h-2 w-2 rounded-full ${statusColors[status]}`} />
                            <span className="text-sm text-muted-foreground">
                                {statusLabels[status]}
                            </span>
                        </div>
                    </div>
                    <div className="h-16 w-24">
                        {/* Placeholder for trend chart */}
                        <div className="h-full w-full bg-muted/50 rounded flex items-center justify-center text-xs text-muted-foreground">
                            趋势图
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function StatCard({
    label,
    value,
    subtext,
}: {
    label: string
    value: string | number
    subtext?: string
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{value}</div>
                {subtext && (
                    <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
                )}
            </CardContent>
        </Card>
    )
}

export function MonitoringPage() {
    const metrics = mockSystemMetrics
    const alerts = mockAlerts
    const stats = mockDashboardStats

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">系统监控</h1>
                    <p className="text-muted-foreground">
                        最后更新: {new Date().toLocaleString('zh-CN')}
                    </p>
                </div>
                <Button variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    刷新
                </Button>
            </div>

            {/* System Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
                <MetricCard label="CPU 使用率" value={metrics.cpu} unit="%" />
                <MetricCard label="内存使用率" value={metrics.memory} unit="%" />
                <MetricCard label="磁盘使用率" value={metrics.disk} unit="%" />
            </div>

            {/* Application Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    label="在线用户"
                    value={stats.todayActiveUsers}
                    subtext="当前活跃"
                />
                <StatCard
                    label="今日登录"
                    value={stats.todayLogins}
                    subtext="次"
                />
                <StatCard
                    label="API 请求"
                    value="12,456"
                    subtext="今日总数"
                />
            </div>

            {/* Historical Chart Placeholder */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>历史趋势</CardTitle>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm">1小时</Button>
                        <Button variant="outline" size="sm">24小时</Button>
                        <Button variant="secondary" size="sm">7天</Button>
                        <Button variant="outline" size="sm">30天</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-64 bg-muted/50 rounded flex items-center justify-center text-muted-foreground">
                        历史趋势图表（需要图表库如 Recharts）
                    </div>
                </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>系统告警</CardTitle>
                    {alerts.length > 0 && (
                        <Button variant="outline" size="sm">
                            全部清除
                        </Button>
                    )}
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
                                        <AlertTriangle
                                            className={`h-4 w-4 ${alert.level === 'critical'
                                                ? 'text-red-500'
                                                : 'text-yellow-500'
                                                }`}
                                        />
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
