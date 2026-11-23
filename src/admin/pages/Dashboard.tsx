import { useEffect, useState } from "react";
import { AlertCircle, Calendar, GraduationCap, Megaphone, RefreshCw, School, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { KpiStatCard } from "@/components/KpiStatCard";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RichTextContent } from "@/components/RichTextContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { formatDateDisplay } from "@/utils/format";
import { announcementApi, statsApi, type Announcement, type Stats } from "../api-client";

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
        { key: "semester", label: "当前教学学期", value: stats ? stats.currentSemester || "未设置" : null, icon: Calendar, intent: "primary" as const, to: "/semester", hint: "配置与切换活跃学期" },
        { key: "teachers", label: "在册授课教师", value: stats?.teacherCount ?? null, icon: Users, intent: "info" as const, to: "/teacher", hint: "管理工号与授课权限" },
        { key: "classes", label: "实验教学班级", value: stats?.classCount ?? null, icon: School, intent: "auxiliary" as const, to: "/class", hint: "维护学期班级组织" },
        { key: "students", label: "注册实训学生", value: stats?.studentCount ?? null, icon: GraduationCap, intent: "success" as const, to: "/student", hint: "查看与维护学生名册" },
    ];

    return (
        <div className="space-y-5" aria-busy={loading}>
            {loading && <span className="sr-only" role="status">正在加载管理员首页数据</span>}
            {loadError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-destructive">
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

            <section aria-label="管理概览" className="grid grid-cols-4 gap-4">
                {cards.map(({ key, label, value, icon, intent, to, hint }) => (
                    <KpiStatCard
                        key={key}
                        label={label}
                        value={value === null ? (loading ? null : "—") : value}
                        loading={value === null && loading}
                        icon={icon}
                        intent={intent}
                        to={to}
                        hint={hint}
                        testId={`admin-dashboard-stat-${key}`}
                    />
                ))}
            </section>

            <Card className="gap-4 py-4">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                        <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
                        <CardTitle>
                            <h2 className="text-section-title font-semibold">最近平台公告</h2>
                        </CardTitle>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link to="/announcement">管理公告</Link>
                    </Button>
                </CardHeader>
                <CardContent data-testid="admin-dashboard-announcements" className="divide-y divide-border">
                    {announcements === null
                        ? loading
                            ? <LoadingStatus label="正在加载最近公告" showLabel className="py-8 text-label text-muted-foreground" />
                            : <p className="py-8 text-center text-label text-muted-foreground">公告数据暂不可用，请重试</p>
                        : announcements.length
                            ? announcements.map((item) => (
                                <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                                    <div className="flex items-center justify-between gap-4">
                                        <h3 className="text-body font-semibold text-foreground">{item.title}</h3>
                                        <span className="rounded-control bg-muted px-2.5 py-0.5 text-meta tabular-nums text-muted-foreground">
                                            {formatDateDisplay(item.createdAt, "-")}
                                        </span>
                                    </div>
                                    <RichTextContent html={item.content} className="mt-2 line-clamp-2 text-label text-muted-foreground" />
                                </div>
                            ))
                            : <p className="py-8 text-center text-label text-muted-foreground">暂无已发布公告</p>}
                </CardContent>
            </Card>
        </div>
    );
}
