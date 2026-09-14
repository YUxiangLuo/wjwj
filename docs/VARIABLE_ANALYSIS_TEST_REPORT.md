# 变量分析前四阶段：深度测试执行报告

本报告记录 [测试规划](VARIABLE_ANALYSIS_TEST_PLAN.md) 的执行结果。基线为 `8fb7b1c`，执行期间按“测试暴露问题 → 单独最小修复”的方式新增 6 个测试提交与 4 个修复提交。补做阶段（R05/R07、双窗口、空功能路径、键盘/窄屏）完成后，规划中列出的未覆盖项除一项视觉排版外均已落地。

## 环境与版本

| 项 | 值 |
| --- | --- |
| 代码版本 | `8fb7b1c` + 本报告所列提交；`git log --oneline 8fb7b1c..HEAD` 可复现 |
| Bun | 本地 1.4.2，项目锁定 1.4.0（`packageManager`/CI） |
| PostgreSQL | 17.11，测试库 `wjwj_testplan_0914`（一次性，独立于开发库） |
| 浏览器 | agent-browser 0.36.0 + Chrome 153（E2E，独立临时库 `wj_browser_*`） |
| 随机种子 | `bun run test:unit:random` 使用仓库固定种子 `20260903`；属性测试 `20260914` |
| 截图与日志 | `test-results/teaching-flow/`（E2E 产物） |

## 命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 通过（tsc + 17 类样式规则 0 违规） |
| `bun run check:docs` | 通过 |
| `bun run test:unit` | **1265 pass / 47 skip / 0 fail**（1312 tests，215 files） |
| `bun run test:unit:random` | **4/4 次 1265 pass / 0 fail**（每次 47 skip）；修复新 DOM 测试的调度器清理后无中间错误 |
| `bun run test:db` | **47 pass / 0 fail**，连续 3 次以上稳定（5 个实库文件，含新增 2 个） |
| `bun run test:teaching` | **14 项 PASS**（含双窗口冲突、空功能路径与键盘路径） |
| `bun run verify` | 通过（typecheck + 样式 + 文档 + 单测 + 构建 + 迁移 + 依赖门禁） |
| `bun run build` | 通过：student 144.6 KB / teacher 130.5 KB / admin 125.7 KB 首屏 gzip，低于 350 KB 预算 |
| `bun run db:check` | `Everything's fine` |
| 生产冒烟（`NODE_ENV=production` + `dist/`） | 三入口 200、`/` 302、未登录 API 401 JSON + CSP/no-store、跨站 POST 403、静态资源 gzip 200 |
| 空库迁移契约 | 新建空库迁移成功；`saved_analysis` 唯一键/`ON DELETE CASCADE`/`generation >= 0`、`analysis_references='[]'`、`sampling_generation=0`、`variable_revision=0` 均符合预期 |
| `scripts/benchmark-analysis.ts` | 100k 行、4 并发分析：主线程 918ms（ping p95 865ms）；Worker 冷启 822ms（ping p95 8ms）；热缓存 80ms（ping p95 0ms），远低于 30s 硬限 |

## 覆盖对照（按规划 ID）

