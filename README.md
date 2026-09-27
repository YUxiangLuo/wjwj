# 抽样调查虚拟仿真实验平台

面向统计学课堂的抽样教学系统。学生完成问卷预试、样本量规划、概率抽样和分析报告；教师配置与批改实验；管理员维护学期、班级和账号。

**边界：受信任内网、桌面端（支持下限 1024×768）、浅色主题、单实例部署。** 时间按中国标准时间（UTC+8）展示。总体文件只能使用合成或充分脱敏数据。

## 入口与范围

| 入口 | 路径 | 用途 |
| --- | --- | --- |
| 学生端 | `/student` | 四阶段实验、提交与成绩 |
| 教师端 | `/teacher` | 模板、任务、班级、批改与导出 |
| 管理端 | `/admin` | 学期、教师、班级、学生与公告 |

支持简单随机、系统、PPS 和分层抽样；主要目标限完整有限总体中的一个数值均值或明确类别比例。问卷只用于预试，分析使用教师上传的总体表。详见[教学指南](docs/TEACHING.md)和[课题模型](RESEARCH_MODEL.md)。

## 启动

需要 Bun **1.4.2**、PostgreSQL，以及可创建 `citext` 扩展的迁移角色。Bun 自动读取 `.env`。

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
bun run test:teaching      # 浏览器教学闭环；需测试角色可创建临时库
bun run test:compatibility # 8 种主题 × CSV/XLSX × 3 种样本量，含师生结果页面核对
bun run ci:local           # 本地推送门禁；自动创建并删除一次性测试库
bun run ci:local:full      # 发布前完整门禁；额外执行随机顺序和浏览器闭环
```

`verify` 不代替真实数据库测试和浏览器验收。样式修改运行 `bun run check:styles`；依赖变更同时运行 `bun audit` 与 `bun run audit:applicable`。测试库准备见 [DATABASE.md](DATABASE.md)。

首次运行浏览器测试先执行 `bun node_modules/agent-browser/bin/agent-browser.js install`（Linux 可加 `--with-deps`）。教学测试自动创建并删除临时库和存储，产物在 `test-results/teaching-flow/`。

兼容性测试同样使用可创建临时库的 `TEST_DATABASE_URL`，独立计算点估计和设计标准误，核对教师发布、学生抽样/分析/提交、教师评分及双方导出。产物默认位于 `.amp/in/artifacts/topic-compatibility/`，可用 `COMPATIBILITY_ARTIFACTS` 指定目录。

本项目不使用 GitHub Actions。执行 `bun run hooks:install` 可启用仓库内的 `pre-push` hook，在每次推送前自动运行 `ci:local`；克隆后需安装一次。`TEST_DATABASE_URL` 仅作为创建临时库的基准连接，其角色须有 `CREATE DATABASE` 权限，脚本不会迁移、清空或写入该基准库。发布前另行运行 `ci:local:full`。

测试保留统计边界、权限与会话、事务并发、文件安全、草稿/提交恢复及关键无障碍行为；普通展示、文案和演示数据快照不单独锁定。端到端测试负责教学闭环，不逐页重复同一规则。

## 架构与文档

单一 `Bun.serve` 进程提供三个 React SPA 和同源 API；后端使用 PostgreSQL、Drizzle 与 `bun:sql`。`styles/theme.css` 是三端唯一主题源。

| 专题 | 文档 |
| --- | --- |
| 四阶段、模板冻结、账号与删除 | [教学指南](docs/TEACHING.md) |
| 研究目标、变量和统计边界 | [课题模型](RESEARCH_MODEL.md) |
| 环境、容量与发布 | [运行与部署](docs/OPERATIONS.md) |
| 迁移、危险操作、备份恢复 | [数据库操作](DATABASE.md) |
| 鉴权、数据披露与依赖风险 | [安全边界](SECURITY.md) |
| 主题、样式与共享组件 | [设计系统](DESIGN_SYSTEM.md) |
| 发布前高风险人工验收 | [高风险测试检查清单](docs/TESTER_RISK_CHECKLIST.md) |
| 统计公式、抽样设计与解释验收 | [统计学专业验收清单](docs/STATISTICAL_TEST_CHECKLIST.md) |
| 多轮真实使用、统计红队与恢复演练 | [全面深度 Dogfood 测试计划](docs/DOGFOOD_TEST_PLAN.md) |
| 教师工作流、冻结、批改与导出验收 | [教师端专项 Dogfood 测试计划](docs/TEACHER_DOGFOOD_TEST_PLAN.md) |

开发约定见 [AGENTS.md](AGENTS.md)。专题文档是对应规则的唯一事实来源，不维护历史测试快照。
