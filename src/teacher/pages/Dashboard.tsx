import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Megaphone, ChevronRight, Circle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type TeacherStats, type TeacherAnnouncement } from "../api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTimeDisplay } from "@/utils/format";

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
        blue: { bg: "bg-info-muted", text: "text-info", border: "border-info-border" },
        emerald: { bg: "bg-success-muted", text: "text-success", border: "border-success-border" },
        rose: { bg: "bg-destructive-muted", text: "text-destructive", border: "border-destructive-border" },
        amber: { bg: "bg-warning-muted", text: "text-warning", border: "border-warning-border" },
        slate: { bg: "bg-muted", text: "text-muted-foreground", border: "border-input" },
    };

    const style = colorStyles[color] || colorStyles.slate!;

    const card = (
        <Card className={`border-border bg-card hover:border-input transition-colors duration-200 ${to ? "cursor-pointer" : ""}`}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-label font-medium text-muted-foreground">{label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-display font-bold text-foreground">
                                {loading ? <div className="h-9 w-12 bg-muted rounded-control animate-pulse" /> : value}
                            </span>
                        </div>
                    </div>
                    <div className={`w-12 h-12 rounded-surface ${style.bg} ${style.text} flex items-center justify-center border ${style.border}`}>
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
    const [activeTasks, setActiveTasks] = useState<TeacherStats["activeTasks"]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
    const [showAnnouncements, setShowAnnouncements] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<TeacherAnnouncement | null>(null);

    useEffect(() => {
        loadData();
        loadAnnouncements();
    }, []);

    async function loadData() {
        setLoading(true);
        setLoadError(null);
        const res = await teacherApi.getStats();
        if (res.success && res.data) {
            setStats(res.data.stats);
            setActiveTasks(res.data.activeTasks ?? []);
        } else {
            setStats([]);
            setActiveTasks([]);
            setLoadError(res.error?.code === "NETWORK_ERROR"
                ? "教学概览加载失败，请检查网络后重试"
                : res.error?.message ?? "教学概览加载失败，请稍后重试");
        }
        setLoading(false);
    }

    async function loadAnnouncements() {
        const res = await teacherApi.getAnnouncements();
        if (res.success && res.data) {
            setAnnouncements(res.data);
        }
    }

    function handleAnnouncementClick(item: TeacherAnnouncement) {
        setSelectedAnnouncement(item);
    }

    const getIconAndColor = (label: string) => {
        switch (label) {
            case "我的班级": return { icon: School, color: "blue", to: "/class" };
            case "我的实验模板": return { icon: BookOpen, color: "emerald", to: "/topic" };
            case "待批改作业": return { icon: PenLine, color: "rose", to: "/grading" };
            case "进行中实验任务": return { icon: ClipboardList, color: "amber", to: "/task" };
            default: return { icon: LayoutDashboard, color: "slate", to: undefined };
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-subheading font-semibold text-foreground">教学概览</h2>
                <p className="text-label text-muted-foreground mt-1">关注班级、实验模板、活动任务与待批改作业。</p>
            </div>

            {loadError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive">
                    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{loadError}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} className="border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"><RefreshCw className="mr-1.5 h-4 w-4" />重试</Button>
                </div>
            )}

            {/* Announcement Banner */}
            {(() => {
                if (announcements.length === 0) return null;
                const latest = announcements[0]!;
                return (
                    <div className="flex items-center gap-3 px-4 py-3 bg-warning-muted border border-warning-border rounded-surface">
                        <Megaphone className="w-5 h-5 text-warning shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-label text-warning font-medium truncate block">{latest.title}</span>
                        </div>
                        <span className="text-meta text-warning shrink-0">{announcements.length} 条公告</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-warning hover:text-warning hover:bg-warning-muted h-7 text-meta px-2 shrink-0"
                            onClick={() => setShowAnnouncements(true)}
                        >
                            查看详情
                            <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-4 gap-6">
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
                }) : loading ? (
                    // Skeletons if stats are empty initially or loading
                    Array.from({ length: 4 }).map((_, i) => (
                        <StatCard key={i} icon={LayoutDashboard} label="Loading..." value={0} color="slate" loading={true} />
                    ))
                ) : null}
            </div>

            <Card className="border-border bg-card" data-testid="teacher-dashboard-active-tasks">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                    <div><CardTitle className="text-subheading text-foreground">当前活动实验任务</CardTitle><p className="mt-1 text-meta text-muted-foreground">按最近截止时间排序，直接进入班级任务进度。</p></div>
                    <Button variant="outline" size="sm" asChild><Link to="/task">全部实验任务</Link></Button>
                </CardHeader>
                <CardContent className="space-y-3 pt-5">
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-8 text-label text-muted-foreground">加载中...</div>
                    ) : loadError ? (
                        <div className="py-10 text-center text-label text-destructive">活动任务加载失败，请重试</div>
                    ) : activeTasks.length === 0 ? (
                        <div className="py-10 text-center"><p className="text-label text-muted-foreground">当前没有已开放且未截止的实验任务</p><Button asChild variant="outline" size="sm" className="mt-3"><Link to="/task">进入实验任务管理</Link></Button></div>
                    ) : activeTasks.map((item) => {
                        const progress = item.total > 0 ? item.completed / item.total * 100 : 0;
                        return (
                            <Link key={item.id} to={`/task/${item.id}/progress`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(12rem,1fr)_auto] items-center gap-5 rounded-surface border border-border bg-background p-4 transition-colors hover:border-input hover:bg-muted">
                                <div className="min-w-0"><p className="truncate text-label font-semibold text-foreground">{item.templateName}</p><p className="mt-1 text-meta text-muted-foreground">{item.className}</p></div>
                                <div><div className="flex justify-between text-meta text-muted-foreground"><span>已提交 {item.completed}/{item.total}</span><span>{Math.round(progress)}%</span></div><Progress aria-label={`${item.templateName}提交进度`} value={progress} className="mt-2 h-1.5" /></div>
                                <div className="flex items-center gap-2 whitespace-nowrap"><StatusBadge intent={item.pending > 0 ? "warning" : "neutral"}>待批改 {item.pending}</StatusBadge>{item.rejected > 0 && <StatusBadge intent="destructive">需重做 {item.rejected}</StatusBadge>}<span className="flex items-center gap-1 text-meta text-muted-foreground"><Clock className="h-3.5 w-3.5" />{item.deadline ? formatDateTimeDisplay(item.deadline, "-") : "无截止时间"}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
                            </Link>
                        );
                    })}
                </CardContent>
            </Card>

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
                            <div className="text-center text-label text-muted-foreground py-8">暂无公告</div>
                        ) : (
                            announcements.map(item => (
                                <button
                                    key={item.id}
                                    className="w-full text-left p-3 rounded-surface border border-border hover:bg-muted hover:border-input transition-colors"
                                    onClick={() => handleAnnouncementClick(item)}
                                >
                                    <div className="flex items-start gap-2">
                                        <Circle className="w-2 h-2 mt-1.5 text-warning fill-warning shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-label font-medium truncate text-foreground">
                                                {item.title}
                                            </div>
                                            <div className="text-meta text-muted-foreground mt-1">
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
                        <DialogTitle className="text-foreground text-body">{selectedAnnouncement?.title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            查看系统公告的完整内容。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="text-meta text-muted-foreground -mt-2">
                        {selectedAnnouncement?.createdAt && new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                    </div>
                    <div className="flex-1 overflow-y-auto py-4">
                        <RichTextContent
                            html={selectedAnnouncement?.content ?? ""}
                            className="text-label text-foreground leading-relaxed"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
