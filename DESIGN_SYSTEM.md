# Design system

[styles/theme.css](styles/theme.css) 是三个 SPA（学生端、教师端、管理端）的唯一主题源。项目采用现代 **Executive BI Light（商务智能浅色桌面工作台）** 设计语言，支持下限 `1024×768`（更宽内容在自身容器内横向滚动）；页面组合本地维护的 `src/components/ui` primitives、KPI 指标卡片与 **Apache ECharts（`SVGRenderer`）** 矢量统计图表，不创建各端主题副本。

## 必须遵守的规则

- 颜色严格使用语义 token：`background`、`foreground`、`card`、`muted`、`primary`、`success`、`warning`、`info`、`destructive`、`auxiliary`。侧栏导航使用配套 `navigation-*`；统计图表和热力图统一使用 `--chart-1..8` 专用色板 token。
- 不使用 Tailwind palette（如 `slate-*`、`indigo-*`、`white`）、`dark:`、渐变、模糊/光晕、颜色透明度后缀（如 `bg-primary/10`）、响应式前缀（`sm:`/`md:`/`lg:`）、彩色阴影、hover 缩放/位移或 `transition-all`。
- 填充背景上的文字使用 `X-foreground`；普通背景上的辅助强调文字使用 `text-auxiliary-strong`。所有语义对比度均通过 [scripts/check-styles.ts](scripts/check-styles.ts) WCAG AA/AAA 自动核验。
- 字体仅用 `text-display`、`text-page-title`、`text-section-title`、`text-subheading`、`text-body`、`text-label`、`text-meta`。普通 HTML 文本不得小于 14px；12px 只用于图表 SVG `<text>` 刻度与标注；统计数值统一搭配 `tabular-nums`。
- 圆角使用几何商务尺度：`rounded-control`（`8px`）、`rounded-surface`（`12px`）、`rounded-overlay`（`16px`）；`rounded-circle` 只用于真正的圆，`rounded-toggle` 只用于开关轨道。普通表面用精细边框分隔，`shadow-floating` 只用于浮层；严禁原始 radius/shadow utilities。
- 重复状态徽章、图标统计块、KPI 指标卡和页面标题分别使用 [StatusBadge.tsx](src/components/StatusBadge.tsx)、[IconTile.tsx](src/components/IconTile.tsx)、[KpiStatCard.tsx](src/components/KpiStatCard.tsx)、[PageHeader.tsx](src/components/PageHeader.tsx)。

## Executive BI 图表架构（Apache ECharts SVG）

全平台业务分析、抽样诊断与教学门户统计统一基于模块化 **Apache ECharts + `SVGRenderer`** 构建，兼顾高密度商务可视化表现力、最小化拆包体积、确定性单测渲染与 WCAG 无障碍可读性。

### 1. 模块化内核与主题桥接

- **按需注册内核（[echarts-core.ts](src/components/charts/echarts-core.ts)）**：统一从 `echarts/core` 注册 `BarChart`、`LineChart`、`PieChart`、`ScatterChart`、`RadarChart`、`FunnelChart`、`BoxplotChart`、`CustomChart` 以及 `Grid`、`Tooltip`、`Legend`、`MarkLine`、`MarkPoint`、`MarkArea`、`Dataset`、`Radar`、`LabelLayout`、`LegacyGridContainLabel` 与 **`SVGRenderer`**。业务代码严禁直接裸引 `"echarts"` 全量入口，必须从 `@/components/charts/echarts-core`、`@/components/charts/echarts-theme` 与 `@/components/charts/EChartBox` 导入。
- **实时 CSS Token 桥接（[echarts-theme.ts](src/components/charts/echarts-theme.ts)）**：`getExecutiveChartTokens()` 实时读取 `:root` 计算样式中的 `--chart-1..8` 及语义表面/边框色，并在 HappyDOM 无头单测环境下提供与 [styles/theme.css](styles/theme.css) 完全一致的精确 hex 回退。统一使用 `buildExecutiveCategoryAxis()`、`buildExecutiveValueAxis()`、`buildExecutiveTooltip()`、`buildExecutiveLegend()`、`buildExecutiveGrid()` 与 `withExecutiveDefaults()` 生成商务坐标轴（1px 实线分类基线、虚线数值网格、无多余刻度刺线、浮层 `tabular-nums` 提示框）；在 HappyDOM 与 `prefers-reduced-motion: reduce` 下自动关闭动画，确保 SVG 输出同步且确定。

### 2. `--chart-1..8` 商务色板语义映射

| Token | 默认浅色值 | 商务统计与门户状态语义用途 |
| --- | --- | --- |
| `--chart-1` | `#475569` | 中性基线、总体参考线、未开始状态 |
| `--chart-2` | `#175cd3` | 核心主指标序列（皇家蓝）、实训进行中 / 阶段 4、学生规模 |
| `--chart-3` | `#0b6e87` | 信息对比序列（青蓝）、阶段 1 问卷设计、在册教师 / 分项过程 |
| `--chart-4` | `#5948b1` | 辅助结构序列（靛紫）、阶段 3 质检诊断、教学班级 / 分项报告 |
| `--chart-5` | `#b85c00` | 警示与待办序列（琥珀橙）、阶段 5 决策报告、待批改队列 |
| `--chart-6` | `#8a6a00` | 过渡与待审序列（暖金）、已提交待审节点 |
| `--chart-7` | `#0f764a` | 达标与归档序列（祖母绿）、质检有效、已批改归档、高分段 |
| `--chart-8` | `#b42318` | 异常与退回序列（绯红）、质检剔除、已驳回重做、不及格预警 |

### 3. 容器生命周期与 `.sr-only` 无障碍合同

