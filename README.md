# 商务统计虚拟仿真实验平台

面向商务统计与商业数据分析课程的全闭环仿真教学平台。学生围绕真实商业管理决策问题，完整执行「商业问卷设计 → 首轮试投发放 → 回收质检与诊断 → 调整思路与二轮投放 → 商务分析与决策报告」五阶段多波次调研闭环；教师配置商业案例模板、虚拟发放环境并开展多波次轨迹批改；管理员维护学期、班级、师生账号与系统公告。

**边界：受信任内网、桌面端（支持下限 1024×768）、现代商务智能浅色主题、单实例部署。** 时间按中国标准时间（UTC+8）展示。总体文件只能使用合成或充分脱敏商业数据。

## 入口与范围

| 入口 | 路径 | 用途 |
| --- | --- | --- |
| 学生端 | `/student` | 五阶段多波次商业调研闭环、质检清洗、客群交叉分析与决策报告 |
| 教师端 | `/teacher` | 商业案例模板、虚拟投放参数、任务分配、闭环轨迹批改与导出 |
| 管理端 | `/admin` | 学期、教师、班级、学生与全局公告治理 |

支持简单随机、系统、PPS 和分层抽样；支持基于 `dispatchSeed` 的确定性虚拟受访者问卷发放回收、闪电卷/直线卷交互质检清洗、基于框内分层规模的事后无回答权重校准对照，以及细分客群交叉对比分析（Subgroup Cross-tab）。详见[教学指南](docs/TEACHING.md)、[课题模型](RESEARCH_MODEL.md)与[内置商业案例目录](docs/DEMO_EXPERIMENT_CATALOG.md)。

## 启动

需要 Bun **>= 1.4.2**、PostgreSQL，以及可创建 `citext` 扩展的迁移角色。Bun 自动读取 `.env`。

```sh
bun install
cp .env.example .env       # 设置 DATABASE_URL，指向空数据库
bun run db:migrate
bun run db:bootstrap-admin
bun run dev
```

访问 `http://127.0.0.1:3000/student`、`/teacher` 或 `/admin`。生产运行 `bun run start`。

**已有数据库先读 [DATABASE.md](DATABASE.md)，绝不能用 reset 升级。** 开发环境默认开启开发鉴权；真实账号验收设 `DEV_AUTH_MODE=0`。演示模式会公开凭据，只能按[运行与部署](docs/OPERATIONS.md)中的内部演示流程使用。

## 验证

```sh
bun run test:unit          # 日常回归；按文件调试用 bun test --isolate <路径>
bun run verify             # 类型、样式、文档、单测、构建、迁移与依赖门禁
bun run test:db            # 需独立、已迁移、可丢弃的 TEST_DATABASE_URL
bun run test:teaching      # 浏览器五阶段闭环教学验收；需测试角色可创建临时库
bun run test:compatibility # 8 种主题 × CSV/XLSX × 3 种样本量 × 多波次统计对账
bun run ci:local           # 本地推送门禁；自动创建并删除一次性测试库
bun run ci:local:full      # 发布前完整门禁；额外执行随机顺序和浏览器闭环
```

`verify` 不代替真实数据库测试和浏览器验收。样式修改运行 `bun run check:styles`；依赖变更同时运行 `bun audit` 与 `bun run audit:applicable`。测试库准备见 [DATABASE.md](DATABASE.md)。

首次运行浏览器测试先执行 `bun node_modules/agent-browser/bin/agent-browser.js install`（Linux 可加 `--with-deps`）。教学测试自动创建并删除临时库和存储，产物在 `test-results/teaching-flow/`。

兼容性测试使用可创建临时库的 `TEST_DATABASE_URL`，独立计算点估计和设计标准误，核对教师发布、学生五阶段多波次抽样/发放/分析/提交、教师评分及双方导出。产物默认位于 `.amp/in/artifacts/topic-compatibility/`。

## 架构与文档

单一 `Bun.serve` 进程提供三个 React SPA 和同源 API；后端使用 PostgreSQL、Drizzle 与 `bun:sql`。`styles/theme.css` 是三端唯一主题源。

| 专题 | 文档 |
| --- | --- |
| 五阶段闭环、质检调优、模板冻结与账号管理 | [教学指南](docs/TEACHING.md) |
| 商业研究合同、虚拟发放、校准与统计边界 | [课题模型](RESEARCH_MODEL.md) |
| 五大内置商务统计标杆商业案例 | [默认商业案例目录](docs/DEMO_EXPERIMENT_CATALOG.md) |
| 环境、容量与发布 | [运行与部署](docs/OPERATIONS.md) |
| 迁移、危险操作、备份恢复 | [数据库操作](DATABASE.md) |
| 鉴权、数据披露与依赖风险 | [安全边界](SECURITY.md) |
| 商务智能浅色主题、图表组件与样式门禁 | [设计系统](DESIGN_SYSTEM.md) |
| 发布前高风险人工验收 | [高风险测试检查清单](docs/TESTER_RISK_CHECKLIST.md) |
| 统计公式、抽样设计与解释验收 | [统计学专业验收清单](docs/STATISTICAL_TEST_CHECKLIST.md) |
| 多轮真实使用、统计红队与恢复演练 | [全面深度 Dogfood 测试计划](docs/DOGFOOD_TEST_PLAN.md) |
| 教师工作流、冻结、批改与导出验收 | [教师端专项 Dogfood 测试计划](docs/TEACHER_DOGFOOD_TEST_PLAN.md) |

开发约定见 [AGENTS.md](AGENTS.md)。专题文档是对应规则的唯一事实来源。
