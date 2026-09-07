# 三端悬停闪烁修复 — 2026-09-08

基于 b24d854 和 [前轮排查](HOVER_STABILITY_REVIEW_2026-09-07.md)，完成 33 个生产文件的统一修复。本轮仅修改本地源码，未提交、推送或部署。

## 修复行为

- 共享 Button（含 IconButton、AlertDialog 确认/取消）、Dialog 关闭按钮、TableRow 和富文本工具栏改用 `transition-none`。正常、悬停、焦点和禁用状态直接显示最终颜色，快速进出不再中断并反转颜色动画。
- 教师、学生、管理员页面中独立实现的按钮、链接、列表、卡片及其文字/边框反馈同步处理，包括问卷选项和规划教学参数。显式 `transition-none` 也避免调用点重新继承基础控件的过渡。
- 问卷题目操作组始终显示，移除父级 hover/focus 透明度隐藏与淡入淡出。保留现有按钮布局和禁用条件。
- 是非、单选、多选的未选中分支各移除重复 `hover:bg-card`，统一保留实际生效的 `hover:bg-muted`。
- 保留加载旋转、抽样轨迹、教学进度、图表及非悬停状态动画。未更改数据计算、接口、提交行为或现有焦点/禁用规则。

## 验证

- 115 个生产 TSX 文件 AST 复扫：直接背景 hover + 颜色过渡由 40 处降至 0；文字/边框 hover + 颜色过渡由 47 处降至 0。共享 Button 的 273 个使用位置、TableRow 的 39 个位置和 ToolbarButton 的 12 个位置沿组件定义核对。另检查动态类名的教学自检按钮，已覆盖。
- 本地生产构建运行于 `http://127.0.0.1:3220`，使用现有本地多状态测试库；agent-browser 0.36.0 + 系统 Chromium 完成 **24 个入口**的真实鼠标压力测试，覆盖前轮全部 18 类背景反转正例，以及禁用按钮、已选单选项、多选上限禁用项、确认/取消按钮和已修复侧栏。
- 每个入口 8 轮中心/外侧往返，随后等待 350ms，再进行 20 个间隔 40ms 的静止采样；全部成功进入 hover，**0 过渡事件、0 子级过渡事件、0 中间背景色、0 DOM 变更、1 个固定几何矩形**。详见 [24 项浏览器结果](docs/reviews/hover-stability-2026-09-07/fix-browser-cases.json)。
- 问卷题目操作组不再淡入淡出；1280px 截图确认布局正常。选择单选答案后自动进入下一题，返回该题验证选中背景在 hover 时仍保持 primary。多选达到 3 项上限后，剩余选项保持禁用且 hover 不变色。
- 管理员编辑按钮 Tab / Shift+Tab 显示焦点环；Enter 打开编辑学期弹窗，Escape 关闭。删除确认弹窗仅打开、悬停和取消，未执行删除。
- 在按钮内临时插入带 `animate-spin` 的 SVG 检查生产 CSS，仍为 `spin 1s`；检查后移除。抽样动画现有行为测试通过。
- `bun run audit:shadcn button dialog table` 已检查本地 fork 与固定版本上游差异，未覆盖组件。
- `bun run typecheck`（含 `check:styles`）、生产构建、`git diff --check` 通过。
- `bun test --isolate src scripts`：827 pass、1 skip、0 fail，11189 断言。跳过项为未配置专用测试库的 PostgreSQL 集成测试。

原始事件与截图在本地忽略目录 `test-results/interaction-fix-2026-09-08/`。测试使用客户端草稿和预览，不执行实验阶段完成或报告提交；远程演示站未被修改。原有 `DOGFOOD_FRESH_R2_2026-09-07.md` 保持原样。

修复消除了已复现的悬停过渡反转；不将本次 Chromium 验收扩大为所有浏览器/GPU 环境的保证。
