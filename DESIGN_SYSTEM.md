# Design System (Google Material Design 3 Productivity Light)

[styles/theme.css](styles/theme.css) 与 [src/theme/mui-theme.ts](src/theme/mui-theme.ts) 共同构成三大 SPA（学生端、教师端、管理端）的唯一设计系统源，不创建各端主题副本。平台采用正统 **Google Material Design 3（MD3）Productivity Light** 设计语言（对标 Google Drive、Google Classroom、Google Analytics 与 Looker Studio），纯浅色桌面工作台（Light-only，支持下限 `1024×768`，更宽内容在自身容器内横向滚动），底层组件全面基于 `@mui/material` + CSS Cascade Layers + **Apache ECharts（`SVGRenderer`）** 构建。

---

## 1. `@mui/material` 与 CSS 层叠架构

- **主题与层叠挂载（[MaterialThemeProvider.tsx](src/components/MaterialThemeProvider.tsx)）**：统一封装 `@mui/material/styles` 的 `<StyledEngineProvider enableCssLayer>` 与 `<ThemeProvider theme={muiTheme}>`，支持幂等嵌套挂载（在 `student.tsx`、`teacher.tsx`、`admin.tsx`、`StudentApp.tsx`、`TeacherApp.tsx`、`AdminApp.tsx` 及独立浮层单测树中均可安全包裹）。**严禁开启全局 `CssBaseline`**，基础文档重置统一由 [styles/theme.css](styles/theme.css) 的 `@layer base` 负责。
- **层叠优先级顺序**：[styles/theme.css](styles/theme.css) 顶部显式声明：
  ```css
  @layer theme, base, mui, components, utilities;
  ```
  确保 `@mui/material` 生成的 `@layer mui` 覆盖 `@layer base`，而外部传入的语义化 Tailwind 工具类（`@layer utilities`）能无冲突地覆盖 `@layer mui` 默认样式。
- **测试确定性与交互清洁性（[mui-theme.ts](src/theme/mui-theme.ts)）**：
  - 全局设置 `MuiButtonBase: { defaultProps: { disableRipple: true } }`，以现代 MD3 干净的 hover/focus 状态层取代旧式水波纹，消除 `happy-dom` 单测下的异步定时器告警。
  - `Dialog` / `Modal` / `Popover` / `Menu` 统一默认 `transitionDuration: 0` 与 `closeAfterTransition: false`，确保关闭浮层后 DOM 同步卸载，保障单测与 E2E 断言零竞态。

---

## 2. 去 AI 味铁律与视觉边界

- **彻底废除深色壳层与伪装饰**：严禁使用深海军蓝 `#0c213b` 侧栏/顶栏、严禁使用 `.institutional-grid` 网格背景、严禁采用“左深蓝口号海报 + 右表单”的模板化登录页。
- **浅色 Tonal 导航壳层**：[WorkspaceShell.tsx](src/components/WorkspaceShell.tsx) 与 [WorkspaceSidebar.tsx](src/components/WorkspaceSidebar.tsx) 基于 MUI `Drawer` / `AppBar` / `Toolbar` / `List` / `ListItemButton` 构建 Google Drive / Classroom 风格浅色 Tonal 导航栏（`--navigation: #f0f4f9`），当前激活项采用 `--navigation-active: #c2e7ff` + `--navigation-active-foreground: #001d35` 胶囊药丸（`rounded-pill`）高亮，顶栏标题采用克制的 `font-medium`（500 字重），不加多余竖线分隔符。
- **居中浅色登录体验**：[AuthLoginScreen.tsx](src/components/AuthLoginScreen.tsx) 采用 `#f0f4f9`（`bg-muted`）柔和画布 + `24px` 大圆角（`rounded-overlay`）白色 `Paper` 卡片，简洁品牌标识、Google 风格描边输入框与胶囊主按钮。
- **克制的 KPI 指标卡片**：[KpiStatCard.tsx](src/components/KpiStatCard.tsx) 对标 Google Analytics / Looker Studio 指标卡，**严禁在右上角堆砌彩虹色块 `IconTile`**（仅允许展示低调中性色小图标），移除多余底部分隔线噪音，数值使用 `font-medium tabular-nums`。
- **严禁硬编码与浮夸特效**：禁止使用 Tailwind 原始调色板（如 `slate-*`、`indigo-*`、`white`）、`dark:`、渐变、模糊/光晕、颜色透明度后缀（如 `bg-primary/10`）、视口响应式前缀（`sm:`/`md:`/`lg:`）、彩色阴影、hover 缩放/位移或 `transition-all`。

