import { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity, Wifi, Users, Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { systemApi, type SystemMetrics, type SystemLog } from "../api-client";

const defaultMetrics: SystemMetrics = {
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    activeConnections: 0,
};

function MetricCard({ label, value, unit, icon: Icon, color }: {
    label: string;
    value: number;
    unit: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}) {
    return (
        <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-500">{label}</span>
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                    </div>
                </div>
                <div className="flex items-end gap-1 mb-3">
                    <span className={`text-3xl font-semibold ${color}`}>{value}</span>
                    <span className="text-sm text-slate-500 mb-1">{unit}</span>
                </div>
                <Progress value={Math.min(value, 100)} className={`h-2 ${color.replace("text-", "[&>div]:bg-")}`} />
            </CardContent>
        </Card>
    );
}

export function SystemMonitor() {
    const [metrics, setMetrics] = useState<SystemMetrics>(defaultMetrics);
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLive, setIsLive] = useState(true);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [metricsRes, logsRes] = await Promise.all([
                systemApi.getMetrics(),
                systemApi.getLogs(),
            ]);

            if (metricsRes.success && metricsRes.data) {
                setMetrics(metricsRes.data);
            }
            if (logsRes.success && logsRes.data) {
                setLogs(logsRes.data);
            }
        } catch (error) {
            console.error("Failed to fetch system data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        if (!isLive) return;
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [isLive]);

    const getLevelBadge = (level: string) => {
        switch (level) {
            case "ERROR":
                return <Badge variant="destructive">{level}</Badge>;
            case "WARN":
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{level}</Badge>;
            default:
                return <Badge variant="secondary">{level}</Badge>;
        }
    };

    const getMetricColor = (value: number, thresholds: [number, number]) => {
        if (value > thresholds[1]) return "text-destructive";
        if (value > thresholds[0]) return "text-amber-500";
        return "text-emerald-500";
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">系统监控</h2>
                    <p className="text-sm text-slate-500 mt-1">查看系统资源占用与日志动态。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span className={`w-2.5 h-2.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                        {isLive ? "实时监控中" : "监控已暂停"}
                    </div>
                    <Button variant="outline" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        刷新数据
                    </Button>
                    <Button
                        variant={isLive ? "secondary" : "default"}
                        onClick={() => setIsLive(!isLive)}
                    >
                        {isLive ? (
                            <>
                                <Pause className="w-4 h-4" />
                                暂停
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4" />
                                恢复监控
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="CPU 使用率"
                    value={metrics.cpu}
                    unit="%"
                    icon={Cpu}
                    color={getMetricColor(metrics.cpu, [60, 80])}
                />
                <MetricCard
                    label="内存使用率"
                    value={metrics.memory}
                    unit="%"
                    icon={Activity}
                    color={getMetricColor(metrics.memory, [70, 85])}
                />
                <MetricCard
                    label="磁盘使用率"
                    value={metrics.disk}
                    unit="%"
                    icon={HardDrive}
                    color={getMetricColor(metrics.disk, [75, 90])}
                />
                <MetricCard
                    label="网络带宽"
                    value={metrics.network}
                    unit="Mbps"
                    icon={Wifi}
                    color="text-blue-600"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <Users className="w-4 h-4" />
                            <span className="text-sm">活跃连接数</span>
                        </div>
                        <div className="text-2xl font-semibold text-slate-900">{metrics.activeConnections}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">系统日志</CardTitle>
                    <span className="text-xs text-slate-500">最近 {logs.length} 条</span>
                </CardHeader>
                <CardContent className="space-y-2">
                    {logs.map((log) => (
                        <div key={log.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:flex-row sm:items-start">
                            <div className="text-xs text-slate-500 font-mono sm:w-20">
                                {new Date(log.time).toLocaleTimeString("zh-CN")}
                            </div>
                            {getLevelBadge(log.level)}
                            <span className="text-slate-800 flex-1">{log.message}</span>
                            <span className="text-xs text-slate-400">{log.source}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
