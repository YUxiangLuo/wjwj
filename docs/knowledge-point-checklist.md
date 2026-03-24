# 第七章《样本量的确定》知识点实现检查清单

## 文档结构
- **第1页**: 封面 ✓
- **第2页**: 学习目的（6项）
- **第3页**: 目录（3节）
- **第4-14页**: 第一节 影响样本量确定的因素
- **第15-20页**: 第二节 不同抽样方式下样本量确定
- **第21-34页**: 第三节 分层抽样样本量的分配
- **第35页**: 本章小结
- **第36-37页**: 课后作业

---

## 知识点详细检查

### 【第2页】学习目的（6项）

| 序号 | 学习目的 | 实现状态 | 代码位置 |
|------|---------|---------|---------|
| 1 | 掌握简单随机抽样样本量的计算方法 | ✅ 已实现 | `sample-plan.ts:calculateFinitePopulationSampleSize()` + `calculateMeanEstimationSampleSize()` |
| 2 | 熟悉精度的表示与计算 | ✅ 已实现 | `PrecisionPhase.tsx` (沉浸式教学) + `EnhancedMetricsCard.tsx` (SE, CV, 置信区间) |
| 3 | 掌握确定精度需要考虑的因素 | ✅ 已实现 | `FactorsPhase.tsx` (沉浸式教学 5 子步骤) + `DomainEstimationManager.tsx`, `PrecisionCostTradeoff.tsx` |
| 4 | 理解影响样本量的各个因素 | ✅ 已实现 | `FactorsPhase.tsx` + `DesignEffectEstimator.tsx` (deff, 回答率) |
| 5 | 掌握分层抽样样本量的分配方法 | ✅ 已实现 | `StratifiedAllocationComparison.tsx` (6种方法对比) |
| 6 | 掌握其他随机抽样样本量的计算方法 | ✅ 完全实现 | 简单随机、系统、PPS、分层、整群抽样均已实现 |

**结论**: 6项全部完全实现 ✅

---

### 【第3页】目录 - 3节内容

| 节 | 标题 | 实现状态 | 备注 |
|---|------|---------|------|
| 第一节 | 影响样本量确定的因素 | ✅ 完全实现 | `PrecisionPhase` + `FactorsPhase` 沉浸式教学 |
| 第二节 | 不同抽样方式下样本量确定 | ✅ 完全实现 | `FormulaPhase`(均值+比例) + `FourStepPhase`(四步法) |
| 第三节 | 分层抽样样本量的分配 | ✅ 完全实现 | 6种分配方法 + 超额分配处理 |

---

### 【第4-6页】第一节 - 精度的表示方法

| 知识点 | 文档页码 | 实现状态 | 代码体现 |
|--------|---------|---------|---------|
| 标准误差 (Standard Error) | 第5页 | ✅ 已实现 | `PrecisionPhase.tsx` (沉浸式教学) + `EnhancedMetricsCard.tsx` |
| 误差界限 (Margin of Error) | 第5页 | ✅ 已实现 | `PrecisionPhase.tsx` + `FormulaPhase.tsx: step=e` |
| 变异系数 (CV / RSE) | 第5页 | ✅ 已实现 | `PrecisionPhase.tsx` + `EnhancedMetricsCard.tsx` |
| 置信区间计算与解释 | 第6页 | ✅ 已实现 | `PrecisionPhase.tsx` (直观解释) + `EnhancedMetricsCard.tsx` |
| 置信度含义（95%置信区间） | 第6页 | ✅ 已实现 | `PrecisionPhase.tsx`："100次调查中约95次包含真值" |

---

### 【第7-14页】第一节 - 确定精度需要考虑的因素

| 知识点 | 文档页码 | 实现状态 | 代码体现 |
|--------|---------|---------|---------|
| **允许多大的误差限** | 第8页 | ✅ 已实现 | `FactorsPhase.tsx: error_tolerance` (沉浸式教学) + `FormulaPhase.tsx: step=e` |
| **是否需要子总体估计** | 第9页 | ✅ 已实现 | `FactorsPhase.tsx: subpopulation` (方案1 vs 方案2) + `DomainEstimationManager.tsx` |
| 子总体样本量计算 | 第9页 | ✅ 已实现 | 每个域独立计算后取max |
| 不同层精度差异（上层高、下层低） | 第9页 | ✅ 已实现 | 可在DomainManager中设置不同误差限 |
| **调查估计值有关的抽样方差** | 第11页 | ✅ 已实现 | `FactorsPhase.tsx: variability` (多指标时的处理) + `calculateVariance()` |
| **需要在精度和费用间平衡** | 第12页 | ✅ 已实现 | `FactorsPhase.tsx: cost_balance` (边际递减可视化) + `PrecisionCostTradeoff.tsx` |
| 精度-成本曲线（边际效益递减） | 第12页 | ✅ 已实现 | `FactorsPhase.tsx` 柱状图 + `PrecisionCostTradeoff.tsx` |
| **调查的回答率** | 第14页 | ✅ 已实现 | `FourStepPhase.tsx: scenario=nrr` + `DesignEffectEstimator.tsx` |