---

## 3. 正统 Google MD3 Light 语义令牌

所有令牌定义在 [styles/theme.css](styles/theme.css) 的 `:root` 中，并由 [scripts/check-styles.ts](scripts/check-styles.ts) 自动执行 WCAG AA/AAA 对比度核验：

- **画布与表面层级**：
  - `--background: #f8fafd`（Google Workspace 清爽中性画布）
  - `--card: #ffffff`、`--popover: #ffffff`（纯净主操作表面）
  - `--muted: #f0f4f9`（Surface Container Tonal 容器）、`--secondary: #e9eef6`
- **文字与描边**：
  - `--foreground: #1f1f1f`（On Surface 主文本）
  - `--muted-foreground: #444746`（On Surface Variant 次级文本，对比度 >= 8:1 WCAG AAA）
  - `--border: #dde3ea`（柔和分隔线）、`--input: #747775`（MD3 Outline 控件描边，对比度 > 4.5:1）
- **主色与选中态**：
  - `--primary: #0b57d0`（Google Blue 40，`hover: #0842a0`，`active: #062e6f`，`foreground: #ffffff`，`muted: #edf2fc`，`border: #a8c7fa`）
  - `--accent: #c2e7ff`、`--accent-foreground: #001d35`（MD3 Secondary Container 选中色）
- **语义状态色（全部满足实心底白字 >= 4.5:1 且 `intent` 在 `intent-muted` 上 >= 4.5:1）**：
  - `success`：`#146c2e`（muted `#e6f4ea`, border `#ceead6`）
  - `warning`：`#8c4a00`（muted `#fef7e0`, border `#fde293`）
  - `destructive`：`#b3261e`（muted `#fce8e6`, border `#f9dedc`）
  - `info`：`#00639b`（muted `#e8f0fe`, border `#c2e7ff`）
  - `auxiliary`：`#65558f`（strong `#4f378b`, muted `#f3edf7`, border `#eaddff`）
  - 填充背景上的文字始终使用 `X-foreground`；普通背景上的辅助强调文字使用 `text-auxiliary-strong`。
- **MD3 形状与字阶尺度**：
  - 字体栈以 `"Roboto", "Noto Sans SC"` 优先；字号仅使用 `text-display`、`text-page-title`、`text-section-title`、`text-subheading`、`text-body`、`text-label`、`text-meta`。普通 HTML 文本不得小于 `14px`；`12px` 仅用于图表 SVG `<text>` 刻度与标注；统计数值统一搭配 `tabular-nums`。
  - 圆角语义工具类：`rounded-pill`（`9999px`，按钮与侧栏导航胶囊）、`rounded-control`（`8px`，输入框、下拉框、Chip 徽章）、`rounded-surface`（`12px`，卡片、下拉菜单与 Popover）、`rounded-overlay`（`24px`，MD3 Dialog 弹窗与登录卡片）；`rounded-circle` 仅用于正圆，`rounded-toggle` 仅用于开关轨道。普通表面依靠 Tonal 层级与精细描边区分，`shadow-floating` 仅用于浮层。

---

## 4. 公共组件与 `@mui/material` 封装契约

