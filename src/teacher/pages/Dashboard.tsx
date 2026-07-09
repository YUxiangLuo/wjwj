import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Megaphone, ChevronRight, Circle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type TeacherStats, type TeacherAnnouncement } from "../api-client";

function StatCard({ icon: Icon, label, value, color, loading, to }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    color: string;
    loading?: boolean;
    to?: string;
}) {
    // Map colors to class names
    const colorStyles: Record<string, { bg: string, text: string, border: string }> = {
        blue: { bg: "bg-info/10", text: "text-info", border: "border-info/20" },
        emerald: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
        rose: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
        amber: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
        slate: { bg: "bg-muted", text: "text-muted-foreground", border: "border-input" },
    };

    const style = colorStyles[color] || colorStyles.slate!;

    const card = (
        <Card className={`border-border bg-card hover:border-input transition-all duration-200 ${to ? "cursor-pointer" : ""}`}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">{label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-foreground">
                                {loading ? <div className="h-9 w-12 bg-muted rounded animate-pulse" /> : value}
                            </span>
                        </div>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${style.bg} ${style.text} flex items-center justify-center border ${style.border}`}>
                        <Icon className="w-6 h-6" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (to) {
        return <Link to={to}>{card}</Link>;
    }
    return card;
}

export function Dashboard() {
    const [stats, setStats] = useState<TeacherStats["stats"]>([]);
    const [recentSubmissions, setRecentSubmissions] = useState<TeacherStats["recentSubmissions"]>([]);
    const [recentGradings, setRecentGradings] = useState<TeacherStats["recentGradings"]>([]);
    const [loading, setLoading] = useState(true);
    const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
    const [showAnnouncements, setShowAnnouncements] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<TeacherAnnouncement | null>(null);

    useEffect(() => {
        loadData();
        loadAnnouncements();
    }, []);

    async function loadData() {
        setLoading(true);
        const res = await teacherApi.getStats();
        if (res.success && res.data) {
            setStats(res.data.stats);
            setRecentSubmissions(res.data.recentSubmissions);
            setRecentGradings(res.data.recentGradings ?? []);
        }
        setLoading(false);
    }

    async function loadAnnouncements() {
        const res = await teacherApi.getAnnouncements();
        if (res.success && res.data) {
            setAnnouncements(res.data.announcements);
        }
    }

    async function handleAnnouncementClick(item: TeacherAnnouncement) {
        setSelectedAnnouncement(item);
        if (item.isRead === 0) {
            await teacherApi.markAnnouncementRead(item.id);
            setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, isRead: 1 } : a));
        }
    }

    const getIconAndColor = (label: string) => {
        switch (label) {
            case "我的班级": return { icon: School, color: "blue", to: "/class" };
            case "我的课题": return { icon: BookOpen, color: "emerald", to: "/topic" };
            case "待批改作业": return { icon: PenLine, color: "rose", to: "/grading" };
            case "进行中任务": return { icon: ClipboardList, color: "amber", to: "/task" };
            default: return { icon: LayoutDashboard, color: "slate", to: undefined };
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-foreground">教学概览</h2>
                <p className="text-sm text-muted-foreground mt-1">关注班级、课题与待批改任务。</p>
            </div>

            {/* Announcement Banner */}
            {(() => {
                const unread = announcements.filter(a => a.isRead === 0);
                if (unread.length === 0) return null;
                const latest = unread[0]!;
                return (
                    <div className="flex items-center gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-lg">
                        <Megaphone className="w-5 h-5 text-warning shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm text-warning font-medium truncate block">{latest.title}</span>
                        </div>
                        <span className="text-xs text-warning shrink-0">{unread.length} 条未读</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-warning hover:text-warning hover:bg-warning/10 h-7 text-xs px-2 shrink-0"
                            onClick={() => setShowAnnouncements(true)}
                        >
                            查看详情
                            <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.length > 0 ? stats.map((stat) => {
                    const { icon, color, to } = getIconAndColor(stat.label);
                    return (
                        <StatCard
                            key={stat.label}
                            icon={icon}
                            label={stat.label}
                            value={stat.value}
                            color={color}
                            loading={loading}
                            to={to}
                        />
                    );
                }) : (
                    // Skeletons if stats are empty initially or loading
                    Array.from({ length: 4 }).map((_, i) => (
                        <StatCard key={i} icon={LayoutDashboard} label="Loading..." value={0} color="slate" loading={true} />
                    ))
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Recent Submissions */}
                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                        <CardTitle className="text-lg text-foreground">最近提交</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-input bg-muted/50 text-foreground/90 hover:bg-muted hover:text-foreground">
                            <Link to="/grading">全部作业</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {loading ? (
                            <div className="text-sm text-muted-foreground flex items-center justify-center py-6">加载中...</div>
                        ) : recentSubmissions.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">暂无提交记录</div>
                        ) : (
                            recentSubmissions.map((item, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-background/30 hover:bg-muted/50 hover:border-input transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="w-10 h-10 border border-input">
                                            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{item.student?.[0] ?? "?"}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium text-foreground">{item.student}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{item.class}</span>
                                                <span>·</span>
                                                <span className="text-primary">{item.topic}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground font-mono">{item.time}</span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Recent Gradings */}
                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                        <CardTitle className="text-lg text-foreground">最近批改</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-input bg-muted/50 text-foreground/90 hover:bg-muted hover:text-foreground">
                            <Link to="/grading">批改列表</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {loading ? (
                            <div className="text-sm text-muted-foreground flex items-center justify-center py-6">加载中...</div>
                        ) : recentGradings.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">暂无批改记录</div>
                        ) : (
                            recentGradings.map((item, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-background/30 hover:bg-muted/50 hover:border-input transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="w-10 h-10 border border-input">
                                            <AvatarFallback className={`text-sm font-semibold ${item.rejected ? "bg-destructive text-destructive-foreground" : "bg-success text-success-foreground"}`}>{item.student?.[0] ?? "?"}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium text-foreground">{item.student}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{item.class}</span>
                                                <span>·</span>
                                                <span className="text-primary">{item.topic}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {item.rejected ? (
                                            <span className="flex items-center gap-1 text-xs text-destructive">
                                                <XCircle className="w-3.5 h-3.5" />
                                                已驳回
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-xs text-success">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                {item.score ?? "-"} 分
                                            </span>
                                        )}
                                        <span className="text-xs text-muted-foreground font-mono">{item.time}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Announcement List Dialog */}
            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <Megaphone className="w-5 h-5 text-warning" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            查看最近发布的系统公告列表。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-2 py-2">
                        {announcements.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">暂无公告</div>
                        ) : (
                            announcements.map(item => (
                                <button
                                    key={item.id}
                                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-input transition-colors"
                                    onClick={() => handleAnnouncementClick(item)}
                                >
                                    <div className="flex items-start gap-2">
                                        {item.isRead === 0 && <Circle className="w-2 h-2 mt-1.5 text-warning fill-warning shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate ${item.isRead === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                                                {item.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Announcement Detail Dialog */}
            <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null); }}>
                <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-foreground text-base">{selectedAnnouncement?.title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            查看系统公告的完整内容。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="text-xs text-muted-foreground -mt-2">
                        {selectedAnnouncement?.createdAt && new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                    </div>
                    <div className="flex-1 overflow-y-auto py-4">
                        <RichTextContent
                            html={selectedAnnouncement?.content ?? ""}
                            className="text-sm text-foreground/90 leading-relaxed"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
