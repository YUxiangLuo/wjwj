import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, School, CalendarDays } from "lucide-react";
import { teacherApi, type TeacherClass } from "../api-client";

export function ClassManagement() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [loading, setLoading] = useState(true);
    const [semesterFilter, setSemesterFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadClasses();
    }, []);

    async function loadClasses() {
        setLoading(true);
        const res = await teacherApi.getClasses();
        if (res.success && res.data) {
            setClasses(res.data);
        }
        setLoading(false);
    }

    const semesters = useMemo(() => {
        const values = classes.map((cls) => cls.semester).filter(Boolean) as string[];
        return Array.from(new Set(values));
    }, [classes]);

    const summary = useMemo(() => {
        const total = classes.length;
        const studentTotal = classes.reduce((sum, cls) => sum + cls.studentCount, 0);
        const semesterCount = semesters.length;
        return { total, studentTotal, semesterCount };
    }, [classes, semesters]);

    const filteredClasses = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return classes.filter((cls) => {
            const matchesSemester = semesterFilter === "all" || cls.semester === semesterFilter;
            const matchesKeyword = !keyword || cls.name.toLowerCase().includes(keyword);
            return matchesSemester && matchesKeyword;
        });
    }, [classes, semesterFilter, searchTerm]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">班级管理</h2>
                <p className="text-sm text-slate-500 mt-1">查看班级名单与学期分布。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">班级总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">学生总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">学期数量</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.semesterCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">班级列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredClasses.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索班级名称"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-64"
                        />
                        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                            <SelectTrigger className="sm:w-44">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((semester) => (
                                    <SelectItem key={semester} value={semester}>
                                        {semester}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-slate-500">加载中...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>班级名称</TableHead>
                                    <TableHead>学期</TableHead>
                                    <TableHead>学生人数</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow key={cls.id}>
                                        <TableCell className="font-medium text-slate-900">{cls.name}</TableCell>
                                        <TableCell>{cls.semester || "-"}</TableCell>
                                        <TableCell>{cls.studentCount} 人</TableCell>
                                        <TableCell className="text-slate-500">{new Date(cls.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Link to={`/class/${cls.id}/students`}>
                                                    <Button variant="ghost" size="sm" className="text-blue-600">管理学生</Button>
                                                </Link>
                                                <Button variant="ghost" size="sm">查看详情</Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                            暂无符合条件的数据
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