---

### 【第15-20页】第二节 - 不同抽样方式下样本量确定

| 知识点 | 文档页码 | 实现状态 | 代码体现 |
|--------|---------|---------|---------|
| 比例估计样本量公式 | 第16页 | ✅ 已实现 | `FormulaPhase.tsx` (比例估计模式) + `sample-plan.ts: n₀ = Z²p(1-p)/E²` |
| **均值估计样本量公式** | 第16页 | ✅ **新增** | `FormulaPhase.tsx` (均值估计模式) + `sample-plan.ts: calculateMeanEstimationSampleSize()` |
| 有限总体校正 | 第16页 | ✅ 已实现 | `FPCPhase.tsx` + `n₁ = n₀ / (1 + (n₀ - 1) / N)` |
| 无限总体/重复抽样情形 | 第17页 | ✅ 已实现 | 当N很大时自动趋近n₀ |
| **设计效应(deff)调整** | 第18页 | ✅ 已实现 | `FourStepPhase.tsx: scenario=deff` (Step 3) |
| **回答率调整** | 第18页 | ✅ 已实现 | `FourStepPhase.tsx: scenario=nrr` (Step 4) |
| **四步法确定样本量** | 第18页 | ✅ **新增** | `FourStepPhase.tsx: scenario=summary` (结构化四步展示) |
| 分层抽样不同要求对比（方案1 vs 方案2） | 第19-20页 | ✅ **增强** | `FourStepPhase.tsx: summary` (方案对比卡片) + `FactorsPhase.tsx: subpopulation` |
| 总样本量 vs 各层样本量关系 | 第20页 | ✅ 已实现 | 方案1 vs 方案2 倍数对比 |

---

### 【第21-34页】第三节 - 分层抽样样本量的分配

| 知识点 | 文档页码 | 实现状态 | 代码体现 |
|--------|---------|---------|---------|
| **总样本量固定时的分配准则** | 第23页 | ✅ 已实现 | `StratifiedAllocationComparison.tsx` 核心功能 |
| 给定变异系数确定总样本量 | 第24页 | ✅ 已实现 | `CVBasedSampleSizeCalculator.tsx` |
| **按比例分配** | 第25页 | ✅ 已实现 | `calculateProportionalAllocation()` |
| 与N成比例、与N的平方根成比例 | 第25页 | ✅ 已实现 | 按比例分配 + `calculateSquareRootAllocation()` |
| **与 Nh×Yh 成比例分配** | 第25页 | ✅ **新增** | `sample-plan.ts: calculateSizeMeasureAllocation()` + `StratifiedAllocationComparison.tsx` |
| **与 √(Nh×Yh) 成比例分配** | 第25页 | ✅ **新增** | `sample-plan.ts: calculateSqrtSizeMeasureAllocation()` + `StratifiedAllocationComparison.tsx` |
| **奈曼分配（Neyman）** | 第27页 | ✅ 已实现 | `calculateNeymanAllocation()` |
| 最优分配（考虑费用） | 第28页 | ✅ 已实现 | `calculateOptimalAllocationWithCost()` |
| **方差相等时的最优分配** | 第30页 | ✅ 已实现 | 等额分配即为此情况 |
| **超额分配（Over-allocation）** | 第31页 | ✅ 已实现 | `detectOverAllocation()` 完整检测与处理 |
| 超额分配层的全数调查处理 | 第33页 | ✅ 已实现 | 自动设为n_h = N_h |
| **多个变量的分配** | 第34页 | ✅ 已实现 | `MultiVariableSamplePlan.tsx` 完整实现 |
| 变量主次之分 | 第34页 | ✅ 已实现 | primary/secondary/tertiary重要性分级 |

---

## 沉浸式教学流程覆盖（重构后）

重构后的沉浸式样本量规划流程按课件三节结构编排：

