import { useEffect, useState } from "react";
import { AlertCircle, Briefcase, Calendar, GraduationCap, Megaphone, RefreshCw, School, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
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
        { key: "semester", label: "当前学期", value: stats ? stats.currentSemester || "未设置" : null, icon: Calendar },
        { key: "teachers", label: "教师", value: stats?.teacherCount ?? null, icon: Briefcase },
        { key: "classes", label: "班级", value: stats?.classCount ?? null, icon: School },
        { key: "students", label: "学生", value: stats?.studentCount ?? null, icon: GraduationCap },
        { key: "pending", label: "待批改", value: stats?.pendingItems ?? null, icon: TrendingUp },
    ];

    return (
        <div className="space-y-6" aria-busy={loading}>
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

            <div className="grid grid-cols-[1.35fr_repeat(4,minmax(0,1fr))] gap-4">
                {cards.map(({ key, label, value, icon: Icon }) => (
                    <Card key={key}>
                        <CardContent className="flex items-center justify-between gap-3 p-5">
                            <div className="min-w-0">
                                <p className="text-label text-muted-foreground">{label}</p>
                                <p
                                    data-testid={`admin-dashboard-stat-${key}`}
                                    className={`mt-2 font-bold ${label === "当前学期" ? "whitespace-nowrap text-section-title" : "text-page-title"}`}
                                >
                                    {value === null
                                        ? loading
                                            ? <span aria-hidden="true" className="inline-block h-8 w-16 animate-pulse bg-muted align-middle" />
                                            : "—"
                                        : value}
                                </p>
                            </div>
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-surface bg-primary-muted text-primary"><Icon className="h-5 w-5" /></span>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>
                        <h2 className="flex items-center gap-2 text-subheading">
                            <Megaphone className="h-5 w-5 text-primary" />
                            最近公告
                        </h2>
                    </CardTitle>
                    <Link className="text-label text-primary hover:underline" to="/announcement">管理公告</Link>
                </CardHeader>
                <CardContent data-testid="admin-dashboard-announcements" className="space-y-3">
                    {announcements === null
                        ? loading
                            ? <LoadingStatus label="正在加载最近公告" showLabel className="py-8 text-label text-muted-foreground" />
                            : <p className="py-8 text-center text-label text-muted-foreground">公告数据暂不可用，请重试</p>
                        : announcements.length
                            ? announcements.map((item) => (
                                <div key={item.id} className="rounded-surface border border-border p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <h3 className="font-medium">{item.title}</h3>
                                        <span className="text-meta text-muted-foreground">{formatDateDisplay(item.createdAt, "-")}</span>
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
