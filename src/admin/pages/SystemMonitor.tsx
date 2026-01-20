import { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity, Wifi, Users, Zap, Pause, Play, RefreshCw } from "lucide-react";
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
        <Card>
            <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex items-end gap-1 mb-3">
                    <span className={`text-3xl font-bold ${color}`}>{value}</span>
                    <span className="text-sm text-muted-foreground mb-1">{unit}</span>
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
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                    <span className="text-sm text-muted-foreground">{isLive ? "实时监控中" : "监控已暂停"}</span>
                </div>
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
                    color="text-primary"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Card>
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Users className="w-4 h-4" />
                            <span className="text-sm">活跃连接数</span>
                        </div>
                        <div className="text-2xl font-bold text-foreground">{metrics.activeConnections}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">系统日志</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg text-sm">
                            <span className="text-muted-foreground font-mono text-xs">
                                {new Date(log.time).toLocaleTimeString("zh-CN")}
                            </span>
                            {getLevelBadge(log.level)}
                            <span className="text-foreground flex-1">{log.message}</span>
                            <span className="text-xs text-muted-foreground">{log.source}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
