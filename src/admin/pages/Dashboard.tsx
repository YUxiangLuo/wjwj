import { useEffect, useState } from "react";
import { AlertCircle, Calendar, GraduationCap, RefreshCw, School, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { KpiStatCard } from "@/components/KpiStatCard";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RichTextContent } from "@/components/RichTextContent";
import { StatusBadge } from "@/components/StatusBadge";
import { AdminPlatformOverviewCharts } from "@/components/charts/PortalAnalyticsCharts";
import { Button } from "@/components/ui/button";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { formatDateDisplay } from "@/utils/format";
import { announcementApi, statsApi, type Announcement, type Stats } from "../api-client";

const audienceLabels: Record<Announcement["targetScope"], string> = {
    all: "全部用户",
    teacher: "仅教师",
    student: "仅学生",
};

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
    const { loading, error: loadError, run } = useAsyncLoad("首页数据加载失败");

    const loadDashboard = async () => {
        return run(async () => {
            const [statsResponse, announcementsResponse] = await Promise.all([
                statsApi.getStats(),
                announcementApi.list(),
            ]);
            return {
                stats: requireApiData(statsResponse, "统计数据加载失败"),
                announcements: requireApiData(announcementsResponse, "公告加载失败"),
            };
        }, (data) => {
            setStats(data.stats);
            setAnnouncements(data.announcements.filter((item) => item.status === 1).slice(0, 5));
        });
    };

    useEffect(() => {
        void loadDashboard();
    }, []);

    const cards = [
        { key: "semester", label: "当前教学学期", value: stats ? stats.currentSemester || "未设置" : null, icon: Calendar, to: "/semester", hint: "切换活跃学期" },
        { key: "teachers", label: "在册授课教师", value: stats?.teacherCount ?? null, icon: Users, to: "/teacher", hint: "维护教师账号" },
        { key: "classes", label: "实验教学班级", value: stats?.classCount ?? null, icon: School, to: "/class", hint: "管理教学班级" },
        { key: "students", label: "注册实训学生", value: stats?.studentCount ?? null, icon: GraduationCap, to: "/student", hint: "查看学生名册" },
    ];

    return (
        <div className="space-y-4" aria-busy={loading}>
            {loading && <span className="sr-only" role="status">正在加载管理员首页数据</span>}
            {loadError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-destructive">
                    <div className="flex min-w-0 items-center gap-3">
                        <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
                        <p className="text-label">{loadError}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadDashboard()}>
                        <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : undefined} />
                        重新加载
                    </Button>
                </div>
            )}

            <section aria-label="管理概览" className="grid grid-cols-4 gap-3.5">
                {cards.map(({ key, label, value, icon, to, hint }) => (
                    <KpiStatCard
                        key={key}
                        label={label}
                        value={value === null ? (loading ? null : "—") : value}
                        loading={value === null && loading}
                        icon={icon}
                        to={to}
                        hint={hint}
                        testId={`admin-dashboard-stat-${key}`}
                        className="py-3"
                    />
                ))}
            </section>

            <section
                aria-labelledby="admin-recent-announcements-heading"
                className="overflow-hidden rounded-surface border border-border bg-card"
            >
                <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <h2 id="admin-recent-announcements-heading" className="text-subheading font-medium text-foreground">
                            最近平台公告
                        </h2>
                        {stats !== null && (
                            stats.pendingItems > 0 ? (
                                <StatusBadge intent="warning" className="tabular-nums">
                                    全平台待批改提交 {stats.pendingItems} 份
                                </StatusBadge>
                            ) : (
                                <span className="text-meta tabular-nums text-muted-foreground">
                                    全平台待批改提交 0 份
                                </span>
                            )
                        )}
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link to="/announcement">管理公告</Link>
                    </Button>
                </div>
                <div data-testid="admin-dashboard-announcements" className="divide-y divide-border px-5">
                    {announcements === null
                        ? loading
                            ? <LoadingStatus label="正在加载最近公告" showLabel className="py-6 text-label text-muted-foreground" />
                            : <p className="py-6 text-center text-label text-muted-foreground">公告数据暂不可用，请重试</p>
                        : announcements.length
                            ? announcements.map((item) => (
                                <article key={item.id} className="py-3.5">
                                    <div className="flex items-baseline justify-between gap-4">
                                        <h3 className="min-w-0 truncate text-body font-medium text-foreground">{item.title}</h3>
                                        <div className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                                            <span>{audienceLabels[item.targetScope]}</span>
                                            <span aria-hidden="true">·</span>
                                            <time className="tabular-nums">{formatDateDisplay(item.createdAt, "-")}</time>
                                        </div>
                                    </div>
                                    <RichTextContent html={item.content} className="mt-1 line-clamp-2 text-label text-muted-foreground" />
                                </article>
                            ))
                            : <p className="py-6 text-center text-label text-muted-foreground">暂无已发布公告</p>}
                </div>
            </section>

            {!loading && !loadError && stats !== null && (
                <AdminPlatformOverviewCharts stats={stats} />
            )}
        </div>
    );
}
