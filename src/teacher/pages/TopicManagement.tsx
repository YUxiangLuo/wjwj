import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { teacherApi, type Topic, type TopicDetail, type TopicRecommendQuestion } from "../api-client";

export function TopicManagement() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentStep, setCurrentStep] = useState(1);
    const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
    const [excelInfo, setExcelInfo] = useState<{ filePath: string; rowCount: number; colCount: number; columns: string[]; preview: any[] } | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [fieldMapping, setFieldMapping] = useState<{ identifier?: string; stratified: string[]; numeric: string[]; others: string[] }>({
        stratified: [],
        numeric: [],
        others: [],
    });
    const [attachments, setAttachments] = useState<TopicDetail["attachments"]>([]);
    const [recommendQuestions, setRecommendQuestions] = useState<TopicRecommendQuestion[]>([]);
    const [weightConfig, setWeightConfig] = useState({ questionnaire: 30, process: 30, report: 40 });
    const [uploadingExcel, setUploadingExcel] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);

    // Form state
    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    const [newTopicName, setNewTopicName] = useState("");
    const [newTopicDesc, setNewTopicDesc] = useState("");

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "publish" | null;
        topic: Topic | null;
    }>({ open: false, type: null, topic: null });

    useEffect(() => {
        loadTopics();
    }, []);

    async function loadTopics() {
        setLoading(true);
        const res = await teacherApi.getTopics();
        if (res.success && res.data) {
            setTopics(res.data);
        }
        setLoading(false);
    }

    async function loadTopicDetail(id: number) {
        const res = await teacherApi.getTopicDetail(id);
        if (res.success && res.data) {
            setTopicDetail(res.data);
            const mapping = res.data.topic?.fieldMapping ?? null;
            const parsed = typeof mapping === "string" ? (() => { try { return JSON.parse(mapping); } catch { return null; } })() : mapping;
            setFieldMapping({
                identifier: parsed?.identifier ?? undefined,
                stratified: parsed?.stratified ?? [],
                numeric: parsed?.numeric ?? [],
                others: parsed?.others ?? [],
            });
            if (res.data.excelInfo?.columns?.length) {
                setColumns(res.data.excelInfo.columns);
            }
            if (res.data.excelInfo) {
                setExcelInfo({
                    filePath: res.data.topic?.excelFilePath ?? "",
                    rowCount: res.data.topic?.excelRowCount ?? 0,
                    colCount: res.data.excelInfo.columns.length,
                    columns: res.data.excelInfo.columns,
                    preview: res.data.excelInfo.preview,
                });
            }
            setAttachments(res.data.attachments ?? []);
            setRecommendQuestions(res.data.recommendQuestions ?? []);
            const weight = res.data.topic?.weightConfig;
            const weightParsed = typeof weight === "string" ? (() => { try { return JSON.parse(weight); } catch { return null; } })() : weight;
            setWeightConfig({
                questionnaire: weightParsed?.questionnaire ?? 30,
                process: weightParsed?.process ?? 30,
                report: weightParsed?.report ?? 40,
            });
        }
    }

    async function handleSubmitTopic() {
        if (!newTopicName.trim()) return;

        let res;
        if (editingTopicId) {
            // Update
            res = await teacherApi.updateTopic(editingTopicId, {
                name: newTopicName,
                description: newTopicDesc
            });
        } else {
            // Create
            res = await teacherApi.createTopic({
                name: newTopicName,
                description: newTopicDesc
            });
        }

        if (res.success) {
            if (!editingTopicId && res.data?.id) {
                setEditingTopicId(res.data.id);
                await loadTopicDetail(res.data.id);
                setCurrentStep(2);
            } else if (editingTopicId) {
                await loadTopicDetail(editingTopicId);
                setCurrentStep(Math.min(currentStep + 1, 6));
            }
            loadTopics();
        } else {
            alert((editingTopicId ? "更新" : "创建") + "失败: " + (res.error?.message || "未知错误"));
        }
    }

    function openCreateModal() {
        setEditingTopicId(null);
        setNewTopicName("");
        setNewTopicDesc("");
        setCurrentStep(1);
        setTopicDetail(null);
        setExcelInfo(null);
        setColumns([]);
        setFieldMapping({ stratified: [], numeric: [], others: [] });
        setAttachments([]);
        setRecommendQuestions([]);
        setWeightConfig({ questionnaire: 30, process: 30, report: 40 });
        setShowCreateModal(true);
    }

    function openEditModal(topic: Topic) {
        setEditingTopicId(topic.id);
        setNewTopicName(topic.name);
        setNewTopicDesc(topic.description || "");
        setCurrentStep(1);
        loadTopicDetail(topic.id);
        setShowCreateModal(true);
    }

    async function executeConfirmAction() {
        const { type, topic } = confirmDialog;
        if (!topic || !type) return;

        let res;
        if (type === "delete") {
            res = await teacherApi.deleteTopic(topic.id);
        } else if (type === "publish") {
            res = await teacherApi.updateTopic(topic.id, { status: 1 });
        }

        if (res?.success) {
            loadTopics();
        } else {
            alert("操作失败");
        }
        setConfirmDialog({ open: false, type: null, topic: null });
    }

    async function handleExcelUpload(file: File) {
        if (!editingTopicId) return;
        setUploadingExcel(true);
        const res = await teacherApi.uploadTopicExcel(editingTopicId, file);
        setUploadingExcel(false);
        if (res.success && res.data) {
            setExcelInfo(res.data);
            setColumns(res.data.columns ?? []);
        } else {
            alert("上传失败: " + res.error?.message);
        }
    }

    async function handleSaveFieldMapping() {
        if (!editingTopicId) return;
        if (!fieldMapping.identifier) {
            alert("请选择标识符字段");
            return;
        }
        if (fieldMapping.stratified.length === 0 || fieldMapping.numeric.length === 0) {
            alert("至少选择1个分层变量和1个数值变量");
            return;
        }
        const res = await teacherApi.updateFieldMapping(editingTopicId, fieldMapping);
        if (res.success) {
            setCurrentStep(4);
        } else {
            alert("保存失败: " + res.error?.message);
        }
    }

    async function handleUploadAttachment(file: File) {
        if (!editingTopicId) return;
        setUploadingAttachment(true);
        const res = await teacherApi.uploadAttachment(editingTopicId, file);
        setUploadingAttachment(false);
        if (res.success) {
            await loadTopicDetail(editingTopicId);
        } else {
            alert("上传失败: " + res.error?.message);
        }
    }

    async function handleSaveRecommendQuestions() {
        if (!editingTopicId) return;
        const items = recommendQuestions.map((q, idx) => ({
            questionType: q.questionType,
            content: q.content,
            options: q.options,
            sortOrder: q.sortOrder ?? idx,
        }));
        const res = await teacherApi.updateRecommendQuestions(editingTopicId, items);
        if (res.success) {
            setCurrentStep(6);
        } else {
            alert("保存失败: " + res.error?.message);
        }
    }

    async function handleSaveWeights() {
        if (!editingTopicId) return;
        const total = weightConfig.questionnaire + weightConfig.process + weightConfig.report;
        if (total !== 100) {
            alert("权重总和必须等于100");
            return;
        }
        const res = await teacherApi.updateWeightConfig(editingTopicId, weightConfig);
        if (res.success) {
            setShowCreateModal(false);
            setCurrentStep(1);
            setEditingTopicId(null);
            setNewTopicName("");
            setNewTopicDesc("");
            loadTopics();
        } else {
            alert("保存失败: " + res.error?.message);
        }
    }

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">课题列表</CardTitle>
                <div className="flex gap-3">
                    <Select defaultValue="all">
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            <SelectItem value="draft">草稿</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={openCreateModal}>+ 创建课题</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? <div className="text-center py-4">加载中...</div> : topics.map((topic) => (
                    <div key={topic.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-5 h-5 text-primary" />
                                <div>
                                    <h4 className="font-medium text-foreground">{topic.name}</h4>
                                    <div className="text-xs text-muted-foreground mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString()}</div>
                                </div>
                            </div>
                            {topic.status === 1 ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已发布</Badge>
                            ) : (
                                <Badge variant="secondary">草稿</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                            <span>数据行数：{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                            {/* Attachments not yet in API, hidden or mock */}
                            {/* <span>附件：{topic.attachments}个</span> */}
                        </div>
                        <div className="flex gap-2">
                            {topic.status === 0 ? (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => openEditModal(topic)}>编辑</Button>
                                    <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => setConfirmDialog({ open: true, type: "publish", topic })}>发布</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary">查看</Button>
                                    <Button variant="ghost" size="sm" onClick={() => openEditModal(topic)}>编辑</Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-blue-500"
                                        onClick={async () => {
                                            const res = await teacherApi.copyTopic(topic.id);
                                            if (res.success) {
                                                loadTopics();
                                            } else {
                                                alert("复制失败: " + res.error?.message);
                                            }
                                        }}
                                    >
                                        复制
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </CardContent>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2 mb-6">
                            {/* Wizard steps visual only for now */}
                            {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                                <div key={step} className="flex items-center">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx + 1 === currentStep ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                                        {idx + 1}
                                    </div>
                                    <span className={`text-xs ml-1 ${idx + 1 === currentStep ? "text-primary font-medium" : "text-muted-foreground"}`}>{step}</span>
                                    {idx < 5 && <span className="mx-2 text-muted-foreground">→</span>}
                                </div>
                            ))}
                        </div>
                        {currentStep === 1 && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="topicName">课题名称</Label>
                                    <Input
                                        id="topicName"
                                        placeholder="请输入课题名称"
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="topicDesc">背景描述</Label>
                                    <Textarea
                                        id="topicDesc"
                                        placeholder="请输入课题背景描述"
                                        className="min-h-32 resize-none"
                                        value={newTopicDesc}
                                        onChange={e => setNewTopicDesc(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-3">
                                <Label>上传总体数据（Excel）</Label>
                                <Input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleExcelUpload(file);
                                    }}
                                />
                                {uploadingExcel && <div className="text-sm text-muted-foreground">上传中...</div>}
                                {excelInfo && (
                                    <div className="text-sm text-muted-foreground">
                                        已上传：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-4">
                                <div className="text-sm text-muted-foreground">请选择字段类型</div>
                                <div className="space-y-2">
                                    <Label>标识符（必选 1 个）</Label>
                                    <Select value={fieldMapping.identifier ?? ""} onValueChange={(v) => setFieldMapping(prev => ({ ...prev, identifier: v }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择标识符" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {columns.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>分层变量</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {columns.map((c) => (
                                            <label key={c} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={fieldMapping.stratified.includes(c)}
                                                    onChange={(e) => {
                                                        setFieldMapping(prev => ({
                                                            ...prev,
                                                            stratified: e.target.checked
                                                                ? [...prev.stratified, c]
                                                                : prev.stratified.filter(x => x !== c)
                                                        }));
                                                    }}
                                                />
                                                {c}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>数值变量</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {columns.map((c) => (
                                            <label key={c} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={fieldMapping.numeric.includes(c)}
                                                    onChange={(e) => {
                                                        setFieldMapping(prev => ({
                                                            ...prev,
                                                            numeric: e.target.checked
                                                                ? [...prev.numeric, c]
                                                                : prev.numeric.filter(x => x !== c)
                                                        }));
                                                    }}
                                                />
                                                {c}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-3">
                                <Label>附件上传</Label>
                                <Input
                                    type="file"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadAttachment(file);
                                    }}
                                />
                                {uploadingAttachment && <div className="text-sm text-muted-foreground">上传中...</div>}
                                <div className="space-y-2">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between text-sm">
                                            <span>{a.fileName}</span>
                                            <Button variant="ghost" size="sm" onClick={() => teacherApi.deleteAttachment(editingTopicId!, a.id).then(() => loadTopicDetail(editingTopicId!))}>删除</Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {currentStep === 5 && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label>推荐题目</Label>
                                    <Button variant="outline" size="sm" onClick={() => setRecommendQuestions(prev => ([...prev, { id: Date.now(), topicId: editingTopicId ?? 0, questionType: 1, content: "", options: "", sortOrder: prev.length }]))}>添加题目</Button>
                                </div>
                                <div className="space-y-3">
                                    {recommendQuestions.map((q, idx) => (
                                        <div key={q.id} className="border rounded-md p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Select value={String(q.questionType)} onValueChange={(v) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, questionType: Number(v) };
                                                    setRecommendQuestions(next);
                                                }}>
                                                    <SelectTrigger className="w-36">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">判断题</SelectItem>
                                                        <SelectItem value="2">单选题</SelectItem>
                                                        <SelectItem value="3">多选题</SelectItem>
                                                        <SelectItem value="4">量表题</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRecommendQuestions(prev => prev.filter((_, i) => i !== idx))}>删除</Button>
                                            </div>
                                            <Input
                                                placeholder="题目内容"
                                                value={q.content}
                                                onChange={(e) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, content: e.target.value };
                                                    setRecommendQuestions(next);
                                                }}
                                            />
                                            <Input
                                                placeholder="选项（逗号分隔）"
                                                value={typeof q.options === "string" ? q.options : (q.options ? JSON.stringify(q.options) : "")}
                                                onChange={(e) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, options: e.target.value };
                                                    setRecommendQuestions(next);
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {currentStep === 6 && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>问卷设计</Label>
                                        <Input type="number" min={0} max={100} value={weightConfig.questionnaire} onChange={(e) => setWeightConfig(prev => ({ ...prev, questionnaire: Number(e.target.value) }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>实验过程</Label>
                                        <Input type="number" min={0} max={100} value={weightConfig.process} onChange={(e) => setWeightConfig(prev => ({ ...prev, process: Number(e.target.value) }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>实验报告</Label>
                                        <Input type="number" min={0} max={100} value={weightConfig.report} onChange={(e) => setWeightConfig(prev => ({ ...prev, report: Number(e.target.value) }))} />
                                    </div>
                                </div>
                                <div className="text-sm text-muted-foreground">权重总和必须等于 100</div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateModal(false)}>取消</Button>
                        {currentStep === 1 && (
                            <Button onClick={handleSubmitTopic}>{editingTopicId ? "保存并继续" : "下一步"}</Button>
                        )}
                        {currentStep === 2 && (
                            <Button onClick={() => setCurrentStep(3)} disabled={!excelInfo}>下一步</Button>
                        )}
                        {currentStep === 3 && (
                            <Button onClick={handleSaveFieldMapping} disabled={!fieldMapping.identifier}>保存并继续</Button>
                        )}
                        {currentStep === 4 && (
                            <Button onClick={() => setCurrentStep(5)}>下一步</Button>
                        )}
                        {currentStep === 5 && (
                            <Button onClick={handleSaveRecommendQuestions}>保存并继续</Button>
                        )}
                        {currentStep === 6 && (
                            <Button onClick={handleSaveWeights}>完成</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirmDialog.open}
                onOpenChange={(open) => !open && setConfirmDialog(markdown => ({ ...markdown, open: false }))}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认操作</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.type === "delete" && "确认删除该课题吗？删除后无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该课题吗？发布后学生将可见。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
