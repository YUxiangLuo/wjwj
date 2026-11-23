import type {
    EChartsCoreOption,
    GridComponentOption,
    LegendComponentOption,
    TooltipComponentOption,
} from "./echarts-core";

export const CHART_FONT_FAMILY =
    '"Inter", "Noto Sans SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const EXECUTIVE_TOOLTIP_EXTRA_CSS =
    "border-radius: 12px; box-shadow: 0 10px 28px -8px rgba(15, 23, 42, 0.14); font-variant-numeric: tabular-nums;";

/**
 * Exact hex fallbacks matching `:root` in `styles/theme.css` so ECharts renders
 * identical Executive BI colors in HappyDOM / headless unit tests where
 * `getComputedStyle(document.documentElement)` returns empty strings.
 */
export const EXECUTIVE_CHART_FALLBACK_TOKENS = {
    chart1: "#475569",
    chart2: "#175cd3",
    chart3: "#0b6e87",
    chart4: "#5948b1",
    chart5: "#b85c00",
    chart6: "#8a6a00",
    chart7: "#0f764a",
    chart8: "#b42318",
    primary: "#175cd3",
    primaryMuted: "#eff4ff",
    primaryBorder: "#b2ccff",
    success: "#0f764a",
    successMuted: "#ecfdf3",
    successBorder: "#abefc6",
    warning: "#8a4b08",
    warningMuted: "#fffaeb",
    warningBorder: "#fedf89",
    info: "#0b6e87",
    infoMuted: "#ecfdff",
    infoBorder: "#a5f0fc",
    destructive: "#b42318",
    destructiveMuted: "#fef3f2",
    destructiveBorder: "#fecdca",
    auxiliary: "#4e5ba6",
    auxiliaryStrong: "#363f72",
    auxiliaryMuted: "#eef4ff",
    auxiliaryBorder: "#c7d7fe",
    foreground: "#0f172a",
    mutedForeground: "#3e5066",
    background: "#f4f7fb",
    card: "#ffffff",
    popover: "#ffffff",
    popoverForeground: "#0f172a",
    border: "#d5dfec",
    muted: "#eef2f6",
} as const;

export type ChartSemanticTone =
    | "primary"
    | "info"
    | "success"
    | "warning"
    | "destructive"
    | "auxiliary"
    | "muted";

export interface ExecutiveChartTokens {
    chart1: string;
    chart2: string;
    chart3: string;
    chart4: string;
    chart5: string;
    chart6: string;
    chart7: string;
    chart8: string;
    /** Indexed `--chart-1` .. `--chart-8` tuple. */
    chartSeries: [string, string, string, string, string, string, string, string];
    /** Categorical series palette led by primary business series colors. */
    palette: [string, string, string, string, string, string, string, string];
    primary: string;
    primaryMuted: string;
    primaryBorder: string;
    success: string;
    successMuted: string;
    successBorder: string;
    warning: string;
    warningMuted: string;
    warningBorder: string;
    info: string;
    infoMuted: string;
    infoBorder: string;
    destructive: string;
    destructiveMuted: string;
    destructiveBorder: string;
    auxiliary: string;
    auxiliaryStrong: string;
    auxiliaryMuted: string;
    auxiliaryBorder: string;
    foreground: string;
    mutedForeground: string;
    background: string;
    card: string;
    popover: string;
    popoverForeground: string;
    border: string;
    muted: string;
}

function getRootComputedStyle(): CSSStyleDeclaration | null {
    if (
        typeof window === "undefined"
        || typeof document === "undefined"
        || typeof window.getComputedStyle !== "function"
        || !document.documentElement
    ) {
        return null;
    }
    try {
        return window.getComputedStyle(document.documentElement);
    } catch {
        return null;
    }
}

export function readCssToken(
    cssVarName: `--${string}`,
    fallback: string,
    computedStyle?: CSSStyleDeclaration | null,
): string {
    const style = computedStyle === undefined ? getRootComputedStyle() : computedStyle;
    const raw = style?.getPropertyValue(cssVarName)?.trim();
    return raw ? raw : fallback;
}

