import { useState, useEffect, useMemo } from "react";
import { Cpu, HardDrive, Activity, Wifi, Users, Pause, Play, RefreshCw, TerminalSquare, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { systemApi, type SystemMetrics, type SystemLog } from "../api-client";
import { toast } from "sonner";

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
        <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-400">{label}</span>
                    <div className="w-10 h-10 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center border border-slate-700">
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
                <div className="flex items-end gap-1.5 mb-4">
                    <span className={`text-3xl font-bold tracking-tight ${color}`}>{value}</span>
                    <span className="text-sm font-medium text-slate-500 mb-1.5">{unit}</span>
                </div>
                <Progress value={Math.min(value, 100)} className={`h-2 bg-slate-800 ${color.replace("text-", "[&>div]:bg-")}`} />
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
        const now = new Date().toLocaleString("zh-CN");
        const lines = [
            `系统监控报告 - ${now}`,
            "",
            "=== 系统资源 ===",
            `CPU 使用率: ${metrics.cpu}%`,
            `内存使用率: ${metrics.memory}%`,
            `磁盘使用率: ${metrics.disk}%`,
            `网络带宽: ${metrics.network} Mbps`,
            `活跃在线用户: ${metrics.activeConnections}`,
            "",
            "=== 告警信息 ===",
            alerts.length > 0
                ? alerts.map(a => `[${a.level === "critical" ? "严重" : "警告"}] ${a.message}`).join("\n")
                : "无告警",
            "",
            "=== 最近日志 ===",
            ...logs.slice(0, 20).map(l => `[${new Date(l.time).toLocaleString("zh-CN")}] [${l.level}] ${l.message} (${l.source})`),
        ];
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
                return <Badge variant="destructive" className="bg-rose-500/10 text-rose-400 hover:bg-rose-500/20">{level}</Badge>;
            case "WARN":
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">{level}</Badge>;
            default:
                return <Badge variant="secondary" className="bg-slate-800 text-slate-300 hover:bg-slate-700">{level}</Badge>;
        }
    };

    const getMetricColor = (value: number, thresholds: [number, number]) => {
        if (value > thresholds[1]) return "text-rose-400";
        if (value > thresholds[0]) return "text-amber-400";
        return "text-emerald-400";
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-100">系统监控</h2>
                    <p className="text-sm text-slate-400 mt-1">查看系统资源占用与日志动态。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-slate-400 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
                        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
                        {isLive ? "实时监控中" : "监控已暂停"}
                    </div>
                    <Button variant="outline" onClick={handleExportReport} className="border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800">
                        <Download className="w-4 h-4 mr-2" />
                        导出报告
                    </Button>
                    <Button variant="outline" onClick={fetchData} disabled={loading} className="border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        刷新
                    </Button>
                    <Button
                        variant={isLive ? "secondary" : "default"}
                        onClick={() => setIsLive(!isLive)}
                        className={isLive ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-indigo-600 hover:bg-indigo-700 text-white"}
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
                    color="text-blue-400"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <Users className="w-4 h-4" />
                            <span className="text-sm font-medium">活跃在线用户</span>
                        </div>
                        <div className="text-3xl font-bold text-slate-100">{metrics.activeConnections}</div>
                    </CardContent>
                </Card>
            </div>

            {/* 告警区域 */}
            {alerts.length > 0 && (
                <Card className="border-slate-800 bg-slate-900 shadow-sm">
                    <CardHeader className="flex flex-row items-center gap-2 border-b border-slate-800 pb-4">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <CardTitle className="text-base text-slate-100">系统告警</CardTitle>
                        <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-400 border-amber-500/20">{alerts.length} 条</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-4">
                        {alerts.map((alert, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    alert.level === "critical"
                                        ? "border-rose-500/30 bg-rose-500/5"
                                        : "border-amber-500/30 bg-amber-500/5"
                                }`}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    alert.level === "critical" ? "bg-rose-500" : "bg-amber-500"
                                }`} />
                                <Badge variant="outline" className={
                                    alert.level === "critical"
                                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }>
                                    {alert.level === "critical" ? "严重" : "警告"}
                                </Badge>
                                <span className="text-sm text-slate-300">{alert.message}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                        <TerminalSquare className="w-5 h-5 text-slate-400" />
                        <CardTitle className="text-base text-slate-100">系统日志</CardTitle>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">Total {logs.length} logs</span>
                </CardHeader>
                <CardContent className="space-y-2 pt-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {logs.map((log) => (
                        <div key={log.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm sm:flex-row sm:items-start group hover:bg-slate-950 transition-colors">
                            <div className="text-xs text-slate-600 font-mono sm:w-20 pt-1 group-hover:text-slate-500 transition-colors">
                                {new Date(log.time).toLocaleTimeString("zh-CN")}
                            </div>
                            <div className="min-w-[70px]">
                                {getLevelBadge(log.level)}
                            </div>
                            <span className="text-slate-300 flex-1 font-mono text-xs sm:text-sm py-0.5">{log.message}</span>
                            <span className="text-xs text-slate-600 italic px-2 py-0.5 rounded bg-slate-900 border border-slate-800">{log.source}</span>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="text-center py-8 text-slate-600 text-sm">暂无日志记录</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