- **基础 UI 原语（`src/components/ui/**`）**：底层全部基于 `@mui/material`（`MuiButton`、`MuiChip`、`MuiPaper`、`styled("input")` / `styled("textarea")`、`MuiFormLabel`、`MuiDivider`、`MuiLinearProgress`、`MuiSwitch`、`MuiSlider`、`MuiAvatar`、`MuiTable*`、`MuiTabs`/`MuiTab`、`MuiDialog`、`MuiPopover`、`MuiMenu`/`MuiMenuItem`），同时严格保留复合组件导出 API、`asChild` 组合、[accessible-name.ts](src/components/ui/accessible-name.ts) 编译期无障碍命名强约束、`TableHead scope="col"`、[controlled-overlay-focus.ts](src/components/ui/controlled-overlay-focus.ts) 受控弹窗焦点恢复（含 `AlertDialog` `fallbackFocusRef`）以及 [overlay-inert.ts](src/components/ui/overlay-inert.ts) 背景 `inert` 隔离。严禁用外部模板覆盖这些文件，运行 `bun run audit:shadcn` 校验 `@mui/material` 归属。
- **共享业务组件**：状态标签统一使用 [StatusBadge.tsx](src/components/StatusBadge.tsx)（基于 MUI `Chip` 的 `8px` 标签），低调图标容器使用 [IconTile.tsx](src/components/IconTile.tsx)，指标卡使用 [KpiStatCard.tsx](src/components/KpiStatCard.tsx)，页面头部使用 [PageHeader.tsx](src/components/PageHeader.tsx)。

### MD3 按钮四级强调规范（[button.tsx](src/components/ui/button.tsx)）

全平台严格执行正统 Google Material Design 3 胶囊按钮（`rounded-pill`）四级主次层级，彻底消除满屏抢眼的 `w-full` 100% 满宽实心蓝横条：

1. **`default`（MD3 Filled，最高强调）**：`bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active`（`#0b57d0` 实心蓝底白字）。**每屏最多保留 1 个**最高强调主按钮（例如顶部唯一新建入口、[TaskHall.tsx](src/student/pages/TaskHall.tsx)「当前优先推进课题」焦点主入口、实验工作台单阶段主推进按钮或提交确认主按钮）；**列表与网格卡片内部严禁使用 `w-full` 实心蓝大按钮**。
2. **`secondary`（MD3 Filled Tonal，中高强调）**：`border-transparent bg-accent text-accent-foreground hover:bg-primary-border active:bg-primary-border`（`#c2e7ff` 浅蓝胶囊底 + `#001d35` 深蓝字，对比度 > 10:1 WCAG AAA）。对标 Gmail / Google Drive 的柔和强调按钮，用于进行中课题卡片入口、全屏沉浸式预览、保存密码或局部计算触发等次主操作，不与 `#0b57d0` 实心主按钮抢夺视觉重心。
3. **`outline`（MD3 Outlined，中等强调）**：`border-border bg-card text-primary hover:border-primary-border hover:bg-primary-muted`（细腻 `#dde3ea` 描边 + `#0b57d0` 蓝色文字，取代粗黑 `#747775` 控件框）。用于常规次级操作（查看任务书、查看快照/成绩、下载模板、导出数据、弹窗取消等）；退回重调等警示次级动作可组合 `border-destructive-border text-destructive hover:border-destructive-border hover:bg-destructive-muted`。
4. **`ghost`（MD3 Text，低强调）**：`bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground`。用于返回导航、卡片内辅助链接、图标操作等低干扰动作（需主色文字引导时可叠加 `text-primary hover:text-primary`）。

---

## 5. Google Material / Looker Studio 图表架构（Apache ECharts SVG）

全平台业务分析、抽样诊断与教学门户统计统一基于模块化 **Apache ECharts + `SVGRenderer`** 构建：

