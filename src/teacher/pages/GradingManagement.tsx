import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, ClipboardList, Search } from "lucide-react";
import { teacherApi, type GradingItem } from "../api-client";

export function GradingManagement() {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<GradingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("all-status");
    const [filterClass, setFilterClass] = useState("all-class");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadGradingList();
    }, [filterStatus]);

    async function loadGradingList() {
        setLoading(true);
        // Map UI filter to API status needed? 
        // Currently API supports 'pending' or all. Frontend filtering might be better for now if API is simple.
        // Or if filterStatus is passed directly.
        const effectiveStatus = filterStatus === "all-status" ? undefined : filterStatus;

        const res = await teacherApi.getGradingList(effectiveStatus);
        if (res.success && res.data) {
            setSubmissions(res.data);
        }
        setLoading(false);
    }

    const getStatusBadge = (status: number, score?: number | null) => {
        switch (status) { // 0=draft(unsubmitted?), 1=pending, 2=graded, 3=rejected
            case 1: return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">待批改</Badge>;
            case 0: return <Badge variant="secondary">草稿</Badge>; // Wait, 0 usually means draft (not submitted) or editing
            case 2: return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已批改 ({score ?? 0}分)</Badge>;
            case 3: return <Badge variant="destructive">已驳回</Badge>;
            default: return <Badge variant="outline">未知状态</Badge>;
        }
    };

    const summary = useMemo(() => {
        const total = submissions.length;
        const pending = submissions.filter((sub) => sub.status === 1).length;
        const graded = submissions.filter((sub) => sub.status === 2).length;
        const rejected = submissions.filter((sub) => sub.status === 3).length;
        return { total, pending, graded, rejected };
    }, [submissions]);

    const classOptions = useMemo(() => {
        const values = submissions.map((sub) => sub.className).filter(Boolean);
        return Array.from(new Set(values));
    }, [submissions]);

    const filteredSubmissions = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return submissions.filter((sub) => {
            const matchesClass = filterClass === "all-class" || sub.className === filterClass;
            const matchesKeyword = !keyword ||
                sub.studentName.toLowerCase().includes(keyword) ||
                sub.studentId.toLowerCase().includes(keyword) ||
                sub.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesKeyword;
        });
    }, [submissions, filterClass, searchTerm]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">作业批改</h2>
                <p className="text-sm text-slate-500 mt-1">查看待批改列表并快速进入评分。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">提交总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">待批改</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.pending}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已批改</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.graded}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已驳回</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.rejected}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">批改列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredSubmissions.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="搜索学生/课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={filterClass} onValueChange={setFilterClass}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-class">全部班级</SelectItem>
                                {classOptions.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-status">全部状态</SelectItem>
                                <SelectItem value="pending">待批改</SelectItem>
                                <SelectItem value="graded">已批改</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {loading ? <div className="text-center py-6 text-slate-500">加载中...</div> : (
                        filteredSubmissions.length === 0 ? <div className="text-center text-slate-500 py-6">暂无待批改作业</div> :
                            filteredSubmissions.map((sub) => (
                                <div key={sub.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="w-10 h-10">
                                                <AvatarFallback className="bg-slate-200 text-slate-600">{sub.studentName[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900">{sub.studentName}</span>
                                                    <span className="text-xs text-slate-500">({sub.studentId})</span>
                                                </div>
                                                <div className="text-xs text-slate-500">{sub.className} · {sub.topic}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {getStatusBadge(sub.status, sub.score)}
                                            <div className="text-xs text-slate-500 mt-1">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "-"}</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end mt-3">
                                        {sub.status === 1 && <Button size="sm" onClick={() => navigate(`/grading/${sub.id}`)}>开始批改</Button>}
                                        {sub.status === 2 && <Button variant="outline" size="sm" onClick={() => navigate(`/grading/${sub.id}`)}>查看详情</Button>}
                                        {sub.status === 3 && <Button variant="outline" size="sm" onClick={() => navigate(`/grading/${sub.id}`)}>查看原因</Button>}
                                    </div>
                                </div>
                            ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
