import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Download, FileText, HelpCircle, Loader2, Pencil, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TopicDetail, TopicRecommendQuestion } from "../api-client";
import { teacherApi } from "../api-client";
import { RecommendQuestionEditor } from "./RecommendQuestionEditor";

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

    // Recommend question editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<TopicRecommendQuestion | undefined>(undefined);

    const handleAddQuestion = () => {
        setEditingQuestion(undefined);
        setEditorOpen(true);
    };

    const handleEditQuestion = (q: TopicRecommendQuestion) => {
        setEditingQuestion(q);
        setEditorOpen(true);
    };

    const handleSaveQuestion = (saved: TopicRecommendQuestion) => {
        setRecommendQuestions((prev) => {
            const idx = prev.findIndex((q) => q.id === saved.id);
            if (idx >= 0) {
                // Update existing
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            // Add new
            return [...prev, { ...saved, sortOrder: prev.length }];
        });
    };

    const handleDeleteQuestion = (idx: number) => {
        setRecommendQuestions((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleMoveQuestion = (idx: number, direction: "up" | "down") => {
        setRecommendQuestions((prev) => {
            const next = [...prev];
            const targetIdx = direction === "up" ? idx - 1 : idx + 1;
            if (targetIdx < 0 || targetIdx >= next.length) return prev;
            const temp = next[idx]!;
            next[idx] = next[targetIdx]!;
            next[targetIdx] = temp;
            return next;
        });
    };

    const normalizeColumnName = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
    const tokenizeColumnName = (value: string) => value.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    const idExactKeywords = new Set(["id", "uid", "userid", "studentid", "respondentid", "recordid", "sampleid"]);
    const idPrefixKeywords = ["user", "student", "respondent", "record", "sample", "member", "customer", "subject", "case"];
    const idLabelKeywords = ["编号", "编码", "序号", "样本号", "学号", "工号"];
    const numericKeywords = ["age", "income", "score", "amount", "count", "frequency", "rate", "price", "spending", "nps", "满意", "次数", "分数", "金额", "收入"];
    const stratifiedKeywords = ["gender", "sex", "education", "province", "city", "grade", "major", "class", "platform", "status", "marital", "职业", "学历", "年级", "专业", "地区", "省", "性别"];

    function isNumericValue(value: unknown) {
        if (typeof value === "number") return Number.isFinite(value);
        if (typeof value !== "string") return false;
        const trimmed = value.trim();
        if (!trimmed) return false;
        return /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""));
    }

    function sampleValuesOf(column: string) {
        const preview = excelInfo?.preview ?? [];
        return preview
            .map((row) => row?.[column])
            .filter((value) => value !== null && value !== undefined && `${value}`.trim() !== "")
            .slice(0, 30);
    }

    function columnProfile(column: string) {
        const values = sampleValuesOf(column)
            .map((value) => String(value).trim())
            .filter(Boolean);
        const sampleSize = values.length;
        if (sampleSize === 0) {
            return { sampleSize: 0, uniqueCount: 0, uniqueRatio: 0, numericRatio: 0 };
        }
        const uniqueCount = new Set(values).size;
        const numericCount = values.filter((value) => isNumericValue(value)).length;
        return {
            sampleSize,
            uniqueCount,
            uniqueRatio: uniqueCount / sampleSize,
            numericRatio: numericCount / sampleSize,
        };
    }

    function numericRatioOf(column: string) {
        return columnProfile(column).numericRatio;
    }

    function isLikelyHighCardinality(column: string) {
        const { sampleSize, uniqueCount, uniqueRatio } = columnProfile(column);
        if (sampleSize < 10) return false;
        return uniqueCount > 8 && uniqueRatio >= 0.8;
    }

    function isLikelyIdentifier(column: string) {
        const tokens = tokenizeColumnName(column);
        const normalized = normalizeColumnName(column);
        const byExact = idExactKeywords.has(normalized);
        const byToken = tokens.some((token) => token === "id" || token === "uid");
        const byPrefixSuffix = normalized.endsWith("id") && idPrefixKeywords.some((prefix) => normalized.startsWith(prefix));
        const byLabel = idLabelKeywords.some((keyword) => column.includes(keyword));
        return byExact || byToken || byPrefixSuffix || byLabel;
    }

    function isLikelyNumeric(column: string) {
        const normalized = normalizeColumnName(column);
        const byName = numericKeywords.some((keyword) => normalized.includes(keyword));
        const byData = columnProfile(column).numericRatio >= 0.8;
        return !isLikelyIdentifier(column) && (byName || byData);
    }

    function isLikelyStratified(column: string) {
        if (isLikelyIdentifier(column) || isLikelyHighCardinality(column)) return false;
        const normalized = normalizeColumnName(column);
        const byName = stratifiedKeywords.some((keyword) => normalized.includes(keyword));
        const profile = columnProfile(column);
        const byData =
            profile.sampleSize > 0 &&
            profile.numericRatio < 0.5 &&
            profile.uniqueCount >= 2 &&
            profile.uniqueCount <= 20 &&
            (profile.sampleSize < 10 || profile.uniqueRatio <= 0.7);
        return byName || byData;
    }

    function unique<T>(arr: T[]) {
        return Array.from(new Set(arr));
    }

    function buildRecommendedMapping() {
        if (columns.length === 0) {
            return { identifier: undefined, stratified: [], numeric: [], others: [] as string[] };
        }

        const identifier =
            columns.find((column) => normalizeColumnName(column) === "id") ??
            columns.find((column) => isLikelyIdentifier(column)) ??
            columns[0];
        const candidates = columns.filter((column) => column !== identifier);
        const analysableCandidates = candidates.filter((column) => !isLikelyIdentifier(column));

        let numeric = unique(analysableCandidates.filter((column) => isLikelyNumeric(column))).slice(0, 4);
        if (numeric.length === 0) {
            const fallback = [...analysableCandidates].sort((a, b) => numericRatioOf(b) - numericRatioOf(a))[0];
            if (fallback) numeric = [fallback];
        }

        const stratifiedPool = analysableCandidates.filter(
            (column) => !numeric.includes(column) && !isLikelyHighCardinality(column)
        );

        let stratified = unique(
            stratifiedPool.filter((column) => isLikelyStratified(column))
        ).slice(0, 4);

        if (stratified.length === 0) {
            const fallback = [...stratifiedPool].sort((a, b) => {
                const aByName = stratifiedKeywords.some((keyword) => normalizeColumnName(a).includes(keyword)) ? 1 : 0;
                const bByName = stratifiedKeywords.some((keyword) => normalizeColumnName(b).includes(keyword)) ? 1 : 0;
                if (aByName !== bByName) return bByName - aByName;
                return columnProfile(a).uniqueCount - columnProfile(b).uniqueCount;
            })[0];
            if (fallback) stratified = [fallback];
        }

        if (numeric.length === 0) {
            const fallback = analysableCandidates.find((column) => !stratified.includes(column));
            if (fallback) numeric = [fallback];
        }

        return { identifier, stratified, numeric, others: [] as string[] };
    }

    function applyRecommendedMapping() {
        setFieldMapping(buildRecommendedMapping());
    }

    const uniqueFieldCount = new Set(
        [fieldMapping.identifier, ...fieldMapping.stratified, ...fieldMapping.numeric].filter(Boolean)
    ).size;
    const mappingRules = [
        { ok: Boolean(fieldMapping.identifier), text: "已选择 1 个标识符" },
        { ok: fieldMapping.stratified.length > 0, text: "至少 1 个分层变量" },
        { ok: fieldMapping.numeric.length > 0, text: "至少 1 个数值变量" },
        { ok: uniqueFieldCount >= 3, text: "至少 3 个不同字段" },
    ];
    const riskyStratifiedFields = fieldMapping.stratified.filter(
        (column) => isLikelyIdentifier(column) || isLikelyHighCardinality(column)
    );
    const canProceedMapping = mappingRules.every((item) => item.ok);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-5xl max-h-[90vh] flex flex-col bg-slate-900 border-slate-800 text-slate-200"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-slate-100">{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                    <DialogDescription className="sr-only">
                        通过六个步骤配置课题基础信息、总体数据、字段映射、辅助资料、推荐题目和评分权重。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                        {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => {
                            const isCompleted = idx + 1 < currentStep;
                            const isCurrent = idx + 1 === currentStep;
                            return (
                                <div key={step} className="flex items-center shrink-0">
                                    <div
                                        data-testid={`teacher-topic-step-${idx + 1}`}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${isCurrent
                                            ? "bg-indigo-600 text-white ring-2 ring-indigo-500/30"
                                            : isCompleted
                                                ? "bg-emerald-600/20 text-emerald-600 border border-emerald-500/30"
                                                : "bg-slate-800 text-slate-400 border border-slate-700"
                                        }`}
                                    >
                                        {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                                    </div>
                                    <span className={`text-xs ml-2 ${isCurrent ? "text-indigo-500 font-medium" : isCompleted ? "text-emerald-600/80" : "text-slate-500"}`}>{step}</span>
                                    {idx < 5 && <ChevronRight className="w-3 h-3 mx-2 text-slate-700" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="min-h-[350px]">
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
                                        className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="topicDesc" className="text-slate-300">背景描述</Label>
                                    <Textarea
                                        id="topicDesc"
                                        data-testid="teacher-topic-desc"
                                        placeholder="请输入课题背景描述"
                                        className="min-h-40 resize-none bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500"
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
                                            href="/templates/数据上传规范.pdf"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            数据规范
                                        </a>
                                        <a
                                            href="/templates/数据模板.csv"
                                            download
                                            className="text-xs text-emerald-600 hover:text-emerald-500 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            下载模板
                                        </a>
                                    </div>
                                </div>
                                <div className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-lg p-8 text-center hover:border-indigo-500/50 transition-colors">
                                    <Upload className="w-10 h-10 mx-auto text-slate-500 mb-4" />
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
                                        <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100">
                                            选择文件
                                        </Button>
                                    </div>
                                </div>
                                {uploadingExcel && <div className="flex items-center gap-2 text-sm text-indigo-500"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                {excelInfo && (
                                    <div className="space-y-3">
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm text-slate-300">
                                            <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                上传成功
                                            </div>
                                            <div>已解析：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列</div>
                                        </div>
                                        {excelInfo.preview && excelInfo.preview.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-xs text-slate-400 font-medium">数据预览（前 {Math.min(excelInfo.preview.length, 5)} 行）</div>
                                                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-800/50 border-b border-slate-800">
                                                                {excelInfo.columns.map((col) => (
                                                                    <th key={col} className="text-left px-3 py-2 text-slate-400 font-medium whitespace-nowrap">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {excelInfo.preview.slice(0, 5).map((row, idx) => (
                                                                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                                                    {excelInfo!.columns.map((col) => (
                                                                        <td key={col} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                                                                            {row?.[col] != null ? String(row[col]) : <span className="text-slate-500">-</span>}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">不知道怎么配？可先用智能推荐</div>
                                            <p className="mt-1 text-xs text-slate-500">
                                                系统会根据字段名称和样例数据自动推荐标识符、分层变量和数值变量，你再按教学需要微调即可。
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={applyRecommendedMapping}
                                            className="shrink-0 border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
                                        >
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            智能推荐映射
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-slate-300">标识符（必选 1 个）</Label>
                                    <Select
                                        value={fieldMapping.identifier ?? ""}
                                        onValueChange={(v) =>
                                            setFieldMapping((prev) => ({
                                                ...prev,
                                                identifier: v,
                                                stratified: prev.stratified.filter((item) => item !== v),
                                                numeric: prev.numeric.filter((item) => item !== v),
                                            }))}
                                    >
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

                                <div className="grid grid-cols-2 gap-3">
                                    {mappingRules.map((rule) => (
                                        <div
                                            key={rule.text}
                                            className={`rounded-md border px-3 py-2 text-xs ${rule.ok
                                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                                : "border-slate-700 bg-slate-900 text-slate-400"
                                                }`}
                                        >
                                            {rule.ok ? "✓" : "○"} {rule.text}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">分层变量（已选 {fieldMapping.stratified.length}）</Label>
                                        <p className="text-xs text-slate-500">用于按类别分组对比，建议 1-3 个，且每个字段唯一值不超过 20（如性别、学历、地区）。</p>
                                        {riskyStratifiedFields.length > 0 && (
                                            <p className="text-xs text-amber-600">
                                                当前分层变量包含高基数或 ID 类字段（{riskyStratifiedFields.join("、")}），保存时可能失败，建议替换。
                                            </p>
                                        )}
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.stratified.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifier(c) && !checked;
                                                const disabled = fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为分层变量"
                                                        : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 text-sm p-1.5 rounded ${disabled
                                                            ? "text-slate-500 cursor-not-allowed"
                                                            : "text-slate-300 hover:bg-slate-900 cursor-pointer"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-stratified-${c}`}
                                                            type="checkbox"
                                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => ({
                                                                    ...prev,
                                                                    stratified: e.target.checked ? [...prev.stratified, c] : prev.stratified.filter(x => x !== c),
                                                                    numeric: e.target.checked ? prev.numeric.filter(x => x !== c) : prev.numeric,
                                                                }));
                                                            }}
                                                        />
                                                        {c}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-300">数值变量（已选 {fieldMapping.numeric.length}）</Label>
                                        <p className="text-xs text-slate-500">用于统计计算，建议选择连续值/可比较大小的字段。</p>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.numeric.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifier(c) && !checked;
                                                const disabled = fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为数值变量"
                                                        : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 text-sm p-1.5 rounded ${disabled
                                                            ? "text-slate-500 cursor-not-allowed"
                                                            : "text-slate-300 hover:bg-slate-900 cursor-pointer"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-numeric-${c}`}
                                                            type="checkbox"
                                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => ({
                                                                    ...prev,
                                                                    numeric: e.target.checked ? [...prev.numeric, c] : prev.numeric.filter(x => x !== c),
                                                                    stratified: e.target.checked ? prev.stratified.filter(x => x !== c) : prev.stratified,
                                                                }));
                                                            }}
                                                        />
                                                        {c}
                                                    </label>
                                                );
                                            })}
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
                                {uploadingAttachment && <div className="flex items-center gap-2 text-sm text-indigo-500"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                <div className="space-y-2 mt-4">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between text-sm p-3 bg-slate-950 border border-slate-800 rounded-lg group">
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-indigo-500" />
                                                <span className="text-slate-300">{a.fileName}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="opacity-0 group-hover:opacity-100 text-rose-600 hover:text-rose-500 hover:bg-rose-500/10"
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
                                    <Button data-testid="teacher-topic-question-add" size="sm" onClick={handleAddQuestion} className="bg-indigo-600 hover:bg-indigo-700">
                                        + 添加题目
                                    </Button>
                                </div>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                    {recommendQuestions.map((q, idx) => {
                                        const typeLabel: Record<number, string> = { 1: "判断题", 2: "单选题", 3: "多选题", 4: "量表题" };
                                        const typeBadgeColor: Record<number, string> = {
                                            1: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                            2: "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                            3: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                                            4: "bg-purple-500/10 text-purple-500 border-purple-500/20",
                                        };
                                        const optionsArr = Array.isArray(q.options) ? q.options as string[] : [];
                                        return (
                                            <div key={q.id} className="border border-slate-800 bg-slate-950 rounded-lg p-4 relative group hover:border-slate-700 transition-colors">
                                                <div className="flex items-start gap-3">
                                                    {/* Reorder buttons */}
                                                    <div className="flex flex-col gap-0.5 pt-0.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-slate-500 hover:text-slate-300 disabled:opacity-30"
                                                            disabled={idx === 0}
                                                            onClick={() => handleMoveQuestion(idx, "up")}
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-slate-500 hover:text-slate-300 disabled:opacity-30"
                                                            disabled={idx === recommendQuestions.length - 1}
                                                            onClick={() => handleMoveQuestion(idx, "down")}
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>

                                                    {/* Content area */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-slate-500 text-xs font-mono">{idx + 1}.</span>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${typeBadgeColor[q.questionType] ?? "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}>
                                                                {typeLabel[q.questionType] ?? "未知"}
                                                            </span>
                                                        </div>
                                                        <p data-testid={`teacher-topic-question-content-${idx}`} className="text-sm text-slate-200 leading-relaxed">
                                                            {q.content || <span className="text-slate-500 italic">未填写题目内容</span>}
                                                        </p>
                                                        {(q.questionType === 2 || q.questionType === 3) && optionsArr.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {optionsArr.map((opt, i) => (
                                                                    <span key={i} className="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded border border-slate-700/50">
                                                                        {String.fromCharCode(65 + i)}. {opt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {q.questionType === 1 && (
                                                            <p className="text-xs text-slate-500 mt-1">选项：是 / 否</p>
                                                        )}
                                                        {q.questionType === 4 && (
                                                            <p className="text-xs text-slate-500 mt-1">量表：1-10 分</p>
                                                        )}
                                                    </div>

                                                    {/* Action buttons */}
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
                                                            onClick={() => handleDeleteQuestion(idx)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {recommendQuestions.length === 0 && <div className="text-center text-slate-500 py-8">暂无推荐题目，点击「+ 添加题目」开始创建</div>}
                                </div>

                                {/* Question Editor Dialog */}
                                <RecommendQuestionEditor
                                    open={editorOpen}
                                    onOpenChange={setEditorOpen}
                                    question={editingQuestion}
                                    topicId={editingTopicId ?? 0}
                                    onSave={handleSaveQuestion}
                                />
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
                                    <span className={`text-2xl font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-emerald-600" : "text-rose-600"}`}>
                                        {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="border-t border-slate-800 pt-4 flex-shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-xs text-slate-500">步骤 {currentStep} / 6</div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">关闭</Button>
                            {currentStep > 1 && (
                                <Button data-testid="teacher-topic-prev" variant="outline" onClick={() => setCurrentStep(prev => prev - 1)} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-700">上一步</Button>
                            )}
                            {currentStep === 1 && (
                                <Button data-testid="teacher-topic-next" onClick={onSubmitTopic} className="bg-indigo-600 hover:bg-indigo-700 text-white">{editingTopicId ? "保存并继续" : "下一步"}</Button>
                            )}
                            {currentStep === 2 && (
                                <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(3)} disabled={!excelInfo} className="bg-indigo-600 hover:bg-indigo-700 text-white">下一步</Button>
                            )}
                            {currentStep === 3 && (
                                <Button data-testid="teacher-topic-next" onClick={onSaveFieldMapping} disabled={!canProceedMapping} className="bg-indigo-600 hover:bg-indigo-700 text-white">保存并继续</Button>
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
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