| 批次 | ID | 新增/扩展测试 |
| --- | --- | --- |
| T1 | F1–F4、F7、A01–A02 | `src/domain/variables/variables.test.ts` |
| T1 | F5、F6 | `src/domain/variables/design-weights.test.ts` |
| T1 | PPS 端到端（种子/索引/概率/估计一致） | `src/domain/statistics/sampling.test.ts` |
| T1 | D01、D03、D07、Q06 | `src/server/variable-source.test.ts`（新文件，真实 CSV/XLSX 解析） |
| T1 | D02、D06 | `src/domain/variables/variables.test.ts` |
| T1 | Q01 | `src/student/components/ImmersiveQuestionnairePreview.test.tsx` |
| T1 | Q02 | `src/lib/validate-question.test.ts` |
| T1 | Q03–Q05（领域） | `src/domain/variables/question-binding.test.ts` |
| T1 | A03 | `src/student/experiment/univariate-job.test.ts` |
| T1 | A04 | `src/student/routes/analyses.route.test.ts`（新文件，真实路由 + 严格请求形状） |
| T1 | 属性测试 | `src/domain/variables/analysis-properties.test.ts`（重排/权重缩放/单位变换/分类一致性） |
| T2 | A05–A07、R01、R03、R04、R05、R07 | `src/db/variable-analysis.integration.test.ts` |
| T2 | D02、D04、D05（含 20 轮并发保存） | `src/db/variable-dictionary.integration.test.ts`（新文件） |
| T2 | HTTP 权限与输入攻击 | `src/db/variable-permissions.integration.test.ts`（新文件，真实 Cookie/路由） |
| T3 | Worker 失败链路、杜绝失败落库、提交中断重试 | `src/student/experiment/univariate-service.test.ts`、`src/db/variable-analysis.integration.test.ts` |
| T3 | A08、D06（UI） | `AnalysisReport.workspace.test.tsx`、`src/teacher/components/VariableDictionaryEditor.test.tsx` |
| T3 | 上游失效与过期引用门禁（浏览器） | `scripts/test-teaching-flow.ts` 扩展 |
| T3 | 双窗口冲突恢复、空功能路径、键盘与窄屏 | `scripts/test-teaching-flow.ts` 扩展 |
| T3 | 数值题 Enter 续答 | `ImmersiveQuestionnairePreview.tsx` 修复 + 回归测试 |
| T4 | 全套门禁、性能、生产与迁移冒烟 | 本报告“命令与结果” |

`test:db` 已接入两个新增实库文件（`package.json`），缺少 `TEST_DATABASE_URL` 时按 blocked 处理，不计通过。

## 发现并修复的问题

| 编号 | 问题 | 修复提交 |
| --- | --- | --- |
| F6 | 设计权重接受伪造的入样概率 `π > 1` 并静默产生小于 1 的权重 | `c5eb7e0` |
| Q02 | 数值题配置经 `Number()` 把布尔/数组/对象/null 强转成 0/1 后接受 | `c64d3f4` |
| D01 | CSV 空单元被建议为空标签类别，随后被自身校验拒绝，字典无法确认 | `22fd7f3` |
| Q01 键盘 | 数值题提示承诺“按 Enter 继续”，但处理器忽略文本输入中的 Enter | `17638f8` |

测试与回归分别位于对应测试文件；修复仅改动相关校验，无其他行为变化。

## 观察与未决事项

- **A06 截止时刻语义（待产品确认）**：请求在截止前受理、写锁等待中跨过截止时刻仍会落库（与阶段完成路径的 admit-once 约定一致）。测试 `A06 (open) a deadline crossing…` 固定当前行为并标注问答。
- **R7 分位数浮点**：定标归一化带来 ≤2e-16 相对误差（如 5.499999999999999）；按规划 §3 容差断言，不锁十进制字面量。
- **PPS 边界浮点**：系统抽样在累计概率的精确边界处受浮点求和影响；边界是连续随机起点的测度零事件，测试改为断言边界两侧 1e-9 偏移的确定行为。
- **随机顺序基线抖动**：在未包含本轮新测试时曾观测到 1 次与顺序/时序相关的失败；本轮套件连续 3 次通过。随机顺序在 CI 中仍为非阻塞信号。
- **窄屏辅助信息（观察）**：1024px 下报告正文与提交路径可用且不溢出，但右侧“随手查结果”辅助卡片会被裁切并需要横向滚动；桌面端为声明目标，未按缺陷处理。是否要支持 1024px 完整布局属于产品取舍。
- **仍未自动化**：10 条附录的页面排版（容量与引用上限已由 A07/R01 覆盖，冻结附录由 R04 与 E2E 覆盖，仅未做 10 条同屏视觉断言）；随机顺序套件在不含本轮新测试时曾出现 1 次时序抖动（CI 仍为非阻塞信号）。

## 资源与清理

- 保留：开发服务器 `127.0.0.1:3100`（本轮启动，供继续体验）。
- 一次性测试库 `wjwj_testplan_0914`（`createdb` + `bun run db:migrate` 可重建）；`test:teaching` 创建的临时库与工作目录已自动删除。
- 为运行教学 E2E，`ALTER ROLE wjwj_dev CREATEDB`（可 `NOCREATEDB` 撤销）。
- 生成文件仅位于 `test-results/`（gitignored）与 `/tmp`。
