import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Download, FileText, HelpCircle, Loader2, Pencil, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { TopicDetail, Question } from "../api-client";
import { teacherApi } from "../api-client";
import { QuestionEditor } from "@/components/questionnaire/QuestionEditor";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";

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
    /** 已发布课题：上传数据、字段映射步骤只读，下一步不触发保存接口 */
    isPublishedTopic?: boolean;
    currentStep: number;
    setCurrentStep: (value: number | ((prev: number) => number)) => void;
    newTopicName: string;
    setNewTopicName: (value: string) => void;
    newTopicDesc: string;
    setNewTopicDesc: (value: string) => void;
    loadingDetail: boolean;
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
    recommendQuestions: Question[];
    setRecommendQuestions: (value: Question[] | ((prev: Question[]) => Question[])) => void;
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
        isPublishedTopic = false,
        currentStep,
        setCurrentStep,
        newTopicName,
        setNewTopicName,
        newTopicDesc,
        setNewTopicDesc,
        loadingDetail,
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
    const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | undefined>(undefined);

    const handleAddQuestion = () => {
        setEditingQuestion(undefined);
        setQuestionEditorOpen(true);
    };

    const handleEditQuestion = (q: Question) => {
        setEditingQuestion(q);
        setQuestionEditorOpen(true);
    };

    const handleSaveQuestion = (saved: Question) => {
        setRecommendQuestions((prev) => {
            const idx = prev.findIndex((q) => q.id === saved.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            return [...prev, saved];
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
    const isFormControlClick = (target: EventTarget | null) =>
        target instanceof HTMLElement && Boolean(target.closest("[data-slot='checkbox'], [data-slot='label']"));

    const toggleStratifiedField = (column: string, checked: boolean) => {
        setFieldMapping(prev => ({
            ...prev,
            stratified: checked ? [...prev.stratified, column] : prev.stratified.filter(x => x !== column),
            numeric: checked ? prev.numeric.filter(x => x !== column) : prev.numeric,
        }));
    };

    const toggleNumericField = (column: string, checked: boolean) => {
        setFieldMapping(prev => ({
            ...prev,
            numeric: checked ? [...prev.numeric, column] : prev.numeric.filter(x => x !== column),
            stratified: checked ? prev.stratified.filter(x => x !== column) : prev.stratified,
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-5xl h-[80vh] flex flex-col"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                    <DialogDescription className="sr-only">
                        通过六个步骤配置课题基础信息、总体数据、字段映射、辅助资料、推荐题目和评分权重。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted-foreground/20">
                        {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => {
                            const isCompleted = idx + 1 < currentStep;
                            const isCurrent = idx + 1 === currentStep;
                            return (
                                <div key={step} className="flex items-center shrink-0">
                                    <div
                                        data-testid={`teacher-topic-step-${idx + 1}`}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${isCurrent
                                            ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                                            : isCompleted
                                                ? "bg-success/20 text-success border border-success/30"
                                                : "bg-muted text-muted-foreground border border-border"
                                        }`}
                                    >
                                        {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                                    </div>
                                    <span className={`text-xs ml-2 ${isCurrent ? "text-primary font-medium" : isCompleted ? "text-success/80" : "text-muted-foreground"}`}>{step}</span>
                                    {idx < 5 && <ChevronRight className="w-3 h-3 mx-2 text-muted-foreground/30" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex-1">
                        {loadingDetail && currentStep > 1 && (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in duration-200">
                                <Loader2 className="w-6 h-6 animate-spin mb-3" />
                                <span className="text-sm">加载中...</span>
                            </div>
                        )}
                        {currentStep === 1 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="space-y-2">
                                    <Label htmlFor="topicName" className="text-foreground">课题名称</Label>
                                    <Input
                                        id="topicName"
                                        data-testid="teacher-topic-name"
                                        placeholder="请输入课题名称"
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                        className="placeholder:text-muted-foreground"
                                        />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">背景描述</Label>
                                    <RichTextEditor
                                        dataTestId="teacher-topic-desc"
                                        value={newTopicDesc}
                                        onChange={setNewTopicDesc}
                                        placeholder="请输入课题背景描述"
                                        className="bg-background border-border"
                                    />
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 2 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                {isPublishedTopic && (
                                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                                        该课题已发布，总体数据文件不可更换，仅可查看当前数据。
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <Label className="text-foreground">上传总体数据（Excel）</Label>
                                    <div className="flex items-center gap-3">
                                        <a
                                            href="/templates/数据上传规范.pdf"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:text-primary flex items-center gap-1"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            数据规范
                                        </a>
                                        <a
                                            href="/templates/数据模板.csv"
                                            download
                                            className="text-xs text-success hover:text-success/80 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            下载模板
                                        </a>
                                    </div>
                                </div>
                                <div
                                    className={`border-2 border-dashed border-border bg-background/50 p-8 text-center transition-colors ${isPublishedTopic ? "opacity-80 pointer-events-none" : "hover:border-primary/50"}`}
                                >
                                    <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-sm text-muted-foreground mb-2">
                                        {isPublishedTopic ? "已上传的数据文件（不可更换）" : "点击或拖拽上传 Excel 文件"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mb-4">支持 .xlsx, .xls, .csv 格式，数据行数 1-100,000</p>
                                    {!isPublishedTopic && (
                                        <>
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
                                                <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()}>
                                                    选择文件
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {uploadingExcel && <div className="flex items-center gap-2 text-sm text-primary"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                {excelInfo && (
                                    <div className="space-y-3">
                                        <div className="bg-background border border-border rounded-lg p-4 text-sm text-foreground">
                                            <div className={`flex items-center gap-2 mb-2 ${isPublishedTopic ? "text-muted-foreground" : "text-success"}`}>
                                                <CheckCircle2 className="w-4 h-4" />
                                                {isPublishedTopic ? "当前总体数据" : "上传成功"}
                                            </div>
                                            <div>已解析：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列</div>
                                        </div>
                                        {excelInfo.preview && excelInfo.preview.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-xs text-muted-foreground font-medium">数据预览（前 {Math.min(excelInfo.preview.length, 5)} 行）</div>
                                                <div className="border border-border rounded-lg">
                                                    <Table className="text-xs">
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                {excelInfo.columns.map((col) => (
                                                                    <TableHead key={col} className="h-auto py-2 normal-case tracking-normal">{col}</TableHead>
                                                                ))}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {excelInfo.preview.slice(0, 5).map((row, idx) => (
                                                                <TableRow key={idx} className="hover:bg-muted/30">
                                                                    {excelInfo!.columns.map((col) => (
                                                                        <TableCell key={col} className="max-w-[200px] truncate py-1.5 text-foreground">
                                                                            {row?.[col] != null ? String(row[col]) : <span className="text-muted-foreground">-</span>}
                                                                        </TableCell>
                                                                    ))}
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {!loadingDetail && currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                {isPublishedTopic && (
                                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                                        该课题已发布，字段映射不可修改，仅可查看当前配置。
                                    </div>
                                )}
                                <div className={`rounded-lg border border-border bg-background/60 p-4 ${isPublishedTopic ? "opacity-70" : ""}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-foreground">不知道怎么配？可先用智能推荐</div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                系统会根据字段名称和样例数据自动推荐标识符、分层变量和数值变量，你再按教学需要微调即可。
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={isPublishedTopic}
                                            onClick={applyRecommendedMapping}
                                            className="shrink-0"
                                        >
                                            <Sparkles data-icon="inline-start" />
                                            智能推荐映射
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-foreground">标识符（必选 1 个）</Label>
                                    <Select
                                        value={fieldMapping.identifier ?? ""}
                                        onValueChange={(v) =>
                                            setFieldMapping((prev) => ({
                                                ...prev,
                                                identifier: v,
                                                stratified: prev.stratified.filter((item) => item !== v),
                                                numeric: prev.numeric.filter((item) => item !== v),
                                            }))}
                                        disabled={isPublishedTopic}
                                    >
                                        <SelectTrigger data-testid="teacher-topic-mapping-identifier">
                                            <SelectValue placeholder="选择标识符字段" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                {columns.map((c) => (
                                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">用于唯一标识每条数据的字段，如“编号”、“ID”等</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {mappingRules.map((rule) => (
                                        <div
                                            key={rule.text}
                                            className={`rounded-md border px-3 py-2 text-xs ${rule.ok
                                                ? "border-success/30 bg-success/10 text-success"
                                                : "border-border bg-card text-muted-foreground"
                                                }`}
                                        >
                                            {rule.ok ? "✓" : "○"} {rule.text}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-foreground">分层变量（已选 {fieldMapping.stratified.length}）</Label>
                                        <p className="text-xs text-muted-foreground">用于按类别分组对比，建议 1-3 个，且每个字段唯一值不超过 20（如性别、学历、地区）。</p>
                                        {riskyStratifiedFields.length > 0 && (
                                            <p className="text-xs text-warning">
                                                当前分层变量包含高基数或 ID 类字段（{riskyStratifiedFields.join("、")}），保存时可能失败，建议替换。
                                            </p>
                                        )}
                                        <div className="bg-background border border-border p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.stratified.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifier(c) && !checked;
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为分层变量"
                                                        : undefined;
                                                const checkboxId = `teacher-topic-mapping-stratified-${encodeURIComponent(c)}`;
                                                return (
                                                    <div
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 rounded p-1.5 text-sm font-normal normal-case tracking-normal ${disabled
                                                            ? "text-muted-foreground cursor-not-allowed"
                                                            : "text-foreground hover:bg-card cursor-pointer"
                                                            }`}
                                                        onClick={(event) => {
                                                            if (disabled || isFormControlClick(event.target)) return;
                                                            toggleStratifiedField(c, !checked);
                                                        }}
                                                    >
                                                        <Checkbox
                                                            id={checkboxId}
                                                            data-testid={`teacher-topic-mapping-stratified-${c}`}
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onCheckedChange={(nextChecked) => {
                                                                toggleStratifiedField(c, nextChecked === true);
                                                            }}
                                                        />
                                                        <Label
                                                            htmlFor={checkboxId}
                                                            className={`text-sm font-normal normal-case tracking-normal ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                                                        >
                                                            {c}
                                                        </Label>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-foreground">数值变量（已选 {fieldMapping.numeric.length}）</Label>
                                        <p className="text-xs text-muted-foreground">用于统计计算，建议选择连续值/可比较大小的字段。</p>
                                        <div className="bg-background border border-border p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.numeric.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifier(c) && !checked;
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为数值变量"
                                                        : undefined;
                                                const checkboxId = `teacher-topic-mapping-numeric-${encodeURIComponent(c)}`;
                                                return (
                                                    <div
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 rounded p-1.5 text-sm font-normal normal-case tracking-normal ${disabled
                                                            ? "text-muted-foreground cursor-not-allowed"
                                                            : "text-foreground hover:bg-card cursor-pointer"
                                                            }`}
                                                        onClick={(event) => {
                                                            if (disabled || isFormControlClick(event.target)) return;
                                                            toggleNumericField(c, !checked);
                                                        }}
                                                    >
                                                        <Checkbox
                                                            id={checkboxId}
                                                            data-testid={`teacher-topic-mapping-numeric-${c}`}
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onCheckedChange={(nextChecked) => {
                                                                toggleNumericField(c, nextChecked === true);
                                                            }}
                                                        />
                                                        <Label
                                                            htmlFor={checkboxId}
                                                            className={`text-sm font-normal normal-case tracking-normal ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                                                        >
                                                            {c}
                                                        </Label>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 4 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <Label className="text-foreground">附件上传</Label>
                                <Input
                                    data-testid="teacher-topic-attachment-file"
                                    type="file"
                                    className="file:bg-muted file:text-foreground"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) onAttachmentUpload(file);
                                    }}
                                />
                                {uploadingAttachment && <div className="flex items-center gap-2 text-sm text-primary"><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                <div className="space-y-2 mt-4">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between text-sm p-3 bg-background border border-border group">
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-primary" />
                                                <span className="text-foreground">{a.fileName}</span>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="icon-xs"
                                                className="opacity-0 group-hover:opacity-100"
                                                onClick={() => teacherApi.deleteAttachment(editingTopicId!, a.id).then(() => onRefreshTopicDetail(editingTopicId!))}
                                            >
                                                <X />
                                            </Button>
                                        </div>
                                    ))}
                                    {attachments.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">暂无附件</div>}
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 5 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex justify-between items-center">
                                    <Label className="text-foreground">推荐题目</Label>
                                    <Button data-testid="teacher-topic-question-add" size="sm" onClick={handleAddQuestion}>
                                        + 添加题目
                                    </Button>
                                </div>
                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                    {recommendQuestions.map((q, idx) => {
                                        const qt = q.type as QuestionType;
                                        const optionsArr = q.options ?? [];
                                        return (
                                            <div key={q.id} className="border border-border bg-background p-4 relative group hover:border-border transition-colors">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex flex-col gap-0.5 pt-0.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            className="disabled:opacity-30"
                                                            disabled={idx === 0}
                                                            onClick={() => handleMoveQuestion(idx, "up")}
                                                        >
                                                            <ArrowUp />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            className="disabled:opacity-30"
                                                            disabled={idx === recommendQuestions.length - 1}
                                                            onClick={() => handleMoveQuestion(idx, "down")}
                                                        >
                                                            <ArrowDown />
                                                        </Button>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-muted-foreground text-xs font-mono">{idx + 1}.</span>
                                                            <Badge variant="muted">
                                                                {questionTypeLabels[qt] ?? "未知"}
                                                            </Badge>
                                                        </div>
                                                        <p data-testid={`teacher-topic-question-content-${idx}`} className="text-sm text-foreground leading-relaxed">
                                                            {q.content || <span className="text-muted-foreground italic">未填写题目内容</span>}
                                                        </p>
                                                        {(q.type === "single" || q.type === "multiple") && optionsArr.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {optionsArr.map((opt, i) => (
                                                                    <Badge key={i} variant="muted">
                                                                        {String.fromCharCode(65 + i)}. {opt}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {q.type === "boolean" && (
                                                            <p className="text-xs text-muted-foreground mt-1">选项：是 / 否</p>
                                                        )}
                                                        {q.type === "scale" && (
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                量表：{q.scaleMin ?? 1}–{q.scaleMax ?? 10} 分
                                                                {q.scaleMinLabel || q.scaleMaxLabel
                                                                    ? `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`
                                                                    : ""}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Pencil />
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="icon-xs"
                                                            onClick={() => handleDeleteQuestion(idx)}
                                                        >
                                                            <Trash2 />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {recommendQuestions.length === 0 && <div className="text-center text-muted-foreground py-8">暂无推荐题目，点击「+ 添加题目」开始创建</div>}
                                </div>

                                {/* Question Editor Dialog */}
                                <QuestionEditor
                                    open={questionEditorOpen}
                                    onOpenChange={setQuestionEditorOpen}
                                    question={editingQuestion}
                                    onSave={handleSaveQuestion}
                                />
                            </div>
                        )}

                        {!loadingDetail && currentStep === 6 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-background border border-border p-6 space-y-4">
                                        <Label className="text-foreground text-lg">问卷设计权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-questionnaire"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.questionnaire}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, questionnaire: Number(e.target.value) }))}
                                                className="text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-background border border-border p-6 space-y-4">
                                        <Label className="text-foreground text-lg">实验过程权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-process"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.process}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, process: Number(e.target.value) }))}
                                                className="text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-background border border-border p-6 space-y-4">
                                        <Label className="text-foreground text-lg">实验报告权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                data-testid="teacher-topic-weight-report"
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={weightConfig.report}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, report: Number(e.target.value) }))}
                                                className="text-2xl font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-xl">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-background/50 p-4 flex justify-between items-center border border-border">
                                    <span className="text-muted-foreground">当前总权重</span>
                                    <span className={`text-2xl font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                        {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-xs text-muted-foreground">步骤 {currentStep} / 6</div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => onOpenChange(false)}>关闭</Button>
                            {currentStep > 1 && (
                                <Button data-testid="teacher-topic-prev" variant="outline" onClick={() => setCurrentStep(prev => prev - 1)}>上一步</Button>
                            )}
                            {currentStep === 1 && (
                                <Button data-testid="teacher-topic-next" onClick={onSubmitTopic}>{editingTopicId ? "保存并继续" : "下一步"}</Button>
                            )}
                            {!loadingDetail && currentStep === 2 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={() => setCurrentStep(3)}
                                    disabled={!isPublishedTopic && !excelInfo}
                                >
                                    下一步
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 3 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={onSaveFieldMapping}
                                    disabled={!isPublishedTopic && !canProceedMapping}
                                >
                                    {isPublishedTopic ? "下一步" : "保存并继续"}
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 4 && (
                                <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(5)}>下一步</Button>
                            )}
                            {!loadingDetail && currentStep === 5 && (
                                <Button data-testid="teacher-topic-next" onClick={onSaveRecommendQuestions}>保存并继续</Button>
                            )}
                            {!loadingDetail && currentStep === 6 && (
                                <Button data-testid="teacher-topic-finish" onClick={onSaveWeights}>完成</Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
