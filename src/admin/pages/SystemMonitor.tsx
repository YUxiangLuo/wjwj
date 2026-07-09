import { useState, useEffect, useMemo, useRef } from "react";
import { Cpu, HardDrive, Activity, Wifi, Users, Pause, Play, RefreshCw, TerminalSquare, AlertTriangle, Download, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { systemApi, type SystemMetrics, type SystemLog } from "../api-client";
import { toast } from "sonner";
import { createSingleFlight } from "../single-flight";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

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
        <Card className="transition-colors hover:border-input">
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <div className="w-10 h-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center border border-input">
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
                <div className="flex items-end gap-1.5 mb-4">
                    <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
                    <span className="text-sm font-medium text-muted-foreground mb-1.5">{unit}</span>
                </div>
                <Progress value={Math.min(value, 100)} className={`h-2 bg-muted ${color.replace("text-", "[&>div]:bg-")}`} />
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
        // React Strict Mode replays effects in development; suppress the duplicate immediate poll.
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
        a.download = `monitor-report-${new Date().toISOString().slice(0, 10)}.txt`;
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
                return <StatusBadge intent="destructive">{level}</StatusBadge>;
            case "WARN":
                return <StatusBadge intent="warning">{level}</StatusBadge>;
            default:
                return <Badge variant="secondary" className="bg-muted text-foreground/90 hover:bg-muted">{level}</Badge>;
        }
    };

    const getMetricColor = (value: number, thresholds: [number, number]) => {
        if (value > thresholds[1]) return "text-destructive";
        if (value > thresholds[0]) return "text-warning";
        return "text-success";
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">系统监控</h2>
                    <p className="text-sm text-muted-foreground mt-1">查看系统资源占用与日志动态。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5 rounded-md bg-card border border-border">
                        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
                        {isLive ? "实时监控中" : "监控已暂停"}
                    </div>
                    <Button data-testid="monitor-export-report" variant="outline" onClick={handleExportReport} className="border-input text-foreground/90 hover:text-foreground hover:bg-muted">
                        <Download className="w-4 h-4 mr-2" />
                        导出报告
                    </Button>
                    <Button data-testid="monitor-refresh" variant="outline" onClick={fetchData} disabled={loading} className="border-input text-foreground/90 hover:text-foreground hover:bg-muted">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        刷新
                    </Button>
                    <Button
                        data-testid={isLive ? "monitor-pause" : "monitor-resume"}
                        variant={isLive ? "secondary" : "default"}
                        onClick={() => setIsLive(!isLive)}
                        className={isLive ? "bg-muted text-foreground/90 hover:bg-muted" : "bg-primary hover:bg-primary text-primary-foreground"}
                    >
                        {isLive ? (
                            <>
                                <Pause className="w-4 h-4 mr-2" />
                                暂停
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 mr-2" />
                                恢复
                            </>
                        )}
                    </Button>
                </div>
            </PageHeader>

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
                    color="text-info"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Users className="w-4 h-4" />
                            <span className="text-sm font-medium">活跃在线用户</span>
                        </div>
                        <div className="text-3xl font-bold text-foreground">{metrics.activeConnections}</div>
                        {metrics.activeByRole && metrics.activeByRole.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {metrics.activeByRole.map((r) => (
                                    <div key={r.role} className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">{r.role}</span>
                                        <span className="text-foreground/90 font-mono">{r.count}</span>
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
                        <div className="text-3xl font-bold text-foreground">{metrics.todayLogins ?? 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* 告警区域 */}
            {alerts.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center gap-2 border-b border-border pb-4">
                        <AlertTriangle className="w-5 h-5 text-warning" />
                        <CardTitle className="text-base text-foreground">系统告警</CardTitle>
                        <StatusBadge intent="warning" className="ml-auto">{alerts.length} 条</StatusBadge>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-4">
                        {alerts.map((alert, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    alert.level === "critical"
                                        ? "border-destructive/30 bg-destructive/5"
                                        : "border-warning/30 bg-warning/5"
                                }`}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    alert.level === "critical" ? "bg-destructive" : "bg-warning"
                                }`} />
                                <Badge variant="outline" className={
                                    alert.level === "critical"
                                        ? "bg-destructive/10 text-destructive border-destructive/20"
                                        : "bg-warning/10 text-warning border-warning/20"
                                }>
                                    {alert.level === "critical" ? "严重" : "警告"}
                                </Badge>
                                <span className="text-sm text-foreground/90">{alert.message}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                        <TerminalSquare className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base text-foreground">系统日志</CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">Total {logs.length} logs</span>
                </CardHeader>
                <CardContent className="space-y-2 pt-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {logs.map((log) => (
                        <div key={log.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background/50 p-3 text-sm sm:flex-row sm:items-start group hover:bg-background dark:hover:bg-background transition-colors">
                            <div className="text-xs text-muted-foreground font-mono sm:w-20 pt-1 group-hover:text-muted-foreground dark:group-hover:text-muted-foreground transition-colors">
                                {new Date(log.time).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" })}
                            </div>
                            <div className="min-w-[70px]">
                                {getLevelBadge(log.level)}
                            </div>
                            <span className="text-foreground/90 flex-1 font-mono text-xs sm:text-sm py-0.5">{log.message}</span>
                            <span className="text-xs text-muted-foreground italic px-2 py-0.5 rounded bg-card border border-border">{log.source}</span>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">暂无日志记录</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
