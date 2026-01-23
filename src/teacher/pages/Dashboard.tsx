import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, School, BookOpen, ClipboardList, PenLine, ArrowUpRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { teacherApi, type TeacherStats } from "../api-client";

function StatCard({ icon: Icon, label, value, color, loading }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    color: string;
    loading?: boolean;
}) {
    // Map colors to class names
    const colorStyles: Record<string, { bg: string, text: string, border: string }> = {
        blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
        emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
        rose: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
        amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
        slate: { bg: "bg-slate-800", text: "text-slate-400", border: "border-slate-700" },
    };

    const style = colorStyles[color] || colorStyles.slate!;

    return (
        <Card className="border-slate-800 bg-slate-900 hover:border-slate-700 transition-all duration-200">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">{label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-slate-100">
                                {loading ? <div className="h-9 w-12 bg-slate-800 rounded animate-pulse" /> : value}
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
}

export function Dashboard() {
    const [stats, setStats] = useState<TeacherStats["stats"]>([]);
    const [recentSubmissions, setRecentSubmissions] = useState<TeacherStats["recentSubmissions"]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const res = await teacherApi.getStats();
        if (res.success && res.data) {
            setStats(res.data.stats);
            setRecentSubmissions(res.data.recentSubmissions);
        }
        setLoading(false);
    }

    const getIconAndColor = (label: string) => {
        switch (label) {
            case "我的班级": return { icon: School, color: "blue" };
            case "我的课题": return { icon: BookOpen, color: "emerald" };
            case "待批改作业": return { icon: PenLine, color: "rose" };
            case "进行中任务": return { icon: ClipboardList, color: "amber" };
            default: return { icon: LayoutDashboard, color: "slate" };
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-100">教学概览</h2>
                <p className="text-sm text-slate-400 mt-1">关注班级、课题与待批改任务。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.length > 0 ? stats.map((stat) => {
                    const { icon, color } = getIconAndColor(stat.label);
                    return (
                        <StatCard
                            key={stat.label}
                            icon={icon}
                            label={stat.label}
                            value={stat.value}
                            color={color}
                            loading={loading}
                        />
                    );
                }) : (
                    // Skeletons if stats are empty initially or loading
                    Array.from({ length: 4 }).map((_, i) => (
                        <StatCard key={i} icon={LayoutDashboard} label="Loading..." value={0} color="slate" loading={true} />
                    ))
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Recent Submissions */}
                <Card className="xl:col-span-2 border-slate-800 bg-slate-900">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-100">最近提交</CardTitle>
                        <Button variant="outline" size="sm" asChild className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white">
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
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/30 hover:bg-slate-800/50 hover:border-slate-700 transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="w-10 h-10 border border-slate-700">
                                            <AvatarFallback className="bg-indigo-950 text-indigo-400 text-sm font-semibold">{item.student[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{item.student}</div>
                                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{item.class}</span>
                                                <span>·</span>
                                                <span className="text-indigo-400">{item.topic}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                        <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                                        <Button size="sm" variant="outline" className="h-8 border-slate-700 text-slate-300 hover:text-white" asChild>
                                            <Link to="/grading">批改</Link>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="border-slate-800 bg-slate-900 h-fit">
                    <CardHeader className="border-b border-slate-800 pb-4">
                        <CardTitle className="text-lg text-slate-100">快捷入口</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-3">
                        <Button className="w-full justify-between h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 group" asChild>
                            <Link to="/grading">
                                <span className="flex items-center gap-2">
                                    <PenLine className="w-4 h-4" />
                                    进入批改
                                </span>
                                <ArrowUpRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </Link>
                        </Button>
                        <Button variant="outline" className="w-full justify-between h-12 border-slate-700 bg-slate-800/30 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-all group" asChild>
                            <Link to="/topic">
                                <span className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4" />
                                    创建新课题
                                </span>
                                <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </Link>
                        </Button>
                        <Button variant="outline" className="w-full justify-between h-12 border-slate-700 bg-slate-800/30 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-all group" asChild>
                            <Link to="/export">
                                <span className="flex items-center gap-2">
                                    <GraduationCap className="w-4 h-4" />
                                    导出成绩
                                </span>
                                <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
