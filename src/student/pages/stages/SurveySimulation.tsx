import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Activity, CheckCircle, PieChart as PieChartIcon, BarChart as BarChartIcon, BrainCircuit } from "lucide-react";

interface SurveySimulationProps {
    onPrev: () => void;
    onSubmit: () => void;
}

const mockSummary = [
    { label: "总答卷数", value: "384", icon: Activity, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "完成率", value: "94%", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "满意度均值", value: "4.2/5", icon: PieChartIcon, color: "text-amber-600", bg: "bg-amber-500/10" },
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
    { label: "选项 D", value: 12, color: "#94a3b8" },
];

export function SurveySimulation({ onPrev, onSubmit }: SurveySimulationProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div>
                        <div className="text-sm text-indigo-500 font-semibold uppercase tracking-wider">调查结果模拟</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">模拟数据分析与统计</div>
                    </div>
                </div>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                    <Download className="w-4 h-4 mr-2" />
                    导出报告
                </Button>
            </div>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                <CardContent className="py-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">日期范围</Label>
                            <Input placeholder="2026-01-01 ~ 2026-01-22" className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">细分人群</Label>
                            <Select defaultValue="all">
                                <SelectTrigger className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                    <SelectItem value="all">全部样本</SelectItem>
                                    <SelectItem value="female">女性</SelectItem>
                                    <SelectItem value="male">男性</SelectItem>
                                    <SelectItem value="18-24">18-24 岁</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-700 dark:text-slate-300">标签</Label>
                            <Input placeholder="如：高频用户" className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mockSummary.map((item) => (
                    <Card key={item.label} className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm overflow-hidden relative">
                        <div className={`absolute top-0 right-0 p-4 opacity-10 ${item.color}`}>
                            <item.icon className="w-24 h-24 transform translate-x-4 -translate-y-4" />
                        </div>
                        <CardContent className="py-6 flex items-center gap-4 relative z-10">
                            <div className={`p-3 rounded-2xl ${item.bg}`}>
                                <item.icon className={`w-6 h-6 ${item.color}`} />
                            </div>
                            <div>
                                <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{item.label}</div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{item.value}</div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                            <BarChartIcon className="w-5 h-5 text-indigo-500" />
                            人口统计分布
                        </CardTitle>
                        <CardDescription className="text-slate-600 dark:text-slate-400">年龄段/群体占比对比</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <BarChart data={mockBarData} />
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                            <PieChartIcon className="w-5 h-5 text-teal-500" />
                            偏好分布
                        </CardTitle>
                        <CardDescription className="text-slate-600 dark:text-slate-400">选项偏好占比</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <PieChart data={mockPieData} />
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                        <BrainCircuit className="w-5 h-5" />
                        关键洞察
                    </CardTitle>
                    <CardDescription className="text-indigo-800/60 dark:text-indigo-200/60">从模拟结果中提取的结论</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                    {mockInsights.map((insight) => (
                        <div key={insight.id} className="rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-indigo-500/20 p-4 text-sm text-indigo-800 dark:text-indigo-200 flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div>
                            {insight.text}
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex justify-between pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button variant="outline" onClick={onPrev} className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100">
                    上一阶段
                </Button>
                <Button onClick={onSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    完成并预览提交
                </Button>
            </div>
        </div>
    );
}

export default SurveySimulation;

function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const chartHeight = 160;
    return (
        <div className="h-64 rounded-xl bg-white/30 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 px-8 py-6 relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between px-8 py-6 pointer-events-none">
                <div className="w-full h-px bg-slate-200/50 dark:bg-slate-800/50"></div>
                <div className="w-full h-px bg-slate-200/50 dark:bg-slate-800/50"></div>
                <div className="w-full h-px bg-slate-200/50 dark:bg-slate-800/50"></div>
                <div className="w-full h-px bg-slate-200/50 dark:bg-slate-800/50"></div>
                <div className="w-full h-px bg-slate-200/50 dark:bg-slate-800/50"></div>
            </div>

            <div className="flex h-full items-end justify-between gap-6 relative z-10">
                {data.map((item) => (
                    <div key={item.label} className="flex flex-1 flex-col items-center gap-3">
                        <div className="w-full relative group">
                            <div
                                className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-teal-400 opacity-80 group-hover:opacity-100 transition-opacity"
                                style={{ height: `${Math.round((item.value / max) * chartHeight)}px` }}
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.value}%
                            </div>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">{item.label}</div>
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
        <div className="flex flex-col items-center gap-6 rounded-xl bg-white/30 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 px-6 py-6">
            <div className="relative">
                <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
                    {segments.map((segment) => (
                        <path
                            key={segment.label}
                            d={describeArc(segment.startAngle, segment.endAngle)}
                            fill={segment.color}
                            className="hover:opacity-80 transition-opacity cursor-pointer stroke-slate-50 dark:stroke-slate-900 stroke-2"
                        />
                    ))}
                    {/* Inner circle for donut chart effect */}
                    <circle cx="80" cy="80" r="40" className="fill-white dark:fill-slate-950" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-slate-500 font-medium">分布</span>
                </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
                {data.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full ring-2 ring-slate-50 dark:ring-slate-900" style={{ backgroundColor: item.color }} />
                        <span>{item.label}</span>
                        <span className="ml-auto font-mono text-slate-700 dark:text-slate-300">{item.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}


