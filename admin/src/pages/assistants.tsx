import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, MoreHorizontal, KeyRound, Ban, CheckCircle, Trash2 } from 'lucide-react'
import { mockAssistants } from '@/data/mock'
import type { Assistant } from '@/types'

export function AssistantsPage() {
    const [assistants, setAssistants] = useState<Assistant[]>(mockAssistants)
    const [search, setSearch] = useState('')

    const filteredAssistants = assistants.filter(
        (a) =>
            a.account.toLowerCase().includes(search.toLowerCase()) ||
            a.name.toLowerCase().includes(search.toLowerCase())
    )

    const toggleStatus = (id: number) => {
        setAssistants(
            assistants.map((a) =>
                a.id === id ? { ...a, status: a.status === 1 ? 0 : 1 } : a
            )
        )
    }

    const handleDelete = (id: number) => {
        setAssistants(assistants.filter((a) => a.id !== id))
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">助教管理</h1>
                <p className="text-muted-foreground">
                    助教由教师创建，管理员可以管理现有账号
                </p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>助教列表</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索账号或姓名..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>账号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>创建者</TableHead>
                                <TableHead>绑定班级</TableHead>
                                <TableHead>最后登录</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAssistants.map((assistant) => (
                                <TableRow key={assistant.id}>
                                    <TableCell className="font-medium">
                                        {assistant.account}
                                    </TableCell>
                                    <TableCell>{assistant.name}</TableCell>
                                    <TableCell>
                                        {assistant.status === 1 ? (
                                            <Badge className="bg-green-500">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{assistant.creatorName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {assistant.classNames.map((c) => (
                                                <Badge key={c} variant="outline" className="text-xs">
                                                    {c}
                                                </Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>{assistant.lastLogin}</TableCell>
                                    <TableCell>{assistant.createdAt}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    重置密码
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => toggleStatus(assistant.id)}
                                                >
                                                    {assistant.status === 1 ? (
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
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => handleDelete(assistant.id)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    删除
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
