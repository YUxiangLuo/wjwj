import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockClasses } from "../mock-data";

export function GradeExport() {
    const exportTasks = [
        { id: 1, topic: "消费者行为调研", class: "统计学2024-1班", graded: 45, total: 45, avgScore: 82.5 },
        { id: 2, topic: "消费者行为调研", class: "统计学2024-2班", graded: 40, total: 42, avgScore: 79.8 },
        { id: 3, topic: "市场竞争分析", class: "统计学2024-3班", graded: 35, total: 38, avgScore: 85.2 },
    ];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">成绩导出</CardTitle>
                    <div className="flex gap-3">
                        <Select defaultValue="all-class">
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-class">全部班级</SelectItem>
                                {mockClasses.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select defaultValue="all-topic">
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-topic">全部课题</SelectItem>
                                <SelectItem value="topic1">消费者行为调研</SelectItem>
                                <SelectItem value="topic2">市场竞争分析</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8">
                                    <input type="checkbox" className="rounded border-input" />
                                </TableHead>
                                <TableHead>课题</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>批改进度</TableHead>
                                <TableHead>平均分</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {exportTasks.map((task) => (
                                <TableRow key={task.id}>
                                    <TableCell>
                                        <input type="checkbox" className="rounded border-input" />
                                    </TableCell>
                                    <TableCell className="font-medium">{task.topic}</TableCell>
                                    <TableCell>{task.class}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={(task.graded / task.total) * 100} className="w-16 h-2" />
                                            <span className="text-xs text-muted-foreground">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && (
                                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">已完成</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">{task.avgScore.toFixed(1)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" className="text-primary">
                                                <FileSpreadsheet className="w-4 h-4 mr-1" />
                                                导出Excel
                                            </Button>
                                            <Button variant="ghost" size="sm">
                                                <FileText className="w-4 h-4 mr-1" />
                                                导出PDF
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">批量导出</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">已选择 0 项</span>
                        <Button variant="outline" disabled>
                            <FileSpreadsheet className="w-4 h-4" />
                            批量导出Excel
                        </Button>
                        <Button variant="outline" disabled>
                            <FileText className="w-4 h-4" />
                            批量导出PDF
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
