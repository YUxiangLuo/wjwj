# Dogfood 第三批 修复闭环（E-01 + R6）

被测基线：`1dd70e787905bf9b827db3952cc36cc99b1bb74e`。本批共两类修复：

- **E-01 / P3（文档口径）**：见第一部分，已提交于 `6b3d6a1`。
- **R6 的 3 项 P3 无障碍改进（O-5 / O-6 / O-7）**：见第二部分。

---

# 第一部分：E-01 文档口径

日期：2026-09-10 CST。被测基线：`1dd70e787905bf9b827db3952cc36cc99b1bb74e`。
本批唯一缺陷为 **E-01 / P3 文档口径**，按产品决定「猜测可跳过；自检须答对每题后才能继续」修正文档，实现保持不变。

## 决策

| 选项 | 结论 |
| --- | --- |
| 改实现让自检可跳过 | **未采用** |
| 改文档以匹配实现 | **采用** |

依据：样本量规划的实际行为是严格解锁的——步骤 1 的推进条件是 `phase.revealed`（可点「暂不估计，直接查看建议」跳过猜测），其余步骤要求完成对应「理解检查」（`factors` 需六项全部完成），第 6 步快速自检要求每题答对。`test:teaching` 的用例名亦为 `required planning lessons`。

## 变更

1. **`README.md`**（第 22 行，样本量规划段落）
   - 原文：「…自检可跳过，最后点击「保存规划并进入抽样」一次完成阶段保存；失败时保留方案供重试。」
   - 改为：「…**猜测可跳过**；各步的「理解检查」需逐个完成以解锁下一步，**最后的快速自检须答对每题后才能继续**，然后点击「保存规划并进入抽样」一次完成阶段保存；失败时保留方案供重试。」

2. **`scripts/check-docs.ts`**（新增语义口径门禁，关闭观察项 O-4）
   - `check:docs` 原先只校验 README/DATABASE 的 seed fixture 计数与任务名，拦不住行为描述漂移（E-01 即由此漏网）。
   - 新增 4 条断言：README 不得出现「自检可跳过」；须写明「猜测可跳过」「快速自检须答对每题」「理解检查」。

## 验证

| 检查 | 结果 |
| --- | --- |
| `bun run check:docs` | 通过（`Documentation fixture summary and planning-behaviour claims are in sync.`） |
| 反向验证：把 README 改回「自检可跳过」 | `check:docs` **exit 1**，报「README 行为描述与实现不一致」，随后恢复 |
| `bun run typecheck`（tsc + check:styles） | 通过 |
| `bun test --isolate src scripts` | **1052 pass / 15 skip / 0 fail**（1067 tests × 207 files），与修改前完全一致 |
| 定向：`immersive-sample-planning` + `scripts` | 74 pass / 0 fail |

未修改任何运行时行为代码，因此未重跑数据库集成、生产构建与浏览器复测；产品源码零改动。

## 影响面与回滚

- 影响面：仅文档与文档门禁。三个 SPA 的运行时、数据库、API、样式均未变化。
- 回滚：`git checkout -- README.md scripts/check-docs.ts` 即可；回滚后 `check:docs` 仍会通过（门禁随实现一并回退）。
- 该门禁纳入 `bun run verify` 链路，今后若再出现「文档声称自检可跳过」会直接失败。

## 残留

本批其余 NOT_RUN 项（草稿 7 天过期的行为验证、B-02 冲突后重入路径、B-07 离开页面取消在途分析与 Worker 异常、B-06 真实断链）与六轮总纲的 R5/R6 不在本次修复范围，见 [summary.md](summary.md) 第七节。

---

# 第二部分：R6 无障碍改进（O-5 / O-6 / O-7）

日期：2026-09-10 CST。三项都是 R6 扫描发现的 P3 改进项。**运行时行为未变**，只补无障碍语义与焦点归还。

## 决策

R6 的初测只把 O-6/O-7 记在 `/teacher/class`。全站重扫后发现同类问题分布更广（**8 个页面**的表格缺 `scope`/名称、**6 处**输入缺无障碍名称），因此按“在原语修 + 逐页补名称”的方式**一次性修全**，而不是只补被记录的那一页。

## 变更

### O-5 弹窗关闭后焦点归还常驻触发器

