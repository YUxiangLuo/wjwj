/** Clarify that design-level benchmark comparisons use full-invited records, distinct from multi-wave fieldwork nonresponse simulation. */
export function SamplingObservationNotice({ nonResponseRate = 0 }: { nonResponseRate?: number }) {
    const pctLabel = Number((nonResponseRate * 100).toPrecision(12));
    return (
        <p className="rounded-surface bg-muted p-3 text-meta leading-relaxed text-muted-foreground" data-testid="sampling-observation-assumption">
            完整入样基准对照口径说明：基于抽样框的设计层面对照按全部入样记录观测计算（外勤拒访、中途弃答与质检清洗影响详见「多轮质检与校准演进」及有效回收分析工作区）。
            {nonResponseRate > 0
                ? `规划中的 ${pctLabel}% 无回答率只用于发放量与预期完成量的情景计算，完整入样基准对照不叠加无回答缺失。`
                : "无回答率属于规划情景参数；完整入样基准对照仅反映抽样设计本身，不叠加外勤无回答缺失。"}
            回答率无论高低都不能单独证明无回答偏差已经消除，也不能保证样本无偏或具有代表性。
            覆盖完整虚拟总体时，零设计标准误也只表示没有抽样误差。
        </p>
    );
}