export function getExecutiveChartTokens(): ExecutiveChartTokens {
    const style = getRootComputedStyle();
    const f = EXECUTIVE_CHART_FALLBACK_TOKENS;

    const chart1 = readCssToken("--chart-1", f.chart1, style);
    const chart2 = readCssToken("--chart-2", f.chart2, style);
    const chart3 = readCssToken("--chart-3", f.chart3, style);
    const chart4 = readCssToken("--chart-4", f.chart4, style);
    const chart5 = readCssToken("--chart-5", f.chart5, style);
    const chart6 = readCssToken("--chart-6", f.chart6, style);
    const chart7 = readCssToken("--chart-7", f.chart7, style);
    const chart8 = readCssToken("--chart-8", f.chart8, style);

    return {
        chart1,
        chart2,
        chart3,
        chart4,
        chart5,
        chart6,
        chart7,
        chart8,
        chartSeries: [chart1, chart2, chart3, chart4, chart5, chart6, chart7, chart8],
        palette: [chart2, chart3, chart7, chart4, chart5, chart6, chart1, chart8],
        primary: readCssToken("--primary", f.primary, style),
        primaryMuted: readCssToken("--primary-muted", f.primaryMuted, style),
        primaryBorder: readCssToken("--primary-border", f.primaryBorder, style),
        success: readCssToken("--success", f.success, style),
        successMuted: readCssToken("--success-muted", f.successMuted, style),
        successBorder: readCssToken("--success-border", f.successBorder, style),
        warning: readCssToken("--warning", f.warning, style),
        warningMuted: readCssToken("--warning-muted", f.warningMuted, style),
        warningBorder: readCssToken("--warning-border", f.warningBorder, style),
        info: readCssToken("--info", f.info, style),
        infoMuted: readCssToken("--info-muted", f.infoMuted, style),
        infoBorder: readCssToken("--info-border", f.infoBorder, style),
        destructive: readCssToken("--destructive", f.destructive, style),
        destructiveMuted: readCssToken("--destructive-muted", f.destructiveMuted, style),
        destructiveBorder: readCssToken("--destructive-border", f.destructiveBorder, style),
        auxiliary: readCssToken("--auxiliary", f.auxiliary, style),
        auxiliaryStrong: readCssToken("--auxiliary-strong", f.auxiliaryStrong, style),
        auxiliaryMuted: readCssToken("--auxiliary-muted", f.auxiliaryMuted, style),
        auxiliaryBorder: readCssToken("--auxiliary-border", f.auxiliaryBorder, style),
        foreground: readCssToken("--foreground", f.foreground, style),
        mutedForeground: readCssToken("--muted-foreground", f.mutedForeground, style),
        background: readCssToken("--background", f.background, style),
        card: readCssToken("--card", f.card, style),
        popover: readCssToken("--popover", f.popover, style),
        popoverForeground: readCssToken("--popover-foreground", f.popoverForeground, style),
        border: readCssToken("--border", f.border, style),
        muted: readCssToken("--muted", f.muted, style),
    };
}

export function resolveChartToneColor(
    tone: ChartSemanticTone,
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): string {
    switch (tone) {
        case "primary":
            return tokens.chart2;
        case "info":
            return tokens.chart3;
        case "success":
            return tokens.chart7;
        case "warning":
            return tokens.chart5;
        case "destructive":
            return tokens.chart8;
        case "auxiliary":
            return tokens.chart4;
        case "muted":
            return tokens.chart1;
    }
}

export function buildExecutiveTextStyle(tokens: ExecutiveChartTokens = getExecutiveChartTokens()) {
    return {
        fontFamily: CHART_FONT_FAMILY,
        fontSize: 12,
        color: tokens.mutedForeground,
    };
}

export interface ExecutiveAxisOverrides {
    name?: string;
    nameLocation?: "start" | "middle" | "center" | "end";
    nameGap?: number;
    min?: number | string | ((value: { min: number; max: number }) => number);
    max?: number | string | ((value: { min: number; max: number }) => number);
    interval?: number;
    splitNumber?: number;
    inverse?: boolean;
    boundaryGap?: boolean | [number | string, number | string];
    data?: readonly (string | number | Record<string, unknown>)[];
    axisLabel?: Record<string, unknown>;
    axisLine?: Record<string, unknown>;
    axisTick?: Record<string, unknown>;
    splitLine?: Record<string, unknown>;
    nameTextStyle?: Record<string, unknown>;
    [key: string]: unknown;
}

/**
 * Executive BI category axis: crisp 1px border baseline, no ticks, no splitLines,
 * 12px `Inter`/`Noto Sans SC` labels.
 */
