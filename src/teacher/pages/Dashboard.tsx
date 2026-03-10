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
        blue: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
        emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/20" },
        rose: { bg: "bg-rose-500/10", text: "text-rose-600", border: "border-rose-500/20" },
        amber: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/20" },
        slate: { bg: "bg-slate-200 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", border: "border-slate-300 dark:border-slate-700" },
    };

    const style = colorStyles[color] || colorStyles.slate!;

    const card = (
        <Card className={`border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 ${to ? "cursor-pointer" : ""}`}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">{label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                                {loading ? <div className="h-9 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : value}
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
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">教学概览</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">关注班级、课题与待批改任务。</p>
            </div>

            {/* Announcement Banner */}
            {(() => {
                const unread = announcements.filter(a => a.isRead === 0);
                if (unread.length === 0) return null;
                const latest = unread[0]!;
                return (
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <Megaphone className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm text-amber-800 dark:text-amber-200 font-medium truncate block">{latest.title}</span>
                        </div>
                        <span className="text-xs text-amber-600/70 shrink-0">{unread.length} 条未读</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:text-amber-500 hover:bg-amber-500/10 h-7 text-xs px-2 shrink-0"
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
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-100">最近提交</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
                            <Link to="/grading">全部作业</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {loading ? (
                            <div className="text-sm text-slate-500 flex items-center justify-center py-6">加载中...</div>
                        ) : recentSubmissions.length === 0 ? (
                            <div className="text-center text-sm text-slate-500 py-8">暂无提交记录</div>
                        ) : (
                            recentSubmissions.map((item, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-950/30 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="w-10 h-10 border border-slate-300 dark:border-slate-700">
                                            <AvatarFallback className="bg-indigo-950 text-indigo-500 text-sm font-semibold">{item.student[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.student}</div>
                                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">{item.class}</span>
                                                <span>·</span>
                                                <span className="text-indigo-500">{item.topic}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Recent Gradings */}
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-100">最近批改</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">
                            <Link to="/grading">批改列表</Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        {loading ? (
                            <div className="text-sm text-slate-500 flex items-center justify-center py-6">加载中...</div>
                        ) : recentGradings.length === 0 ? (
                            <div className="text-center text-sm text-slate-500 py-8">暂无批改记录</div>
                        ) : (
                            recentGradings.map((item, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-950/30 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="w-10 h-10 border border-slate-300 dark:border-slate-700">
                                            <AvatarFallback className={`text-sm font-semibold ${item.rejected ? "bg-rose-950 text-rose-600" : "bg-emerald-950 text-emerald-600"}`}>{item.student[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.student}</div>
                                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">{item.class}</span>
                                                <span>·</span>
                                                <span className="text-indigo-500">{item.topic}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {item.rejected ? (
                                            <span className="flex items-center gap-1 text-xs text-rose-600">
                                                <XCircle className="w-3.5 h-3.5" />
                                                已驳回
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                {item.score ?? "-"} 分
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>


            </div>

            {/* Announcement List Dialog */}
            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Megaphone className="w-5 h-5 text-amber-600" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            查看最近发布的系统公告列表。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-2 py-2">
                        {announcements.length === 0 ? (
                            <div className="text-center text-sm text-slate-500 py-8">暂无公告</div>
                        ) : (
                            announcements.map(item => (
                                <button
                                    key={item.id}
                                    className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                                    onClick={() => handleAnnouncementClick(item)}
                                >
                                    <div className="flex items-start gap-2">
                                        {item.isRead === 0 && <Circle className="w-2 h-2 mt-1.5 text-amber-600 fill-amber-400 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate ${item.isRead === 0 ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"}`}>
                                                {item.title}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {new Date(item.createdAt).toLocaleString("zh-CN")}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Announcement Detail Dialog */}
            <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null); }}>
                <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100 text-base">{selectedAnnouncement?.title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            查看系统公告的完整内容。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="text-xs text-slate-500 -mt-2">
                        {selectedAnnouncement?.createdAt && new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN")}
                    </div>
                    <div className="flex-1 overflow-y-auto py-4">
                        <RichTextContent
                            html={selectedAnnouncement?.content ?? ""}
                            className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
