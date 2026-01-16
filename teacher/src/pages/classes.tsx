import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { School, Users, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mockClasses } from '@/data/mock'

export function ClassesPage() {
    const classes = mockClasses

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">班级管理</h1>
                <p className="text-muted-foreground">管理您负责的班级</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {classes.map((cls) => (
                    <Card key={cls.id}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <School className="h-5 w-5 text-primary" />
                                {cls.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">学期</span>
                                <span>{cls.semesterName}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">学生数</span>
                                <div className="flex items-center gap-1">
                                    <Users className="h-4 w-4" />
                                    <span>{cls.studentCount}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                            <Button variant="outline" className="flex-1" asChild>
                                <Link to={`/classes/${cls.id}/students`}>
                                    <Users className="mr-2 h-4 w-4" />
                                    管理学生
                                </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                                <Link to={`/classes/${cls.id}`}>
                                    <Eye className="h-4 w-4" />
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
