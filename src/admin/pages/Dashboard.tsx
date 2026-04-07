import { useState, useEffect } from "react";
import {
    Users, Activity, TrendingUp, ShieldCheck, ArrowUpRight, ArrowDownRight, GraduationCap, School, UserCheck, Calendar, LogOut, Briefcase
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { statsApi, announcementApi, systemApi, type Stats, type Announcement, type SystemMetrics } from "../api-client";

function KpiCard({ icon: Icon, value, label, trend, trendUp, loading }: {
    icon: React.ComponentType<{ className?: string }>;
    value: string | number;
    label: string;
    trend?: string;
    trendUp?: boolean;
    loading?: boolean;
}) {
    return (
        <Card className="shadow-lg shadow-black/20 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500/30 transition-all duration-300 group">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-indigo-500 flex items-center justify-center border border-slate-300/50 dark:border-slate-700/50 group-hover:bg-indigo-500/10 group-hover:text-indigo-600 transition-colors">
                        <Icon className="w-6 h-6" />
                    </div>
                    {trend ? (
                        <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${trendUp
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            }`}>
                            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {trend}
                        </div>
                    ) : null}
                </div>
                <div className="mt-5">
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        {loading ? <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : value}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 font-medium">{label}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function RoleCountCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-5 py-4 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 border border-slate-300/50 dark:border-slate-700/50">
                    <Icon className="w-5 h-5" />
                </div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</div>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        </div>
    );
}

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    const [metrics, setMetrics] = useState<SystemMetrics>({
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        activeConnections: 0
    });

    useEffect(() => {
        loadData();
        const interval = setInterval(loadMetrics, 60000);
        return () => clearInterval(interval);
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [statsRes, announcementsRes] = await Promise.all([
                statsApi.getStats(),
                announcementApi.list(),
            ]);

            if (statsRes.success && statsRes.data) {
                setStats(statsRes.data);
            }

            if (announcementsRes.success && announcementsRes.data) {
                setAnnouncements(
                    announcementsRes.data
                        .filter(a => a.status === 1)
                        .slice(0, 5)
                );
            }

            await loadMetrics();
        } catch (error) {
            console.error("Failed to load dashboard data:", error);
        } finally {
            setLoading(false);
        }
    }

    async function loadMetrics() {
        try {
            const res = await systemApi.getMetrics();
            if (res.success && res.data) {
                setMetrics(res.data);
            }
        } catch (error) {
            console.error("Failed to load metrics:", error);
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const totalUsers = (stats?.studentCount ?? 0) + (stats?.teacherCount ?? 0) + (stats?.assistantCount ?? 0);

    const quickActions = [
        { label: "发布公告", to: "/announcement" },
        { label: "新增教师", to: "/teacher" },
        { label: "创建班级", to: "/class" },
        { label: "系统设置", to: "/settings" },
    ];

    function getStatusColor(value: number, warnThreshold: number, criticalThreshold: number) {
        if (value > criticalThreshold) return "bg-rose-500";
        if (value > warnThreshold) return "bg-amber-500";
        return "bg-emerald-500";
    }

    function getStatusIndicator(value: number, warnThreshold: number, criticalThreshold: number) {
        if (value > criticalThreshold) return "text-rose-600";
        if (value > warnThreshold) return "text-amber-600";
        return "text-emerald-600";
    }

    const hasAlert = metrics.cpu > 70 || metrics.memory > 75 || metrics.disk > 80;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard
                    icon={Calendar}
                    value={loading ? "-" : stats?.currentSemester ?? "-"}
                    label="当前学期"
                    loading={loading}
                />
                <KpiCard
                    icon={Briefcase}
                    value={loading ? "-" : stats?.teacherCount ?? 0}
                    label="教师总数"
                    loading={loading}
                />
                <KpiCard
                    icon={Activity}
                    value={loading ? "-" : stats?.todayActiveUsers ?? 0}
                    label="今日活跃用户"
                    loading={loading}
                />
                <KpiCard
                    icon={LogOut}
                    value={loading ? "-" : stats?.todayLogins ?? 0}
                    label="今日登录次数"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard
                    icon={School}
                    value={loading ? "-" : stats?.classCount ?? 0}
                    label="班级总数"
                    loading={loading}
                />
                <KpiCard
                    icon={GraduationCap}
                    value={loading ? "-" : stats?.studentCount ?? 0}
                    label="学生总数"
                    loading={loading}
                />
                <KpiCard
                    icon={UserCheck}
                    value={loading ? "-" : stats?.assistantCount ?? 0}
                    label="助教总数"
                    loading={loading}
                />
                <KpiCard
                    icon={TrendingUp}
                    value={loading ? "-" : stats?.pendingItems ?? 0}
                    label="待处理事项"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-lg shadow-black/20">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div>
                            <CardTitle className="text-lg text-slate-900 dark:text-slate-100">角色数量概览</CardTitle>
                            <p className="text-xs text-slate-500 mt-1">管理员可直接查看人数分布</p>
                        </div>
                        <div className="text-sm font-mono text-slate-600 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-3 py-1 rounded-full border border-slate-300/50 dark:border-slate-700/50">
                            Total: <span className="text-indigo-500 font-bold">{totalUsers}</span>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RoleCountCard icon={GraduationCap} label="学生" value={stats?.studentCount ?? 0} />
                        <RoleCountCard icon={School} label="教师" value={stats?.teacherCount ?? 0} />
                        <RoleCountCard icon={UserCheck} label="助教" value={stats?.assistantCount ?? 0} />
                    </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-lg shadow-black/20">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-100">系统状态</CardTitle>
                        <ShieldCheck className={`w-5 h-5 ${hasAlert ? "text-amber-500" : "text-emerald-500"}`} />
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${getStatusColor(metrics.cpu, 70, 90)}`} />
                                    <span className="text-sm text-slate-600 dark:text-slate-400">CPU 使用率</span>
                                </div>
                                <span className={`text-sm font-medium font-mono ${getStatusIndicator(metrics.cpu, 70, 90)}`}>{metrics.cpu}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${getStatusColor(metrics.cpu, 70, 90)}`} style={{ width: `${Math.min(metrics.cpu, 100)}%` }} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${getStatusColor(metrics.memory, 75, 90)}`} />
                                    <span className="text-sm text-slate-600 dark:text-slate-400">内存使用率</span>
                                </div>
                                <span className={`text-sm font-medium font-mono ${getStatusIndicator(metrics.memory, 75, 90)}`}>{metrics.memory}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${getStatusColor(metrics.memory, 75, 90)}`} style={{ width: `${Math.min(metrics.memory, 100)}%` }} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${getStatusColor(metrics.disk, 80, 95)}`} />
                                    <span className="text-sm text-slate-600 dark:text-slate-400">磁盘使用率</span>
                                </div>
                                <span className={`text-sm font-medium font-mono ${getStatusIndicator(metrics.disk, 80, 95)}`}>{metrics.disk}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${getStatusColor(metrics.disk, 80, 95)}`} style={{ width: `${Math.min(metrics.disk, 100)}%` }} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-lg shadow-black/20">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-100">最近动态</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
                            <Link to="/announcement">查看全部</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-6">
                        {loading ? (
                            <div className="text-sm text-slate-500 flex items-center justify-center py-4">加载中...</div>
                        ) : announcements.length > 0 ? (
                            announcements.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-950/30 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all group">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{item.title}</div>
                                        <div className="text-xs text-slate-500 mt-1">发布于 {formatDate(item.createdAt)}</div>
                                    </div>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-900">公告</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-slate-500 text-center py-6">暂无动态</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-lg shadow-black/20">
                    <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-100">快速操作</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">常用管理入口</p>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-6">
                        {quickActions.map((action) => (
                            <Button key={action.to} variant="outline" className="w-full justify-between h-12 border-slate-300 dark:border-slate-700 bg-slate-200/30 dark:bg-slate-800/30 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400 dark:hover:border-slate-600 transition-all" asChild>
                                <Link to={action.to}>
                                    {action.label}
                                    <ArrowUpRight className="w-4 h-4 opacity-50" />
                                </Link>
                            </Button>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
