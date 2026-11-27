import { CsvFileReviewDialog } from "@/components/CsvFileReviewDialog";
import { RequestError } from "@/components/RequestError";
import { parseNumericText } from "@/lib/numeric-text";
import { assignFieldRole } from "../topic/field-roles";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Download, FileText, HelpCircle, Loader2, Pencil, Play, School, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { TopicDetail, Question } from "../api-client";
import { teacherApi } from "../api-client";
import { QuestionEditor } from "@/components/questionnaire/QuestionEditor";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";
import type { QuestionType } from "@/lib/questionnaire-types";

import { categoricalFieldsFromMapping, parseStudyContract } from "@/lib/analysis-target";
import { getStudyContractMissingItems, isStudyContractComplete, StudyContractEditor, type FieldMappingState } from "./StudyContractEditor";
import { VariableDictionaryEditor } from "./VariableDictionaryEditor";
import {
    filterPpsEligibleFields,
    SAMPLING_METHODS,
    validateSamplingPolicy,
    type SamplingMethod,
    type SamplingMethodRequirement,
    type SamplingPolicyV1,
} from "@/lib/sampling-policy";
import {
    DEFAULT_FIELDWORK_CONFIG,
    type FieldworkPreset,
    type FieldworkSimulationConfig,
} from "@/domain/fieldwork";
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
    excelInfo: { rowCount: number; colCount: number; columns: string[]; preview: any[]; columnValues?: Record<string, string[]>; columnValuesTruncated?: string[]; ppsEligibleFields?: string[] } | null;
    uploadingExcel: boolean;
    onExcelUpload: (file: File) => void;
    columns: string[];
    fieldMapping: FieldMappingState;
    /** Compared with the last successfully loaded server mapping, not the step's draft baseline. */
    fieldMappingNeedsSave: boolean;
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
    fieldworkConfig?: FieldworkSimulationConfig;
    setFieldworkConfig?: (value: FieldworkSimulationConfig | ((prev: FieldworkSimulationConfig) => FieldworkSimulationConfig)) => void;
    onSubmitTopic: () => void;
    onSaveFieldMapping: (advance?: boolean) => Promise<boolean>;
    onSaveSamplingPolicy: () => void;
    onSaveRecommendQuestions: () => void;
    onSaveWeights: () => void;
}

function parseBoundedInput(input: HTMLInputElement, min: number, max: number, fallback: number, decimals?: number): number {
    if (input.validity?.badInput) return fallback;
    const raw = input.value.trim();
    if (raw === "") return min;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.min(max, Math.max(min, parsed));
    return decimals !== undefined ? Number(clamped.toFixed(decimals)) : clamped;
}

function parseWeightInput(input: HTMLInputElement, fallback: number): number {
    if (input.validity?.badInput) return fallback;
    const raw = input.value.trim();
    if (raw === "") return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const FIELDWORK_PRESET_META: Record<FieldworkPreset, {
    label: string;
    baseUnitNonResponseRate: number;
    baseSpeederRate: number;
    baseStraightlinerRate: number;
    baseItemSkipRate: number;
    waveSummary: string;
}> = {
    balanced: {
        label: "常规均衡实地回收",
        baseUnitNonResponseRate: 0.16,
        baseSpeederRate: 0.06,
        baseStraightlinerRate: 0.05,
        baseItemSkipRate: 0.02,
        waveSummary: "首轮试投（Wave 1）呈现均衡触达损耗（基准无回答率 16%）与少量敷衍卷；学生可在正式轮（Wave 2）代入实测回收率与样本方差校准发放规模。",
    },
    stratum_differential: {
        label: "细分客群差异化拒访",
        baseUnitNonResponseRate: 0.22,
        baseSpeederRate: 0.06,
        baseStraightlinerRate: 0.05,
        baseItemSkipRate: 0.02,
        waveSummary: "不同细分客群存在显著拒访率梯度。首轮试投若仅用简单随机抽样，样本将向高响应客群偏移（无回答偏倚）；引导学生在正式轮升级为分层抽样或启用事后分层权重校准。",
    },
    high_burden_sensitive: {
        label: "问卷题量负担高敏感",
        baseUnitNonResponseRate: 0.20,
        baseSpeederRate: 0.12,
        baseStraightlinerRate: 0.10,
        baseItemSkipRate: 0.04,
        waveSummary: "中途弃答概率按 1.35 倍放大，且冗长问卷更易诱发闪电敷衍卷（12%）与直线作答卷（10%）。引导学生在首轮质检清洗废卷后，于正式轮精简问卷结构并优化数值量程。",
    },
    peak_congestion: {
        label: "高峰拥堵漏接场景",
        baseUnitNonResponseRate: 0.28,
        baseSpeederRate: 0.07,
        baseStraightlinerRate: 0.05,
        baseItemSkipRate: 0.03,
        waveSummary: "实地触达额外叠加 +4% 高峰拥堵漏接损耗（基准无回答率 28%），拒访与失联比例偏高。引导学生在首轮识别有效样本缺口后，于正式轮上调无回答膨胀系数重算样本量。",
    },
};

function resolveStratumCategories(
    stratumField: string | undefined,
    excelInfo: TopicWizardDialogProps["excelInfo"],
    existingRates?: Record<string, number>,
): string[] {
    if (!stratumField) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (raw: unknown) => {
        const normalized = String(raw ?? "").trim().normalize("NFKC");
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            list.push(normalized);
        }
    };
    for (const val of excelInfo?.columnValues?.[stratumField] ?? []) push(val);
    if (list.length === 0) {
        for (const row of excelInfo?.preview ?? []) push(row?.[stratumField]);
    }
    for (const key of Object.keys(existingRates ?? {})) push(key);
    return list.slice(0, 20);
}

function buildDefaultStratumRates(categories: readonly string[]): Record<string, number> {
    if (categories.length === 0) return {};
    if (categories.length === 1) return { [categories[0]!]: 0.22 };
    const low = 0.08;
    const high = 0.38;
    return Object.fromEntries(categories.map((cat, idx) => {
        const rate = low + ((high - low) * idx) / (categories.length - 1);
        return [cat, Number(rate.toFixed(2))];
    }));
}

