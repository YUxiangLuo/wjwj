import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
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
        { key: "semester", label: "当前学期", value: stats ? stats.currentSemester || "未设置" : null },
        { key: "teachers", label: "教师", value: stats?.teacherCount ?? null },
        { key: "classes", label: "班级", value: stats?.classCount ?? null },
        { key: "students", label: "学生", value: stats?.studentCount ?? null },
        { key: "pending", label: "待批改", value: stats?.pendingItems ?? null },
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

            <dl aria-label="管理概览" className="grid grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-5 border-b border-border pb-5">
                {cards.map(({ key, label, value }) => (
                    <div key={key} className="min-w-0">
                        <dt className="text-label text-muted-foreground">{label}</dt>
                        <dd
                            data-testid={`admin-dashboard-stat-${key}`}
                            className={`mt-2 font-semibold tabular-nums ${label === "当前学期" ? "break-words text-label" : "text-section-title"}`}
                        >
                            {value === null
                                ? loading
                                    ? <span aria-hidden="true" className="inline-block h-8 w-16 animate-pulse bg-muted align-middle" />
                                    : "—"
                                : value}
                        </dd>
                    </div>
                ))}
            </dl>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>
                        <h2 className="text-section-title font-semibold">
                            最近公告
                        </h2>
                    </CardTitle>
                    <Link className="text-label text-primary hover:underline" to="/announcement">管理公告</Link>
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
