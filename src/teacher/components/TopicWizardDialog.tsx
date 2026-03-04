import { CheckCircle2, ChevronRight, Download, FileText, HelpCircle, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TopicDetail, TopicRecommendQuestion } from "../api-client";
import { teacherApi } from "../api-client";

interface FieldMappingState {
    identifier?: string;
    stratified: string[];
    numeric: string[];
    others: string[];
}

interface TopicWizardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTopicId: number | null;
    currentStep: number;
    setCurrentStep: (value: number | ((prev: number) => number)) => void;
    newTopicName: string;
    setNewTopicName: (value: string) => void;
    newTopicDesc: string;
    setNewTopicDesc: (value: string) => void;
    excelInfo: { filePath: string; rowCount: number; colCount: number; columns: string[]; preview: any[] } | null;
    uploadingExcel: boolean;
    onExcelUpload: (file: File) => void;
    columns: string[];
    fieldMapping: FieldMappingState;
    setFieldMapping: (value: FieldMappingState | ((prev: FieldMappingState) => FieldMappingState)) => void;
    attachments: TopicDetail["attachments"];
    uploadingAttachment: boolean;
    onAttachmentUpload: (file: File) => void;
    onRefreshTopicDetail: (id: number) => Promise<void>;
    recommendQuestions: TopicRecommendQuestion[];
    setRecommendQuestions: (value: TopicRecommendQuestion[] | ((prev: TopicRecommendQuestion[]) => TopicRecommendQuestion[])) => void;
    weightConfig: { questionnaire: number; process: number; report: number };
    setWeightConfig: (value: { questionnaire: number; process: number; report: number } | ((prev: { questionnaire: number; process: number; report: number }) => { questionnaire: number; process: number; report: number })) => void;
    onSubmitTopic: () => void;
    onSaveFieldMapping: () => void;
    onSaveRecommendQuestions: () => void;
    onSaveWeights: () => void;
}

