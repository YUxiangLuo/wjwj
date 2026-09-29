import { performSystematicSampling, preparePPSSampling, drawPreparedPPSSample } from "@/domain/statistics/sampling";
import type { MethodKey } from "@/domain/experiment/types";

// Small, fixed teaching frames; never presented as the student's saved data.
const systematic = performSystematicSampling(Array.from({ length: 10 }, (_, i) => i + 1), 3, () => .36);
const ppsFrame = [{ name: "A", size: 8 }, { name: "B", size: 3 }, { name: "C", size: 2 }, { name: "D", size: 1 }];
const pps = preparePPSSampling(ppsFrame, "size", 2)!;
const ppsDraw = drawPreparedPPSSample(pps, () => .6);

export function SamplingMethodExplanation({ method }: { method: MethodKey }) {
    if (method === "simple") return <p className="mt-2">等概率、不放回：例如 10 个单位抽 3 个，每个单位的纳入概率都是 3/10。已选单位不会再次入样。点亮顺序只用于展示，不代表服务器的执行时间顺序。</p>;
    if (method === "stratified") return <p className="mt-2">每层分别做不放回随机抽样。层内每个单位的纳入概率为 nₕ/Nₕ，各层抽样比可以不同；估计总体均值时按 Nₕ/N 加权，不能直接平均各层均值。点阵中的层按顺序排列，不代表原始数据的排列顺序；层名和配额以列表为准。</p>;
    if (method === "systematic") return <div className="mt-3 space-y-3" data-testid="systematic-mechanism-example">
        <p className="font-medium text-foreground">独立示例：10 个单位抽 3 个，K=10/3，随机起点 r=1.2（零基位置）</p>
        <div className="flex gap-2" role="img" aria-label="顺序轴：第2、5、8个单位入样">
            {Array.from({ length: 10 }, (_, i) => <span key={i} className={`flex-1 rounded-control border p-2 text-center ${systematic.indices.includes(i) ? "border-primary bg-primary-muted text-primary" : "border-border bg-card"}`}>{i + 1}</span>)}
        </div>
        <p>选取位置依次为 1.2、4.533…、7.866…；向下取整得到零基索引 1、4、7，即第 2、5、8 个单位。间隔作用于连续位置，不是把 K 四舍五入后每隔固定整数行抽取。</p>
        <p>顺序会影响结果。若总体排序有与间隔同步的周期，系统抽样可能只覆盖某一类单位；等距选取不保证样本“有代表性”。</p>
    </div>;
    return <div className="mt-3 space-y-3" data-testid="pps-mechanism-example">
        <p className="font-medium text-foreground">独立示例：规模 A=8、B=3、C=2、D=1，抽 2 个；示例起点 u=0.6</p>
        <p>A 的初始配额为 2×8/14&gt;1，因此必入。剩余 1 个名额在 B、C、D 之间分配，纳入概率分别为 1/2、1/3、1/6，总和为 1。</p>
        <div className="flex" role="img" aria-label="剩余累计概率轴：B占0至0.5，C占0.5至5/6，D占5/6至1；0.6落在C">
            {pps.designFrame.systematicIndices.map((index, position) => <span key={index} data-unit={ppsFrame[index]!.name} style={{ width: `${pps.designFrame.systematicProbabilities[position]! * 100}%` }} className={`rounded-control border p-2 text-center ${ppsDraw.indices.includes(index) ? "border-primary bg-primary-muted text-primary" : "border-border bg-card"}`}>
                {ppsFrame[index]!.name}<span className="block">{["[0, 1/2)", "[1/2, 5/6)", "[5/6, 1)"][position]}</span>{ppsDraw.indices.includes(index) && <span className="block">↑ u=0.6</span>}
            </span>)}
        </div>
        <p>u=0.6 落在 C 的区间 [0.5, 5/6)，所以结果为 {ppsDraw.data.map(row => row.name).join("、")}。剩余名额多于 1 时，用 u、u+1、u+2…穿过累计纳入概率轴；区间左闭右开，不使用“重复命中后顺延”。</p>
        <p>设计权重为 1/π：A 为 1，C 为 3。规模大意味着纳入概率较高，不意味着目标指标的数值一定更大。这里的数字仅用于解释机制；本次抽样的参数与数据见结果凭证。</p>
    </div>;
}
