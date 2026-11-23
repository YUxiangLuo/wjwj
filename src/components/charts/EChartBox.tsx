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

export function exportEChartSvg(instance: ECharts | null | undefined): string | null {
    if (!instance || instance.isDisposed()) {
        return null;
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
            lastAppliedOptionRef.current = option;
            syncChartDomAccessibility(container);
        }
        if (chartRef) {
            chartRef.current = instance;
        }
    }, [option, chartRef]);

    useEffect(() => {
        const instance = instanceRef.current;
        const container = containerRef.current;
        if (!instance || instance.isDisposed() || !container) return;

        const nextWidth = resolveContainerWidth(container, safeFallbackWidth);
        if (instance.getWidth() !== nextWidth || instance.getHeight() !== safeHeight) {
            instance.resize({ width: nextWidth, height: safeHeight });
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
