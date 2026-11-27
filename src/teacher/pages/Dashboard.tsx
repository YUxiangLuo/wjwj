import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Megaphone, ChevronRight, Clock, AlertCircle, RefreshCw, School, BookOpen, PenLine, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { KpiStatCard } from "@/components/KpiStatCard";
import { TeacherActiveTasksStructureCard } from "@/components/charts/PortalAnalyticsCharts";
import { teacherApi, type TeacherStats, type TeacherAnnouncement } from "../api-client";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTimeDisplay } from "@/utils/format";

export function Dashboard() {
    const navigate = useNavigate();
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
                return { to: "/class", icon: School, hint: "授课班级与学生名册" };
            case "我的实验模板":
                return { to: "/topic", icon: BookOpen, hint: "商业案例与投放配置" };
            case "待批改作业":
                return { to: "/grading", icon: PenLine, hint: "多轮调优轨迹批改" };
            case "进行中实验任务":
                return { to: "/task", icon: ClipboardList, hint: "五阶段实训进度跟踪" };
            default:
                return { to: undefined, icon: ClipboardList, hint: undefined };
        }
    };

    const topicCount = stats.find((item) => item.label === "我的实验模板")?.value ?? null;

    return (
        <div className="space-y-4">
            {loadError && (
                <div role="alert" className="flex items-center justify-between gap-4 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-2.5 text-label text-destructive">
                    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{loadError}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} className="border-destructive-border bg-card text-destructive hover:bg-destructive-muted hover:text-destructive"><RefreshCw className="mr-1.5 h-4 w-4" />重试</Button>
                </div>
            )}

            {announcements.length > 0 && (() => {
                const latest = announcements[0]!;
                return (
                    <div className="flex items-center gap-3 rounded-surface border border-border bg-muted px-3.5 py-2">
                        <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-label font-medium text-foreground">{latest.title}</span>
                        <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{announcements.length} 条通知</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2.5 text-primary hover:bg-accent hover:text-accent-foreground"
                            onClick={() => setShowAnnouncements(true)}
                        >
                            查看详情
                            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                        </Button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-4 gap-3.5">
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
                            intent="neutral"
                            hint={meta.hint}
                            className="py-3"
                        />
                    );
                }) : loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <KpiStatCard key={i} label="加载中…" value={0} loading={true} className="py-3" />
                    ))
                ) : null}
            </div>

            <Card className="gap-0 overflow-hidden border-border bg-card py-0" data-testid="teacher-dashboard-active-tasks">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3.5 [.border-b]:pb-3.5">
                    <div>
                        <CardTitle className="text-section-title font-medium text-foreground">当前活动商务调研任务</CardTitle>
                        <p className="mt-0.5 text-meta text-muted-foreground">实时追踪各班试投质检、二轮抽样调优与商业报告提交进度</p>
                    </div>
                    <Button variant="outline" size="sm" asChild><Link to="/task">全部实验任务</Link></Button>
                </CardHeader>
                <CardContent className="divide-y divide-border p-0">
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-8 text-label text-muted-foreground">加载中...</div>
                    ) : loadError ? (
                        <div className="py-10 text-center text-label text-destructive">活动任务加载失败，请重试</div>
                    ) : activeTasks.length === 0 ? (
                        <div className="px-6 py-10 text-center">
                            <p className="text-label font-medium text-foreground">当前没有已开放且未截止的实验任务</p>
                            {topicCount === 0 ? (
                                <p className="mx-auto mt-1.5 max-w-lg text-meta text-muted-foreground">
                                    尚未创建商业实验模板。请先完成七步模板配置并发布，再在实验任务中分配给授课班级。
                                </p>
                            ) : (
                                <p className="mx-auto mt-1.5 max-w-lg text-meta text-muted-foreground">
                                    可将已发布的商业实验模板分配给班级，或延长已截止任务的提交时间。
                                </p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                                {topicCount === 0 && (
                                    <Button asChild size="sm">
                                        <Link to="/topic">前往创建实验模板</Link>
                                    </Button>
                                )}
                                <Button asChild variant="outline" size="sm">
                                    <Link to="/task">进入实验任务管理</Link>
                                </Button>
                            </div>
                        </div>
                    ) : activeTasks.map((item) => {
                        const progress = item.total > 0 ? Math.round(item.completed / item.total * 100) : 0;
                        return (
                            <Link key={item.id} to={`/task/${item.id}/progress`} className="grid grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)_10.5rem_1rem] items-center gap-x-4 px-5 py-3.5 transition-none hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                                <div className="min-w-0">
                                    <p className="break-words text-label font-medium text-foreground">{item.templateName}</p>
                                    <p className="mt-0.5 truncate text-meta text-muted-foreground">{item.className}</p>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex justify-between text-meta tabular-nums text-muted-foreground">
                                        <span>已提交 {item.completed}/{item.total}</span>
                                        <span aria-hidden="true" className="font-medium text-foreground">{progress}%</span>
                                    </div>
                                    <Progress aria-label={`${item.templateName}提交进度`} value={progress} className="mt-1.5 h-2" />
                                </div>
                                <div className="min-w-0 text-right">
                                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                        <StatusBadge intent={item.pending > 0 ? "warning" : "neutral"}>待批改 {item.pending}</StatusBadge>
                                        {item.rejected > 0 && <StatusBadge intent="destructive">需重做 {item.rejected}</StatusBadge>}
                                    </div>
                                    <span className="mt-1 flex items-center justify-end gap-1 whitespace-nowrap text-meta tabular-nums text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5 shrink-0" />
                                        {item.deadline ? formatDateTimeDisplay(item.deadline, "-") : "无截止时间"}
                                    </span>
                                </div>
                                <ChevronRight className="h-4 w-4 justify-self-end text-muted-foreground" />
                            </Link>
                        );
                    })}
                </CardContent>
            </Card>

            {!loading && !loadError && activeTasks.length > 0 && (
                <TeacherActiveTasksStructureCard
                    activeTasks={activeTasks}
                    onSelectTask={(id) => navigate(`/task/${id}/progress`)}
                />
            )}

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="flex max-h-[80vh] max-w-lg flex-col border-border bg-card text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Megaphone className="h-5 w-5 text-muted-foreground" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            查看最近发布的系统公告列表。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 divide-y divide-border overflow-y-auto rounded-surface border border-border">
                        {announcements.length === 0 ? (
                            <div className="py-8 text-center text-label text-muted-foreground">暂无公告</div>
                        ) : (
                            announcements.map(item => (
                                <button
                                    key={item.id}
                                    className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left transition-none hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                                    onClick={() => handleAnnouncementClick(item)}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-label font-medium text-foreground">
                                            {item.title}
                                        </div>
                                        <div className="mt-0.5 text-meta text-muted-foreground">
                                            {new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null); }}>
                <DialogContent className="flex max-h-[80vh] max-w-lg flex-col border-border bg-card text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-subheading font-medium text-foreground">{selectedAnnouncement?.title}</DialogTitle>
                        <DialogDescription className="sr-only">
                            查看系统公告的完整内容。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="-mt-2 text-meta text-muted-foreground">
                        {selectedAnnouncement?.createdAt && new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                    </div>
                    <div className="flex-1 overflow-y-auto py-3">
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
