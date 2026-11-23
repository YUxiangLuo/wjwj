# Design system

`styles/theme.css` 是三个 SPA（学生端、教师端、管理端）的唯一主题源。项目采用现代 **Executive BI Light（商务智能浅色桌面工作台）** 设计语言，支持下限 `1024×768`（更宽内容在自身容器内横向滚动）；页面组合本地维护的 `src/components/ui` primitives、KPI 卡片与原生 SVG 图表，不创建主题副本。

## 必须遵守的规则

- 颜色严格使用语义 token：`background`、`foreground`、`card`、`muted`、`primary`、`success`、`warning`、`info`、`destructive`、`auxiliary`。侧栏导航使用配套 `navigation-*`；图表和热力图使用 `--chart-1..8` 专用 token。
- 不使用 Tailwind palette（如 `slate-*`、`indigo-*`、`white`）、`dark:`、渐变、模糊/光晕、颜色透明度后缀（如 `bg-primary/10`）、响应式前缀（`sm:`/`md:`/`lg:`）、彩色阴影、hover 缩放/位移或 `transition-all`。
- 填充背景上的文字使用 `X-foreground`；普通背景上的辅助强调文字使用 `text-auxiliary-strong`。所有语义对比度均通过 `scripts/check-styles.ts` WCAG AA/AAA 自动核验。
- 字体仅用 `text-display`、`text-page-title`、`text-section-title`、`text-subheading`、`text-body`、`text-label`、`text-meta`。普通 HTML 文本不得小于 14px；12px 只用于 SVG `<text fontSize="12">` 图表刻度；统计数值统一搭配 `tabular-nums`。
- 圆角使用几何商务尺度：`rounded-control`（`8px`）、`rounded-surface`（`12px`）、`rounded-overlay`（`16px`）；`rounded-circle` 只用于真正的圆，`rounded-toggle` 只用于开关轨道。普通表面用精细边框分隔，`shadow-floating` 只用于浮层；严禁原始 radius/shadow utilities。
- 重复状态徽章、图标统计块、KPI 指标卡和页面标题分别使用 `StatusBadge`、`IconTile`、`KpiStatCard`、`PageHeader`。
- 多波次商务统计可视化优先使用 `src/components/charts/` 下的原生无障碍 SVG 组件：`FieldworkFunnelChart`（投放—完答—质检漏斗）、`ConfidenceIntervalPlot`（多口径置信区间森林图）、`StratumComparisonChart`（客群框内占比 vs 有效回收占比）、`WaveDeltaScorecard`（首轮试投 vs 正式投放跃升记分卡）以及共享闭环快照 `WaveLoopSnapshot`。

## 页面层级

- 先区分商业立项上下文、核心操作画布、主要推进动作与辅助统计依据，再选用双栏工作台或分步页签；避免碎片化信息堆叠。
- 编辑、结果比较和材料阅读使用主要白色 `bg-card` 表面；参考信息优先使用中性 `bg-muted` 背景与分隔线。控件边界和键盘焦点环必须清晰保留。
- 统计比较平等展示各抽样方法与清洗/校准口径，不自动替学生判定唯一“最佳方法”；教学总体参考基准不应盖过学生的实证估计结果。
- 检查 `1024×768`、`1440×900`、`1920×1080` 三种桌面分辨率下的长内容、折叠态和固定操作栏。

## 本地 shadcn fork

`src/components/ui` 包含行为和无障碍修改，不是可覆盖的生成文件。严禁用 shadcn `--overwrite`；用 `bun run audit:shadcn [component ...]` 查看上游变化并手工移植，保留语义 token、浅色桌面和无障碍合同。

## 验证

样式修改后运行：

```sh
bun run check:styles
bun run verify
```

并用 `agent-browser` 巡检三个入口。
