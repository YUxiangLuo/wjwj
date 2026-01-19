import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { teacherApi, type GradingItem } from "../api-client";

export function GradingManagement() {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<GradingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("all-status");

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

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">作业批改</CardTitle>
                <div className="flex gap-3">
                    <Select defaultValue="all-class">
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all-class">全部班级</SelectItem>
                            {/* Fetch classes dynamically if needed, but for now placeholder */}
                            <SelectItem value="class1">统计学2024-1班</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select defaultValue="all-status" onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
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
                {loading ? <div className="text-center py-4">加载中...</div> : (
                    submissions.length === 0 ? <div className="text-center text-muted-foreground py-4">暂无待批改作业</div> :
                        submissions.map((sub) => (
                            <div key={sub.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="w-10 h-10">
                                            <AvatarFallback className="bg-accent text-accent-foreground">{sub.studentName[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{sub.studentName}</span>
                                                <span className="text-xs text-muted-foreground">({sub.studentId})</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">{sub.className} · {sub.topic}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {getStatusBadge(sub.status, sub.score)}
                                        <div className="text-xs text-muted-foreground mt-1">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "-"}</div>
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
    );
}
