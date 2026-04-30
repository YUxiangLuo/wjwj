import { useState, useEffect, useMemo, useRef } from "react";
import { Cpu, HardDrive, Activity, Wifi, Users, Pause, Play, RefreshCw, TerminalSquare, AlertTriangle, Download, LogIn } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { systemApi, type SystemMetrics, type SystemLog } from "../api-client";
import { toast } from "sonner";
import { createSingleFlight } from "../single-flight";
import { formatDateStampCN } from "@/utils/format";

const defaultMetrics: SystemMetrics = {
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    activeConnections: 0,
};

const requestMonitorSnapshot = createSingleFlight(async () => {
    const [metricsRes, logsRes] = await Promise.all([
        systemApi.getMetrics(),
        systemApi.getLogs(),
    ]);

    return { metricsRes, logsRes };
});

function MetricCard({ label, value, unit, icon: Icon, color }: {
    label: string;
    value: number;
    unit: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}) {
    return (
        <Card className="hover:border-primary/30 transition-colors">
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <div className="app-stat-icon app-stat-icon-muted">
                        <Icon className="size-5" />
                    </div>
                </div>
                <div className="flex items-end gap-1.5 mb-4">
                    <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
                    <span className="text-sm font-medium text-muted-foreground mb-1.5">{unit}</span>
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
    const isMountedRef = useRef(true);
    const lastAutoFetchAtRef = useRef(0);

    const fetchData = async () => {
        try {
            const { metricsRes, logsRes } = await requestMonitorSnapshot();
            if (!isMountedRef.current) return;

            if (metricsRes.success && metricsRes.data) {
                setMetrics(metricsRes.data);
            }
            if (logsRes.success && logsRes.data) {
                setLogs(logsRes.data);
            }
        } catch (error) {
            console.error("Failed to fetch system data:", error);
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    };

    const fetchDataForPolling = async () => {
        const now = Date.now();
        if (now - lastAutoFetchAtRef.current < 250) return;
        lastAutoFetchAtRef.current = now;
        await fetchData();
    };

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        void fetchDataForPolling();
        if (!isLive) return;
        const interval = setInterval(() => {
            void fetchDataForPolling();
        }, 3000);
        return () => clearInterval(interval);
    }, [isLive]);

    const alerts = useMemo(() => {
        const items: { level: "warning" | "critical"; message: string }[] = [];
        if (metrics.cpu > 90) items.push({ level: "critical", message: `CPU 使用率过高：${metrics.cpu}%` });
        else if (metrics.cpu > 70) items.push({ level: "warning", message: `CPU 使用率偏高：${metrics.cpu}%` });
        if (metrics.memory > 90) items.push({ level: "critical", message: `内存使用率过高：${metrics.memory}%` });
        else if (metrics.memory > 75) items.push({ level: "warning", message: `内存使用率偏高：${metrics.memory}%` });
        if (metrics.disk > 95) items.push({ level: "critical", message: `磁盘使用率过高：${metrics.disk}%` });
        else if (metrics.disk > 80) items.push({ level: "warning", message: `磁盘使用率偏高：${metrics.disk}%` });
        return items;
    }, [metrics]);

    function handleExportReport() {
        const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const lines = [
            `系统监控报告 - ${now}`,
            "",
            "=== 系统资源 ===",
            `CPU 使用率: ${metrics.cpu}%`,
            `内存使用率: ${metrics.memory}%`,
            `磁盘使用率: ${metrics.disk}%`,
            `网络带宽: ${metrics.network} Mbps`,
            `活跃在线用户: ${metrics.activeConnections}`,
            `今日登录次数: ${metrics.todayLogins ?? 0}`,
        ];
        if (metrics.activeByRole && metrics.activeByRole.length > 0) {
            lines.push("", "=== 在线用户分布 ===");
            for (const r of metrics.activeByRole) {
                lines.push(`${r.role}: ${r.count}`);
            }
        }
        lines.push(
            "",
            "=== 告警信息 ===",
            alerts.length > 0
                ? alerts.map(a => `[${a.level === "critical" ? "严重" : "警告"}] ${a.message}`).join("\n")
                : "无告警",
            "",
            "=== 最近日志 ===",
            ...logs.slice(0, 20).map(l => `[${new Date(l.time).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}] [${l.level}] ${l.message} (${l.source})`),
        );
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `monitor-report-${formatDateStampCN()}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 0);
        toast.success("监控报告已导出");
    }

    const getLevelBadge = (level: string) => {
        switch (level) {
            case "ERROR":
                return <Badge variant="destructive">{level}</Badge>;
            case "WARN":
                return <Badge variant="warning">{level}</Badge>;
            default:
                return <Badge variant="secondary">{level}</Badge>;
        }
    };

    const getMetricColor = (value: number, thresholds: [number, number]) => {
        if (value > thresholds[1]) return "text-destructive";
        if (value > thresholds[0]) return "text-warning";
        return "text-success";
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">系统监控</h2>
                    <p className="text-sm text-muted-foreground mt-1">查看系统资源占用与日志动态。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5 rounded-md bg-card border border-border">
                        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                        {isLive ? "实时监控中" : "监控已暂停"}
                    </div>
                    <Button data-testid="monitor-export-report" variant="outline" onClick={handleExportReport}>
                        <Download data-icon="inline-start" />
                        导出报告
                    </Button>
                    <Button data-testid="monitor-refresh" variant="outline" onClick={fetchData} disabled={loading}>
                        <RefreshCw data-icon="inline-start" className={loading ? "animate-spin" : undefined} />
                        刷新
                    </Button>
                    <Button
                        data-testid={isLive ? "monitor-pause" : "monitor-resume"}
                        variant={isLive ? "secondary" : "default"}
                        onClick={() => setIsLive(!isLive)}
                    >
                        {isLive ? (
                            <>
                                <Pause data-icon="inline-start" />
                                暂停
                            </>
                        ) : (
                            <>
                                <Play data-icon="inline-start" />
                                恢复
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
                    color="text-primary"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Users className="w-4 h-4" />
                            <span className="text-sm font-medium">活跃在线用户</span>
                        </div>
                        <div className="text-3xl font-bold">{metrics.activeConnections}</div>
                        {metrics.activeByRole && metrics.activeByRole.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {metrics.activeByRole.map((r) => (
                                    <div key={r.role} className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">{r.role}</span>
                                        <span className="font-mono">{r.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <LogIn className="w-4 h-4" />
                            <span className="text-sm font-medium">今日登录次数</span>
                        </div>
                        <div className="text-3xl font-bold">{metrics.todayLogins ?? 0}</div>
                    </CardContent>
                </Card>
            </div>

            {alerts.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center gap-2 border-b border-border pb-4">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        <CardTitle className="text-base">系统告警</CardTitle>
                        <Badge variant="warning" className="ml-auto">{alerts.length} 条</Badge>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 pt-4">
                        {alerts.map((alert, i) => (
                            <Alert
                                key={i}
                                variant={alert.level === "critical" ? "destructive" : "warning"}
                                className="grid-cols-[auto_auto_1fr]"
                            >
                                <Badge variant={alert.level === "critical" ? "destructive" : "warning"}>
                                    {alert.level === "critical" ? "严重" : "警告"}
                                </Badge>
                                <AlertDescription>{alert.message}</AlertDescription>
                            </Alert>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                        <TerminalSquare className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">系统日志</CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">共 {logs.length} 条日志</span>
                </CardHeader>
                <CardContent className="pt-4">
                    <ScrollArea className="h-[400px]">
                        <div className="flex flex-col gap-2 pr-3">
                            {logs.map((log) => (
                                <div key={log.id} className="flex flex-col gap-3 border border-border bg-card p-3 text-sm sm:flex-row sm:items-start group hover:bg-muted transition-colors">
                                    <div className="text-xs text-muted-foreground font-mono sm:w-20 pt-1">
                                        {new Date(log.time).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                    </div>
                                    <div className="min-w-[70px]">
                                        {getLevelBadge(log.level)}
                                    </div>
                                    <span className="flex-1 font-mono text-xs sm:text-sm py-0.5">{log.message}</span>
                                    <Badge variant="muted">{log.source}</Badge>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <Empty className="border border-dashed border-border py-12">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <TerminalSquare />
                                        </EmptyMedia>
                                        <EmptyTitle>暂无日志记录</EmptyTitle>
                                    </EmptyHeader>
                                </Empty>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
