import { useEffect, useState } from "react";
import { Briefcase, Calendar, GraduationCap, Megaphone, School, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/IconTile";
import { RichTextContent } from "@/components/RichTextContent";
import { formatDateDisplay } from "@/utils/format";
import { announcementApi, statsApi, type Announcement, type Stats } from "../api-client";

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    useEffect(() => {
        void Promise.all([statsApi.getStats(), announcementApi.list()]).then(([statsResponse, announcementsResponse]) => {
            if (statsResponse.success && statsResponse.data) setStats(statsResponse.data);
            if (announcementsResponse.success && announcementsResponse.data) {
                setAnnouncements(announcementsResponse.data.filter((item) => item.status === 1).slice(0, 5));
            }
        });
    }, []);
    const cards = [
        { label: "当前学期", value: stats?.currentSemester ?? "-", icon: Calendar },
        { label: "教师", value: stats?.teacherCount ?? 0, icon: Briefcase },
        { label: "班级", value: stats?.classCount ?? 0, icon: School },
        { label: "学生", value: stats?.studentCount ?? 0, icon: GraduationCap },
        { label: "待批改", value: stats?.pendingItems ?? 0, icon: TrendingUp },
    ];
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {cards.map(({ label, value, icon: Icon }) => (
                    <Card key={label}><CardContent className="flex min-w-0 items-center justify-between gap-3 p-4 sm:p-5"><div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 truncate font-bold ${label === "当前学期" ? "text-xl" : "text-2xl"}`}>{value}</p></div><IconTile intent="primary" className="h-11 w-11"><Icon className="h-5 w-5" /></IconTile></CardContent></Card>
                ))}
            </div>
            <Card>
                <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>
                        <h2 className="flex items-center gap-2 text-lg">
                            <Megaphone className="h-5 w-5 text-primary" />
                            最近公告
                        </h2>
                    </CardTitle>
                    <Link className="text-sm text-primary hover:underline" to="/announcement">管理公告</Link>
                </CardHeader>
                <CardContent className="space-y-3">
                    {announcements.length ? announcements.map((item) => (
                        <div key={item.id} className="min-w-0 rounded-xl border border-border p-4"><div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><h3 className="min-w-0 break-words font-medium">{item.title}</h3><span className="shrink-0 text-xs text-muted-foreground">{formatDateDisplay(item.createdAt, "-")}</span></div><RichTextContent html={item.content} className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground" /></div>
                    )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无已发布公告</p>}
                </CardContent>
            </Card>
        </div>
    );
}