根因在 `AlertDialog` 原语：它已经调用 `useControlledOverlayFocusRestore(actualOpen)`，但没有 fallback。当开启弹窗的元素是**随菜单卸载的菜单项**时，`opener?.isConnected` 为 false，回退目标为空，焦点落到 `body`。

- `src/components/ui/alert-dialog.tsx`：`AlertDialog` 新增可选 `fallbackFocusRef`，透传给共享 hook（不透传给 Radix Root）。
- `src/student/StudentApp.tsx`：给账号菜单触发器加 ref，并传给退出确认弹窗。
- `src/components/interaction-quality-gates.test.ts`：源码门禁断言更新为 `useControlledOverlayFocusRestore(actualOpen, fallbackFocusRef)`，同时继续校验 Dialog 的调用。

### O-6 搜索框补无障碍名称

`placeholder` 虽可作为 accname 的回退，但输入后名称即消失。为 6 个只有 placeholder 的搜索框补 `aria-label`：

| 文件 | 补的名称 |
| --- | --- |
| `src/teacher/pages/ClassManagement.tsx` | 搜索班级名称 |
| `src/teacher/pages/StudentManagement.tsx` | 搜索学生 |
| `src/teacher/pages/TopicManagement.tsx` | 搜索实验模板名称 |
| `src/admin/pages/ClassManagement.tsx` | 搜索班级、学期或教师 |
| `src/admin/pages/SemesterManagement.tsx` | 搜索学期名称 |
| `src/admin/pages/TeacherManagement.tsx` | 搜索教师工号或姓名 |

### O-7 表头 scope 与表格名称

- `src/components/ui/table.tsx`：`TableHead` 默认 `scope="col"`（仍可被调用方覆盖为 `row` 等）。**一处修改修好全部表格**。
- 9 张表格补 `aria-label`：教师班级列表、学生列表、实验任务列表、导出列表、任务学生进度；管理端学期列表、教师列表、班级列表、学生列表、学生实验记录；学生端分层抽样结果、分层样本量面板。
- `DESIGN_SYSTEM.md`：在本地 shadcn fork 的保证清单中记录 `scope="col"` 与 `fallbackFocusRef`。

## 回归测试

| 测试 | 作用 |
| --- | --- |
| `src/components/ui/table.test.tsx`（新增） | 断言 `TableHead` 默认渲染 `scope="col"`、表格可被命名，且调用方可覆盖为 `scope="row"` |
| `src/components/ui/alert-dialog-fallback-focus.test.tsx`（新增） | 复现“菜单项开启弹窗随后卸载”的场景，断言焦点回退到常驻触发器 |
| `src/components/interaction-quality-gates.test.ts`（更新） | 源码门禁覆盖新的 hook 调用形式 |

**负向验证**：临时撤销 `alert-dialog.tsx` 的 fallback 透传后，新测试 FAIL（exit 1、`0 pass / 1 fail`）；恢复后 PASS。说明该回归测试确实能抓住此缺陷，而不是恒真。

## 验证

| 检查 | 结果 |
| --- | --- |
| `bun run verify`（typecheck + check:styles + check:docs + 单测 + 随机单测 + build + db:check + audit:applicable） | 通过 |
| 全站语义重扫（9 个曾命中的页面） | 全部 clean：无未命名输入、所有表格均有 `scope` 与名称 |
| axe 重扫（教师 3 页 + 管理端 4 页 + 学生 2 页） | **violations = 0**，通过项反而增加（如 `/teacher/class` 38→39、`/admin/teacher` 32→34） |
| O-5 线上复测（真实点击 / 生产实例） | 打开账户菜单 → 点“退出登录”（菜单项随之下线）→ Esc → `document.activeElement` 为账号菜单触发器（`aria-label="打开账户菜单"`），**不再是 body** |

axe 在 `/teacher/task` 新增 1 条 `color-contrast` **incomplete**（非违规）：该处为 ghost 链接“进度”，computed color `#42546b` 于白底 **对比度 7.74:1**（AA 要求 4.5:1），axe 因背景需追溯透明祖先而无法自动判定。人工实测通过，不计缺陷。

## 影响面与回滚

- 影响面：两个 UI 原语、1 个 SPA 外壳、8 个页面组件、1 个文档、3 个测试。**未改数据库、API、样式令牌或业务逻辑**。
- 回滚：`git revert <commit>` 即可；原语默认值回退后，调用方传入的 `aria-label` 仍是无害的。
