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
        "我的班级": "bg-blue-500",
        "我的课题": "bg-emerald-500",
        "待批改作业": "bg-destructive",
        "进行中任务": "bg-amber-500",
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = iconMap[stat.label] ?? LayoutDashboard;
                    const color = colorMap[stat.label] ?? "bg-gray-500";
                    const highlight = stat.label === "待批改作业" && stat.value > 0;

                    return (
                        <Card key={stat.label} className={`cursor-pointer hover:shadow-md transition-shadow ${highlight ? "ring-2 ring-destructive/20" : ""}`}>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                                    <span className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white`}>
                                        <Icon className="w-5 h-5" />
                                    </span>
                                </div>
                                <div className={`text-3xl font-bold ${highlight ? "text-destructive" : "text-foreground"}`}>{stat.value}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">快捷入口</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                    <Link to="/grading">
                        <Button variant="destructive">
                            <PenLine className="w-4 h-4 mr-2" />
                            进入批改
                        </Button>
                    </Link>
                    <Link to="/topic">
                        <Button>+ 创建新课题</Button>
                    </Link>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">最近提交</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {recentSubmissions.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-4">暂无提交记录</div>
                    ) : (
                        recentSubmissions.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-8 h-8">
                                        <AvatarFallback className="bg-accent text-accent-foreground text-sm">{item.student[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-medium text-foreground">{item.student}</div>
                                        <div className="text-xs text-muted-foreground">{item.class} · {item.topic}</div>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground">{item.time}</span>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