- **SVG 矢量容器（[EChartBox.tsx](src/components/charts/EChartBox.tsx)）**：固定以 `renderer: "svg"` 初始化实例，配合 `ResizeObserver`（在无观察器环境中安全降级至 `fallbackWidth`）同步容器宽度，组件卸载时自动调用 `dispose()` 释放实例，并通过 `exportEChartSvg()` 提供纯矢量 SVG 字符串导出。
- **双通道无障碍结构**：`<EChartBox>` 外层绘图区声明 `role="img"` 与明确的中文 `ariaLabel`，并将内部 ECharts 生成的 `<svg>` 同步标记为 `aria-hidden="true" focusable="false"`（避免屏幕阅读器逐条朗读原始刻度节点）；同时通过 `srSummary` 属性在同级 `.sr-only` 容器内输出语义化 `<table>` 数据摘要表，确保屏幕阅读器完整读取核心指标且通过 `axe-core` 零违规校验。

### 4. 全平台图表目录（Chart Catalog）

- **学生端外勤与多波次推断图表**：
  - [FieldworkFunnelChart.tsx](src/components/charts/FieldworkFunnelChart.tsx)：抽样邀约—成功触达—完整提交—质检有效梯形转化漏斗（`FunnelSeries`）与环节留存拆解。
  - [ConfidenceIntervalPlot.tsx](src/components/charts/ConfidenceIntervalPlot.tsx)：多抽样设计/校准口径 95% 置信区间统计森林图（`CustomSeries` 误差须线 + 点估计标记 + 总体真值虚线 `MarkLine`）。
  - [StratumComparisonChart.tsx](src/components/charts/StratumComparisonChart.tsx)：客群分层抽样框占比、有效回收占比与实测有效应答率双轴组合图（`BarSeries` + `LineSeries`）。
  - [WaveDeltaScorecard.tsx](src/components/charts/WaveDeltaScorecard.tsx) 与 [WaveLoopSnapshot.tsx](src/components/WaveLoopSnapshot.tsx)：首轮试投 vs 正式投放四维跃升记分卡与波次演进雷达/对比图。
  - [CostPrecisionChart.tsx](src/student/components/CostPrecisionChart.tsx)：抽样成本—预期误差限前沿曲线（`LineSeries` + 参考预算与目标误差限双 `MarkLine` + 可行域 `MarkArea`）。
  - Stage 5 [AnalysisReport.tsx](src/student/pages/stages/AnalysisReport.tsx) 与单变量/交叉分析图表（`src/components/charts/AnalysisResultChart.tsx`）：跨方法点估计与 95% CI 对比图、均值/分布（分组与 100% 堆叠切换）/设计标准误/总体代表性雷达四页签图表、连续变量箱线图（`BoxplotSeries`）、分类占比环形条形双视图及客群交叉分析图，支持浮层放大检视与矢量 SVG 导出。
- **教师端与管理端门户分析图表（[PortalAnalyticsCharts.tsx](src/components/charts/PortalAnalyticsCharts.tsx)）**：
  - [TaskProgressDetail.tsx](src/teacher/pages/TaskProgressDetail.tsx)：任务进度五阶段交互式状态环形图（`PieSeries`，`aria-label="学生实验状态分布环形图"`）与五阶段推进管道柱状图（`BarSeries` + 紧凑筛选图例，支持点击扇区/柱条联动筛选学生名册）。
  - [GradeExport.tsx](src/teacher/pages/GradeExport.tsx)：成绩统计参考三联图表——学生任务状态梯形转化漏斗（`FunnelSeries`）、已批改总分分布直方图（`BarSeries` + 总分均值/中位数双虚线 `MarkLine`）、三维评分雷达与分项柱状组合视图（`RadarSeries` + `BarSeries`）。
  - [Teacher/Dashboard.tsx](src/teacher/pages/Dashboard.tsx)：活跃任务学生推进结构图（横向 100% 堆叠占比 / 学生人数双口径切换，位于活动任务主面板下方以确保 `1024×768` 首屏核心任务列表优先展示）。
  - [Admin/Dashboard.tsx](src/admin/pages/Dashboard.tsx)：平台教学资源规模横向柱状图与角色账号构成及批改队列状态环形图（位于最近平台公告面板下方，附平均班额、师生比与师均待审负载指标）。

## 页面层级

- 先区分商业立项上下文、核心操作画布、主要推进动作与辅助统计依据，再选用双栏工作台或分步页签；避免碎片化信息堆叠。教师端活动任务面板与管理端最新公告面板在 `1024×768` 下必须保持在首屏上半区起始（`top < innerHeight / 2`）。
- 编辑、结果比较和材料阅读使用主要白色 `bg-card` 表面；参考信息优先使用中性 `bg-muted` 背景与分隔线。控件边界和键盘焦点环必须清晰保留。
- 统计比较平等展示各抽样方法与清洗/校准口径，不自动替学生判定唯一“最佳方法”；教学总体参考基准不应盖过学生的实证估计结果。
- 检查 `1024×768`、`1440×900`、`1920×1080` 三种桌面分辨率下的长内容、折叠态和固定操作栏，确保零横向溢出与零标签遮挡。

## 本地 shadcn fork

`src/components/ui` 包含行为和无障碍修改，不是可覆盖的生成文件。严禁用 shadcn `--overwrite`；用 `bun run audit:shadcn [component ...]` 查看上游变化并手工移植，保留语义 token、浅色桌面和无障碍合同。

## 验证

样式与文档修改后运行：

```sh
bun run check:styles
bun run check:docs
bun run verify
```

并用 `agent-browser` 巡检三个入口。
