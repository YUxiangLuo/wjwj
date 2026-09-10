# Dogfood 第三批 修复闭环（E-01）

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
