import * as echarts from "echarts/core";
import {
    BarChart,
    BoxplotChart,
    CustomChart,
    FunnelChart,
    LineChart,
    PieChart,
    RadarChart,
    ScatterChart,
    type BarSeriesOption,
    type BoxplotSeriesOption,
    type CustomSeriesOption,
    type FunnelSeriesOption,
    type LineSeriesOption,
    type PieSeriesOption,
    type RadarSeriesOption,
    type ScatterSeriesOption,
} from "echarts/charts";
import {
    DatasetComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    MarkPointComponent,
    RadarComponent,
    TooltipComponent,
    type DatasetComponentOption,
    type GridComponentOption,
    type LegendComponentOption,
    type MarkAreaComponentOption,
    type MarkLineComponentOption,
    type MarkPointComponentOption,
    type RadarComponentOption,
    type TooltipComponentOption,
} from "echarts/components";
import { LabelLayout, LegacyGridContainLabel } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import type {
    ComposeOption,
    ECElementEvent,
    ECharts,
    EChartsCoreOption,
    EChartsInitOpts,
    EChartsType,
    SetOptionOpts,
} from "echarts/core";

echarts.use([
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    RadarChart,
    FunnelChart,
    BoxplotChart,
    CustomChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
    DatasetComponent,
    RadarComponent,
    LabelLayout,
    LegacyGridContainLabel,
    SVGRenderer,
]);

export type ExecutiveChartOption = ComposeOption<
    | BarSeriesOption
    | LineSeriesOption
    | PieSeriesOption
    | ScatterSeriesOption
    | RadarSeriesOption
    | FunnelSeriesOption
    | BoxplotSeriesOption
    | CustomSeriesOption
    | GridComponentOption
    | TooltipComponentOption
    | LegendComponentOption
    | MarkLineComponentOption
    | MarkPointComponentOption
    | MarkAreaComponentOption
    | DatasetComponentOption
    | RadarComponentOption
>;

export { echarts };
export type {
    BarSeriesOption,
    BoxplotSeriesOption,
    ComposeOption,
    CustomSeriesOption,
    DatasetComponentOption,
    ECElementEvent,
    ECharts,
    EChartsCoreOption,
    EChartsInitOpts,
    EChartsType,
    FunnelSeriesOption,
    GridComponentOption,
    LegendComponentOption,
    LineSeriesOption,
    MarkAreaComponentOption,
    MarkLineComponentOption,
    MarkPointComponentOption,
    PieSeriesOption,
    RadarComponentOption,
    RadarSeriesOption,
    ScatterSeriesOption,
    SetOptionOpts,
    TooltipComponentOption,
};
