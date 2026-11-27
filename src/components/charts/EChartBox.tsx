import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { echarts, type ECharts, type EChartsCoreOption } from "./echarts-core";
import { withExecutiveDefaults } from "./echarts-theme";

export interface EChartBoxProps {
    option: EChartsCoreOption;
    height?: number;
    fallbackWidth?: number;
    ariaLabel: string;
    className?: string;
    testId?: string;
    chartRef?: MutableRefObject<ECharts | null>;
    onChartClick?: (params: unknown) => void;
    srSummary?: ReactNode;
}

function sanitizePositiveDimension(value: number | undefined, defaultValue: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.round(value)
        : defaultValue;
}

function resolveContainerWidth(container: HTMLElement, fallbackWidth: number): number {
    const clientWidth = container.clientWidth;
    if (typeof clientWidth === "number" && Number.isFinite(clientWidth) && clientWidth > 0) {
        return Math.round(clientWidth);
    }
    const rectWidth = container.getBoundingClientRect?.().width ?? 0;
    if (typeof rectWidth === "number" && Number.isFinite(rectWidth) && rectWidth > 0) {
        return Math.round(rectWidth);
    }
    return fallbackWidth;
}

function syncChartDomAccessibility(container: HTMLElement) {
    for (const svg of container.querySelectorAll("svg")) {
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
    }
}

interface ChartExportMeta {
    option: EChartsCoreOption;
    width: number;
    height: number;
}

const chartExportMetaMap = new WeakMap<ECharts, ChartExportMeta>();

function disableMarkAnimation(mark: unknown): unknown {
    if (!mark || typeof mark !== "object" || Array.isArray(mark)) return mark;
    return { ...(mark as Record<string, unknown>), animation: false };
}

function disableSeriesAnimation(seriesItem: unknown): unknown {
    if (!seriesItem || typeof seriesItem !== "object") return seriesItem;
    const rec = seriesItem as Record<string, unknown>;
    return {
        ...rec,
        animation: false,
        ...(rec.markLine !== undefined ? { markLine: disableMarkAnimation(rec.markLine) } : {}),
        ...(rec.markPoint !== undefined ? { markPoint: disableMarkAnimation(rec.markPoint) } : {}),
        ...(rec.markArea !== undefined ? { markArea: disableMarkAnimation(rec.markArea) } : {}),
    };
}

function buildStaticExportOption(option: EChartsCoreOption): EChartsCoreOption {
    const base = withExecutiveDefaults(option);
    const rawSeries = base.series;
    const staticSeries = Array.isArray(rawSeries)
        ? rawSeries.map(disableSeriesAnimation)
        : rawSeries && typeof rawSeries === "object"
            ? disableSeriesAnimation(rawSeries)
            : rawSeries;

    return {
        ...base,
        ...(staticSeries !== undefined ? { series: staticSeries } : {}),
        animation: false,
        animationDuration: 0,
        animationDurationUpdate: 0,
    };
}

export function exportEChartSvg(instance: ECharts | null | undefined): string | null {
    if (!instance || instance.isDisposed()) {
        return null;
    }
    const meta = chartExportMetaMap.get(instance);
    if (meta && typeof document !== "undefined") {
        const width = sanitizePositiveDimension(instance.getWidth(), meta.width);
        const height = sanitizePositiveDimension(instance.getHeight(), meta.height);
        const scratchContainer = document.createElement("div");
        let scratchInstance: ECharts | null = null;
        try {
            scratchInstance = echarts.init(scratchContainer, undefined, {
                renderer: "svg",
                width,
                height,
            });
            scratchInstance.setOption(buildStaticExportOption(meta.option), {
                notMerge: true,
                lazyUpdate: false,
            });
            const svg = scratchInstance.renderToSVGString();
            if (typeof svg === "string" && svg.trim().length > 0) {
                return svg;
            }
        } catch {
            // Fall back to direct instance SVG rendering when offscreen init is unavailable.
        } finally {
            if (scratchInstance && !scratchInstance.isDisposed()) {
                scratchInstance.dispose();
            }
        }
    }
    try {
        const svg = instance.renderToSVGString();
        return typeof svg === "string" && svg.trim().length > 0 ? svg : null;
    } catch {
        return null;
    }
}

