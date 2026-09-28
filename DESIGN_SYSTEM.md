# Design system

`styles/theme.css` 是三个 SPA 的唯一主题源。项目仅支持浅色桌面界面（支持下限 1024×768，更宽内容在自身容器内滚动）；页面组合本地维护的 `src/components/ui` primitives 和共享模式，不创建主题副本。

## 必须遵守的规则

- 颜色使用语义 token：`background`、`foreground`、`card`、`muted`、`primary`、`success`、`warning`、`info`、`destructive`、`auxiliary`。导航使用配套 `navigation-*`；图表和热力图使用专用 token。
- 不使用 Tailwind palette、`dark:`、渐变、模糊/光晕、颜色透明度组合、彩色阴影、hover 缩放/位移或 `transition-all`。
- 填充背景上的文字使用 `X-foreground`；普通背景上的辅助强调文字使用 `auxiliary-strong`。状态和操作按语义意图选色。
- 字体仅用 `text-display`、`text-page-title`、`text-section-title`、`text-subheading`、`text-body`、`text-label`、`text-meta`。普通 HTML 文本不得小于 14px；12px 只用于 SVG 图表刻度。
- 圆角使用 `rounded-control`、`rounded-surface`、`rounded-overlay`；`rounded-circle` 只用于真正的圆，`rounded-toggle` 只用于开关轨道。普通表面用边框分隔，`shadow-floating` 只用于浮层；不用原始 radius/shadow utilities。
- 默认、紧凑、强调控件高度分别为 40、36、44px；禁用态使用明确的 muted 颜色，不对整个控件降透明度。
- 重复状态徽章、图标统计块和页面标题分别使用 `StatusBadge`、`IconTile`、`PageHeader`。

## 页面层级

- 先区分页面上下文、主要工作区、主要操作与辅助依据，再选用容器；不要把每个信息分组都做成独立卡片。
- 编辑、结果比较和材料阅读使用主要白色表面；参考信息优先使用中性背景、留白和分隔线。卡片内部避免重复完整边框，控件边界和键盘焦点环必须保留。
- 章节间距大于章节内部间距。用语义字号、字重与位置共同表达层级，不通过小于 14px 或低对比度文字弱化辅助内容。
- 主要颜色用于操作和当前选择；成功图标表示真实的成功状态，不作为普通区域标题的装饰。同一区域的主要动作应比参考和返回操作醒目。
- 统计比较平等展示各方法，不自动推荐“最佳方法”；总体真值是教学参考，不应比学生估计更醒目。结果旁保留必要限制，完整诊断可展开查看。
- 局部页面先验证，再考虑共享组件默认值。检查 1024×768、1440×900、1920×1080 下的长内容、展开状态和固定操作区，避免只凭宽屏默认状态推广。

## 本地 shadcn fork

`src/components/ui` 包含行为和无障碍修改，不是可覆盖的生成文件。严禁用 shadcn `--overwrite`；用 `bun run audit:shadcn [component ...]` 查看上游变化并手工移植，保留语义 token、浅色桌面和无障碍合同。不要在纯样式改动中迁移到 `radix-ui` 聚合包。

## 验证

样式修改后运行：

```sh
bun run check:styles
bun run verify
```

并用 agent-browser 检查三个入口。`audit:shadcn` 依赖网络，不属于 `verify`。
