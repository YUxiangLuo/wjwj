import { useState, useEffect } from "react";

// Mock real-time data
const generateMetrics = () => ({
    cpu: Math.floor(Math.random() * 40) + 20,
    memory: Math.floor(Math.random() * 30) + 50,
    disk: Math.floor(Math.random() * 10) + 45,
    network: Math.floor(Math.random() * 100) + 50,
    activeConnections: Math.floor(Math.random() * 50) + 100,
    requestsPerMinute: Math.floor(Math.random() * 200) + 300,
});

const mockLogs = [
    { id: 1, time: "17:45:32", level: "INFO", message: "用户 admin 登录系统", source: "AuthService" },
    { id: 2, time: "17:44:18", level: "INFO", message: "班级「统计学2024-1班」数据导出完成", source: "ExportService" },
    { id: 3, time: "17:42:55", level: "WARN", message: "API请求响应时间超过阈值 (523ms)", source: "APIGateway" },
    { id: 4, time: "17:40:12", level: "INFO", message: "学生 2024001 完成实验步骤3", source: "ExperimentService" },
    { id: 5, time: "17:38:45", level: "ERROR", message: "数据库连接池达到上限，正在扩容", source: "DatabasePool" },
    { id: 6, time: "17:35:20", level: "INFO", message: "定时任务：清理过期缓存完成", source: "SchedulerService" },
];

function MetricCard({ label, value, unit, color, icon }: { label: string; value: number; unit: string; color: string; icon: string }) {
    return (
        <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-xl">{icon}</span>
            </div>
            <div className="flex items-end gap-1">
                <span className={`text-3xl font-bold ${color}`}>{value}</span>
                <span className="text-sm text-slate-500 mb-1">{unit}</span>
            </div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${color.replace("text-", "bg-")}`} style={{ width: `${Math.min(value, 100)}%` }} />
            </div>
        </div>
    );
}

export function SystemMonitor() {
    const [metrics, setMetrics] = useState(generateMetrics());
    const [isLive, setIsLive] = useState(true);

    useEffect(() => {
        if (!isLive) return;
        const interval = setInterval(() => setMetrics(generateMetrics()), 3000);
        return () => clearInterval(interval);
    }, [isLive]);

    const getLevelColor = (level: string) => {
        switch (level) {
            case "ERROR": return "text-red-600 bg-red-50";
            case "WARN": return "text-amber-600 bg-amber-50";
            default: return "text-slate-600 bg-slate-50";
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    <span className="text-sm text-slate-500">{isLive ? "实时监控中" : "监控已暂停"}</span>
                </div>
                <button
                    onClick={() => setIsLive(!isLive)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isLive ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-teal-600 text-white hover:bg-teal-700"}`}
                >
                    {isLive ? "暂停" : "恢复监控"}
                </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="CPU 使用率" value={metrics.cpu} unit="%" color={metrics.cpu > 80 ? "text-red-500" : metrics.cpu > 60 ? "text-amber-500" : "text-emerald-500"} icon="💻" />
                <MetricCard label="内存使用率" value={metrics.memory} unit="%" color={metrics.memory > 85 ? "text-red-500" : metrics.memory > 70 ? "text-amber-500" : "text-emerald-500"} icon="🧠" />
                <MetricCard label="磁盘使用率" value={metrics.disk} unit="%" color={metrics.disk > 90 ? "text-red-500" : metrics.disk > 75 ? "text-amber-500" : "text-emerald-500"} icon="💾" />
                <MetricCard label="网络带宽" value={metrics.network} unit="Mbps" color="text-teal-500" icon="🌐" />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm">
                    <div className="text-sm text-slate-500 mb-1">活跃连接数</div>
                    <div className="text-2xl font-bold text-slate-800">{metrics.activeConnections}</div>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm">
                    <div className="text-sm text-slate-500 mb-1">请求数/分钟</div>
                    <div className="text-2xl font-bold text-slate-800">{metrics.requestsPerMinute}</div>
                </div>
            </div>

            {/* System Logs */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-base font-semibold text-slate-800 mb-4">系统日志</h3>
                <div className="space-y-2">
                    {mockLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                            <span className="text-slate-400 font-mono text-xs">{log.time}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>{log.level}</span>
                            <span className="text-slate-700 flex-1">{log.message}</span>
                            <span className="text-xs text-slate-400">{log.source}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
