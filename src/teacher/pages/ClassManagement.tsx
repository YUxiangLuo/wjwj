import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Search } from "lucide-react";
import { teacherApi, type TeacherClass } from "../api-client";
import { PageHeader } from "@/components/PageHeader";

export function ClassManagement() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("班级列表加载失败");
    const [semesterFilter, setSemesterFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        void loadClasses();
    }, []);

    async function loadClasses() {
        return run(async () => requireApiData(await teacherApi.getClasses(), "班级列表加载失败"), setClasses);
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
        <div className="space-y-4">
            <p className="text-label text-muted-foreground">查看班级名单与学期分布。</p>

            <dl aria-label="班级概览" className="grid grid-cols-3 gap-3.5">
                {[["班级总数", summary.total], ["学生总数", summary.studentTotal], ["学期数量", summary.semesterCount]].map(([label, value]) => (
                    <div key={label} className="rounded-surface border border-border bg-card px-4 py-3">
                        <dt className="text-meta font-medium text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-page-title font-medium tabular-nums text-foreground">{loading || loadError ? "-" : value}</dd>
                    </div>
                ))}
            </dl>

            <Card className="gap-0 overflow-hidden border-border bg-card py-0">
                <PageHeader as={CardHeader} className="flex-wrap border-b border-border px-5 py-4 [.border-b]:pb-4">
                    <div>
                        <CardTitle className="text-section-title font-medium text-foreground">班级列表</CardTitle>
                        <p className="mt-0.5 text-meta text-muted-foreground">
                            {loading || loadError ? "共 - 条数据" : `共 ${filteredClasses.length} 条数据`}
                        </p>
                    </div>
                    <div className="flex w-auto flex-row flex-wrap items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-class-search"
                                aria-label="搜索班级名称"
                                placeholder="搜索班级名称"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-64 pl-9"
                            />
                        </div>
                        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                            <SelectTrigger aria-label="按学期筛选班级" data-testid="teacher-class-semester-filter" className="w-44 bg-card">
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
                </PageHeader>
                <CardContent className="p-0">
                    {loadError ? (
                        <div className="p-5">
                            <RequestError message={loadError} onRetry={() => void loadClasses()} />
                        </div>
                    ) : loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-12 text-label text-muted-foreground">加载中...</div>
                    ) : (
                        <Table aria-label="班级列表">
                            <TableHeader>
                                <TableRow className="border-border">
                                    <TableHead className="text-muted-foreground">班级名称</TableHead>
                                    <TableHead className="text-muted-foreground">学期</TableHead>
                                    <TableHead className="text-muted-foreground">学生人数</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-right text-muted-foreground">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow data-testid={`teacher-class-row-${cls.id}`} key={cls.id} className="border-border transition-none hover:bg-muted">
                                        <TableCell className="font-medium text-foreground">{cls.name}</TableCell>
                                        <TableCell className="text-foreground">{cls.semester || "-"}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-control bg-muted px-2 py-0.5 text-meta font-medium tabular-nums text-foreground">
                                                {cls.studentCount} 人
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-meta tabular-nums text-muted-foreground">{new Date(cls.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild data-testid={`teacher-class-manage-students-${cls.id}`} variant="outline" size="sm" className="h-8 px-3">
                                                <Link to={`/class/${cls.id}/students`}>
                                                    <Users className="mr-1 h-3.5 w-3.5" />
                                                    管理学生
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="whitespace-normal py-14 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <Search className="h-6 w-6 text-muted-foreground" />
                                                <p>暂无符合条件的数据</p>
                                                {(searchTerm || semesterFilter !== "all") && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="mt-1"
                                                        onClick={() => {
                                                            setSearchTerm("");
                                                            setSemesterFilter("all");
                                                        }}
                                                    >
                                                        清空筛选条件
                                                    </Button>
                                                )}
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