export function TopicWizardDialog(props: TopicWizardDialogProps) {
    const {
        open,
        onOpenChange,
        editingTopicId,
        currentStep,
        setCurrentStep,
        newTopicName,
        setNewTopicName,
        newTopicDesc,
        setNewTopicDesc,
        excelInfo,
        uploadingExcel,
        onExcelUpload,
        columns,
        fieldMapping,
        setFieldMapping,
        attachments,
        uploadingAttachment,
        onAttachmentUpload,
        onRefreshTopicDetail,
        recommendQuestions,
        setRecommendQuestions,
        weightConfig,
        setWeightConfig,
        onSubmitTopic,
        onSaveFieldMapping,
        onSaveRecommendQuestions,
        onSaveWeights,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                        {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                            <div key={step} className="flex items-center shrink-0">
                                <div data-testid={`teacher-topic-step-${idx + 1}`} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx + 1 === currentStep ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                                    {idx + 1}
                                </div>
                                <span className={`text-xs ml-2 ${idx + 1 === currentStep ? "text-indigo-400 font-medium" : "text-slate-500"}`}>{step}</span>
                                {idx < 5 && <ChevronRight className="w-3 h-3 mx-2 text-slate-700" />}
                            </div>
                        ))}
                    </div>

                    <div className="min-h-[300px]">
                        {currentStep === 1 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="space-y-2">
                                    <Label htmlFor="topicName" className="text-slate-300">课题名称</Label>
                                    <Input
                                        id="topicName"
                                        data-testid="teacher-topic-name"
                                        placeholder="请输入课题名称"
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="topicDesc" className="text-slate-300">背景描述</Label>
                                    <Textarea
                                        id="topicDesc"
                                        data-testid="teacher-topic-desc"
                                        placeholder="请输入课题背景描述"
                                        className="min-h-40 resize-none bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                        value={newTopicDesc}
                                        onChange={e => setNewTopicDesc(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between">
                                    <Label className="text-slate-300">上传总体数据（Excel）</Label>
                                    <div className="flex items-center gap-3">
                                        <a
                                            href="/templates/数据上传说明.md"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            数据规范
                                        </a>
                                        <a
                                            href="/templates/空白模板.csv"
                                            download
                                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            下载模板
                                        </a>
                                    </div>
                                </div>
                                <div className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-lg p-8 text-center hover:border-indigo-500/50 transition-colors">
                                    <Upload className="w-10 h-10 mx-auto text-slate-600 mb-4" />
                                    <p className="text-sm text-slate-400 mb-2">点击或拖拽上传 Excel 文件</p>
                                    <p className="text-xs text-slate-500 mb-4">支持 .xlsx, .xls, .csv 格式，数据行数 1-100,000</p>
                                    <Input
                                        type="file"
                                        data-testid="teacher-topic-excel-file"
                                        accept=".xlsx,.xls,.csv"
                                        className="hidden"
                                        id="excel-upload"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) onExcelUpload(file);
                                        }}
                                    />
                                    <div className="flex items-center justify-center gap-3">
                                        <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white">
                                            选择文件
                                        </Button>
                                    </div>
                                </div>
                                {uploadingExcel && <div className="flex items-center gap-2 text-sm text-indigo-400"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                {excelInfo && (
                                    <div className="bg-slate-950 border border-slate-800 rounded p-4 text-sm text-slate-300">
                                        <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            上传成功
                                        </div>
                                        <div>已解析：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="space-y-2">
                                    <Label className="text-slate-300">标识符（必选 1 个）</Label>
                                    <Select value={fieldMapping.identifier ?? ""} onValueChange={(v) => setFieldMapping(prev => ({ ...prev, identifier: v }))}>
                                        <SelectTrigger data-testid="teacher-topic-mapping-identifier" className="bg-slate-950 border-slate-800 text-slate-200">
                                            <SelectValue placeholder="选择标识符字段" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                            {columns.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500">用于唯一标识每条数据的字段，如“编号”、“ID”等</p>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">分层变量</Label>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => (
                                                <label key={c} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-1.5 rounded cursor-pointer">
                                                    <input
                                                        data-testid={`teacher-topic-mapping-stratified-${c}`}
                                                        type="checkbox"
                                                        className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                        checked={fieldMapping.stratified.includes(c)}
                                                        onChange={(e) => {
                                                            setFieldMapping(prev => ({
                                                                ...prev,
                                                                stratified: e.target.checked ? [...prev.stratified, c] : prev.stratified.filter(x => x !== c),
                                                            }));
                                                        }}
                                                    />
                                                    {c}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">数值变量</Label>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => (
                                                <label key={c} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-1.5 rounded cursor-pointer">
                                                    <input
                                                        data-testid={`teacher-topic-mapping-numeric-${c}`}
                                                        type="checkbox"
                                                        className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                        checked={fieldMapping.numeric.includes(c)}
                                                        onChange={(e) => {
                                                            setFieldMapping(prev => ({
                                                                ...prev,
                                                                numeric: e.target.checked ? [...prev.numeric, c] : prev.numeric.filter(x => x !== c),
                                                            }));
                                                        }}
                                                    />
                                                    {c}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <Label className="text-slate-300">附件上传</Label>
                                <Input
                                    data-testid="teacher-topic-attachment-file"
                                    type="file"
                                    className="bg-slate-950 border-slate-800 text-slate-300 file:bg-slate-800 file:text-slate-300"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) onAttachmentUpload(file);
                                    }}
                                />
                                {uploadingAttachment && <div className="flex items-center gap-2 text-sm text-indigo-400"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                <div className="space-y-2 mt-4">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between text-sm p-3 bg-slate-950 border border-slate-800 rounded-lg group">
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-indigo-400" />
                                                <span className="text-slate-300">{a.fileName}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                                onClick={() => teacherApi.deleteAttachment(editingTopicId!, a.id).then(() => onRefreshTopicDetail(editingTopicId!))}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {attachments.length === 0 && <div className="text-sm text-slate-500 text-center py-4">暂无附件</div>}
                                </div>
                            </div>
                        )}

                        {currentStep === 5 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex justify-between items-center">
                                    <Label className="text-slate-300">推荐题目</Label>
                                    <Button data-testid="teacher-topic-question-add" size="sm" onClick={() => setRecommendQuestions(prev => ([...prev, { id: Date.now(), topicId: editingTopicId ?? 0, questionType: 1, content: "", options: "", sortOrder: prev.length }]))} className="bg-indigo-600 hover:bg-indigo-700">
                                        + 添加题目
                                    </Button>
                                </div>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {recommendQuestions.map((q, idx) => (
                                        <div key={q.id} className="border border-slate-800 bg-slate-950 rounded-lg p-4 space-y-3 relative group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500 text-xs font-mono w-6">{idx + 1}.</span>
                                                <Select value={String(q.questionType)} onValueChange={(v) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, questionType: Number(v) };
                                                    setRecommendQuestions(next);
                                                }}>
                                                    <SelectTrigger className="w-32 bg-slate-900 border-slate-800 text-slate-300 h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                        <SelectItem value="1">判断题</SelectItem>
                                                        <SelectItem value="2">单选题</SelectItem>
                                                        <SelectItem value="3">多选题</SelectItem>
                                                        <SelectItem value="4">量表题</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 h-8 w-8 p-0"
                                                    onClick={() => setRecommendQuestions(prev => prev.filter((_, i) => i !== idx))}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            <Input
                                                data-testid={`teacher-topic-question-content-${idx}`}
                                                placeholder="题目内容"
                                                value={q.content}
                                                onChange={(e) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, content: e.target.value };
                                                    setRecommendQuestions(next);
                                                }}
                                                className="bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600"
                                            />
                                            <Input
                                                data-testid={`teacher-topic-question-options-${idx}`}
                                                placeholder="选项（逗号分隔，判断题无需填写）"
                                                value={typeof q.options === "string" ? q.options : (q.options ? JSON.stringify(q.options) : "")}
                                                onChange={(e) => {
                                                    const next = [...recommendQuestions];
                                                    next[idx] = { ...q, options: e.target.value };
                                                    setRecommendQuestions(next);
                                                }}
                                                className="bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600 text-sm"
                                                disabled={q.questionType === 1 || q.questionType === 4}
                                            />
                                        </div>
                                    ))}
                                    {recommendQuestions.length === 0 && <div className="text-center text-slate-500 py-8">暂无推荐题目</div>}
                                </div>
                            </div>
                        )}

                        {currentStep === 6 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                        <Label className="text-slate-300 text-lg">问卷设计权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-questionnaire"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.questionnaire}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, questionnaire: Number(e.target.value) }))}
                                                className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-slate-500 font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                        <Label className="text-slate-300 text-lg">实验过程权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-process"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.process}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, process: Number(e.target.value) }))}
                                                className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-slate-500 font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-4">
                                        <Label className="text-slate-300 text-lg">实验报告权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-report"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.report}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, report: Number(e.target.value) }))}
                                                className="bg-slate-900 border-slate-800 text-slate-200 text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-slate-500 font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-950/50 p-4 rounded-lg flex justify-between items-center border border-slate-800">
                                    <span className="text-slate-400">当前总权重</span>
                                    <span className={`text-2xl font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                    <div className="flex gap-2">
                        {currentStep > 1 && (
                            <Button data-testid="teacher-topic-prev" variant="outline" onClick={() => setCurrentStep(prev => prev - 1)} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700">上一步</Button>
                        )}
                        {currentStep === 1 && (
                            <Button data-testid="teacher-topic-next" onClick={onSubmitTopic} className="bg-indigo-600 hover:bg-indigo-700 text-white">{editingTopicId ? "保存并继续" : "下一步"}</Button>
                        )}
                        {currentStep === 2 && (
                            <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(3)} disabled={!excelInfo} className="bg-indigo-600 hover:bg-indigo-700 text-white">下一步</Button>
                        )}
                        {currentStep === 3 && (
                            <Button data-testid="teacher-topic-next" onClick={onSaveFieldMapping} disabled={!fieldMapping.identifier} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存并继续</Button>
                        )}
                        {currentStep === 4 && (
                            <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(5)} className="bg-indigo-600 hover:bg-indigo-700 text-white">下一步</Button>
                        )}
                        {currentStep === 5 && (
                            <Button data-testid="teacher-topic-next" onClick={onSaveRecommendQuestions} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存并继续</Button>
                        )}
                        {currentStep === 6 && (
                            <Button data-testid="teacher-topic-finish" onClick={onSaveWeights} className="bg-indigo-600 hover:bg-indigo-700 text-white">完成</Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
