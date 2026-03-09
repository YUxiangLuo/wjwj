import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, ClipboardList, Search, FileEdit, XCircle, Clock, UserCheck } from "lucide-react";
import { teacherApi, type GradingItem } from "../api-client";

export function GradingManagement() {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<GradingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("all-status");
    const [filterClass, setFilterClass] = useState("all-class");
    const [filterTopic, setFilterTopic] = useState("all-topic");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadGradingList();
    }, [filterStatus]);

    async function loadGradingList() {
        setLoading(true);
        const effectiveStatus = filterStatus === "all-status" ? undefined : filterStatus;
        const res = await teacherApi.getGradingList(effectiveStatus);
        if (res.success && res.data) {
            setSubmissions(res.data);
        }
        setLoading(false);
    }

    const getStatusBadge = (status: number, score?: number | null) => {
        switch (status) {
            case 0: return <Badge variant="secondary" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/20"><FileEdit className="w-3 h-3 mr-1" /> 批改草稿</Badge>;
            case 1: return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20"><Clock className="w-3 h-3 mr-1" /> 待批改</Badge>;
            case 2: return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> 已批改 ({score ?? 0}分)</Badge>;
            case 3: return <Badge variant="destructive" className="bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20"><XCircle className="w-3 h-3 mr-1" /> 已驳回</Badge>;
            default: return <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">未知状态</Badge>;
        }
    };

    // 获取批改人显示
    const getGraderBadge = (item: GradingItem) => {
        if (item.status !== 2 && item.status !== 3) return null;
        if (!item.gradedByName) return null;
        
        const isTeacher = item.gradedByType === 2;
        return (
            <Badge 
                variant="outline" 
                className={`text-xs ${isTeacher ? 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10' : 'text-purple-600 border-purple-500/30 bg-purple-500/10'}`}
            >
                <UserCheck className="w-3 h-3 mr-1" />
                {isTeacher ? '教师' : '助教'}: {item.gradedByName}
            </Badge>
        );
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

    const topicOptions = useMemo(() => {
        const values = submissions.map((sub) => sub.topic).filter(Boolean);
        return Array.from(new Set(values));
    }, [submissions]);

    const filteredSubmissions = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return submissions.filter((sub) => {
            const matchesClass = filterClass === "all-class" || sub.className === filterClass;
            const matchesTopic = filterTopic === "all-topic" || sub.topic === filterTopic;
            const matchesKeyword = !keyword ||
                sub.studentName.toLowerCase().includes(keyword) ||
                sub.studentId.toLowerCase().includes(keyword) ||
                sub.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesTopic && matchesKeyword;
        });
    }, [submissions, filterClass, filterTopic, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">作业批改</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">查看待批改列表并快速进入评分。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">提交总数</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">待批改</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.pending}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <Clock className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已批改</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.graded}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已驳回</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.rejected}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center border border-rose-500/20">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-900 dark:text-slate-100">批改列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredSubmissions.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                data-testid="teacher-grading-search"
                                placeholder="搜索学生/课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={filterClass} onValueChange={setFilterClass}>
                            <SelectTrigger data-testid="teacher-grading-class-filter" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all-class">全部班级</SelectItem>
                                {classOptions.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTopic} onValueChange={setFilterTopic}>
                            <SelectTrigger data-testid="teacher-grading-topic-filter" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all-topic">全部课题</SelectItem>
                                {topicOptions.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger data-testid="teacher-grading-status-filter" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all-status">全部状态</SelectItem>
                                <SelectItem value="pending">待批改</SelectItem>
                                <SelectItem value="draft">批改草稿</SelectItem>
                                <SelectItem value="graded">已批改</SelectItem>
                                <SelectItem value="rejected">被驳回</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                    {loading ? <div className="text-center py-12 text-slate-500">加载中...</div> : (
                        filteredSubmissions.length === 0 ?
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-3">
                                    <ClipboardList className="w-6 h-6 text-slate-500" />
                                </div>
                                <p>暂无待批改作业</p>
                            </div>
                            :
                            filteredSubmissions.map((sub) => (
                                <div data-testid={`teacher-grading-card-${sub.id}`} key={sub.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="w-10 h-10 border border-slate-300 dark:border-slate-700">
                                                <AvatarFallback className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{sub.studentName[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{sub.studentName}</span>
                                                    <span className="text-xs font-mono text-slate-500">({sub.studentId})</span>
                                                </div>
                                                <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{sub.className} · <span className="text-indigo-500">{sub.topic}</span></div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {getStatusBadge(sub.status, sub.score)}
                                            {getGraderBadge(sub)}
                                            <div className="text-xs text-slate-500 mt-1">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "-"}</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                                        {sub.status === 1 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                                                <FileEdit className="w-3.5 h-3.5 mr-2" />
                                                开始批改
                                            </Button>
                                        )}
                                        {sub.status === 0 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-950 dark:text-slate-50">
                                                <FileEdit className="w-3.5 h-3.5 mr-2" />
                                                继续批改
                                            </Button>
                                        )}
                                        {sub.status === 2 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} variant="ghost" size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800">
                                                查看详情
                                            </Button>
                                        )}
                                        {sub.status === 3 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} variant="ghost" size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10">
                                                查看原因
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
