import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SamplePlanningStudyGuide() {
    return (
        <Card className="rounded-2xl border-info/20 bg-info/10 shadow-sm dark:border-info/20 dark:bg-info/10">
            <CardHeader>
                <CardTitle className="text-base text-info">学习指南</CardTitle>
                <CardDescription className="text-info">理解公式与参数含义</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-info">
                <div className="space-y-1 rounded-xl border border-info/20 bg-background/80 p-4 font-mono text-xs text-info shadow-sm dark:border-info/20 dark:bg-info/10 dark:text-info">
                    <p className="mb-2 text-info">// 样本量计算公式</p>
                    <p>n₀ = (Z² × p × (1-p)) / E²</p>
                    <p>n₁ = n₀ / (1 + (n₀ - 1) / N)</p>
                    <p className="mt-1 text-info">// 调整公式</p>
                    <p>n = n₁ × deff / (1 - NRR)</p>
                </div>
                <div className="space-y-2 text-xs leading-relaxed">
                    <p>
                        • <strong className="text-info">置信水平 (Z)</strong>
                        ：结果的可信程度。95% 意味着如果重复调查 100 次，有 95 次的结果都在误差范围内。
                    </p>
                    <p>
                        • <strong className="text-info">允许误差 (E)</strong>
                        ：结果与真实值的最大允许偏差。
                    </p>
                    <p>
                        • <strong className="text-info">设计效应 (deff)</strong>
                        ：复杂抽样设计相对简单随机抽样的方差膨胀系数。整群抽样时 deff 通常 &gt; 1。
                    </p>
                    <p>
                        • <strong className="text-info">无回答率 (NRR)</strong>
                        ：预期调查中不回应的比例，用于扩大样本量以弥补无效问卷。
                    </p>
                </div>
                <div className="rounded-xl border border-border bg-card/50 p-3 dark:border-border dark:bg-card/50">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">常用 Z 值参考</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                        <div className="rounded bg-background p-1 dark:bg-background">
                            90%
                            <br />
                            <span className="text-muted-foreground">1.645</span>
                        </div>
                        <div className="rounded bg-background p-1 font-medium text-success ring-1 ring-success/20 dark:bg-background">
                            95%
                            <br />
                            <span className="text-success">1.96</span>
                        </div>
                        <div className="rounded bg-background p-1 dark:bg-background">
                            99%
                            <br />
                            <span className="text-muted-foreground">2.576</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
