import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SamplingResultsData } from "@/student/api-client";
import { SamplePreviewTable } from "@/student/components/SamplePreviewTable";
import { getSamplingResultCount } from "@/student/experiment/sampling-results";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
} from "@/student/experiment/systematic-sampling";

type SamplingMethod = keyof SamplingResultsData;

interface SamplingMethodValue {
    completed?: boolean;
    unavailable?: boolean;
    unavailableReason?: string;
    sampleCount?: number;
    seed?: number;
    interval?: number;
    kValue?: number;
    startIndex?: number;
    sizeField?: string;
    randomStart?: number;
    stratifyBy?: string;
    layers?: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
    data?: unknown[];
}

const METHOD_LABELS: Record<SamplingMethod, string> = {
    simple: "简单随机",
    systematic: "系统抽样",
    pps: "PPS 抽样",
    stratified: "分层抽样",
};

function getMethodDetails(method: SamplingMethod, result: SamplingMethodValue) {
    const details: Array<{ label: string; value: string }> = [];
    if (result.seed !== undefined) details.push({ label: "随机种子", value: String(result.seed) });
    if (method === "systematic") {
        const interval = getStoredSystematicInterval(result);
        if (interval !== null) {
            details.push({ label: "抽样间隔 K", value: formatSystematicInterval(interval) });
        }
        if (result.randomStart !== undefined) {
            details.push({ label: "随机起点 r", value: formatSystematicInterval(result.randomStart) });
        }
        if (result.startIndex !== undefined) details.push({ label: "起始位置", value: String(result.startIndex) });
    }
    if (method === "pps") {
        if (result.sizeField) details.push({ label: "规模字段", value: result.sizeField });
        if (result.randomStart !== undefined) details.push({ label: "随机起点", value: String(result.randomStart) });
    }
    if (method === "stratified") {
        if (result.stratifyBy) details.push({ label: "分层字段", value: result.stratifyBy });
        if (result.layers) details.push({ label: "层数", value: String(result.layers.length) });
    }
    return details;
}

export function SamplingResultsSnapshot({
    value,
    emptyText = "暂无抽样结果",
}: {
    value: SamplingResultsData | null | undefined;
    emptyText?: string;
}) {
    const methods = (Object.keys(METHOD_LABELS) as SamplingMethod[])
        .map((method) => ({ method, result: value?.[method] as SamplingMethodValue | undefined }))
        .filter((entry): entry is { method: SamplingMethod; result: SamplingMethodValue } => Boolean(entry.result));

    if (methods.length === 0) {
        return <p className="text-sm text-muted-foreground">{emptyText}</p>;
    }

    return (
        <Tabs defaultValue={methods[0]!.method} data-testid="sampling-results-snapshot">
            <TabsList className="grid h-auto w-full grid-cols-4">
                {methods.map(({ method, result }) => (
                    <TabsTrigger key={method} value={method} className="flex-wrap py-2">
                        <span>{METHOD_LABELS[method]}</span>
                        <span className="text-xs text-muted-foreground">{getSamplingResultCount(method, result)} 条</span>
                    </TabsTrigger>
                ))}
            </TabsList>

            {methods.map(({ method, result }) => {
                const details = getMethodDetails(method, result);
                const rows = Array.isArray(result.data) ? result.data : [];
                const count = getSamplingResultCount(method, result);
                return (
                    <TabsContent key={method} value={method} className="mt-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-4">
                            <StatusBadge intent={result.unavailable ? "warning" : result.completed ? "success" : "neutral"}>
                                {result.unavailable ? "不可用" : result.completed ? "已完成" : "未完成"}
                            </StatusBadge>
                            <div className="grid flex-1 gap-3 grid-cols-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">样本数</p>
                                    <p className="mt-1 text-sm font-medium">{count}</p>
                                </div>
                                {details.map((detail) => (
                                    <div key={detail.label}>
                                        <p className="text-xs text-muted-foreground">{detail.label}</p>
                                        <p className="mt-1 break-words text-sm font-medium">{detail.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {result.unavailable ? (
                            <p className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
                                {result.unavailableReason || "该总体数据无法执行 PPS 抽样。"}
                            </p>
                        ) : (
                            <div className="h-[32rem] min-h-0">
                                <SamplePreviewTable data={rows} total={count} />
                            </div>
                        )}

                        {method === "stratified" && result.layers?.length ? (
                            <div className="rounded-xl border border-border p-4">
                                <h3 className="text-sm font-medium">分层分配</h3>
                                <div className="mt-3 grid gap-2 grid-cols-3">
                                    {result.layers.map((layer) => (
                                        <div key={layer.name} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                                            <span className="font-medium">{layer.name}</span>
                                            <span className="ml-2 text-muted-foreground">{layer.sampleCount} / {layer.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </TabsContent>
                );
            })}
        </Tabs>
    );
}