| Phase | 课件页码 | 内容 | 状态 |
|-------|---------|------|------|
| `challenge` | — | 猜样本量，建立直觉 | ✅ 保留 |
| `precision` (新增) | 5-6页 | SE/ME/CV 三指标 + 置信区间含义 | ✅ **新增** |
| `factors` (新增) | 7-14页 | 四个影响因素（误差限/子总体/变异/成本），5个子步骤 | ✅ **新增** |
| `formula` (增强) | 16-17页 | 比例估计 + 均值估计双公式，可切换 | ✅ **增强** |
| `fpc` | 16页 | 有限总体校正 | ✅ 保留 |
| `fourstep` (重构) | 18-20页 | 四步法（n₀→FPC→deff→NRR）+ 方案对比 | ✅ **重构** |
| `decision` | — | 高级工具 + 最终决策 | ✅ 保留 |
| `quiz` (增强) | — | 7题自检（精度/置信水平/总体规模/deff/子总体/奈曼/边际递减） | ✅ **增强** |
| `confirm` | — | 确认保存 | ✅ 保留 |

---

## 核心功能覆盖率统计

### 完全实现（✅）
- 基础样本量计算（比例估计 + **均值估计**）
- 精度指标（SE、CV、置信区间）— **沉浸式教学**
- 确定精度的四个考虑因素 — **沉浸式教学**
- 四步法样本量确定（n₀→FPC→deff→NRR）— **结构化展示**
- 方案对比（整体估计 vs 域估计）— **教学案例**
- 敏感性分析（置信度×误差限热力图）
- 子总体/域估计支持
- 精度-成本权衡分析
- 设计效应与回答率估算器
- 分层抽样 **6** 种分配方法对比（按比例/奈曼/等额/平方根/Nh×Yh/√(Nh×Yh)）
- 超额分配检测与自动处理
- 多变量样本量规划

### 部分实现（⚠️）
- 多阶段抽样详细执行流程（有计算公式，可在整群抽样计算器调整deff模拟）

### 未实现（❌）
无 - 所有文档知识点均已实现 ✅

---

## 总体评估

**文档知识点覆盖率：~100%**

**已实现的核心教学价值：**
1. ✅ 理解精度指标（SE、CV、置信区间）及其关系 — 沉浸式 PrecisionPhase
2. ✅ 掌握确定精度的四个考虑因素 — 沉浸式 FactorsPhase（5子步骤）
3. ✅ 比例估计与均值估计双公式教学 — FormulaPhase 可切换
4. ✅ 四步法确定样本量 — FourStepPhase 结构化展示
5. ✅ 方案对比（整体 vs 域估计）— FourStepPhase + FactorsPhase
6. ✅ 权衡精度与成本（边际效益递减可视化）
7. ✅ 比较6种分层分配方法（+Nh×Yh、√(Nh×Yh)）
8. ✅ 处理超额分配（全数调查自动处理）
9. ✅ 多变量调查样本量规划（主次变量分级）
10. ✅ 基于CV的样本量计算（相对精度指标）
11. ✅ 整群抽样样本量计算（群内相关系数ρ估计）
12. ✅ 7题自检覆盖全章知识点

---

## 更新记录

**最后更新：2026-03-24**

**课件对齐重构（本次）：**
- 新增 `PrecisionPhase.tsx` — 精度指标教学（课件5-6页）
- 新增 `FactorsPhase.tsx` — 四因素教学（课件7-14页，5子步骤）
- 增强 `FormulaPhase.tsx` — 均值/比例估计切换（课件16-17页）
- 重构 `RealWorldPhase` → `FourStepPhase.tsx` — 四步法 + 方案对比（课件18-20页）
- 扩充 `QuizPhase.tsx` — 从3题扩充到7题
- 新增 `calculateMeanEstimationSampleSize()` + `calculateMeanSampleSizeMetrics()` — 均值估计
- 新增 `calculateSizeMeasureAllocation()` + `calculateSqrtSizeMeasureAllocation()` — 两种新分配方法
- 扩展 `SamplePlanData` 类型 — 新增 `estimationType` 和 `populationVariance` 字段
- 更新 Phase 状态机 — 新增 `precision`、`factors` phase，重命名 `realworld` → `fourstep`
- 更新分层分配对比组件 — 从4种方法扩展到6种

**历史更新：**
- **阶段1** (commit 5927a64): 增强样本量计算模块 - SE、CV、置信区间、敏感性分析
- **阶段2** (commit 15ff300): 子总体估计、成本权衡、设计效应估算器
- **阶段3** (commit b52523c): 多变量规划、超额分配检测与处理
- **阶段3补充** (commit 981913d): 超额分配与抽样执行联动
- **阶段3完成** (commit c4b9023): CV-based计算、整群抽样、平方根分配、费用最优分配
