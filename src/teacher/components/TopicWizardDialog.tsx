import { RequestError } from "@/components/RequestError";
import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Download, FileText, HelpCircle, Loader2, Pencil, Play, School, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { TopicDetail, Question } from "../api-client";
import { teacherApi } from "../api-client";
import { QuestionEditor } from "@/components/questionnaire/QuestionEditor";
import { questionTypeLabels, questionTypeBadgeColors } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";

import { categoricalFieldsFromMapping, parseStudyContract } from "@/lib/analysis-target";
import { isStudyContractComplete, StudyContractEditor, type FieldMappingState } from "./StudyContractEditor";
import {
    SAMPLING_METHODS,
    validateSamplingPolicy,
    type SamplingMethod,
    type SamplingMethodRequirement,
    type SamplingPolicyV1,
} from "@/lib/sampling-policy";
import {
    buildRecommendedFieldMapping,
    isLikelyHighCardinalityColumn,
    isLikelyIdentifierColumn,
} from "../topic/mapping-recommendation";

interface TopicWizardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTopicId: number | null;
    /** create 期间标题保持“创建”，不会因第 1 步已建草稿而变成“编辑”。 */
    mode?: "create" | "edit";
    /** 已发布课题：总体数据、字段映射和评分权重只读 */
    saveError?: string | null;
    isPublishedTopic?: boolean;
    currentStep: number;
    setCurrentStep: (value: number | ((prev: number) => number)) => void;
    newTopicName: string;
    setNewTopicName: (value: string) => void;
    newTopicDesc: string;
    setNewTopicDesc: (value: string) => void;
    loadingDetail: boolean;
    detailError?: string | null;
    onRetryDetail?: () => void;
    excelInfo: { rowCount: number; colCount: number; columns: string[]; preview: any[]; columnValues?: Record<string, string[]>; columnValuesTruncated?: string[] } | null;
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
    samplingPolicy: SamplingPolicyV1;
    setSamplingPolicy: (value: SamplingPolicyV1 | ((prev: SamplingPolicyV1) => SamplingPolicyV1)) => void;
    onSubmitTopic: () => void;
    onSaveFieldMapping: () => void;
    onSaveSamplingPolicy: () => void;
    onSaveRecommendQuestions: () => void;
    onSaveWeights: () => void;
}

