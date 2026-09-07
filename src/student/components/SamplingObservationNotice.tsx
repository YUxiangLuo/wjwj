/** Keep the planning response scenario distinct from the fully observed simulation. */
export function SamplingObservationNotice({ nonResponseRate = 0 }: { nonResponseRate?: number }) {
    return (
        <p className="rounded-surface border border-info-border bg-info-muted p-3 text-meta leading-relaxed text-info" data-testid="sampling-observation-assumption">
            抽样执行采用完全观测假设：所有入样记录都直接进入分析。
            {nonResponseRate > 0
                ? `规划中的 ${Math.round(nonResponseRate * 100)}% 无回答率只用于发放量与预期完成量的情景计算，本阶段不模拟无回答；分析精度对应全部入样记录已观测的情景。`
                : "无回答率属于规划情景参数；执行和分析不模拟拒访、漏答或差异回答。"}
            覆盖完整虚拟总体时，零设计标准误也只表示没有抽样误差。
        </p>
    );
}
