import { useEffect, useState } from "react";
import { Briefcase, Calendar, GraduationCap, Megaphone, School, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            <div className="grid gap-4 grid-cols-5">
                {cards.map(({ label, value, icon: Icon }) => (
                    <Card key={label}><CardContent className="flex items-center justify-between gap-3 p-5"><div className="min-w-0"><p className="text-label text-muted-foreground">{label}</p><p className={`mt-2 font-bold ${label === "当前学期" ? "whitespace-nowrap text-section-title" : "text-page-title"}`}>{value}</p></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-surface bg-primary-muted text-primary"><Icon className="h-5 w-5" /></span></CardContent></Card>
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
                <CardContent className="space-y-3">
                    {announcements.length ? announcements.map((item) => (
                        <div key={item.id} className="rounded-surface border border-border p-4"><div className="flex items-center justify-between gap-4"><h3 className="font-medium">{item.title}</h3><span className="text-meta text-muted-foreground">{formatDateDisplay(item.createdAt, "-")}</span></div><RichTextContent html={item.content} className="mt-2 line-clamp-2 text-label text-muted-foreground" /></div>
                    )) : <p className="py-8 text-center text-label text-muted-foreground">暂无已发布公告</p>}
                </CardContent>
            </Card>
        </div>
    );
}
