import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Megaphone, ChevronRight, Circle, Clock, AlertCircle, RefreshCw, School, BookOpen, PenLine, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { KpiStatCard } from "@/components/KpiStatCard";
import { teacherApi, type TeacherStats, type TeacherAnnouncement } from "../api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTimeDisplay } from "@/utils/format";

export function Dashboard() {
    const [stats, setStats] = useState<TeacherStats["stats"]>([]);
    const [activeTasks, setActiveTasks] = useState<TeacherStats["activeTasks"]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
    const [showAnnouncements, setShowAnnouncements] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<TeacherAnnouncement | null>(null);

    useEffect(() => {
        void loadData();
        void loadAnnouncements();
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

    const statMeta = (label: string) => {
        switch (label) {
            case "我的班级":
                return { to: "/class", icon: School, intent: "primary" as const, hint: "查看授课班级与学生名册" };
            case "我的实验模板":
                return { to: "/topic", icon: BookOpen, intent: "info" as const, hint: "配置商业案例与投放策略" };
            case "待批改作业":
                return { to: "/grading", icon: PenLine, intent: "warning" as const, hint: "检视多轮调优过程并评分" };
            case "进行中实验任务":
                return { to: "/task", icon: ClipboardList, intent: "success" as const, hint: "跟踪各班五阶段实训进度" };
            default:
                return { to: undefined, icon: ClipboardList, intent: "neutral" as const, hint: undefined };
        }
    };

    return (
        <div className="space-y-6">
            {loadError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive">
                    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{loadError}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} className="border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"><RefreshCw className="mr-1.5 h-4 w-4" />重试</Button>
                </div>
            )}

            {announcements.length > 0 && (() => {
                const latest = announcements[0]!;
                return (
                    <div className="flex items-center gap-3 rounded-surface border border-info-border bg-info-muted px-4 py-3">
                        <Megaphone className="h-5 w-5 shrink-0 text-info" />
                        <div className="min-w-0 flex-1">
                            <span className="block truncate text-label font-medium text-foreground">{latest.title}</span>
                        </div>
                        <span className="shrink-0 text-meta text-info">{announcements.length} 条通知</span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 bg-card"
                            onClick={() => setShowAnnouncements(true)}
                        >
                            查看详情
                            <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-4 gap-4">
                {stats.length > 0 ? stats.map((stat) => {
                    const meta = statMeta(stat.label);
                    return (
                        <KpiStatCard
                            key={stat.label}
                            label={stat.label}
                            value={stat.value}
                            loading={loading}
                            to={meta.to}
                            icon={meta.icon}
                            intent={meta.intent}
                            hint={meta.hint}
                        />
                    );
                }) : loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <KpiStatCard key={i} label="加载中…" value={0} loading={true} />
                    ))
                ) : null}
            </div>

            <Card className="border-border bg-card" data-testid="teacher-dashboard-active-tasks">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-section-title text-foreground">当前活动商务调研任务</CardTitle>
                        <p className="mt-1 text-meta text-muted-foreground">实时追踪各班试投质检、二轮抽样调优与商业报告提交进度</p>
                    </div>
                    <Button variant="outline" size="sm" asChild><Link to="/task">全部实验任务</Link></Button>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-8 text-label text-muted-foreground">加载中...</div>
                    ) : loadError ? (
                        <div className="py-10 text-center text-label text-destructive">活动任务加载失败，请重试</div>
                    ) : activeTasks.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-label text-muted-foreground">当前没有已开放且未截止的实验任务</p>
                            <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/task">进入实验任务管理</Link></Button>
                        </div>
                    ) : activeTasks.map((item) => {
                        const progress = item.total > 0 ? Math.round(item.completed / item.total * 100) : 0;
                        return (
                            <Link key={item.id} to={`/task/${item.id}/progress`} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-control px-3 py-4 transition-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                                <div className="min-w-0 flex-[2_1_16rem]">
                                    <p className="text-label font-semibold text-foreground">{item.templateName}</p>
                                    <p className="mt-1 text-meta text-muted-foreground">{item.className}</p>
                                </div>
                                <div className="flex-[1_1_13rem]">
                                    <div className="flex justify-between text-meta tabular-nums text-muted-foreground">
                                        <span>已提交 {item.completed}/{item.total}</span>
                                        <span aria-hidden="true" className="font-semibold text-foreground">{progress}%</span>
                                    </div>
                                    <Progress aria-label={`${item.templateName}提交进度`} value={progress} className="mt-2 h-2" />
                                </div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <StatusBadge intent={item.pending > 0 ? "warning" : "neutral"}>待批改 {item.pending}</StatusBadge>
                                    {item.rejected > 0 && <StatusBadge intent="destructive">需重做 {item.rejected}</StatusBadge>}
                                    <span className="flex items-center gap-1 text-meta tabular-nums text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        {item.deadline ? formatDateTimeDisplay(item.deadline, "-") : "无截止时间"}
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </Link>
                        );
                    })}
                </CardContent>
            </Card>

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="flex max-h-[80vh] max-w-lg flex-col border-border bg-card text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Megaphone className="h-5 w-5 text-info" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            查看最近发布的系统公告列表。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 space-y-2 overflow-y-auto py-2">
                        {announcements.length === 0 ? (
                            <div className="py-8 text-center text-label text-muted-foreground">暂无公告</div>
                        ) : (
                            announcements.map(item => (
                                <button
                                    key={item.id}
                                    className="w-full rounded-surface border border-border p-3 text-left transition-none hover:border-input hover:bg-muted"
                                    onClick={() => handleAnnouncementClick(item)}
                                >
                                    <div className="flex items-start gap-2">
                                        <Circle className="mt-1.5 h-2 w-2 shrink-0 fill-info text-info" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-label font-medium text-foreground">
                                                {item.title}
                                            </div>
                                            <div className="mt-1 text-meta text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                            </div>
                                        </div>
                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null); }}>
                <DialogContent className="flex max-h-[80vh] max-w-lg flex-col border-border bg-card text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-body text-foreground">{selectedAnnouncement?.title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            查看系统公告的完整内容。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="-mt-2 text-meta text-muted-foreground">
                        {selectedAnnouncement?.createdAt && new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                    </div>
                    <div className="flex-1 overflow-y-auto py-4">
                        <RichTextContent
                            html={selectedAnnouncement?.content ?? ""}
                            className="text-label leading-relaxed text-foreground"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
