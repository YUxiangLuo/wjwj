import { useState, useEffect } from "react";
import {
    Users, Activity, TrendingUp, ShieldCheck, ArrowUpRight, ArrowDownRight, GraduationCap, School, UserCheck, Calendar, LogOut
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
        <Card className="shadow-sm border-slate-200">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                    </div>
                    {trend ? (
                        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${trendUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {trend}
                        </div>
                    ) : null}
                </div>
                <div className="mt-4">
                    <div className="text-2xl font-semibold text-slate-900">
                        {loading ? "加载中" : value}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">{label}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function RoleCountCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                    <Icon className="w-4 h-4" />
                </div>
                <div className="text-sm text-slate-600">{label}</div>
            </div>
            <div className="text-lg font-semibold text-slate-900">{value}</div>
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
        // Refresh metrics every 5 seconds
        const interval = setInterval(loadMetrics, 5000);
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
                // 只显示已发布的最近 5 条公告
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
        return date.toLocaleDateString("zh-CN");
    };

    const totalUsers = (stats?.studentCount ?? 0) + (stats?.teacherCount ?? 0) + (stats?.assistantCount ?? 0);
    const completionRate = stats?.todayLogins
        ? Math.max(0, Math.min(100, Math.round((stats.todayLogins / (stats.todayLogins + stats.pendingItems + 1)) * 100)))
        : 0;
    const systemHealth = Math.max(0, Math.round(100 - (metrics.cpu + metrics.memory + metrics.disk) / 3));

    const quickActions = [
        { label: "发布公告", to: "/announcement" },
        { label: "新增教师", to: "/teacher" },
        { label: "创建班级", to: "/class" },
        { label: "系统设置", to: "/settings" },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard
                    icon={Calendar}
                    value={loading ? "-" : stats?.currentSemester ?? "-"}
                    label="当前学期"
                    trend="稳定"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={Users}
                    value={loading ? "-" : totalUsers}
                    label="用户总数"
                    trend="+6.2%"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={Activity}
                    value={loading ? "-" : stats?.todayActiveUsers ?? 0}
                    label="今日活跃用户"
                    trend="+3.4%"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={LogOut}
                    value={loading ? "-" : stats?.todayLogins ?? 0}
                    label="今日登录次数"
                    trend="-1.2%"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard
                    icon={School}
                    value={loading ? "-" : stats?.classCount ?? 0}
                    label="班级总数"
                    trend="稳定"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={GraduationCap}
                    value={loading ? "-" : stats?.studentCount ?? 0}
                    label="学生总数"
                    trend="+2.1%"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={UserCheck}
                    value={loading ? "-" : stats?.assistantCount ?? 0}
                    label="助教总数"
                    trend="稳定"
                    trendUp
                    loading={loading}
                />
                <KpiCard
                    icon={TrendingUp}
                    value={loading ? "-" : stats?.pendingItems ?? 0}
                    label="待处理事项"
                    trend="关注"
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2 border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base text-slate-900">角色数量概览</CardTitle>
                            <p className="text-xs text-slate-500 mt-1">管理员可直接查看人数分布</p>
                        </div>
                        <div className="text-sm text-slate-500">总人数 {totalUsers}</div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RoleCountCard icon={GraduationCap} label="学生" value={stats?.studentCount ?? 0} />
                        <RoleCountCard icon={School} label="教师" value={stats?.teacherCount ?? 0} />
                        <RoleCountCard icon={UserCheck} label="助教" value={stats?.assistantCount ?? 0} />
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base text-slate-900">系统状态</CardTitle>
                        <ShieldCheck className="w-4 h-4 text-slate-400" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">CPU 使用率</span>
                            <span className="text-sm font-medium text-slate-900">{metrics.cpu}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${Math.min(metrics.cpu, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">内存使用率</span>
                            <span className="text-sm font-medium text-slate-900">{metrics.memory}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${Math.min(metrics.memory, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">磁盘使用率</span>
                            <span className="text-sm font-medium text-slate-900">{metrics.disk}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-rose-500" style={{ width: `${Math.min(metrics.disk, 100)}%` }} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2 border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base text-slate-900">最近动态</CardTitle>
                        <Button variant="outline" size="sm" asChild>
                            <Link to="/announcement">查看全部</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <div className="text-sm text-slate-500">加载中...</div>
                        ) : announcements.length > 0 ? (
                            announcements.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">{item.title}</div>
                                        <div className="text-xs text-slate-500 mt-1">发布于 {formatDate(item.createdAt)}</div>
                                    </div>
                                    <span className="text-xs text-slate-400">公告</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-slate-500">暂无动态</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base text-slate-900">快速操作</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">常用管理入口</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {quickActions.map((action) => (
                            <Button key={action.to} variant="outline" className="w-full justify-between" asChild>
                                <Link to={action.to}>
                                    {action.label}
                                    <ArrowUpRight className="w-4 h-4" />
                                </Link>
                            </Button>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
