import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Users, School, CalendarDays, Search } from "lucide-react";
import { teacherApi, type TeacherClass } from "../api-client";
import { mobileTableActionCellClass, mobileTableCellClass, mobileTableLabelClass } from "./responsive-table";

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
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">班级总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-primary">
                            <School className="size-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-success">
                            <Users className="size-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学期数量</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.semesterCount}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-warning">
                            <CalendarDays className="size-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base text-foreground">班级列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredClasses.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <SearchInput
                            data-testid="teacher-class-search"
                            placeholder="搜索班级名称"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-64"
                        />
                        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                            <SelectTrigger data-testid="teacher-class-semester-filter" className="sm:w-44">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部学期</SelectItem>
                                    {semesters.map((semester) => (
                                        <SelectItem key={semester} value={semester}>
                                            {semester}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pt-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">加载中...</div>
                    ) : (
                        <Table className="md:table">
                            <TableHeader className="hidden md:table-header-group">
                                <TableRow className="border-border hover:bg-muted/50">
                                    <TableHead className="text-muted-foreground">班级名称</TableHead>
                                    <TableHead className="text-muted-foreground">学期</TableHead>
                                    <TableHead className="text-muted-foreground">学生人数</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="block divide-y divide-border md:table-row-group md:divide-y-0">
                                {filteredClasses.map((cls) => (
                                    <TableRow data-testid={`teacher-class-row-${cls.id}`} key={cls.id} className="block border-b-0 py-3 hover:bg-muted/30 md:table-row md:border-b md:py-0">
                                        <TableCell className={`${mobileTableCellClass} font-medium text-foreground`}>
                                            <span className={mobileTableLabelClass}>班级名称</span>
                                            <span className="min-w-0 break-words">{cls.name}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableCellClass}>
                                            <span className={mobileTableLabelClass}>学期</span>
                                            <span className="min-w-0 break-words text-foreground">{cls.semester || "-"}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableCellClass}>
                                            <span className={mobileTableLabelClass}>学生人数</span>
                                            <Badge variant="muted">
                                                {cls.studentCount} 人
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`${mobileTableCellClass} text-xs text-muted-foreground`}>
                                            <span className={mobileTableLabelClass}>创建时间</span>
                                            <span>{new Date(cls.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableActionCellClass}>
                                            <div className="mb-2 text-xs font-medium tracking-wider text-muted-foreground md:hidden">操作</div>
                                            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                                                <Button data-testid={`teacher-class-manage-students-${cls.id}`} variant="ghost" size="xs" asChild>
                                                    <Link to={`/class/${cls.id}/students`}>
                                                        <Users data-icon="inline-start" />
                                                        管理学生
                                                    </Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow className="block md:table-row">
                                        <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                                            <Empty className="py-0">
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <Search />
                                                    </EmptyMedia>
                                                    <EmptyTitle>暂无符合条件的数据</EmptyTitle>
                                                </EmptyHeader>
                                            </Empty>
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
