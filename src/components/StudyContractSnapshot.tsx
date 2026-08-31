import type { ResolvedStudyContract } from "@/lib/analysis-target";

export function StudyContractSnapshot({ value }: { value: ResolvedStudyContract | null | undefined }) {
    if (!value) return null;
    const { contract } = value;
    const target = contract.target.kind === "mean"
        ? `${contract.target.field}的均值`
        : `${contract.target.field}中“${contract.target.value}”的比例`;

    return (
        <section className="rounded-xl border border-info/20 bg-info/10 p-4" data-testid="study-contract-snapshot">
            <h2 className="text-sm font-semibold text-info">研究合同{value.inferred ? "（兼容生成）" : ""}</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2"><dt className="text-muted-foreground">研究问题</dt><dd className="mt-0.5 text-foreground">{contract.researchQuestion}</dd></div>
                <div><dt className="text-muted-foreground">目标总体</dt><dd className="mt-0.5 text-foreground">{contract.targetPopulation}</dd></div>
                <div><dt className="text-muted-foreground">分析单位</dt><dd className="mt-0.5 text-foreground">{contract.unitOfAnalysis}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">目标估计量</dt><dd className="mt-0.5 text-foreground">{target}</dd></div>
            </dl>
        </section>
    );
}
