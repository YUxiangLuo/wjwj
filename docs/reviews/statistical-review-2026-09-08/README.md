# 2026-09-08 统计审查复现材料

**修复后请查看 [修复记录](../../../STATISTICAL_FIXES_2026-09-08.md)。下方原始探针断言修复前的问题行为，当前代码修复后不应再全部通过，请勿用它们覆盖原始观测文件。**

主报告：[STATISTICAL_REVIEW_2026-09-08.md](../../../STATISTICAL_REVIEW_2026-09-08.md)。

这些材料只读取项目模块并处理合成数据，不连接数据库。归档使用 `.txt` 后缀，避免组件复现程序进入项目日常类型检查和测试发现范围。

## 数值复现

从仓库根目录运行：

```sh
cp docs/reviews/statistical-review-2026-09-08/probes.ts.txt docs/reviews/statistical-review-2026-09-08/probes.tmp.ts
node_modules/.bin/bun docs/reviews/statistical-review-2026-09-08/probes.tmp.ts
rm docs/reviews/statistical-review-2026-09-08/probes.tmp.ts
```

会重新写入同目录的 `observations.json`，并将相同结果打印到终端。运行基线为项目固定 Bun 1.4.0。

## 浏览器复现

从仓库根目录复制三个归档文件：

```sh
cp docs/reviews/statistical-review-2026-09-08/browser.tsx.txt docs/reviews/statistical-review-2026-09-08/browser.tmp.tsx
cp docs/reviews/statistical-review-2026-09-08/browser.html.txt docs/reviews/statistical-review-2026-09-08/browser.tmp.html
cp docs/reviews/statistical-review-2026-09-08/server.ts.txt docs/reviews/statistical-review-2026-09-08/server.tmp.ts
bun docs/reviews/statistical-review-2026-09-08/server.tmp.ts
```

在另一终端运行 agent-browser：

```sh
bun node_modules/agent-browser/bin/agent-browser.js --session wj-stat-review-repro open 'http://127.0.0.1:3118/?case=cost'
bun node_modules/agent-browser/bin/agent-browser.js --session wj-stat-review-repro snapshot -i
bun node_modules/agent-browser/bin/agent-browser.js --session wj-stat-review-repro screenshot /tmp/wj-stat-cost.png --full
```

可将 `case` 改为 `precision`、`fpc` 或 `cv`。成本案例点击“应用此样本量”可观察底部的回写结果。CV 案例需要将目标 CV 滑块调至 1%。这是实际组件的隔离复现页，不是演示站或真实实验记录。

结束后关闭该浏览器会话，在服务器终端按 Ctrl+C，并删除三个 `.tmp.*` 文件：

```sh
bun node_modules/agent-browser/bin/agent-browser.js --session wj-stat-review-repro close
rm docs/reviews/statistical-review-2026-09-08/browser.tmp.tsx docs/reviews/statistical-review-2026-09-08/browser.tmp.html docs/reviews/statistical-review-2026-09-08/server.tmp.ts
```

原始截图、PDF 页面渲染及日志保存在 `test-results/statistical-review-2026-09-08/`。该目录由仓库忽略规则排除，跨环境移交报告时需另带附件。

## 统计专项测试

```sh
node_modules/.bin/bun test --isolate src/domain/statistics src/student/sampling.test.ts src/student/experiment/sample-plan.test.ts src/student/experiment/analysis-metrics.test.ts src/student/experiment/advanced-plan.test.ts src/student/experiment/sampling-service.test.ts src/student/experiment/systematic-sampling.test.ts src/student/components/stratified-allocation.test.ts src/student/statistical-quality-gates.test.ts
```

报告中的独立积分检查与现有单元测试是不同的验证来源；`observations.json` 同时保留问题反例和通过检查的汇总结果。

## 二次确认

`recheck.ts.txt` 从实际 CSV 解析、映射校验、抽样服务、结果压缩及回放、阶段完成处理器进入，另用独立的整数纳入概率实现复核 PPS 设计分布。

```sh
cp docs/reviews/statistical-review-2026-09-08/recheck.ts.txt docs/reviews/statistical-review-2026-09-08/recheck.tmp.ts
node_modules/.bin/bun docs/reviews/statistical-review-2026-09-08/recheck.tmp.ts
rm docs/reviews/statistical-review-2026-09-08/recheck.tmp.ts
```

结果写入 `recheck-observations.json`。不依赖浏览器附件时执行 38 项断言；若本地已存在本次保存的 `recheck-cost-applied.json` 和 `recheck-negative-cost-applied.json`，会额外检查两份真实操作产生的快照，共 40 项。浏览器 JSON 存在于上文所述 `test-results/statistical-review-2026-09-08/` 中。

二次浏览器复现使用 `recheck-browser.tsx.txt`、`recheck-browser.html.txt`、`recheck-server.ts.txt`，分别复制为同目录的 `recheck-browser.tmp.tsx`、`recheck-browser.tmp.html`、`recheck-server.tmp.ts`，用 Bun 启动最后一个文件，监听 `127.0.0.1:3119`。

默认页直接加载项目的 `DecisionPhase`。打开“高级工具（可选）→成本权衡”，将工具内的无回答率调为 50% 可复现 F01；保留默认抽样假设，在“自定义成本参数”中输入 -1000、-5、-500 可复现 F04。点击应用后，页面底部 `#review-output` 显示实际回传的参数、来源与快照。`case=snapshot`、`case=precision`、`case=fpc` 分别加载对应真实展示组件。

沿用命名会话的 agent-browser 操作方式。结束后关闭会话、停止临时服务并删除复制出的 `.tmp.*` 文件。两个浏览器场景均只修改复现页内存中的数据。

## 修复后证据

`fix-applied-cost-snapshot.json` 是实际决策组件应用后得到的输入与结果；`fix-boundary-results.json` 记录该快照通过服务端阶段提交边界且保留 `feasible=false`，以及负误差、负成本等反例被拒绝。`fix-pps-performance.json` 是本机单次性能抽查，不是性能保证。

修复后的可重复回归断言位于 `src/domain/statistics/second-review-regressions.test.ts`、`src/student/experiment/cost-plan.test.ts`、`src/student/experiment/advanced-plan.test.ts`、`src/components/AdvancedPlanDetails.test.tsx` 和 `src/student/components/statistical-planning-regressions.test.tsx`；使用 `bun run test:unit` 执行。