- **按需注册内核（[echarts-core.ts](src/components/charts/echarts-core.ts)）**：业务代码严禁直接裸引 `"echarts"` 全量入口，必须从 `@/components/charts/echarts-core`、`@/components/charts/echarts-theme` 与 `@/components/charts/EChartBox` 导入。
- **实时 CSS Token 桥接（[echarts-theme.ts](src/components/charts/echarts-theme.ts)）**：`getExecutiveChartTokens()` 实时读取 `:root` 计算样式中的 `--chart-1..8` 及 MD3 语义表面/描边色，并在 HappyDOM 无头单测环境下提供与 [styles/theme.css](styles/theme.css) 完全一致的 hex 回退。
- **双通道无障碍结构（[EChartBox.tsx](src/components/charts/EChartBox.tsx)）**：外层声明 `role="img"` 与中文 `ariaLabel`，内部 `<svg>` 标记 `aria-hidden="true" focusable="false"`，同级 `.sr-only` 输出语义化数据摘要。

### `--chart-1..8` Looker Studio / Material 色板映射

| Token | 默认浅色值 | 商务统计与门户状态语义用途 |
| --- | --- | --- |
| `--chart-1` | `#5f6368` | 中性基线、总体参考线、未开始状态 |
| `--chart-2` | `#0b57d0` | 核心主指标序列（Google Blue）、实训进行中 / 阶段 4、学生规模 |
| `--chart-3` | `#007b83` | 信息对比序列（Material Teal）、阶段 1 问卷设计、在册教师 / 分项过程 |
| `--chart-4` | `#7627bb` | 辅助结构序列（Material Purple）、阶段 3 质检诊断、教学班级 / 分项报告 |
| `--chart-5` | `#e37400` | 警示与待办序列（Material Orange）、阶段 5 决策报告、待批改队列 |
| `--chart-6` | `#b06000` | 过渡与待审序列（Warm Amber）、已提交待审节点 |
| `--chart-7` | `#146c2e` | 达标与归档序列（Material Green）、质检有效、已批改归档、高分段 |
| `--chart-8` | `#b3261e` | 异常与退回序列（Material Red）、质检剔除、已驳回重做、不及格预警 |

### 全平台图表目录

- **学生端外勤与多波次推断图表**：[FieldworkFunnelChart.tsx](src/components/charts/FieldworkFunnelChart.tsx)、[ConfidenceIntervalPlot.tsx](src/components/charts/ConfidenceIntervalPlot.tsx)、[StratumComparisonChart.tsx](src/components/charts/StratumComparisonChart.tsx)、[WaveDeltaScorecard.tsx](src/components/charts/WaveDeltaScorecard.tsx)、[WaveLoopSnapshot.tsx](src/components/WaveLoopSnapshot.tsx)、[CostPrecisionChart.tsx](src/student/components/CostPrecisionChart.tsx)、Stage 5 [AnalysisReport.tsx](src/student/pages/stages/AnalysisReport.tsx) 与 [AnalysisResultChart.tsx](src/components/charts/AnalysisResultChart.tsx)。
- **教师端与管理端门户分析图表（[PortalAnalyticsCharts.tsx](src/components/charts/PortalAnalyticsCharts.tsx)）**：[TaskProgressDetail.tsx](src/teacher/pages/TaskProgressDetail.tsx)、[GradeExport.tsx](src/teacher/pages/GradeExport.tsx)、[Teacher/Dashboard.tsx](src/teacher/pages/Dashboard.tsx)、[Admin/Dashboard.tsx](src/admin/pages/Dashboard.tsx)。

---

## 6. 页面布局层级与工程门禁

- 教师端活动任务面板与管理端最新公告面板在 `1024×768` 下必须保持在首屏上半区起始（`top < innerHeight / 2`）。
- 主要操作画布使用白色 `bg-card` 表面，参考信息与侧栏导航使用柔和 `bg-muted` / `bg-navigation` Tonal 表面，避免套嵌双层描边与高饱和提示框堆砌。
- [scripts/build.ts](scripts/build.ts) 对三端入口执行生产静态首屏 JS gzip 体积预算门禁（`MAX_INITIAL_JS_GZIP_BYTES = 650 * 1024`）、CSS 硬编码调色板零泄漏检查以及演示密码零泄漏检查。

样式与文档修改后运行：

```sh
bun run check:styles
bun run check:docs
bun run audit:shadcn
bun run verify
```