export function buildExecutiveCategoryAxis(
    overrides: ExecutiveAxisOverrides = {},
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): Record<string, unknown> {
    const { axisLabel, axisLine, axisTick, splitLine, nameTextStyle, ...rest } = overrides;
    return {
        type: "category",
        axisLine: {
            show: true,
            lineStyle: {
                color: tokens.border,
                width: 1,
            },
            ...axisLine,
        },
        axisTick: {
            show: false,
            ...axisTick,
        },
        splitLine: {
            show: false,
            ...splitLine,
        },
        axisLabel: {
            color: tokens.mutedForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            margin: 10,
            hideOverlap: true,
            ...axisLabel,
        },
        nameTextStyle: {
            color: tokens.mutedForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            ...nameTextStyle,
        },
        ...rest,
    };
}

/**
 * Executive BI numeric value axis: subtle dashed splitLines, zero axis/tick line clutter,
 * 12px `Inter`/`Noto Sans SC` tabular-nums scale labels.
 */
export function buildExecutiveValueAxis(
    overrides: ExecutiveAxisOverrides = {},
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): Record<string, unknown> {
    const { axisLabel, axisLine, axisTick, splitLine, nameTextStyle, ...rest } = overrides;
    return {
        type: "value",
        axisLine: {
            show: false,
            ...axisLine,
        },
        axisTick: {
            show: false,
            ...axisTick,
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: tokens.border,
                width: 1,
                type: "dashed",
            },
            ...splitLine,
        },
        axisLabel: {
            color: tokens.mutedForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            margin: 10,
            ...axisLabel,
        },
        nameTextStyle: {
            color: tokens.mutedForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            ...nameTextStyle,
        },
        ...rest,
    };
}

export function buildExecutiveAxis(
    axisType: "category" | "value" = "value",
    overrides: ExecutiveAxisOverrides = {},
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): Record<string, unknown> {
    return axisType === "category"
        ? buildExecutiveCategoryAxis(overrides, tokens)
        : buildExecutiveValueAxis(overrides, tokens);
}

/**
 * Rich floating Executive BI tooltip with crisp popover surface, 1px border,
 * soft elevation, and `tabular-nums` alignment.
 */
export function buildExecutiveTooltip(
    overrides: TooltipComponentOption = {},
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): TooltipComponentOption {
    const { textStyle, axisPointer, extraCssText, ...rest } = overrides;
    return {
        trigger: "axis",
        confine: true,
        backgroundColor: tokens.popover,
        borderColor: tokens.border,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
            color: tokens.popoverForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            lineHeight: 18,
            ...textStyle,
        },
        axisPointer: {
            type: "line",
            lineStyle: {
                color: tokens.border,
                width: 1,
                type: "dashed",
            },
            shadowStyle: {
                color: "rgba(15, 23, 42, 0.04)",
            },
            ...axisPointer,
        },
        extraCssText: extraCssText
            ? `${EXECUTIVE_TOOLTIP_EXTRA_CSS} ${extraCssText}`
            : EXECUTIVE_TOOLTIP_EXTRA_CSS,
        ...rest,
    };
}

export function buildExecutiveLegend(
    overrides: LegendComponentOption = {},
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): LegendComponentOption {
    const { textStyle, ...rest } = overrides;
    return {
        top: 0,
        right: 0,
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 16,
        icon: "roundRect",
        textStyle: {
            color: tokens.mutedForeground,
            fontFamily: CHART_FONT_FAMILY,
            fontSize: 12,
            ...textStyle,
        },
        ...rest,
    };
}

export function buildExecutiveGrid(overrides: GridComponentOption = {}): GridComponentOption {
    return {
        left: 12,
        right: 16,
        top: 32,
        bottom: 12,
        containLabel: true,
        ...overrides,
    };
}

export function shouldDisableChartAnimation(): boolean {
    if (typeof navigator !== "undefined" && /HappyDOM/i.test(navigator.userAgent ?? "")) {
        return true;
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        try {
            if (window.matchMedia("(prefers-reduced-motion: reduce)")?.matches) {
                return true;
            }
        } catch {
            // Ignore matchMedia errors in partial DOM environments.
        }
    }
    return false;
}

export function withExecutiveDefaults(
    option: EChartsCoreOption,
    tokens: ExecutiveChartTokens = getExecutiveChartTokens(),
): EChartsCoreOption {
    const disableAnimation = shouldDisableChartAnimation();
    const existingTextStyle =
        typeof option.textStyle === "object" && option.textStyle !== null
            ? (option.textStyle as Record<string, unknown>)
            : undefined;

    return {
        backgroundColor: "transparent",
        color: tokens.palette,
        animation: disableAnimation ? false : true,
        animationDuration: disableAnimation ? 0 : 240,
        animationEasing: "cubicOut",
        ...option,
        textStyle: {
            ...buildExecutiveTextStyle(tokens),
            ...existingTextStyle,
        },
    };
}
