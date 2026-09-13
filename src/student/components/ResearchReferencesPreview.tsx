import { useEffect, useState } from "react";
import { ResearchAppendix } from "@/components/ResearchResult";
import type { ResearchRun } from "@/domain/experiment/research-analysis";
import { parseResearchReferences } from "@/domain/experiment/research-analysis";
import { researchApi } from "../research-api";
export interface ResearchReferenceValidation { taskId: number; version: number; valid: boolean; runs: ResearchRun[] }
export function ResearchReferencesPreview({ taskId, version, references, onValid }: { taskId: number; version: number; references: unknown; onValid: (state: ResearchReferenceValidation) => void }) {
    const [runs, setRuns] = useState<ResearchRun[]>([]), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController(); let live = true; onValid({ taskId, version, valid: false, runs: [] }); setLoading(true); setError(null);
        const refs = parseResearchReferences(references);
        if (typeof refs === "string") { setError(refs); setLoading(false); return () => { live = false; controller.abort(); }; }
        void researchApi.list(taskId, controller.signal).then(result => {
            if (!live) return;
            if (!result.success || !result.data) throw new Error(result.error?.message ?? "无法核对报告引用");
            const selected = refs.map(id => result.data!.runs.find(item => item.run.id === id));
            if (selected.some(item => !item?.current)) throw new Error("报告引用含过期或无法核对的结果，请返回分析阶段替换或移除后保存");
            setRuns(selected.map(item => item!.run)); onValid({ taskId, version, valid: true, runs: selected.map(item => item!.run) });
        }).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : "无法核对报告引用"); }).finally(() => { if (live) setLoading(false); });
        return () => { live = false; controller.abort(); };
    }, [taskId, version, references, onValid]);
    return <>{loading && <p role="status" className="text-label text-muted-foreground">正在核对报告引用…</p>}{error ? <p role="alert" className="text-label text-destructive">{error}</p> : <ResearchAppendix runs={runs} />}</>;
}
