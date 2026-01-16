import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { mockSystemMetrics, mockAlerts, mockDashboardStats } from '@/data/mock'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts'
import { toast } from 'sonner'

// Generate mock historical data
const generateHistoricalData = (hours: number) => {
    const data = []
    const now = new Date()
    for (let i = hours; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000)
        data.push({
            time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            cpu: Math.floor(30 + Math.random() * 40),
            memory: Math.floor(50 + Math.random() * 30),
            disk: Math.floor(70 + Math.random() * 15),
        })
    }
    return data
}

const historicalData = {
    '1h': generateHistoricalData(1),
    '24h': generateHistoricalData(24),
    '7d': generateHistoricalData(24 * 7),
    '30d': generateHistoricalData(24 * 30),
}

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
    const [selectedRange, setSelectedRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
    const metrics = mockSystemMetrics
    const alerts = mockAlerts
    const stats = mockDashboardStats

    const handleRefresh = () => {
        toast.success('已刷新', { description: '监控数据已更新' })
    }

    const chartData = historicalData[selectedRange]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">系统监控</h1>
                    <p className="text-muted-foreground">
                        最后更新: {new Date().toLocaleString('zh-CN')}
                    </p>
                </div>
                <Button variant="outline" onClick={handleRefresh}>
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

            {/* Historical Chart */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>历史趋势</CardTitle>
                    <div className="flex gap-2">
                        {(['1h', '24h', '7d', '30d'] as const).map((range) => (
                            <Button
                                key={range}
                                variant={selectedRange === range ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={() => setSelectedRange(range)}
                            >
                                {range === '1h' ? '1小时' : range === '24h' ? '24小时' : range === '7d' ? '7天' : '30天'}
                            </Button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="time"
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={selectedRange === '1h' ? 0 : selectedRange === '24h' ? 3 : 'preserveStartEnd'}
                                />
                                <YAxis
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px',
                                    }}
                                    formatter={(value) => [`${value}%`]}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="cpu"
                                    name="CPU"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="memory"
                                    name="内存"
                                    stroke="#22c55e"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="disk"
                                    name="磁盘"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
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
