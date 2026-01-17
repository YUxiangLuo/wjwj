import { useState, useEffect } from "react";
import {
    Calendar, Users, GraduationCap, School, UserCheck,
    Activity, LogOut, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { statsApi, announcementApi, type Stats, type Announcement } from "../api-client";

function StatCard({ icon: Icon, value, label, colorClass, loading }: {
    icon: React.ComponentType<{ className?: string }>;
    value: string | number;
    label: string;
    colorClass: string;
    loading?: boolean;
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                </div>
                {loading ? (
                    <div className="h-8 flex items-center">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="text-2xl font-bold text-foreground">{value}</div>
                )}
                <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
        </Card>
    );
}

function StatusBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="p-4 bg-muted rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">{label}</div>
            <Progress value={value} className={`h-2 mb-2 ${color}`} />
            <div className="text-sm font-semibold text-foreground">{value}%</div>
        </div>
    );
}

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    // 模拟系统指标（后续可接入真实监控 API）
    const [metrics] = useState({ cpu: 35, memory: 62, disk: 48 });

    useEffect(() => {
        loadData();
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
        } catch (error) {
            console.error("Failed to load dashboard data:", error);
        } finally {
            setLoading(false);
        }
    }

    const getMetricColor = (value: number, warnThreshold: number, criticalThreshold: number) => {
        if (value > criticalThreshold) return "[&>div]:bg-destructive";
        if (value > warnThreshold) return "[&>div]:bg-amber-500";
        return "[&>div]:bg-emerald-500";
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("zh-CN");
    };

    return (
        <div className="space-y-6">
            {/* 统计卡片 - 第一行 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Calendar}
                    value={stats?.currentSemester ?? "-"}
                    label="当前学期"
                    colorClass="bg-primary/10 text-primary"
                    loading={loading}
                />
                <StatCard
                    icon={Users}
                    value={stats?.teacherCount ?? 0}
                    label="教师总数"
                    colorClass="bg-emerald-50 text-emerald-600"
                    loading={loading}
                />
                <StatCard
                    icon={School}
                    value={stats?.classCount ?? 0}
                    label="班级总数"
                    colorClass="bg-secondary text-secondary-foreground"
                    loading={loading}
                />
                <StatCard
                    icon={GraduationCap}
                    value={stats?.studentCount ?? 0}
                    label="学生总数"
                    colorClass="bg-amber-50 text-amber-600"
                    loading={loading}
                />
            </div>

            {/* 统计卡片 - 第二行 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={UserCheck}
                    value={stats?.assistantCount ?? 0}
                    label="助教总数"
                    colorClass="bg-rose-50 text-rose-600"
                    loading={loading}
                />
                <StatCard
                    icon={Users}
                    value={stats?.todayActiveUsers ?? 0}
                    label="今日活跃用户"
                    colorClass="bg-primary/10 text-primary"
                    loading={loading}
                />
                <StatCard
                    icon={LogOut}
                    value={stats?.todayLogins ?? 0}
                    label="今日登录次数"
                    colorClass="bg-blue-50 text-blue-600"
                    loading={loading}
                />
                <StatCard
                    icon={Activity}
                    value={stats?.pendingItems ?? 0}
                    label="待处理事项"
                    colorClass="bg-orange-50 text-orange-600"
                    loading={loading}
                />
            </div>

            {/* 系统状态 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">系统状态</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <StatusBar
                            label="CPU 使用率"
                            value={metrics.cpu}
                            color={getMetricColor(metrics.cpu, 70, 90)}
                        />
                        <StatusBar
                            label="内存使用率"
                            value={metrics.memory}
                            color={getMetricColor(metrics.memory, 75, 90)}
                        />
                        <StatusBar
                            label="磁盘使用率"
                            value={metrics.disk}
                            color={getMetricColor(metrics.disk, 80, 95)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* 最近公告 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">最近公告</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : announcements.length > 0 ? (
                        announcements.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                <span className="text-sm text-foreground truncate flex-1 mr-4">{item.title}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {formatDate(item.createdAt)}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">暂无公告</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
