import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teacherApi, type TeacherClass } from "../api-client";

export function ClassManagement() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) return <div>加载中...</div>;

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">班级列表</CardTitle>
                <Select defaultValue="all">
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部学期</SelectItem>
                        {/* Deduplicate semesters if needed */}
                        <SelectItem value="2024-Spring">2024-Spring</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
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
                        {classes.map((cls) => (
                            <TableRow key={cls.id}>
                                <TableCell className="font-medium">{cls.name}</TableCell>
                                <TableCell>{cls.semester || "-"}</TableCell>
                                <TableCell>{cls.studentCount}人</TableCell>
                                <TableCell className="text-muted-foreground">{new Date(cls.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Link to={`/class/${cls.id}/students`}>
                                            <Button variant="ghost" size="sm" className="text-primary">管理学生</Button>
                                        </Link>
                                        <Button variant="ghost" size="sm">查看详情</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
