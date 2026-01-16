import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Search, KeyRound, Ban, CheckCircle } from 'lucide-react'
import { mockStudents } from '@/data/mock'
import type { Student } from '@/types'
import { toast } from 'sonner'

type AlertType = 'resetPassword' | 'toggleStatus' | null

export function StudentsPage() {
    const [students, setStudents] = useState<Student[]>(mockStudents)
    const [search, setSearch] = useState('')
    const [searchResult, setSearchResult] = useState<Student | null>(null)
    const [searched, setSearched] = useState(false)
    const [alertType, setAlertType] = useState<AlertType>(null)

    const handleSearch = () => {
        if (!search.trim()) {
            setSearchResult(null)
            setSearched(false)
            return
        }
        const found = students.find((s) => s.studentId === search.trim())
        setSearchResult(found || null)
        setSearched(true)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }

    const openAlert = (type: AlertType) => {
        setAlertType(type)
    }

    const closeAlert = () => {
        setAlertType(null)
    }

    const handleResetPassword = () => {
        if (!searchResult) return
        toast.success('密码已重置', { description: `${searchResult.name} 的密码已重置为学号` })
        closeAlert()
    }

    const handleToggleStatus = () => {
        if (!searchResult) return
        const newStatus = searchResult.status === 1 ? 0 : 1
        setStudents(
            students.map((s) =>
                s.id === searchResult.id ? { ...s, status: newStatus } : s
            )
        )
        setSearchResult({ ...searchResult, status: newStatus })
        toast.success(
            newStatus === 1 ? '已启用' : '已停用',
            { description: `${searchResult.name} 的账号已${newStatus === 1 ? '启用' : '停用'}` }
        )
        closeAlert()
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">学生管理</h1>
                <p className="text-muted-foreground">通过学号检索学生信息</p>
            </div>

            {/* Reset Password Alert */}
            <AlertDialog open={alertType === 'resetPassword'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>重置密码</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要重置 <span className="font-medium text-foreground">{searchResult?.name}</span> 的密码吗？
                            新密码将被设置为学号。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetPassword}>确认重置</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Toggle Status Alert */}
            <AlertDialog open={alertType === 'toggleStatus'} onOpenChange={(open) => !open && closeAlert()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {searchResult?.status === 1 ? '停用账号' : '启用账号'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {searchResult?.status === 1 ? (
                                <>
                                    确定要停用 <span className="font-medium text-foreground">{searchResult?.name}</span> 的账号吗？
                                    停用后该学生将无法登录系统。
                                </>
                            ) : (
                                <>
                                    确定要启用 <span className="font-medium text-foreground">{searchResult?.name}</span> 的账号吗？
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleToggleStatus}
                            className={searchResult?.status === 1 ? 'bg-destructive hover:bg-destructive/90' : ''}
                        >
                            {searchResult?.status === 1 ? '停用' : '启用'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <CardTitle>学生检索</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 max-w-lg">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="输入学号搜索..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <Button onClick={handleSearch}>搜索</Button>
                    </div>
                </CardContent>
            </Card>

            {searched && (
                <Card>
                    <CardHeader>
                        <CardTitle>搜索结果</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {searchResult ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">学号</p>
                                        <p className="font-medium">{searchResult.studentId}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">姓名</p>
                                        <p className="font-medium">{searchResult.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">班级</p>
                                        <p className="font-medium">{searchResult.className}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">状态</p>
                                        {searchResult.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">最后登录</p>
                                        <p className="font-medium">{searchResult.lastLogin}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">创建时间</p>
                                        <p className="font-medium">{searchResult.createdAt}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-4 border-t">
                                    <Button variant="outline" onClick={() => openAlert('resetPassword')}>
                                        <KeyRound className="mr-2 h-4 w-4" />
                                        重置密码
                                    </Button>
                                    <Button variant="outline" onClick={() => openAlert('toggleStatus')}>
                                        {searchResult.status === 1 ? (
                                            <>
                                                <Ban className="mr-2 h-4 w-4" />
                                                停用账号
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                启用账号
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">未找到学号为 "{search}" 的学生</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
