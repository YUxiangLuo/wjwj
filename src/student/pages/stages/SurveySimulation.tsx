import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

interface SurveySimulationProps {
    onPrev: () => void;
    onSubmit: () => void;
}

const mockSummary = [
    { label: "总答卷数", value: "384" },
    { label: "完成率", value: "94%" },
    { label: "满意度均值", value: "4.2/5" },
];

const mockInsights = [
    { id: 1, text: "18-24 岁群体参与度最高" },
    { id: 2, text: "使用频率与满意度呈正相关" },
    { id: 3, text: "偏好 A 选项的用户占比最高" },
];

const mockBarData = [
    { label: "18-24", value: 32 },
    { label: "25-34", value: 28 },
    { label: "35-44", value: 20 },
    { label: "45+", value: 20 },
];

const mockPieData = [
    { label: "选项 A", value: 45, color: "#11d4d4" },
    { label: "选项 B", value: 25, color: "#6366f1" },
    { label: "选项 C", value: 18, color: "#f59e0b" },
    { label: "选项 D", value: 12, color: "#e5e7eb" },
];

export function SurveySimulation({ onPrev, onSubmit }: SurveySimulationProps) {
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div>
                        <div className="text-sm text-muted-foreground">调查结果模拟</div>
                        <div className="text-xl font-semibold text-foreground">模拟数据分析与统计</div>
                    </div>
                </div>
                <Button>
                    <Download className="w-4 h-4 mr-2" />
                    导出报告
                </Button>
            </div>

            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <CardContent className="py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>日期范围</Label>
                            <Input placeholder="2026-01-01 ~ 2026-01-22" />
                        </div>
                        <div className="space-y-2">
                            <Label>细分人群</Label>
                            <Select defaultValue="all">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部样本</SelectItem>
                                    <SelectItem value="female">女性</SelectItem>
                                    <SelectItem value="male">男性</SelectItem>
                                    <SelectItem value="18-24">18-24 岁</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>标签</Label>
                            <Input placeholder="如：高频用户" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mockSummary.map((item) => (
                    <Card key={item.label} className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardContent className="py-6">
                            <div className="text-sm text-muted-foreground">{item.label}</div>
                            <div className="text-2xl font-semibold text-foreground mt-2">{item.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle>人口统计分布</CardTitle>
                        <CardDescription>年龄段/群体占比对比</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BarChart data={mockBarData} />
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle>偏好分布</CardTitle>
                        <CardDescription>选项偏好占比</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <PieChart data={mockPieData} />
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <CardHeader>
                    <CardTitle>关键洞察</CardTitle>
                    <CardDescription>从模拟结果中提取的结论</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {mockInsights.map((insight) => (
                        <div key={insight.id} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                            {insight.text}
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={onSubmit}>
                    完成并预览提交
                </Button>
            </div>
        </div>
    );
}

export default SurveySimulation;

function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const chartHeight = 120;
    return (
        <div className="h-64 rounded-2xl bg-slate-50 px-6 py-4">
            <div className="flex h-full items-end justify-between gap-4">
                {data.map((item) => (
                    <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                        <div
                            className="w-full rounded-2xl bg-gradient-to-t from-teal-400 to-indigo-400"
                            style={{ height: `${Math.round((item.value / max) * chartHeight)}px` }}
                        />
                        <div className="text-xs text-muted-foreground">{item.label}</div>
                        <div className="text-xs font-medium text-slate-700">{item.value}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PieChart({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
    const total = data.reduce((acc, item) => acc + item.value, 0) || 1;
    let cumulative = 0;

    const segments = data.map((item) => {
        const startAngle = (cumulative / total) * 360;
        cumulative += item.value;
        const endAngle = (cumulative / total) * 360;
        return { ...item, startAngle, endAngle };
    });

    const radius = 70;
    const center = 80;

    const describeArc = (startAngle: number, endAngle: number) => {
        const polarToCartesian = (angle: number) => {
            const rad = ((angle - 90) * Math.PI) / 180.0;
            return {
                x: center + radius * Math.cos(rad),
                y: center + radius * Math.sin(rad),
            };
        };

        const start = polarToCartesian(endAngle);
        const end = polarToCartesian(startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M",
            center,
            center,
            "L",
            start.x,
            start.y,
            "A",
            radius,
            radius,
            0,
            largeArcFlag,
            0,
            end.x,
            end.y,
            "Z",
        ].join(" ");
    };

    return (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-50 px-6 py-4">
            <svg width="160" height="160" viewBox="0 0 160 160">
                {segments.map((segment) => (
                    <path
                        key={segment.label}
                        d={describeArc(segment.startAngle, segment.endAngle)}
                        fill={segment.color}
                    />
                ))}
            </svg>
            <div className="grid w-full grid-cols-2 gap-2 text-xs text-muted-foreground">
                {data.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.label}</span>
                        <span className="ml-auto text-slate-600">{item.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
