import type { CostPrecisionPoint } from "../experiment/cost-precision-curve";

export function CostPrecisionChart({ points, referencePoints, targetMarginOfError, budget }: {
    points: CostPrecisionPoint[]; referencePoints: CostPrecisionPoint[]; targetMarginOfError: number; budget: number;
}) {
    if (!points.length) return null;
    const minCost = Math.min(...points.map(point => point.totalCost));
    const maxCost = Math.max(...points.map(point => point.totalCost));
    const maxError = Math.max(targetMarginOfError, ...points.map(point => point.marginOfError), 1);
    const x = (cost: number) => maxCost > minCost ? 8 + (cost - minCost) / (maxCost - minCost) * 384 : 200;
    const y = (error: number) => 172 - error / maxError * 164;
    return <div className="space-y-2 text-meta">
        <p className="text-muted-foreground">纵轴：预期误差限（百分点），0～{maxError.toFixed(1)}</p>
        <svg role="img" aria-label="精度与成本曲线，横轴为总成本，纵轴为预期误差限" viewBox="0 0 400 180" preserveAspectRatio="none" className="h-48 w-full border-b border-l border-input">
            <line x1="8" x2="392" y1={y(targetMarginOfError)} y2={y(targetMarginOfError)} stroke="var(--color-warning)" strokeDasharray="5 4" />
            {budget >= minCost && budget <= maxCost && <line x1={x(budget)} x2={x(budget)} y1="8" y2="172" stroke="var(--color-auxiliary)" strokeDasharray="3 3" />}
            <polyline points={points.map(point => `${x(point.totalCost)},${y(point.marginOfError)}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
            {referencePoints.map(point => <circle key={point.sampleSize} cx={x(point.totalCost)} cy={y(point.marginOfError)} r="3" fill="var(--color-primary)"><title>{`发放 ${point.sampleSize} 份；总成本 ¥${point.totalCost}；预期误差限 ±${point.marginOfError.toFixed(2)} 个百分点`}</title></circle>)}
        </svg>
        <p className="flex justify-between text-muted-foreground"><span>¥{minCost.toLocaleString()}</span><span>总成本（元）→</span><span>¥{maxCost.toLocaleString()}</span></p>
        <p className="text-warning">水平虚线：目标 ±{targetMarginOfError} 个百分点</p>
        <p className="text-auxiliary-strong">预算：¥{budget.toLocaleString()}{budget >= minCost && budget <= maxCost ? "（竖直虚线）" : "（在横轴范围之外）"}</p>
        <details><summary className="cursor-pointer text-primary">查看参考样本量、成本与精度数值</summary>
            <table className="mt-2 w-full text-right"><thead><tr><th>发放量</th><th>总成本（元）</th><th>误差限（百分点）</th></tr></thead><tbody>{referencePoints.map(point => <tr key={point.sampleSize}><td>{point.sampleSize}</td><td>{point.totalCost.toLocaleString()}</td><td>±{point.marginOfError.toFixed(2)}</td></tr>)}</tbody></table>
        </details>
        <p className="text-muted-foreground">曲线按 p=0.5、当前设计效应和预期回答率计算，包含有限总体校正。临近总体上限时，精度与成本的关系可能不同于小抽样比近似。</p>
    </div>;
}
