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

## 本地 shadcn fork

`src/components/ui` 包含行为和无障碍修改，不是可覆盖的生成文件。严禁用 shadcn `--overwrite`；用 `bun run audit:shadcn [component ...]` 查看上游变化并手工移植，保留语义 token、浅色桌面和无障碍合同。不要在纯样式改动中迁移到 `radix-ui` 聚合包。

## 验证

样式修改后运行：

```sh
bun run check:styles
bun run verify
```

并用 agent-browser 检查三个入口。`audit:shadcn` 依赖网络，不属于 `verify`。
