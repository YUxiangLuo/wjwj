import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, School, CalendarDays, Search } from "lucide-react";
import { teacherApi, type TeacherClass } from "../api-client";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";

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
                <h2 className="text-lg font-semibold text-foreground">班级管理</h2>
                <p className="text-sm text-muted-foreground mt-1">查看班级名单与学期分布。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">班级总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <School className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <IconTile intent="success">
                            <Users className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学期数量</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.semesterCount}</p>
                        </div>
                        <IconTile intent="warning">
                            <CalendarDays className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">班级列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredClasses.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-class-search"
                                placeholder="搜索班级名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground sm:w-64 focus:border-ring"
                            />
                        </div>
                        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                            <SelectTrigger data-testid="teacher-class-semester-filter" className="bg-background border-border text-foreground sm:w-44">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((semester) => (
                                    <SelectItem key={semester} value={semester}>
                                        {semester}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">加载中...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground">班级名称</TableHead>
                                    <TableHead className="text-muted-foreground">学期</TableHead>
                                    <TableHead className="text-muted-foreground">学生人数</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow data-testid={`teacher-class-row-${cls.id}`} key={cls.id} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-medium text-foreground">{cls.name}</TableCell>
                                        <TableCell className="text-foreground/90">{cls.semester || "-"}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground/90">
                                                {cls.studentCount} 人
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{new Date(cls.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</TableCell>
                                        <TableCell className="text-right">
                                            <Link to={`/class/${cls.id}/students`}>
                                                <Button data-testid={`teacher-class-manage-students-${cls.id}`} variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                    <Users className="w-3.5 h-3.5 mr-1" />
                                                    管理学生
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-muted-foreground" />
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
