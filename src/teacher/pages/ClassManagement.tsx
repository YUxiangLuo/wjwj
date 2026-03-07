import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, School, CalendarDays, Search } from "lucide-react";
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-100">班级管理</h2>
                <p className="text-sm text-slate-400 mt-1">查看班级名单与学期分布。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">班级总数</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">学期数量</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.semesterCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">班级列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredClasses.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                data-testid="teacher-class-search"
                                placeholder="搜索班级名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 sm:w-64 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                            <SelectTrigger data-testid="teacher-class-semester-filter" className="bg-slate-950 border-slate-800 text-slate-200 sm:w-44">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
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
                <CardContent className="pt-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-slate-500">加载中...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                    <TableHead className="text-slate-400">班级名称</TableHead>
                                    <TableHead className="text-slate-400">学期</TableHead>
                                    <TableHead className="text-slate-400">学生人数</TableHead>
                                    <TableHead className="text-slate-400">创建时间</TableHead>
                                    <TableHead className="text-slate-400 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow data-testid={`teacher-class-row-${cls.id}`} key={cls.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="font-medium text-slate-200">{cls.name}</TableCell>
                                        <TableCell className="text-slate-300">{cls.semester || "-"}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
                                                {cls.studentCount} 人
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-xs">{new Date(cls.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <Link to={`/class/${cls.id}/students`}>
                                                <Button data-testid={`teacher-class-manage-students-${cls.id}`} variant="ghost" size="sm" className="h-8 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10">
                                                    <Users className="w-3.5 h-3.5 mr-1" />
                                                    管理学生
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-16 text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-slate-500" />
                                                </div>
                                                <p>暂无符合条件的数据</p>
                                            </div>
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
