import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, School, BookOpen, ClipboardList, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { teacherApi, type TeacherStats } from "../api-client";

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

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    }

    const iconMap: Record<string, any> = {
        "我的班级": School,
        "我的课题": BookOpen,
        "待批改作业": PenLine,
        "进行中任务": ClipboardList,
    };

    const colorMap: Record<string, string> = {
        "我的班级": "text-blue-600 bg-blue-50",
        "我的课题": "text-emerald-600 bg-emerald-50",
        "待批改作业": "text-rose-600 bg-rose-50",
        "进行中任务": "text-amber-600 bg-amber-50",
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">教学概览</h2>
                <p className="text-sm text-slate-500 mt-1">关注班级、课题与待批改任务。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = iconMap[stat.label] ?? LayoutDashboard;
                    const color = colorMap[stat.label] ?? "text-slate-600 bg-slate-100";
                    const highlight = stat.label === "待批改作业" && stat.value > 0;

                    return (
                        <Card key={stat.label} className={`border-slate-200 shadow-sm ${highlight ? "ring-2 ring-rose-200" : ""}`}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm text-slate-500">{stat.label}</span>
                                    <span className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
                                        <Icon className="w-5 h-5" />
                                    </span>
                                </div>
                                <div className={`text-3xl font-semibold ${highlight ? "text-rose-600" : "text-slate-900"}`}>{stat.value}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">快捷入口</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    <Link to="/grading">
                        <Button className="bg-rose-600 hover:bg-rose-700">
                            <PenLine className="w-4 h-4 mr-2" />
                            进入批改
                        </Button>
                    </Link>
                    <Link to="/topic">
                        <Button variant="outline">+ 创建新课题</Button>
                    </Link>
                </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">最近提交</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {recentSubmissions.length === 0 ? (
                        <div className="text-center text-sm text-slate-500 py-6">暂无提交记录</div>
                    ) : (
                        recentSubmissions.map((item, idx) => (
                            <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-9 h-9">
                                        <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">{item.student[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">{item.student}</div>
                                        <div className="text-xs text-slate-500">{item.class} · {item.topic}</div>
                                    </div>
                                </div>
                                <span className="text-xs text-slate-500">{item.time}</span>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
