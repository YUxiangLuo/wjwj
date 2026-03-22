import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SamplePlanningStudyGuide() {
    return (
        <Card className="rounded-2xl border-sky-200 bg-sky-50/80 shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10">
            <CardHeader>
                <CardTitle className="text-base text-sky-900 dark:text-sky-200">学习指南</CardTitle>
                <CardDescription className="text-sky-700 dark:text-sky-300">理解公式与参数含义</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-sky-950/80 dark:text-sky-100/80">
                <div className="space-y-1 rounded-xl border border-sky-200 bg-white/80 p-4 font-mono text-xs text-sky-800 shadow-sm dark:border-sky-400/20 dark:bg-sky-950/40 dark:text-sky-200">
                    <p className="mb-2 text-sky-500 dark:text-sky-300/70">// 样本量计算公式</p>
                    <p>n₀ = (Z² × p × (1-p)) / E²</p>
                    <p>n₁ = n₀ / (1 + (n₀ - 1) / N)</p>
                    <p className="mt-1 text-sky-500 dark:text-sky-300/70">// 调整公式</p>
                    <p>n = n₁ × deff / (1 - NRR)</p>
                </div>
                <div className="space-y-2 text-xs leading-relaxed">
                    <p>
                        • <strong className="text-sky-900 dark:text-sky-200">置信水平 (Z)</strong>
                        ：结果的可信程度。95% 意味着如果重复调查 100 次，有 95 次的结果都在误差范围内。
                    </p>
                    <p>
                        • <strong className="text-sky-900 dark:text-sky-200">允许误差 (E)</strong>
                        ：结果与真实值的最大允许偏差。
                    </p>
                    <p>
                        • <strong className="text-sky-900 dark:text-sky-200">设计效应 (deff)</strong>
                        ：复杂抽样设计相对简单随机抽样的方差膨胀系数。整群抽样时 deff 通常 &gt; 1。
                    </p>
                    <p>
                        • <strong className="text-sky-900 dark:text-sky-200">无回答率 (NRR)</strong>
                        ：预期调查中不回应的比例，用于扩大样本量以弥补无效问卷。
                    </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="mb-2 text-xs font-medium text-slate-500">常用 Z 值参考</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600 dark:text-slate-400">
                        <div className="rounded bg-white p-1 dark:bg-slate-950">
                            90%
                            <br />
                            <span className="text-slate-500">1.645</span>
                        </div>
                        <div className="rounded bg-white p-1 font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-slate-950">
                            95%
                            <br />
                            <span className="text-emerald-600">1.96</span>
                        </div>
                        <div className="rounded bg-white p-1 dark:bg-slate-950">
                            99%
                            <br />
                            <span className="text-slate-500">2.576</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