export function EChartBox({
    option,
    height = 280,
    fallbackWidth = 640,
    ariaLabel,
    className,
    testId,
    chartRef,
    onChartClick,
    srSummary,
}: EChartBoxProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<ECharts | null>(null);
    const lastAppliedOptionRef = useRef<EChartsCoreOption | null>(null);
    const optionRef = useRef(option);
    const chartRefPropRef = useRef(chartRef);
    const onChartClickRef = useRef(onChartClick);
    const safeHeight = sanitizePositiveDimension(height, 280);
    const safeFallbackWidth = sanitizePositiveDimension(fallbackWidth, 640);
    const heightRef = useRef(safeHeight);
    const fallbackWidthRef = useRef(safeFallbackWidth);

    optionRef.current = option;
    chartRefPropRef.current = chartRef;
    onChartClickRef.current = onChartClick;
    heightRef.current = safeHeight;
    fallbackWidthRef.current = safeFallbackWidth;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const initialWidth = resolveContainerWidth(container, fallbackWidthRef.current);
        const instance = echarts.init(container, undefined, {
            renderer: "svg",
            width: initialWidth,
            height: heightRef.current,
        });
        instanceRef.current = instance;
        if (chartRefPropRef.current) {
            chartRefPropRef.current.current = instance;
        }
        instance.setOption(withExecutiveDefaults(optionRef.current), {
            notMerge: true,
            lazyUpdate: false,
        });
        chartExportMetaMap.set(instance, {
            option: optionRef.current,
            width: initialWidth,
            height: heightRef.current,
        });
        lastAppliedOptionRef.current = optionRef.current;
        syncChartDomAccessibility(container);

        const handleClick = (params: unknown) => {
            onChartClickRef.current?.(params);
        };
        instance.on("click", handleClick);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver((entries) => {
                if (instance.isDisposed()) return;
                const observedWidth = entries[0]?.contentRect?.width ?? 0;
                const nextWidth =
                    Number.isFinite(observedWidth) && observedWidth > 0
                        ? Math.round(observedWidth)
                        : resolveContainerWidth(container, fallbackWidthRef.current);
                if (
                    nextWidth > 0
                    && (nextWidth !== instance.getWidth() || heightRef.current !== instance.getHeight())
                ) {
                    instance.resize({ width: nextWidth, height: heightRef.current });
                    chartExportMetaMap.set(instance, {
                        option: optionRef.current,
                        width: nextWidth,
                        height: heightRef.current,
                    });
                    syncChartDomAccessibility(container);
                }
            });
            observer.observe(container);
        }

        return () => {
            observer?.disconnect();
            instance.off("click", handleClick);
            if (!instance.isDisposed()) {
                instance.dispose();
            }
            instanceRef.current = null;
            lastAppliedOptionRef.current = null;
            if (chartRefPropRef.current) {
                chartRefPropRef.current.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const instance = instanceRef.current;
        const container = containerRef.current;
        if (!instance || instance.isDisposed() || !container) return;

        if (lastAppliedOptionRef.current !== option) {
            instance.setOption(withExecutiveDefaults(option), {
                notMerge: true,
                lazyUpdate: false,
            });
            chartExportMetaMap.set(instance, {
                option,
                width: sanitizePositiveDimension(instance.getWidth(), safeFallbackWidth),
                height: sanitizePositiveDimension(instance.getHeight(), safeHeight),
            });
            lastAppliedOptionRef.current = option;
            syncChartDomAccessibility(container);
        }
        if (chartRef) {
            chartRef.current = instance;
        }
    }, [option, chartRef, safeFallbackWidth, safeHeight]);

    useEffect(() => {
        const instance = instanceRef.current;
        const container = containerRef.current;
        if (!instance || instance.isDisposed() || !container) return;

        const nextWidth = resolveContainerWidth(container, safeFallbackWidth);
        if (instance.getWidth() !== nextWidth || instance.getHeight() !== safeHeight) {
            instance.resize({ width: nextWidth, height: safeHeight });
            chartExportMetaMap.set(instance, {
                option: optionRef.current,
                width: nextWidth,
                height: safeHeight,
            });
            syncChartDomAccessibility(container);
        }
    }, [safeHeight, safeFallbackWidth]);

    return (
        <div className={cn("relative w-full min-w-0", className)} data-testid={testId}>
            <div
                ref={containerRef}
                role="img"
                aria-label={ariaLabel}
                style={{ width: "100%", height: `${safeHeight}px` }}
                className="w-full overflow-hidden"
            />
            {srSummary ? <div className="sr-only">{srSummary}</div> : null}
        </div>
    );
}