export function TopicWizardDialog(props: TopicWizardDialogProps) {
    const {
        open,
        onOpenChange,
        editingTopicId,
        mode,
        isPublishedTopic = false,
        currentStep,
        setCurrentStep,
        newTopicName,
        setNewTopicName,
        newTopicDesc,
        setNewTopicDesc,
        loadingDetail,
        detailError,
        onRetryDetail,
        excelInfo,
        uploadingExcel,
        onExcelUpload,
        columns,
        fieldMapping,
        setFieldMapping,
        attachments,
        saveError,
        uploadingAttachment,
        onAttachmentUpload,
        onRefreshTopicDetail,
        recommendQuestions,
        setRecommendQuestions,
        weightConfig,
        setWeightConfig,
        samplingPolicy,
        setSamplingPolicy,
        onSubmitTopic,
        onSaveFieldMapping,
        onSaveSamplingPolicy,
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

    function applyRecommendedMapping() {
        setFieldMapping(buildRecommendedFieldMapping({
            columns,
            preview: excelInfo?.preview ?? [],
            topicName: newTopicName,
        }));
    }

    const analysisTarget = fieldMapping.analysisTarget;
    const mappingRules = [
        { ok: Boolean(fieldMapping.identifier), text: "已选择 1 个标识符" },
        // 研究合同完整，或仅有旧版对照变量的历史课题（保存时自动升级）
        { ok: parseStudyContract(fieldMapping) !== null
            ? isStudyContractComplete(fieldMapping.studyContract)
            : Boolean(analysisTarget?.kind && analysisTarget.field && (analysisTarget.kind === "mean" || analysisTarget.value)), text: "已完成研究合同" },
    ];
    const categoricalFields = categoricalFieldsFromMapping(fieldMapping);
    const analysisCategoryValues = (() => {
        if (analysisTarget?.kind !== "proportion" || !analysisTarget.field) return [];
        const fromFull = excelInfo?.columnValues?.[analysisTarget.field];
        if (fromFull && fromFull.length > 0) return fromFull;
        const values = new Set<string>();
        for (const row of excelInfo?.preview ?? []) {
            const value = String(row?.[analysisTarget.field] ?? "").trim();
            if (value) values.add(value);
        }
        return [...values];
    })();
    const isLikelyHighCardinality = (column: string) => (
        isLikelyHighCardinalityColumn(excelInfo?.preview ?? [], column)
    );
    const riskyStratifiedFields = fieldMapping.stratified.filter(
        (column) => isLikelyIdentifierColumn(column) || isLikelyHighCardinality(column)
    );
    const canProceedMapping = mappingRules.every((item) => item.ok);
    const targetField = fieldMapping.studyContract?.target.field ?? fieldMapping.analysisTarget?.field;
    const ppsEligibleFields = fieldMapping.numeric.filter((field) => {
        if (field === targetField) return false;
        const values = excelInfo?.columnValues?.[field]
            ?? (excelInfo?.preview ?? []).map((row) => String(row?.[field] ?? "")).filter(Boolean);
        return values.length > 0 && values.every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    });
    const samplingPolicyError = validateSamplingPolicy(samplingPolicy)
        ?? (ppsEligibleFields.length === 0 && samplingPolicy.methods.pps !== "disabled"
            ? "当前总体没有合格的 PPS 规模变量，请将 PPS 设为不适用"
            : fieldMapping.stratified.length === 0 && samplingPolicy.methods.stratified !== "disabled"
                ? "当前研究没有分层变量，请将分层抽样设为不适用"
            : null);
    const methodLabels: Record<SamplingMethod, string> = {
        simple: "简单随机抽样",
        systematic: "系统抽样",
        pps: "PPS抽样",
        stratified: "分层抽样",
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-5xl h-[80vh] flex flex-col bg-card border-border text-foreground"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-foreground">{(mode ?? (editingTopicId ? "edit" : "create")) === "edit" ? "编辑实验模板" : "创建实验模板"}</DialogTitle>
                    <DialogDescription className="sr-only">
                        通过七个步骤配置实验模板的基础信息、总体数据、研究目标、抽样策略、教学资料、推荐题目和评分规则。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border">
                        {["基本信息", "总体数据", "研究目标与字段", "抽样策略", "教学资料", "推荐题目", "评分规则"].map((step, idx) => {
                            const isCompleted = idx + 1 < currentStep;
                            const isCurrent = idx + 1 === currentStep;
                            return (
                                <div key={step} className="flex items-center shrink-0">
                                    <div
                                        data-testid={`teacher-topic-step-${idx + 1}`}
                                        className={`w-7 h-7 rounded-control flex items-center justify-center text-meta font-medium transition-colors ${isCurrent
                                            ? "bg-primary text-primary-foreground ring-2 ring-ring"
                                            : isCompleted
                                                ? "bg-success-muted text-success border border-success-border"
                                                : "bg-muted text-muted-foreground border border-input"
                                        }`}
                                    >
                                        {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                                    </div>
                                    <span className={`text-meta ml-2 ${isCurrent ? "text-primary font-medium" : isCompleted ? "text-success" : "text-muted-foreground"}`}>{step}</span>
                                    {idx < 6 && <ChevronRight className="w-3 h-3 mx-2 text-muted-foreground" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex-1">
                        {detailError && onRetryDetail && <RequestError message={detailError} onRetry={onRetryDetail} />}
                        {loadingDetail && !detailError && currentStep > 1 && (
                            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in duration-200">
                                <Loader2 aria-hidden="true" className="w-6 h-6 animate-spin mb-3" />
                                <span className="text-label">加载中...</span>
                            </div>
                        )}
                        {currentStep === 1 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="rounded-surface border border-info-border bg-info-muted p-4 text-info">
                                    <h3 className="text-label font-semibold">实验模板如何生成学生实验</h3>
                                    <div className="mt-3 grid grid-cols-4 gap-3 text-meta">
                                        <div className="rounded-surface border border-info-border bg-card p-3 text-foreground"><FileText className="mb-2 h-4 w-4 text-info" /><strong className="block">1. 配置模板</strong><span className="mt-1 block text-muted-foreground">总体数据、研究目标、抽样方法、资料与评分规则</span></div>
                                        <div className="rounded-surface border border-info-border bg-card p-3 text-foreground"><Play className="mb-2 h-4 w-4 text-info" /><strong className="block">2. 发布模板</strong><span className="mt-1 block text-muted-foreground">配置完整后发布，内容进入只读状态</span></div>
                                        <div className="rounded-surface border border-info-border bg-card p-3 text-foreground"><School className="mb-2 h-4 w-4 text-info" /><strong className="block">3. 分配任务</strong><span className="mt-1 block text-muted-foreground">选择班级与截止时间，生成实验任务</span></div>
                                        <div className="rounded-surface border border-info-border bg-card p-3 text-foreground"><Users className="mb-2 h-4 w-4 text-info" /><strong className="block">4. 学生完成</strong><span className="mt-1 block text-muted-foreground">问卷预试、样本量规划、抽样与分析报告</span></div>
                                    </div>
                                    <p className="mt-3 text-meta leading-relaxed">仅上传总体数据不会立即生成学生实验；必须完成七步配置，再发布模板并分配到班级。</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="topicName" className="text-foreground">实验模板名称</Label>
                                    <Input
                                        id="topicName"
                                        data-testid="teacher-topic-name"
                                        placeholder="请输入实验模板名称"
                                        maxLength={200}
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                        className="bg-card border-input text-foreground placeholder:text-muted-foreground"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">背景描述</Label>
                                    <RichTextEditor
                                        dataTestId="teacher-topic-desc"
                                        value={newTopicDesc}
                                        onChange={setNewTopicDesc}
                                        placeholder="请输入实验背景、目标总体和教学目的"
                                        className="bg-background border-border"
                                    />
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 2 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                {isPublishedTopic && (
                                    <div className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-label text-warning">
                                        该实验模板已发布，总体数据文件不可更换，仅可查看当前数据。
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <Label className="text-foreground">上传总体数据（Excel）</Label>
                                    <div className="flex items-center gap-3">
                                        <a
                                            href="/templates/数据上传规范.pdf"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-meta text-primary hover:text-primary flex items-center gap-1"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            数据规范
                                        </a>
                                        <a
                                            href="/templates/数据模板.csv"
                                            download
                                            className="text-meta text-success hover:text-success flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            下载模板
                                        </a>
                                    </div>
                                </div>
                                <div
                                    className={`border-2 border-dashed border-input bg-background rounded-surface p-8 text-center transition-none ${isPublishedTopic ? "opacity-80 pointer-events-none" : "hover:border-primary-border"}`}
                                >
                                    <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-label text-muted-foreground mb-2">
                                        {isPublishedTopic ? "已上传的数据文件（不可更换）" : "点击或拖拽上传 Excel 文件"}
                                    </p>
                                    <p className="text-meta text-muted-foreground mb-4">支持 .xlsx, .csv 格式，数据行数 1-100,000</p>
                                    {!isPublishedTopic && (
                                        <>
                                            <Input
                                                type="file"
                                                aria-label="上传总体数据文件"
                                                data-testid="teacher-topic-excel-file"
                                                accept=".xlsx,.csv"
                                                className="hidden"
                                                id="excel-upload"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) onExcelUpload(file);
                                                }}
                                            />
                                            <div className="flex items-center justify-center gap-3">
                                                <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()} className="border-input bg-muted text-foreground hover:text-foreground">
                                                    选择文件
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {uploadingExcel && <div role="status" aria-live="polite" className="flex items-center gap-2 text-label text-primary"><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                {excelInfo && (
                                    <div className="space-y-3">
                                        <div className="bg-background border border-border rounded-surface p-4 text-label text-foreground">
                                            <div className={`flex items-center gap-2 mb-2 ${isPublishedTopic ? "text-muted-foreground" : "text-success"}`}>
                                                <CheckCircle2 className="w-4 h-4" />
                                                {isPublishedTopic ? "当前总体数据" : "上传成功"}
                                            </div>
                                            <div>已解析：{excelInfo.rowCount} 行 / {excelInfo.colCount} 列</div>
                                            {(excelInfo.columnValuesTruncated?.length ?? 0) > 0 && (
                                                <div className="mt-2 text-meta text-warning">
                                                    高基数字段的类别选择仅展示前 200 项：{excelInfo.columnValuesTruncated!.join("、")}
                                                </div>
                                            )}
                                        </div>
                                        {excelInfo.preview && excelInfo.preview.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-meta text-muted-foreground font-medium">数据预览（前 {Math.min(excelInfo.preview.length, 5)} 行）</div>
                                                <div className="overflow-x-auto border border-border rounded-surface">
                                                    <table className="w-full text-meta">
                                                        <thead>
                                                            <tr className="bg-muted border-b border-border">
                                                                {excelInfo.columns.map((col) => (
                                                                    <th key={col} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {excelInfo.preview.slice(0, 5).map((row, idx) => (
                                                                <tr key={idx} className="border-b border-border hover:bg-muted">
                                                                    {excelInfo!.columns.map((col) => (
                                                                        <td key={col} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                                                                            {row?.[col] != null ? String(row[col]) : <span className="text-muted-foreground">-</span>}
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

                        {!loadingDetail && currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                {isPublishedTopic && (
                                    <div className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-label text-warning">
                                        该实验模板已发布，研究目标与字段不可修改，仅可查看当前配置。
                                    </div>
                                )}
                                <div className={`rounded-surface border border-border bg-background p-4 ${isPublishedTopic ? "opacity-70" : ""}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-label font-medium text-foreground">不知道怎么配？可先用智能推荐</div>
                                            <p className="mt-1 text-meta text-muted-foreground">
                                                系统会根据字段名称和样例数据自动推荐标识符、分层变量和数值变量，你再按教学需要微调即可。
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={isPublishedTopic}
                                            onClick={applyRecommendedMapping}
                                            className="shrink-0 border-primary-border bg-primary-muted text-primary hover:bg-primary-muted hover:text-primary"
                                        >
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            智能推荐映射
                                        </Button>
                                    </div>
                                </div>

                                {excelInfo && excelInfo.rowCount > 0 && excelInfo.rowCount < 100 && (
                                    <div data-testid="teacher-topic-small-population-notice" className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-label text-warning">
                                        总体只有 {excelInfo.rowCount} 个单位：按常用精度规划时很可能直接抽满总体（普查），各抽样方法会得到相同估计且没有抽样误差差异，不适合做方法比较。若教学目标是比较抽样方法，请把总体规模增加到至少数百个单位。
                                    </div>
                                )}

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
                                        <SelectTrigger aria-label="选择唯一标识字段" data-testid="teacher-topic-mapping-identifier" className="bg-card text-foreground disabled:border-input disabled:bg-muted disabled:text-muted-foreground">
                                            <SelectValue placeholder="选择标识符字段" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border text-foreground">
                                            {columns.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-meta text-muted-foreground">用于唯一标识每条数据的字段，如“编号”、“ID”等</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {mappingRules.map((rule) => (
                                        <div
                                            key={rule.text}
                                            className={`rounded-control border px-3 py-2 text-meta ${rule.ok
                                                ? "border-success-border bg-success-muted text-success"
                                                : "border-input bg-card text-muted-foreground"
                                                }`}
                                        >
                                            {rule.ok ? "✓" : "○"} {rule.text}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-foreground">分层变量（按需，已选 {fieldMapping.stratified.length}）</Label>
                                        <p className="text-meta text-muted-foreground">仅在需要分层抽样或分类分布比较时选择，建议 1-3 个，且每个字段唯一值不超过 20。</p>
                                        {riskyStratifiedFields.length > 0 && (
                                            <p className="text-meta text-warning">
                                                当前分层变量包含高基数或 ID 类字段（{riskyStratifiedFields.join("、")}），保存时可能失败，建议替换。
                                            </p>
                                        )}
                                        <div className="bg-background border border-border rounded-surface p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.stratified.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifierColumn(c) && !checked;
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为分层变量"
                                                        : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 text-label p-1.5 rounded-control ${disabled
                                                            ? "text-muted-foreground cursor-not-allowed"
                                                            : "text-foreground hover:bg-card cursor-pointer"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-stratified-${c}`}
                                                            type="checkbox"
                                                            className="rounded-control border-input bg-card text-primary focus:ring-ring"
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
                                        <Label className="text-foreground">数值变量（按需，已选 {fieldMapping.numeric.length}）</Label>
                                        <p className="text-meta text-muted-foreground">均值目标和 PPS 辅助规模需要数值字段；纯分类比例研究可以不选。</p>
                                        <div className="bg-background border border-border rounded-surface p-3 max-h-60 overflow-y-auto space-y-2">
                                            {columns.map((c) => {
                                                const checked = fieldMapping.numeric.includes(c);
                                                const blockedAsIdentifier = isLikelyIdentifierColumn(c) && !checked;
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c || blockedAsIdentifier;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : blockedAsIdentifier
                                                        ? "ID 类字段不建议作为数值变量"
                                                        : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2 text-label p-1.5 rounded-control ${disabled
                                                            ? "text-muted-foreground cursor-not-allowed"
                                                            : "text-foreground hover:bg-card cursor-pointer"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-numeric-${c}`}
                                                            type="checkbox"
                                                            className="rounded-control border-input bg-card text-primary focus:ring-ring"
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

                                <StudyContractEditor
                                    value={fieldMapping}
                                    onChange={setFieldMapping}
                                    topicName={newTopicName}
                                    categoricalFields={categoricalFields}
                                    analysisCategoryValues={analysisCategoryValues}
                                    disabled={Boolean(isPublishedTopic)}
                                />
                            </div>
                        )}

                        {!loadingDetail && currentStep === 4 && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="rounded-surface border border-info-border bg-info-muted px-4 py-3 text-label text-info">
                                    简单随机抽样作为比较基准固定必做。学生还需完成至少一种启用的方法；设为“必做”的方法必须全部完成。
                                    {isPublishedTopic ? "该实验模板已发布，抽样策略不可修改，仅可查看当前配置。" : null}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {SAMPLING_METHODS.map((method) => {
                                        const isSimple = method === "simple";
                                        const ppsUnavailable = method === "pps" && ppsEligibleFields.length === 0;
                                        const stratifiedUnavailable = method === "stratified" && fieldMapping.stratified.length === 0;
                                        const methodUnavailable = ppsUnavailable || stratifiedUnavailable;
                                        const requirement = samplingPolicy.methods[method];
                                        return (
                                            <div key={method} className="rounded-surface border border-border bg-background p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <h3 className="text-label font-semibold text-foreground">{methodLabels[method]}</h3>
                                                        <p className="mt-1 text-meta text-muted-foreground">
                                                            {isSimple
                                                                ? "所有实验的等概率比较基准。"
                                                                : method === "systematic"
                                                                    ? "适合有稳定抽样框顺序且无明显周期结构的场景。"
                                                                    : method === "pps"
                                                                        ? ppsUnavailable
                                                                            ? "当前总体没有与研究目标不同、且对每个单位均为正数的规模变量。"
                                                                            : `可用规模变量：${ppsEligibleFields.join("、")}`
                                                                        : stratifiedUnavailable
                                                                            ? "当前研究没有配置分层变量。"
                                                                            : "适合存在明确分层变量并需要控制各层样本构成的场景。"}
                                                        </p>
                                                    </div>
                                                    {isSimple ? (
                                                        <span className="rounded-control border border-primary-border bg-primary-muted px-2 py-1 text-meta text-primary">固定必做</span>
                                                    ) : (
                                                        <Select
                                                            value={requirement}
                                                            disabled={isPublishedTopic}
                                                            onValueChange={(value) => setSamplingPolicy((current) => ({
                                                                ...current,
                                                                methods: { ...current.methods, [method]: value as SamplingMethodRequirement },
                                                            }))}
                                                        >
                                                            <SelectTrigger aria-label={`${methodLabels[method]}要求`} className="w-28 bg-card"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="required" disabled={methodUnavailable}>必做</SelectItem>
                                                                <SelectItem value="optional" disabled={methodUnavailable}>选做</SelectItem>
                                                                <SelectItem value="disabled">不适用</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {samplingPolicyError && <p className="rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive">{samplingPolicyError}</p>}
                            </div>
                        )}

                        {!loadingDetail && currentStep === 5 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between gap-4">
                                    <Label htmlFor="teacher-topic-attachment-file" className="text-foreground">教学资料上传</Label>
                                    <a className="text-meta text-primary hover:underline" href="/templates/调查问卷设计规范与模板.docx" download>下载标准问卷模板</a>
                                </div>
                                <Input
                                    id="teacher-topic-attachment-file"
                                    data-testid="teacher-topic-attachment-file"
                                    type="file"
                                    className="bg-card border-input text-foreground file:bg-muted file:text-foreground"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) onAttachmentUpload(file);
                                    }}
                                />
                                {uploadingAttachment && <div role="status" aria-live="polite" className="flex items-center gap-2 text-label text-primary"><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> 上传中...</div>}
                                <div className="space-y-2 mt-4">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between text-label p-3 bg-background border border-border rounded-surface group">
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-primary" />
                                                <span className="text-foreground">{a.fileName}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label={`删除附件：${a.fileName}`}
                                                title={`删除附件：${a.fileName}`}
                                                className="opacity-0 text-destructive group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive-muted hover:text-destructive"
                                                onClick={() => teacherApi.deleteAttachment(editingTopicId!, a.id).then(() => onRefreshTopicDetail(editingTopicId!))}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {attachments.length === 0 && <div className="text-label text-muted-foreground text-center py-4">暂无附件</div>}
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 6 && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex justify-between items-center">
                                    <Label className="text-foreground">推荐题目</Label>
                                    <Button data-testid="teacher-topic-question-add" size="sm" onClick={handleAddQuestion} className="bg-primary hover:bg-primary-hover">
                                        + 添加题目
                                    </Button>
                                </div>
                                <div
                                    role="region"
                                    tabIndex={0}
                                    aria-label="推荐题目列表"
                                    className="space-y-3 max-h-[400px] overflow-y-auto pr-2"
                                >
                                    {recommendQuestions.map((q, idx) => {
                                        const qt = q.type as QuestionType;
                                        const badge = questionTypeBadgeColors[qt] ?? "bg-muted text-muted-foreground border-border";
                                        const optionsArr = q.options ?? [];
                                        return (
                                            <div key={q.id} className="border border-border bg-background rounded-surface p-4 relative group hover:border-input transition-none">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex flex-col gap-0.5 pt-0.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`上移第 ${idx + 1} 题`}
                                                            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:bg-muted disabled:text-muted-foreground disabled:border-border"
                                                            disabled={idx === 0}
                                                            onClick={() => handleMoveQuestion(idx, "up")}
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`下移第 ${idx + 1} 题`}
                                                            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:bg-muted disabled:text-muted-foreground disabled:border-border"
                                                            disabled={idx === recommendQuestions.length - 1}
                                                            onClick={() => handleMoveQuestion(idx, "down")}
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-muted-foreground text-meta font-mono">{idx + 1}.</span>
                                                            <span className={`text-meta px-2 py-0.5 rounded-control border ${badge}`}>
                                                                {questionTypeLabels[qt] ?? "未知"}
                                                            </span>
                                                        </div>
                                                        <p data-testid={`teacher-topic-question-content-${idx}`} className="text-label text-foreground leading-relaxed">
                                                            {q.content || <span className="text-muted-foreground italic">未填写题目内容</span>}
                                                        </p>
                                                        {(q.type === "single" || q.type === "multiple") && optionsArr.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {optionsArr.map((opt, i) => (
                                                                    <span key={i} className="text-meta px-2 py-0.5 bg-muted text-muted-foreground rounded-control border border-input">
                                                                        {String.fromCharCode(65 + i)}. {opt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {q.type === "boolean" && (
                                                            <p className="text-meta text-muted-foreground mt-1">选项：是 / 否</p>
                                                        )}
                                                        {q.type === "scale" && (
                                                            <p className="text-meta text-muted-foreground mt-1">
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
                                                            size="icon"
                                                            aria-label={`编辑第 ${idx + 1} 题`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary-muted"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`删除第 ${idx + 1} 题`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                                                            onClick={() => handleDeleteQuestion(idx)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
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

                        {!loadingDetail && currentStep === 7 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                {isPublishedTopic ? (
                                    <div className="rounded-surface border border-info-border bg-info-muted px-4 py-3 text-label text-info">
                                        该实验模板已发布，评分规则不可修改，仅可查看当前权重。
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="bg-background border border-border rounded-surface p-6 space-y-4">
                                        <Label htmlFor="teacher-topic-weight-questionnaire" className="text-foreground text-subheading">问卷设计权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="teacher-topic-weight-questionnaire"
                                                data-testid="teacher-topic-weight-questionnaire"
                                                type="number"
                                                min={0}
                                                max={100}
                                                disabled={isPublishedTopic}
                                                value={weightConfig.questionnaire}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, questionnaire: Number(e.target.value) }))}
                                                className="bg-card border-input text-foreground text-page-title font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-section-title">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-background border border-border rounded-surface p-6 space-y-4">
                                        <Label htmlFor="teacher-topic-weight-process" className="text-foreground text-subheading">实验过程权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="teacher-topic-weight-process"
                                                data-testid="teacher-topic-weight-process"
                                                type="number"
                                                min={0}
                                                max={100}
                                                disabled={isPublishedTopic}
                                                value={weightConfig.process}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, process: Number(e.target.value) }))}
                                                className="bg-card border-input text-foreground text-page-title font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-section-title">%</span>
                                        </div>
                                    </div>
                                    <div className="bg-background border border-border rounded-surface p-6 space-y-4">
                                        <Label htmlFor="teacher-topic-weight-report" className="text-foreground text-subheading">实验报告权重</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="teacher-topic-weight-report"
                                                data-testid="teacher-topic-weight-report"
                                                type="number"
                                                min={0}
                                                max={100}
                                                disabled={isPublishedTopic}
                                                value={weightConfig.report}
                                                onChange={(e) => setWeightConfig(prev => ({ ...prev, report: Number(e.target.value) }))}
                                                className="bg-card border-input text-foreground text-page-title font-bold h-16 text-center"
                                            />
                                            <span className="text-muted-foreground font-bold text-section-title">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-background p-4 rounded-surface flex justify-between items-center border border-border">
                                    <span className="text-muted-foreground">当前总权重</span>
                                    <span className={`text-page-title font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                        {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
                    {saveError ? (
                        <div
                            role="alert"
                            data-testid="teacher-topic-save-error"
                            className="mb-3 w-full rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive"
                        >
                            {saveError}
                        </div>
                    ) : null}
                    <div className="flex items-center justify-between w-full">
                        <div className="text-meta text-muted-foreground">步骤 {currentStep} / 7</div>
                        <div className="flex gap-2">
                            {currentStep > 1 && (
                                <Button data-testid="teacher-topic-prev" variant="outline" onClick={() => setCurrentStep(prev => prev - 1)} className="border-input bg-muted text-foreground hover:text-foreground hover:bg-muted">上一步</Button>
                            )}
                            {currentStep === 1 && (
                                <Button data-testid="teacher-topic-next" onClick={onSubmitTopic} className="bg-primary hover:bg-primary-hover text-primary-foreground">{editingTopicId ? "保存并继续" : "下一步"}</Button>
                            )}
                            {!loadingDetail && currentStep === 2 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={() => setCurrentStep(3)}
                                    disabled={!isPublishedTopic && !excelInfo}
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
                                >
                                    下一步
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 3 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={onSaveFieldMapping}
                                    disabled={!isPublishedTopic && !canProceedMapping}
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
                                >
                                    {isPublishedTopic ? "下一步" : "保存并继续"}
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 4 && (
                                <Button data-testid="teacher-topic-next" onClick={onSaveSamplingPolicy} disabled={!isPublishedTopic && Boolean(samplingPolicyError)} className="bg-primary hover:bg-primary-hover text-primary-foreground">{isPublishedTopic ? "下一步" : "保存并继续"}</Button>
                            )}
                            {!loadingDetail && currentStep === 5 && (
                                <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(6)} className="bg-primary hover:bg-primary-hover text-primary-foreground">下一步</Button>
                            )}
                            {!loadingDetail && currentStep === 6 && (
                                <Button data-testid="teacher-topic-next" onClick={onSaveRecommendQuestions} className="bg-primary hover:bg-primary-hover text-primary-foreground">保存并继续</Button>
                            )}
                            {!loadingDetail && currentStep === 7 && (
                                <Button data-testid="teacher-topic-finish" onClick={onSaveWeights} className="bg-primary hover:bg-primary-hover text-primary-foreground">{isPublishedTopic ? "关闭" : "完成"}</Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
