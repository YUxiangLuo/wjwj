import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SamplePlanningStudyGuide() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">学习指南</CardTitle>
                <CardDescription>理解公式与参数含义</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs text-foreground">
                    <p className="mb-2 text-muted-foreground">// 样本量计算公式</p>
                    <p>n₀ = (Z² × p × (1-p)) / E²</p>
                    <p>n₁ = n₀ / (1 + (n₀ - 1) / N)</p>
                    <p className="mt-1 text-muted-foreground">// 调整公式</p>
                    <p>n = n₁ × deff / (1 - NRR)</p>
                </div>
                <div className="flex flex-col gap-2 text-xs leading-relaxed">
                    <p>
                        • <strong className="text-foreground">置信水平 (Z)</strong>
                        ：结果的可信程度。95% 意味着如果重复调查 100 次，有 95 次的结果都在误差范围内。
                    </p>
                    <p>
                        • <strong className="text-foreground">允许误差 (E)</strong>
                        ：结果与真实值的最大允许偏差。
                    </p>
                    <p>
                        • <strong className="text-foreground">设计效应 (deff)</strong>
                        ：复杂抽样设计相对简单随机抽样的方差膨胀系数。整群抽样时 deff 通常 &gt; 1。
                    </p>
                    <p>
                        • <strong className="text-foreground">无回答率 (NRR)</strong>
                        ：预期调查中不回应的比例，用于扩大样本量以弥补无效问卷。
                    </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">常用 Z 值参考</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                        <div className="rounded bg-background p-1">
                            90%
                            <br />
                            <span>1.645</span>
                        </div>
                        <div className="rounded bg-primary/10 p-1 font-medium text-primary ring-1 ring-primary/20">
                            95%
                            <br />
                            <span>1.96</span>
                        </div>
                        <div className="rounded bg-background p-1">
                            99%
                            <br />
                            <span>2.576</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