function sanitizeFieldworkStrata(
    config: FieldworkSimulationConfig,
    allowedStrata: readonly string[],
): FieldworkSimulationConfig {
    if (config.stratumField && !allowedStrata.includes(config.stratumField)) {
        const { stratumField: _sf, stratumNonResponseRates: _sr, ...rest } = config;
        return {
            ...rest,
            preset: rest.preset === "stratum_differential" ? "balanced" : rest.preset,
        };
    }
    if (allowedStrata.length === 0 && config.preset === "stratum_differential") {
        const { stratumField: _sf, stratumNonResponseRates: _sr, ...rest } = config;
        return { ...rest, preset: "balanced" };
    }
    return config;
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
        fieldMappingNeedsSave,
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
        fieldworkConfig = DEFAULT_FIELDWORK_CONFIG,
        setFieldworkConfig,
        onSubmitTopic,
        onSaveFieldMapping,
        onSaveSamplingPolicy,
        onSaveRecommendQuestions,
        onSaveWeights,
    } = props;

    // Recommend question editor state
    const [csvReviewFile, setCsvReviewFile] = useState<File | null>(null);
    const [pending, setPending] = useState(false);
    const pendingRef = useRef(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stepRef = useRef<HTMLSpanElement>(null);
    const errorRef = useRef<HTMLDivElement>(null);
    const dictionaryDetailsRef = useRef<HTMLDetailsElement>(null);
    const [dictionaryState, setDictionaryState] = useState({ dirty: false, busy: false });
    const [dictionaryLoadVersion, setDictionaryLoadVersion] = useState(0);
    const [mappingSavedNotice, setMappingSavedNotice] = useState(false);
    const mappingNeedsSave = !isPublishedTopic && fieldMappingNeedsSave;
    const [fieldSearch, setFieldSearch] = useState("");
    const [selectedFieldsOnly, setSelectedFieldsOnly] = useState(false);
    const matchingFields = columns.filter(field => field.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase()));
    const fieldsFor = (role: "stratified" | "numeric" | "others") => matchingFields.filter(field => !selectedFieldsOnly || fieldMapping[role].includes(field));
    useEffect(() => { setFieldSearch(""); setSelectedFieldsOnly(false); }, [open, editingTopicId]);
    const editMode = (mode ?? (editingTopicId ? "edit" : "create")) === "edit";
    const busy = pending || uploadingExcel || uploadingAttachment || Boolean(csvReviewFile) || dictionaryState.busy;
    const stepValue = JSON.stringify(currentStep === 1 ? [newTopicName, newTopicDesc]
        : currentStep === 3 ? fieldMapping : currentStep === 4 ? [samplingPolicy, fieldworkConfig]
        : currentStep === 6 ? recommendQuestions : currentStep === 7 ? weightConfig : null);
    const baseline = useRef<{ step: number; value: string } | null>(null);
    const formDirty = Boolean(open && !loadingDetail && baseline.current?.step === currentStep && baseline.current.value !== stepValue);
    useLayoutEffect(() => {
        if (!open || loadingDetail) baseline.current = null;
        else if (baseline.current?.step !== currentStep) baseline.current = { step: currentStep, value: stepValue };
    });
    useEffect(() => {
        if (!open || (!formDirty && !dictionaryState.dirty && !busy)) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [open, formDirty, dictionaryState.dirty, busy]);
    function canLeaveDictionary() {
        if (!dictionaryState.dirty) return true;
        if (dictionaryDetailsRef.current) dictionaryDetailsRef.current.open = true;
        setActionError("变量字典有未保存的修改，请先点击“明确确认并保存”。");
        return false;
    }
    async function saveMappingForDictionary() {
        if (dictionaryState.dirty && !window.confirm("保存字段配置会重新载入变量字典，未保存的字典修改将被丢弃。继续吗？")) return;
        if (await onSaveFieldMapping(false)) {
            // A fast response can batch loading states without unmounting the
            // editor. Explicitly discard the old source only after persistence.
            // Capture the reloaded value on the next render, including any
            // server normalization (JSONB can reorder nested object keys).
            baseline.current = null;
            setDictionaryLoadVersion(version => version + 1);
            setMappingSavedNotice(true);
        }
    }
    useEffect(() => {
        if (mappingSavedNotice && !loadingDetail && dictionaryDetailsRef.current) {
            dictionaryDetailsRef.current.open = true;
            dictionaryDetailsRef.current.scrollIntoView?.({ block: "nearest", behavior: "instant" });
        }
    }, [mappingSavedNotice, loadingDetail]);
    useEffect(() => { setMappingSavedNotice(false); }, [open, editingTopicId, currentStep]);
    useEffect(() => { if (mappingNeedsSave) setMappingSavedNotice(false); }, [mappingNeedsSave]);
    function goToStep(step: number) {
        if (busy || pendingRef.current || loadingDetail || detailError || step === currentStep) return;
        if ((formDirty || dictionaryState.dirty) && !window.confirm("切换步骤会丢弃本步未保存的修改。继续吗？")) return;
        if (formDirty && baseline.current) {
            const saved = JSON.parse(baseline.current.value);
            if (currentStep === 1) { setNewTopicName(saved[0]); setNewTopicDesc(saved[1]); }
            if (currentStep === 3) setFieldMapping(saved);
            if (currentStep === 4) {
                setSamplingPolicy(saved[0]);
                setFieldworkConfig?.(saved[1]);
            }
            if (currentStep === 6) setRecommendQuestions(saved);
            if (currentStep === 7) setWeightConfig(saved);
        }
        setCurrentStep(step);
    }
    const displayedError = actionError ?? saveError;
    useLayoutEffect(() => {
        if (open && displayedError && !busy) errorRef.current?.focus({ preventScroll: true });
    }, [open, displayedError, busy]);
    useLayoutEffect(() => {
        if (!open) { setCsvReviewFile(null); return; }
        if (contentRef.current) contentRef.current.scrollTop = 0;
        stepRef.current?.focus({ preventScroll: true });
        setActionError(null);
    }, [currentStep, open]);
    async function runAction(action: () => void | Promise<unknown>) {
        if (pendingRef.current || busy || loadingDetail) return;
        pendingRef.current = true;
        setPending(true);
        setActionError(null);
        try { await action(); }
        catch { setActionError("操作未完成，请重试；本页输入已保留。"); }
        finally { pendingRef.current = false; setPending(false); }
    }
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

    function applyFieldworkPreset(nextPreset: FieldworkPreset) {
        if (!setFieldworkConfig) return;
        if (nextPreset === "stratum_differential" && fieldMapping.stratified.length === 0) return;
        const meta = FIELDWORK_PRESET_META[nextPreset];
        setFieldworkConfig((prev) => {
            if (nextPreset === "stratum_differential") {
                const chosenField = prev.stratumField && fieldMapping.stratified.includes(prev.stratumField)
                    ? prev.stratumField
                    : fieldMapping.stratified[0]!;
                const categories = resolveStratumCategories(chosenField, excelInfo, prev.stratumNonResponseRates);
                const rates = buildDefaultStratumRates(categories);
                return sanitizeFieldworkStrata({
                    ...prev,
                    preset: nextPreset,
                    baseUnitNonResponseRate: meta.baseUnitNonResponseRate,
                    baseSpeederRate: meta.baseSpeederRate,
                    baseStraightlinerRate: meta.baseStraightlinerRate,
                    baseItemSkipRate: meta.baseItemSkipRate,
                    stratumField: chosenField,
                    ...(Object.keys(rates).length > 0 ? { stratumNonResponseRates: rates } : {}),
                }, fieldMapping.stratified);
            }
            const { stratumField: _sf, stratumNonResponseRates: _sr, ...rest } = prev;
            return sanitizeFieldworkStrata({
                ...rest,
                preset: nextPreset,
                baseUnitNonResponseRate: meta.baseUnitNonResponseRate,
                baseSpeederRate: meta.baseSpeederRate,
                baseStraightlinerRate: meta.baseStraightlinerRate,
                baseItemSkipRate: meta.baseItemSkipRate,
            }, fieldMapping.stratified);
        });
    }

    function handleGenerateRecommendQuestions() {
        const target = fieldMapping.studyContract?.target ?? fieldMapping.analysisTarget;
        const generated: Question[] = [];
        const usedFields = new Set<string>();
        const pushQuestionForField = (field: string, role: "target" | "numeric" | "stratified" | "others") => {
            if (!field || usedFields.has(field)) return;
            if (recommendQuestions.some((q) => q.content.includes(field))) return;
            usedFields.add(field);
            const id = `q_tpl_${Date.now()}_${generated.length}`;
            if (role === "numeric" || (role === "target" && target?.kind === "mean")) {
                generated.push({
                    id,
                    type: "numeric",
                    section: role === "target" ? "main" : "main",
                    content: `请如实填写您的「${field}」数值：`,
                    decimalPlaces: 1,
                    numericMin: 0,
                });
                return;
            }
            const cats = resolveStratumCategories(field, excelInfo).slice(0, 10);
            const normalizedPair = cats.length === 2 && cats.includes("是") && cats.includes("否");
            if (normalizedPair) {
                generated.push({
                    id,
                    type: "boolean",
                    section: role === "stratified" ? "background" : "main",
                    content: `请问您的「${field}」情况是否为“是”？`,
                });
            } else if (cats.length >= 2) {
                generated.push({
                    id,
                    type: "single",
                    section: role === "stratified" ? "background" : "main",
                    content: `请问您的「${field}」属于以下哪一类别？`,
                    options: cats,
                });
            } else {
                generated.push({
                    id,
                    type: "scale",
                    section: "main",
                    content: `请对「${field}」进行综合评分（1—5 分）：`,
                    scaleMin: 1,
                    scaleMax: 5,
                    scaleMinLabel: "非常低",
                    scaleMaxLabel: "非常高",
                });
            }
        };
        if (target?.field) pushQuestionForField(target.field, "target");
        for (const f of fieldMapping.numeric) pushQuestionForField(f, "numeric");
        for (const f of fieldMapping.stratified) pushQuestionForField(f, "stratified");
        for (const f of fieldMapping.others) pushQuestionForField(f, "others");

        const remainingSlots = Math.max(0, 30 - recommendQuestions.length);
        const toAppend = generated.slice(0, remainingSlots);
        if (toAppend.length === 0) return;
        setRecommendQuestions((prev) => [...prev, ...toAppend]);
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
    const ppsEligibleFields = filterPpsEligibleFields(samplingPolicy, fieldMapping.numeric.filter((field) => {
        if (field === targetField) return false;
        if (excelInfo?.ppsEligibleFields) return excelInfo.ppsEligibleFields.includes(field);
        const values = excelInfo?.columnValues?.[field]
            ?? (excelInfo?.preview ?? []).map((row) => String(row?.[field] ?? "")).filter(Boolean);
        return values.length > 0 && values.every((value) => (parseNumericText(value) ?? 0) > 0);
    }));
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
        <Dialog open={open} onOpenChange={(value) => {
            if (busy) return;
            if (!value && (formDirty || dictionaryState.dirty) && !window.confirm(editingTopicId
                ? "关闭会丢弃未保存的修改。已保存的内容不受影响。确定关闭吗？"
                : "尚未创建模板。名称和说明会暂存于本机，确定关闭吗？")) return;
            onOpenChange(value);
        }}>
            <DialogContent
                className="w-[calc(100vw-2rem)] max-w-5xl h-[86vh] flex flex-col overflow-hidden bg-card border-border text-foreground"
                showCloseButton={!busy}
                onOpenAutoFocus={(event) => { event.preventDefault(); stepRef.current?.focus({ preventScroll: true }); }}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-section-title font-medium text-foreground">{editMode ? "编辑实验模板" : "创建实验模板"}</DialogTitle>
                    <DialogDescription className="sr-only">
                        通过七个步骤配置实验模板的基础信息、总体数据、研究目标、抽样策略与虚拟投放参数、教学资料、推荐题目和评分规则。
                    </DialogDescription>
                </DialogHeader>
                    <div data-testid="teacher-topic-step-navigation" className="custom-scrollbar flex shrink-0 items-center justify-between gap-0.5 overflow-x-auto border-b border-border pb-3">
                        {["基本信息", "总体数据", "研究目标与字段", "抽样策略", "教学资料", "推荐题目", "评分规则"].map((step, idx) => {
                            const isCompleted = !editMode && idx + 1 < currentStep;
                            const isCurrent = idx + 1 === currentStep;
                            const needsPopulation = (idx === 2 || idx === 3) && !excelInfo;
                            const indicator = <>
                                    <span
                                        ref={isCurrent ? stepRef : undefined}
                                        tabIndex={isCurrent ? -1 : undefined}
                                        aria-current={isCurrent ? "step" : undefined}
                                        data-testid={`teacher-topic-step-${idx + 1}`}
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-circle text-meta font-medium tabular-nums outline-none ${isCurrent
                                            ? "bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                            : isCompleted
                                                ? "bg-accent text-accent-foreground"
                                                : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                                    </span>
                                    <span className={`ml-1.5 whitespace-nowrap text-meta ${isCurrent ? "font-medium text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>{step}</span>
                            </>;
                            return (
                                <div key={step} className="flex shrink-0 items-center">
                                    {editMode ? <button
                                        type="button"
                                        data-testid={`teacher-topic-jump-${idx + 1}`}
                                        aria-label={`编辑${step}`}
                                        title={needsPopulation ? "请先上传总体数据" : undefined}
                                        disabled={busy || loadingDetail || Boolean(detailError) || needsPopulation}
                                        onClick={() => goToStep(idx + 1)}
                                        className="flex min-h-9 items-center rounded-pill px-1.5 py-1 transition-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed"
                                    >{indicator}</button> : <div className="flex min-h-9 items-center px-1">{indicator}</div>}
                                    {idx < 6 && <span aria-hidden="true" className="mx-1 h-px w-2 shrink-0 bg-border" />}
                                </div>
                            );
                        })}
                    </div>

                <div ref={contentRef} data-testid="teacher-topic-scroll-content" className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
                    <div className="min-w-0 flex-1" inert={busy} aria-busy={busy}>
                        {detailError && onRetryDetail && <RequestError message={detailError} onRetry={onRetryDetail} />}
                        {loadingDetail && !detailError && currentStep > 1 && (
                            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                <Loader2 aria-hidden="true" className="mb-3 h-6 w-6 animate-spin" />
                                <span className="text-label">加载中...</span>
                            </div>
                        )}
                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <details className="rounded-surface border border-border bg-muted px-4 py-3 text-foreground">
                                    <summary className="cursor-pointer text-label font-medium text-foreground">实验模板如何生成学生实验</summary>
                                    <div className="mt-3 grid grid-cols-4 gap-3 text-meta">
                                        <div className="rounded-control border border-border bg-card p-3 text-foreground"><FileText className="mb-2 h-4 w-4 text-muted-foreground" /><strong className="block font-medium">1. 配置模板</strong><span className="mt-1 block text-muted-foreground">总体数据、研究合同、抽样与虚拟投放、资料及评分规则</span></div>
                                        <div className="rounded-control border border-border bg-card p-3 text-foreground"><Play className="mb-2 h-4 w-4 text-muted-foreground" /><strong className="block font-medium">2. 发布模板</strong><span className="mt-1 block text-muted-foreground">发布状态下锁定总体、研究目标与字段、变量字典、抽样策略、虚拟投放配置及评分规则</span></div>
                                        <div className="rounded-control border border-border bg-card p-3 text-foreground"><School className="mb-2 h-4 w-4 text-muted-foreground" /><strong className="block font-medium">3. 分配任务</strong><span className="mt-1 block text-muted-foreground">选择班级与截止时间；存在已分配任务时，另锁定名称、描述、推荐题和教学资料</span></div>
                                        <div className="rounded-control border border-border bg-card p-3 text-foreground"><Users className="mb-2 h-4 w-4 text-muted-foreground" /><strong className="block font-medium">4. 学生完成</strong><span className="mt-1 block text-muted-foreground">商业问卷设计、首轮试投、质检诊断、二轮调优与决策报告</span></div>
                                    </div>
                                    <p className="mt-3 text-meta leading-relaxed text-muted-foreground">完成七步配置并发布模板后，再分配到班级。</p>
                                </details>
                                <div className="space-y-2">
                                    <Label htmlFor="topicName" className="text-foreground">实验模板名称</Label>
                                    <Input
                                        id="topicName"
                                        data-testid="teacher-topic-name"
                                        placeholder="请输入实验模板名称"
                                        maxLength={200}
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                        className="bg-card"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">背景描述</Label>
                                    <RichTextEditor
                                        dataTestId="teacher-topic-desc"
                                        value={newTopicDesc}
                                        onChange={setNewTopicDesc}
                                        placeholder="请输入实验背景、目标总体和教学目的"
                                        className="border-border bg-card"
                                    />
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 2 && (
                            <div className="space-y-4">
                                {isPublishedTopic && (
                                    <div className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-muted-foreground">
                                        该实验模板已发布，总体数据文件不可更换，仅可查看当前数据。
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <Label className="text-foreground">上传总体数据（Excel）</Label>
                                    <div className="flex items-center gap-4">
                                        <a
                                            href="/templates/数据上传规范.pdf"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-meta font-medium text-primary hover:underline"
                                        >
                                            <HelpCircle className="h-3.5 w-3.5" />
                                            数据规范
                                        </a>
                                        <a
                                            href="/templates/数据模板.csv"
                                            download
                                            className="flex items-center gap-1 text-meta font-medium text-primary hover:underline"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                            下载模板
                                        </a>
                                    </div>
                                </div>
                                <div
                                    className={`rounded-surface border border-dashed border-input bg-muted p-8 text-center transition-none ${isPublishedTopic ? "pointer-events-none opacity-80" : "hover:border-primary-border"}`}
                                >
                                    <Upload className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                                    <p className="mb-1.5 text-label font-medium text-foreground">
                                        {isPublishedTopic ? "已上传的数据文件（不可更换）" : "点击或拖拽上传 Excel 文件"}
                                    </p>
                                    <p className="mb-4 text-meta text-muted-foreground">支持 .xlsx、.csv，数据行数 1-100,000；CSV 须先选择编码并核对预览，再确认上传</p>
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
                                                    e.target.value = "";
                                                    if (file?.name.toLowerCase().endsWith(".csv")) setCsvReviewFile(file);
                                                    else if (file) onExcelUpload(file);
                                                }}
                                            />
                                            <div className="flex items-center justify-center gap-3">
                                                <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()} className="bg-card">
                                                    选择文件
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {uploadingExcel && <div role="status" aria-live="polite" className="flex items-center gap-2 text-label text-primary"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> 上传中...</div>}
                                {excelInfo && (
                                    <div className="space-y-3">
                                        <div className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-foreground">
                                            <div className={`mb-1.5 flex items-center gap-2 font-medium ${isPublishedTopic ? "text-muted-foreground" : "text-success"}`}>
                                                <CheckCircle2 className="h-4 w-4" />
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
                                                <div className="text-meta font-medium text-muted-foreground">数据预览（前 {Math.min(excelInfo.preview.length, 5)} 行）</div>
                                                <div className="overflow-x-auto rounded-surface border border-border bg-card">
                                                    <table className="w-full text-meta">
                                                        <thead>
                                                            <tr className="border-b border-border bg-muted">
                                                                {excelInfo.columns.map((col) => (
                                                                    <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {excelInfo.preview.slice(0, 5).map((row, idx) => (
                                                                <tr key={idx} className="border-b border-border last:border-b-0 hover:bg-muted">
                                                                    {excelInfo!.columns.map((col) => (
                                                                        <td key={col} className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-foreground">
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
                            <div className="space-y-5">
                                {isPublishedTopic && (
                                    <div className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-muted-foreground">
                                        该实验模板已发布，研究目标与字段不可修改，仅可查看当前配置。
                                    </div>
                                )}
                                {!isPublishedTopic && <p className="text-meta text-muted-foreground">
                                    更改字段角色或估计目标会重置抽样策略，请在下一步重新确认。仅修改文字说明不会重置。
                                </p>}
                                <div className={`rounded-surface border border-border bg-muted p-4 ${isPublishedTopic ? "opacity-70" : ""}`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-label font-medium text-foreground">推荐字段映射</div>
                                            <p className="mt-0.5 text-meta text-muted-foreground">
                                                根据字段名称和样例数据推荐标识符、分层变量和数值变量，请核对后使用。
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={isPublishedTopic}
                                            onClick={applyRecommendedMapping}
                                            className="shrink-0 bg-card"
                                        >
                                            <Sparkles className="mr-1.5 h-4 w-4 text-primary" />
                                            智能推荐映射
                                        </Button>
                                    </div>
                                </div>

                                {excelInfo && excelInfo.rowCount > 0 && excelInfo.rowCount < 100 && (
                                    <div data-testid="teacher-topic-small-population-notice" className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-label text-warning">
                                        总体只有 {excelInfo.rowCount} 个单位，按常用精度规划可能抽满总体（普查），无法比较抽样误差。若需比较抽样方法，请将总体增加到至少数百个单位。
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label className="text-foreground">标识符（必选 1 个）</Label>
                                    <Select
                                        value={fieldMapping.identifier ?? ""}
                                        onValueChange={(v) =>
                                            setFieldMapping((prev) => assignFieldRole(prev, v, "identifier"))}
                                        disabled={isPublishedTopic}
                                    >
                                        <SelectTrigger aria-label="选择唯一标识字段" data-testid="teacher-topic-mapping-identifier" className="bg-card text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground">
                                            <SelectValue placeholder="选择标识符字段" />
                                        </SelectTrigger>
                                        <SelectContent>
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
                                            className="flex items-center gap-2 rounded-control border border-border bg-muted px-3 py-2 text-meta text-foreground"
                                        >
                                            <span className={rule.ok ? "font-medium text-success" : "text-muted-foreground"}>
                                                {rule.ok ? "✓" : "○"}
                                            </span>
                                            <span>{rule.text}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2 rounded-surface border border-border bg-muted p-3.5">
                                    <Label htmlFor="teacher-field-search">查找字段</Label>
                                    <div className="flex items-center gap-3">
                                        <Input id="teacher-field-search" data-testid="teacher-field-search" value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="按字段名称搜索" className="min-w-0 flex-1 bg-card" />
                                        <label className="flex shrink-0 items-center gap-2 text-label text-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedFieldsOnly} onChange={event => setSelectedFieldsOnly(event.target.checked)} />仅看已选</label>
                                        <Button variant="outline" className="bg-card" disabled={!fieldSearch && !selectedFieldsOnly} onClick={() => { setFieldSearch(""); setSelectedFieldsOnly(false); }}>显示全部字段</Button>
                                    </div>
                                    <p className="text-meta text-muted-foreground">筛选下方三组变量，不改变已选字段或研究目标。</p>
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <Label className="text-foreground">分层变量（按需，已选 {fieldMapping.stratified.length}）</Label>
                                        <p className="text-meta text-muted-foreground">分层抽样时选择，建议 1-3 个；每个字段需有 2-20 个类别。仅用于比例或分类分布比较时，可选下方其他分类变量。</p>
                                        {riskyStratifiedFields.length > 0 && (
                                            <p className="text-meta text-warning">
                                                请核对编码或高基数字段（{riskyStratifiedFields.join("、")}）是否代表实际分组：分层需有 2-20 个类别；其他分类分析不受此限制。
                                            </p>
                                        )}
                                        <div className="max-h-60 space-y-1 overflow-y-auto rounded-surface border border-border bg-card p-2.5">
                                            {fieldsFor("stratified").length === 0 && <p className="px-1 py-2 text-meta text-muted-foreground">没有符合条件的字段</p>}
                                            {fieldsFor("stratified").map((c) => {
                                                const checked = fieldMapping.stratified.includes(c);
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : isLikelyIdentifierColumn(c) ? "请确认该编码代表分组而非唯一单位；分层需有2-20个类别" : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2.5 rounded-control px-2 py-1.5 text-label ${disabled
                                                            ? "cursor-not-allowed text-muted-foreground"
                                                            : checked
                                                                ? "cursor-pointer bg-muted font-medium text-foreground"
                                                                : "cursor-pointer text-foreground hover:bg-muted"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-stratified-${c}`}
                                                            type="checkbox"
                                                            className="h-4 w-4 shrink-0 accent-primary"
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => assignFieldRole(prev, c, e.target.checked ? "stratified" : null));
                                                            }}
                                                        />
                                                        <span className="min-w-0 truncate">{c}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-foreground">数值变量（按需，已选 {fieldMapping.numeric.length}）</Label>
                                        <p className="text-meta text-muted-foreground">均值目标和 PPS 辅助规模需要数值字段；纯分类比例研究可以不选。</p>
                                        <div className="max-h-60 space-y-1 overflow-y-auto rounded-surface border border-border bg-card p-2.5">
                                            {fieldsFor("numeric").length === 0 && <p className="px-1 py-2 text-meta text-muted-foreground">没有符合条件的字段</p>}
                                            {fieldsFor("numeric").map((c) => {
                                                const checked = fieldMapping.numeric.includes(c);
                                                const disabled = isPublishedTopic || fieldMapping.identifier === c;
                                                const reason = fieldMapping.identifier === c
                                                    ? "该字段已作为标识符"
                                                    : isLikelyIdentifierColumn(c) ? "请确认该字段是数值度量而非单位编号" : undefined;
                                                return (
                                                    <label
                                                        key={c}
                                                        title={reason}
                                                        className={`flex items-center gap-2.5 rounded-control px-2 py-1.5 text-label ${disabled
                                                            ? "cursor-not-allowed text-muted-foreground"
                                                            : checked
                                                                ? "cursor-pointer bg-muted font-medium text-foreground"
                                                                : "cursor-pointer text-foreground hover:bg-muted"
                                                            }`}
                                                    >
                                                        <input
                                                            data-testid={`teacher-topic-mapping-numeric-${c}`}
                                                            type="checkbox"
                                                            className="h-4 w-4 shrink-0 accent-primary"
                                                            disabled={disabled}
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setFieldMapping(prev => assignFieldRole(prev, c, e.target.checked ? "numeric" : null));
                                                            }}
                                                        />
                                                        <span className="min-w-0 truncate">{c}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-foreground">其他分类变量（不用于分层，已选 {fieldMapping.others.length}）</Label>
                                    <p className="text-meta text-muted-foreground">用于比例目标或分类分布比较；允许只有一个类别或超过20类，不要求执行分层抽样。</p>
                                    <div className="grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto rounded-surface border border-border bg-card p-2.5">
                                        {fieldsFor("others").length === 0 && <p className="col-span-2 px-1 py-2 text-meta text-muted-foreground">没有符合条件的字段</p>}
                                        {fieldsFor("others").map((field) => {
                                            const checked = fieldMapping.others.includes(field);
                                            const disabled = isPublishedTopic || fieldMapping.identifier === field;
                                            return (
                                                <label
                                                    key={field}
                                                    className={`flex items-center gap-2.5 rounded-control px-2 py-1.5 text-label ${disabled
                                                        ? "cursor-not-allowed text-muted-foreground"
                                                        : checked
                                                            ? "cursor-pointer bg-muted font-medium text-foreground"
                                                            : "cursor-pointer text-foreground hover:bg-muted"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        data-testid={`teacher-topic-mapping-others-${field}`}
                                                        className="h-4 w-4 shrink-0 accent-primary"
                                                        disabled={disabled}
                                                        checked={checked}
                                                        onChange={(event) => setFieldMapping(prev => assignFieldRole(prev, field, event.target.checked ? "others" : null))}
                                                    />
                                                    <span className="min-w-0 truncate">{field}</span>
                                                </label>
                                            );
                                        })}
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
                                {mappingNeedsSave && <div role="status" className="space-y-3 rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">
                                    <p>字段配置尚未保存，请先保存，再核对变量字典。更改字段角色或对照变量会使已保存的字典失效，需要重新确认。</p>
                                    <Button data-testid="teacher-topic-save-mapping" variant="outline" className="bg-card" disabled={busy || !canProceedMapping} onClick={() => void runAction(saveMappingForDictionary)}>保存字段配置并载入字典</Button>
                                </div>}
                                {mappingSavedNotice && !mappingNeedsSave && <p role="status" className="rounded-surface border border-border bg-muted px-4 py-2.5 text-label text-foreground">字段配置已保存，请核对并保存下方变量字典。不需要题目变量绑定与自主分析时，可直接继续。</p>}
                                {editingTopicId && <details ref={dictionaryDetailsRef} data-testid="teacher-variable-dictionary" className="rounded-surface border border-border bg-muted p-4">
                                    <summary data-testid="teacher-variable-dictionary-toggle" className="cursor-pointer text-label font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                                        变量字典（按需配置，单独保存）{dictionaryState.dirty ? " · 未保存" : ""}
                                    </summary>
                                    <p className="mt-2 text-meta text-muted-foreground">核对字段标签、单位、类别顺序和缺失值处理规则；不随“保存并继续”一起保存。</p>
                                    <div className="mt-4"><VariableDictionaryEditor key={`${editingTopicId}-${dictionaryLoadVersion}`} topicId={editingTopicId} readOnly={isPublishedTopic} disabled={mappingNeedsSave} onStateChange={setDictionaryState} /></div>
                                </details>}
                            </div>
                        )}

                        {!loadingDetail && currentStep === 4 && (
                            <div className="space-y-5">
                                <div className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-muted-foreground">
                                    简单随机抽样固定为必做。学生还需完成至少一种已启用的方法，并完成所有标记为“必做”的方法。
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
                                            <div key={method} className="rounded-surface border border-border bg-card p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <h3 className="text-label font-medium text-foreground">{methodLabels[method]}</h3>
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
                                                        <span className="shrink-0 rounded-control border border-border bg-muted px-2.5 py-1 text-meta font-medium text-foreground">固定必做</span>
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

                                {setFieldworkConfig && (() => {
                                    const activeStratumField = fieldworkConfig.stratumField && fieldMapping.stratified.includes(fieldworkConfig.stratumField)
                                        ? fieldworkConfig.stratumField
                                        : fieldMapping.stratified[0];
                                    const stratumCategories = fieldworkConfig.preset === "stratum_differential"
                                        ? resolveStratumCategories(activeStratumField, excelInfo, fieldworkConfig.stratumNonResponseRates)
                                        : [];
                                    const presetMeta = FIELDWORK_PRESET_META[fieldworkConfig.preset] ?? FIELDWORK_PRESET_META.balanced;
                                    return (
                                        <div className="space-y-4 rounded-surface border border-border bg-card p-5" data-testid="teacher-topic-fieldwork-config">
                                            <div>
                                                <h3 className="text-subheading font-medium text-foreground">虚拟问卷投放环境与参考经费参数</h3>
                                                <p className="mt-1 text-meta text-muted-foreground">
                                                    控制学生执行首轮试投及正式轮发放时的无回答率、敷衍废卷比例及单份参考成本（仅作教学成本效益参考，不阻断操作）。
                                                </p>
                                            </div>
                                            <div
                                                data-testid="teacher-topic-fw-preset-summary"
                                                className="rounded-control bg-muted px-3.5 py-2.5 text-meta text-muted-foreground"
                                            >
                                                <span className="font-medium text-foreground">多波次教学效果（{presetMeta.label}）：</span>
                                                {presetMeta.waveSummary}
                                            </div>
                                            {fieldMapping.stratified.length === 0 && (
                                                <p
                                                    data-testid="teacher-topic-fw-no-strata-hint"
                                                    className="rounded-control bg-muted px-3.5 py-2 text-meta text-muted-foreground"
                                                >
                                                    当前研究未映射分层变量，「细分客群差异化拒访」预设不可选；如需模拟不同客群的拒访率差异，请返回第 3 步勾选分层变量。
                                                </p>
                                            )}
                                            <div className="grid grid-cols-4 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-meta text-foreground">市场响应预设场景</Label>
                                                    <Select
                                                        value={fieldworkConfig.preset}
                                                        disabled={isPublishedTopic}
                                                        onValueChange={(val) => applyFieldworkPreset(val as FieldworkPreset)}
                                                    >
                                                        <SelectTrigger aria-label="选择市场响应预设场景" data-testid="teacher-topic-fw-preset" className="bg-card">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="balanced">常规均衡实地回收</SelectItem>
                                                            <SelectItem value="stratum_differential" disabled={fieldMapping.stratified.length === 0}>
                                                                细分客群差异化拒访
                                                            </SelectItem>
                                                            <SelectItem value="high_burden_sensitive">问卷题量负担高敏感</SelectItem>
                                                            <SelectItem value="peak_congestion">高峰拥堵漏接场景</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-base-nrr" className="text-meta text-foreground">基准单元无回答率 (%)</Label>
                                                    <Input
                                                        id="fw-base-nrr"
                                                        data-testid="teacher-topic-fw-nrr"
                                                        type="number"
                                                        min={0}
                                                        max={75}
                                                        step={1}
                                                        disabled={isPublishedTopic}
                                                        value={Math.round(fieldworkConfig.baseUnitNonResponseRate * 100)}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            baseUnitNonResponseRate: parseBoundedInput(e.target, 0, 75, Math.round(prev.baseUnitNonResponseRate * 100), 0) / 100,
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-careless-rate" className="text-meta text-foreground">闪电卷基准比例 (%)</Label>
                                                    <Input
                                                        id="fw-careless-rate"
                                                        data-testid="teacher-topic-fw-speeder"
                                                        type="number"
                                                        min={0}
                                                        max={35}
                                                        step={1}
                                                        disabled={isPublishedTopic}
                                                        value={Math.round(fieldworkConfig.baseSpeederRate * 100)}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            baseSpeederRate: parseBoundedInput(e.target, 0, 35, Math.round(prev.baseSpeederRate * 100), 0) / 100,
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-straight-rate" className="text-meta text-foreground">直线作答卷基准比例 (%)</Label>
                                                    <Input
                                                        id="fw-straight-rate"
                                                        data-testid="teacher-topic-fw-straightliner"
                                                        type="number"
                                                        min={0}
                                                        max={35}
                                                        step={1}
                                                        disabled={isPublishedTopic}
                                                        value={Math.round(fieldworkConfig.baseStraightlinerRate * 100)}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            baseStraightlinerRate: parseBoundedInput(e.target, 0, 35, Math.round(prev.baseStraightlinerRate * 100), 0) / 100,
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-item-skip-rate" className="text-meta text-foreground">普通题项随机漏答率 (%)</Label>
                                                    <Input
                                                        id="fw-item-skip-rate"
                                                        data-testid="teacher-topic-fw-skip-rate"
                                                        type="number"
                                                        min={0}
                                                        max={25}
                                                        step={1}
                                                        disabled={isPublishedTopic}
                                                        value={Math.round(fieldworkConfig.baseItemSkipRate * 100)}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            baseItemSkipRate: parseBoundedInput(e.target, 0, 25, Math.round(prev.baseItemSkipRate * 100), 0) / 100,
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-contact-cost" className="text-meta text-foreground">单份触达发放成本 (元)</Label>
                                                    <Input
                                                        id="fw-contact-cost"
                                                        data-testid="teacher-topic-fw-contact-cost"
                                                        type="number"
                                                        min={0}
                                                        max={10000}
                                                        step="any"
                                                        disabled={isPublishedTopic}
                                                        value={fieldworkConfig.contactCostPerUnit}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            contactCostPerUnit: parseBoundedInput(e.target, 0, 10_000, prev.contactCostPerUnit, 2),
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="fw-incentive-cost" className="text-meta text-foreground">单份完答礼金成本 (元)</Label>
                                                    <Input
                                                        id="fw-incentive-cost"
                                                        data-testid="teacher-topic-fw-incentive-cost"
                                                        type="number"
                                                        min={0}
                                                        max={50000}
                                                        step="any"
                                                        disabled={isPublishedTopic}
                                                        value={fieldworkConfig.incentiveCostPerComplete}
                                                        onChange={(e) => setFieldworkConfig((prev) => sanitizeFieldworkStrata({
                                                            ...prev,
                                                            incentiveCostPerComplete: parseBoundedInput(e.target, 0, 50_000, prev.incentiveCostPerComplete, 2),
                                                        }, fieldMapping.stratified))}
                                                        className="bg-card tabular-nums"
                                                    />
                                                </div>
                                            </div>
                                            {fieldworkConfig.preset === "stratum_differential" && fieldMapping.stratified.length > 0 && activeStratumField && (
                                                <div
                                                    data-testid="teacher-topic-fw-strata-panel"
                                                    className="space-y-3 rounded-surface border border-border bg-muted p-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-label font-medium text-foreground">细分客群差异化无回答率配置</div>
                                                            <p className="mt-0.5 text-meta text-muted-foreground">
                                                                分别设定各客群层的单元拒访/失联率（0%–85%），未单独指定的类别回退至基准单元无回答率。
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Select
                                                                value={activeStratumField}
                                                                disabled={isPublishedTopic}
                                                                onValueChange={(nextField) => setFieldworkConfig((prev) => {
                                                                    const nextCats = resolveStratumCategories(nextField, excelInfo);
                                                                    return sanitizeFieldworkStrata({
                                                                        ...prev,
                                                                        stratumField: nextField,
                                                                        stratumNonResponseRates: buildDefaultStratumRates(nextCats),
                                                                    }, fieldMapping.stratified);
                                                                })}
                                                            >
                                                                <SelectTrigger aria-label="选择差异化应答分层字段" data-testid="teacher-topic-fw-stratum-field" className="w-44 bg-card">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {fieldMapping.stratified.map((field) => (
                                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {!isPublishedTopic && stratumCategories.length > 1 && (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="bg-card"
                                                                    onClick={() => setFieldworkConfig((prev) => ({
                                                                        ...prev,
                                                                        stratumField: activeStratumField,
                                                                        stratumNonResponseRates: buildDefaultStratumRates(stratumCategories),
                                                                    }))}
                                                                >
                                                                    按梯度生成
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {stratumCategories.length > 0 ? (
                                                        <div className="space-y-2.5 pt-1">
                                                            {stratumCategories.map((cat) => {
                                                                const rate = fieldworkConfig.stratumNonResponseRates?.[cat] ?? fieldworkConfig.baseUnitNonResponseRate;
                                                                const pct = Math.round(rate * 100);
                                                                const updateStratumPct = (nextPct: number) => {
                                                                    const clampedPct = Math.min(85, Math.max(0, Math.round(nextPct)));
                                                                    setFieldworkConfig((prev) => {
                                                                        const baseRates = Object.fromEntries(
                                                                            stratumCategories.map((c) => [c, prev.stratumNonResponseRates?.[c] ?? prev.baseUnitNonResponseRate]),
                                                                        );
                                                                        return {
                                                                            ...prev,
                                                                            stratumField: activeStratumField,
                                                                            stratumNonResponseRates: {
                                                                                ...baseRates,
                                                                                [cat]: Number((clampedPct / 100).toFixed(2)),
                                                                            },
                                                                        };
                                                                    });
                                                                };
                                                                return (
                                                                    <div key={cat} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 rounded-control border border-border bg-card px-3 py-2">
                                                                        <span className="truncate text-label font-medium text-foreground" title={cat}>{cat}</span>
                                                                        <Slider
                                                                            aria-label={`${cat} 单元无回答率滑块`}
                                                                            min={0}
                                                                            max={85}
                                                                            step={1}
                                                                            disabled={isPublishedTopic}
                                                                            value={[pct]}
                                                                            onValueChange={(vals) => { if (vals[0] !== undefined) updateStratumPct(vals[0]); }}
                                                                        />
                                                                        <div className="flex items-center gap-1">
                                                                            <Input
                                                                                aria-label={`${cat} 单元无回答率百分比`}
                                                                                data-testid={`teacher-topic-fw-stratum-rate-${cat}`}
                                                                                type="number"
                                                                                min={0}
                                                                                max={85}
                                                                                step={1}
                                                                                disabled={isPublishedTopic}
                                                                                value={pct}
                                                                                onChange={(e) => updateStratumPct(parseBoundedInput(e.target, 0, 85, pct, 0))}
                                                                                className="h-8 bg-card px-2 text-right tabular-nums"
                                                                            />
                                                                            <span className="text-meta text-muted-foreground">%</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-meta text-muted-foreground">
                                                            当前分层字段「{activeStratumField}」暂无预览类别值，将使用基准单元无回答率。
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {!loadingDetail && currentStep === 5 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <Label htmlFor="teacher-topic-attachment-file" className="text-foreground">教学资料上传</Label>
                                    <a className="text-meta font-medium text-primary hover:underline" href="/templates/调查问卷设计规范与模板.docx" download>下载标准问卷模板</a>
                                </div>
                                <Input
                                    id="teacher-topic-attachment-file"
                                    data-testid="teacher-topic-attachment-file"
                                    type="file"
                                    className="bg-card"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) onAttachmentUpload(file);
                                    }}
                                />
                                {uploadingAttachment && <div role="status" aria-live="polite" className="flex items-center gap-2 text-label text-primary"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> 上传中...</div>}
                                <div className="mt-4 space-y-2">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="group flex items-center justify-between rounded-surface border border-border bg-card px-4 py-3 text-label hover:bg-muted">
                                            <div className="flex items-center gap-3">
                                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="text-foreground">{a.fileName}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label={`删除附件：${a.fileName}`}
                                                title={`删除附件：${a.fileName}`}
                                                className="text-muted-foreground hover:bg-destructive-muted hover:text-destructive"
                                                onClick={() => void runAction(async () => {
                                                    const result = await teacherApi.deleteAttachment(editingTopicId!, a.id);
                                                    if (!result.success) throw new Error("删除失败");
                                                    await onRefreshTopicDetail(editingTopicId!);
                                                })}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {attachments.length === 0 && <div className="py-4 text-center text-label text-muted-foreground">暂无附件</div>}
                                </div>
                            </div>
                        )}

                        {!loadingDetail && currentStep === 6 && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <Label className="text-foreground">推荐题目（已配置 {recommendQuestions.length} / 30 题）</Label>
                                        <p className="mt-0.5 text-meta text-muted-foreground">
                                            学生设计问卷时可一键引用推荐题目；数值题与匹配类别选项的单选题可直接绑定课题变量。
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(fieldMapping.numeric.length + fieldMapping.stratified.length + fieldMapping.others.length) > 0 && recommendQuestions.length < 30 && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                data-testid="teacher-topic-question-generate"
                                                onClick={handleGenerateRecommendQuestions}
                                            >
                                                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                                                按映射字段生成推荐题
                                            </Button>
                                        )}
                                        <Button
                                            data-testid="teacher-topic-question-add"
                                            size="sm"
                                            disabled={recommendQuestions.length >= 30}
                                            onClick={handleAddQuestion}
                                        >
                                            + 添加题目
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    role="region"
                                    tabIndex={0}
                                    aria-label="推荐题目列表"
                                    className="custom-scrollbar max-h-[400px] space-y-2.5 overflow-y-auto pr-1"
                                >
                                    {recommendQuestions.map((q, idx) => {
                                        const qt = q.type as QuestionType;
                                        const optionsArr = q.options ?? [];
                                        return (
                                            <div key={q.id} className="group relative rounded-surface border border-border bg-card p-4 transition-none hover:border-input">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex flex-col gap-0.5 pt-0.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`上移第 ${idx + 1} 题`}
                                                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                            disabled={idx === 0}
                                                            onClick={() => handleMoveQuestion(idx, "up")}
                                                        >
                                                            <ArrowUp className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`下移第 ${idx + 1} 题`}
                                                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                            disabled={idx === recommendQuestions.length - 1}
                                                            onClick={() => handleMoveQuestion(idx, "down")}
                                                        >
                                                            <ArrowDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                                            <span className="font-mono text-meta text-muted-foreground">{idx + 1}.</span>
                                                            <span className="rounded-control border border-border bg-muted px-2 py-0.5 text-meta text-muted-foreground">
                                                                {questionTypeLabels[qt] ?? "未知"}
                                                            </span>
                                                            {q.section && QUESTION_SECTION_LABELS[q.section] && (
                                                                <span className="rounded-control border border-border bg-muted px-2 py-0.5 text-meta text-muted-foreground">
                                                                    {QUESTION_SECTION_LABELS[q.section]}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p data-testid={`teacher-topic-question-content-${idx}`} className="text-label leading-relaxed text-foreground">
                                                            {q.content || <span className="italic text-muted-foreground">未填写题目内容</span>}
                                                        </p>
                                                        {(q.type === "single" || q.type === "multiple") && optionsArr.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {optionsArr.map((opt, i) => (
                                                                    <span key={i} className="rounded-control bg-muted px-2 py-0.5 text-meta text-muted-foreground">
                                                                        {String.fromCharCode(65 + i)}. {opt}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {q.type === "boolean" && (
                                                            <p className="mt-1 text-meta text-muted-foreground">选项：是 / 否</p>
                                                        )}
                                                        {q.type === "scale" && (
                                                            <p className="mt-1 text-meta text-muted-foreground">
                                                                量表：{q.scaleMin ?? 1}–{q.scaleMax ?? 10} 分
                                                                {q.scaleMinLabel || q.scaleMaxLabel
                                                                    ? `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`
                                                                    : ""}
                                                            </p>
                                                        )}
                                                        {q.type === "numeric" && (q.unit || q.numericMin !== undefined || q.numericMax !== undefined) && (
                                                            <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                                                                数值设置：
                                                                {q.unit ? `单位「${q.unit}」` : "无单位"}
                                                                {(q.numericMin !== undefined || q.numericMax !== undefined)
                                                                    ? ` · 量程 ${q.numericMin ?? "-∞"} ～ ${q.numericMax ?? "+∞"}`
                                                                    : ""}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`编辑第 ${idx + 1} 题`}
                                                            className="h-8 w-8 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`删除第 ${idx + 1} 题`}
                                                            className="h-8 w-8 text-muted-foreground hover:bg-destructive-muted hover:text-destructive"
                                                            onClick={() => handleDeleteQuestion(idx)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {recommendQuestions.length === 0 && <div className="py-8 text-center text-label text-muted-foreground">暂无推荐题目，点击「+ 添加题目」开始创建</div>}
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

                        {!loadingDetail && currentStep === 7 && (() => {
                            const qOut = weightConfig.questionnaire < 10 || weightConfig.questionnaire > 50;
                            const pOut = weightConfig.process < 20 || weightConfig.process > 60;
                            const rOut = weightConfig.report < 10 || weightConfig.report > 50;
                            const sum = weightConfig.questionnaire + weightConfig.process + weightConfig.report;
                            const weightsValid = !qOut && !pOut && !rOut && sum === 100;
                            return (
                                <div className="space-y-5">
                                    {isPublishedTopic ? (
                                        <div className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-muted-foreground">
                                            该实验模板已发布，评分规则不可修改，仅可查看当前权重。
                                        </div>
                                    ) : (
                                        <p className="text-meta text-muted-foreground">
                                            配置三项成绩的加权比例（三项之和须等于 100%，发布后锁定为批改与总分计算基准）。
                                        </p>
                                    )}
                                    <div className="grid grid-cols-3 gap-5">
                                        <div className={`space-y-3 rounded-surface border bg-card p-5 ${!isPublishedTopic && qOut ? "border-destructive-border" : "border-border"}`}>
                                            <div>
                                                <Label htmlFor="teacher-topic-weight-questionnaire" className="text-subheading font-medium text-foreground">问卷设计权重</Label>
                                                <p className={`mt-1 text-meta tabular-nums ${!isPublishedTopic && qOut ? "text-destructive" : "text-muted-foreground"}`}>允许范围：10% – 50%</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    id="teacher-topic-weight-questionnaire"
                                                    data-testid="teacher-topic-weight-questionnaire"
                                                    type="number"
                                                    min={10}
                                                    max={50}
                                                    aria-invalid={!isPublishedTopic && qOut}
                                                    disabled={isPublishedTopic}
                                                    value={weightConfig.questionnaire}
                                                    onChange={(e) => setWeightConfig(prev => ({
                                                        ...prev,
                                                        questionnaire: parseWeightInput(e.target, prev.questionnaire),
                                                    }))}
                                                    className="h-14 bg-card text-center text-page-title font-medium tabular-nums"
                                                />
                                                <span className="text-section-title font-medium text-muted-foreground">%</span>
                                            </div>
                                        </div>
                                        <div className={`space-y-3 rounded-surface border bg-card p-5 ${!isPublishedTopic && pOut ? "border-destructive-border" : "border-border"}`}>
                                            <div>
                                                <Label htmlFor="teacher-topic-weight-process" className="text-subheading font-medium text-foreground">实验过程权重</Label>
                                                <p className={`mt-1 text-meta tabular-nums ${!isPublishedTopic && pOut ? "text-destructive" : "text-muted-foreground"}`}>允许范围：20% – 60%</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    id="teacher-topic-weight-process"
                                                    data-testid="teacher-topic-weight-process"
                                                    type="number"
                                                    min={20}
                                                    max={60}
                                                    aria-invalid={!isPublishedTopic && pOut}
                                                    disabled={isPublishedTopic}
                                                    value={weightConfig.process}
                                                    onChange={(e) => setWeightConfig(prev => ({
                                                        ...prev,
                                                        process: parseWeightInput(e.target, prev.process),
                                                    }))}
                                                    className="h-14 bg-card text-center text-page-title font-medium tabular-nums"
                                                />
                                                <span className="text-section-title font-medium text-muted-foreground">%</span>
                                            </div>
                                        </div>
                                        <div className={`space-y-3 rounded-surface border bg-card p-5 ${!isPublishedTopic && rOut ? "border-destructive-border" : "border-border"}`}>
                                            <div>
                                                <Label htmlFor="teacher-topic-weight-report" className="text-subheading font-medium text-foreground">实验报告权重</Label>
                                                <p className={`mt-1 text-meta tabular-nums ${!isPublishedTopic && rOut ? "text-destructive" : "text-muted-foreground"}`}>允许范围：10% – 50%</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    id="teacher-topic-weight-report"
                                                    data-testid="teacher-topic-weight-report"
                                                    type="number"
                                                    min={10}
                                                    max={50}
                                                    aria-invalid={!isPublishedTopic && rOut}
                                                    disabled={isPublishedTopic}
                                                    value={weightConfig.report}
                                                    onChange={(e) => setWeightConfig(prev => ({
                                                        ...prev,
                                                        report: parseWeightInput(e.target, prev.report),
                                                    }))}
                                                    className="h-14 bg-card text-center text-page-title font-medium tabular-nums"
                                                />
                                                <span className="text-section-title font-medium text-muted-foreground">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface bg-muted px-4 py-3.5">
                                        <div>
                                            <span className="text-label text-muted-foreground">当前总权重</span>
                                            {!isPublishedTopic && !weightsValid && (
                                                <p className="mt-0.5 text-meta text-destructive">
                                                    {sum !== 100
                                                        ? `当前总和为 ${sum}%，须调整至 100%`
                                                        : "存在超出允许范围的分项权重，请按卡片范围提示调整"}
                                                </p>
                                            )}
                                        </div>
                                        <span className={`text-page-title font-medium tabular-nums ${weightsValid ? "text-success" : "text-destructive"}`}>
                                            {sum}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
                <DialogFooter className="shrink-0 flex-col border-t border-border pt-4">
                    {displayedError ? (
                        <div
                            ref={errorRef}
                            tabIndex={-1}
                            role="alert"
                            data-testid="teacher-topic-save-error"
                            className="mb-3 w-full rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            {displayedError}
                        </div>
                    ) : null}
                    <div className="flex w-full items-center justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="text-meta text-muted-foreground" role="status">步骤 {currentStep} / 7{pending ? " · 正在保存…" : dictionaryState.busy ? " · 正在处理变量字典…" : busy ? " · 正在上传…" : ""}</div>
                            {!busy && !loadingDetail && !isPublishedTopic && (() => {
                                const footerHint = currentStep === 2 && !excelInfo
                                    ? "待完成：请先上传并确认总体数据文件（.xlsx 或 .csv）"
                                    : currentStep === 3 && !canProceedMapping
                                        ? `待完成：${getStudyContractMissingItems(fieldMapping).join("；")}`
                                        : currentStep === 3 && dictionaryState.dirty
                                            ? "提示：变量字典有未保存修改，请先点击「明确确认并保存」后再继续"
                                            : currentStep === 4 && samplingPolicyError
                                                ? `待修正：${samplingPolicyError}`
                                                : null;
                                return footerHint ? (
                                    <p data-testid="teacher-topic-footer-hint" className="truncate text-meta text-warning" title={footerHint}>
                                        {footerHint}
                                    </p>
                                ) : null;
                            })()}
                        </div>
                        <div className="flex shrink-0 gap-2">
                            {currentStep > 1 && (
                                <Button data-testid="teacher-topic-prev" variant="outline" disabled={busy || loadingDetail || Boolean(detailError)} onClick={() => goToStep(currentStep - 1)}>上一步</Button>
                            )}
                            {currentStep === 1 && (
                                <Button data-testid="teacher-topic-next" disabled={busy || loadingDetail} onClick={() => void runAction(onSubmitTopic)}>{editingTopicId ? "保存并继续" : "下一步"}</Button>
                            )}
                            {!loadingDetail && currentStep === 2 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={() => setCurrentStep(3)}
                                    disabled={busy || (!isPublishedTopic && !excelInfo)}
                                >
                                    下一步
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 3 && (
                                <Button
                                    data-testid="teacher-topic-next"
                                    onClick={() => {
                                        if (mappingNeedsSave) void runAction(saveMappingForDictionary);
                                        else if (canLeaveDictionary()) void runAction(() => onSaveFieldMapping());
                                    }}
                                    disabled={busy || (!isPublishedTopic && !canProceedMapping)}
                                >
                                    {isPublishedTopic ? "下一步" : mappingNeedsSave ? "保存字段配置" : "保存并继续"}
                                </Button>
                            )}
                            {!loadingDetail && currentStep === 4 && (
                                <Button data-testid="teacher-topic-next" onClick={() => void runAction(onSaveSamplingPolicy)} disabled={busy || (!isPublishedTopic && Boolean(samplingPolicyError))}>{isPublishedTopic ? "下一步" : "保存并继续"}</Button>
                            )}
                            {!loadingDetail && currentStep === 5 && (
                                <Button data-testid="teacher-topic-next" onClick={() => setCurrentStep(6)} disabled={busy}>下一步</Button>
                            )}
                            {!loadingDetail && currentStep === 6 && (
                                <Button data-testid="teacher-topic-next" onClick={() => void runAction(onSaveRecommendQuestions)} disabled={busy}>保存并继续</Button>
                            )}
                            {!loadingDetail && currentStep === 7 && (
                                <Button data-testid="teacher-topic-finish" onClick={() => void runAction(onSaveWeights)} disabled={busy}>{isPublishedTopic ? "关闭" : "完成"}</Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
            {open && csvReviewFile && <CsvFileReviewDialog file={csvReviewFile} onCancel={() => setCsvReviewFile(null)} onConfirm={file => {
                setCsvReviewFile(null);
                onExcelUpload(file);
            }} />}
        </Dialog>
    );
}
