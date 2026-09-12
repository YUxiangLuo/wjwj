# 抽样调查虚拟仿真实验平台

面向统计学课堂的抽样教学系统：学生完成问卷预试、样本量规划、概率抽样与分析报告；教师配置实验、发布任务和批改；管理员维护学期、班级与账号。

**使用边界：受信任内网、桌面端、浅色主题、单实例部署。** 时间按中国标准时间（UTC+8）展示。总体文件必须使用合成或充分脱敏的数据，不能上传不应向全班披露的个人信息。

## 功能与入口

| 入口 | 路径 | 主要功能 |
| --- | --- | --- |
| 学生端 | `/student` | 任务大厅、四阶段实验、提交与成绩 |
| 教师端 | `/teacher` | 实验模板与总体数据、班级名单、任务、批改与成绩导出 |
| 管理端 | `/admin` | 学期、教师、班级、学生和公告 |

根路径 `/` 跳转到学生端。教师配置可复用的**实验模板**，分配到班级后成为**实验任务**，学生在任务中形成个人的**学生实验**。

支持简单随机、系统、PPS 和分层抽样；主要研究目标是完整有限总体中的一个数值均值或一个明确类别比例。**问卷仅用于预试教学，分析使用教师上传的总体表，不使用试填答案。** 流程规则见[教学与账号指南](docs/TEACHING.md)，支持范围见[课题模型](RESEARCH_MODEL.md)。

## 快速启动

需要 Bun **1.4.0** 和 PostgreSQL；迁移角色须能创建 `citext` 扩展。Bun 自动读取 `.env`。

```sh
bun install
cp .env.example .env        # 设置 DATABASE_URL，指向空数据库
bun run db:migrate
bun run db:bootstrap-admin # 只创建首个管理员，不写演示数据
bun run dev
```

访问 `http://127.0.0.1:3000/student`、`/teacher` 或 `/admin`。生产启动：

```sh
bun run start              # 先构建前端，再以生产模式启动
```

**已有数据库先读 [DATABASE.md](DATABASE.md)，不要执行 reset 尝试升级。** 生产管理员默认生成一次性显示的随机初始密码；学生/教师初始化与重置密码规则见 [SECURITY.md](SECURITY.md)。

开发模式默认开启开发鉴权及账号预填，真实账号验收应设 `DEV_AUTH_MODE=0`。演示数据与 `start:demo` 仅用于内部演示，准备方法见[演示指南](docs/DEMO.md)；不要公开部署 demo 模式。

## 开发与验证

```sh
bun run dev                # 热更新
bun run build              # 生产前端输出到 dist/
bun run verify             # 类型/样式、文档、单测、构建、迁移文件、依赖门禁
bun run test:db            # 真实数据库测试，需独立 TEST_DATABASE_URL
bun run test:teaching      # agent-browser 教学闭环，需可创建临时库的测试角色
```

`verify` 不代替真实数据库测试或浏览器验收：

- 单测：`bun run test:unit`；随机顺序：`bun run test:unit:random`。未设置 `REQUIRE_TEST_DATABASE=1` 时跳过真实数据库用例。
- 数据库：`test:db` 自动要求真实库；`TEST_DATABASE_URL` 必须指向独立、已迁移、可丢弃的库，不回退到 `DATABASE_URL`。准备方式见 [DATABASE.md](DATABASE.md)。
- 浏览器：先 `bun node_modules/agent-browser/bin/agent-browser.js install`（Linux CI 可加 `--with-deps`）。`test:teaching` 使用测试连接创建随机临时库与存储目录，需建库权限，结束后删除；覆盖四阶段、提交、驳回重交、评分、导出和失败恢复。
- 截图与结果写入 `test-results/teaching-flow/`（可用 `TEACHING_TEST_ARTIFACTS` 修改），属于可删除的生成物，不提交到仓库，也不维护历史测试报告文档。
- PR CI 执行 verify、数据库测试及默认 seed 校验；随机测试在 PR 中非阻塞。nightly 执行随机测试和浏览器教学闭环。

样式修改运行 `bun run check:styles`；UI 上游比较使用 `bun run audit:shadcn [组件]`，不要覆盖本地 fork。依赖变更同时运行 `bun audit` 与 `bun run audit:applicable`。

## 技术与目录

单一 `Bun.serve` 进程提供三个独立 SPA 和同源 API。前端使用 React 19、React Router 7、Tailwind 4；后端使用 PostgreSQL、Drizzle 与 `bun:sql`，无 Express / Vite。

```text
src/index.ts              服务入口与路由
src/student/              学生 SPA、API 与实验应用服务
src/teacher/              教师 SPA、API 与模板/任务服务
src/admin/                管理 SPA 与 API
src/domain/experiment/    跨端实验合同与结果类型
src/domain/statistics/    抽样、总体统计与分方法分析
src/server/               HTTP、会话、文件及 Worker 基础设施
src/db/                   表结构、迁移、初始化与演示 seed
src/components/           共享组件与本地 UI primitives
styles/theme.css          三端唯一主题源
public/templates/         上传及问卷模板
storage/                  总体文件与附件（需与数据库配套备份）
```

`src/domain/` 不依赖页面、数据库或文件系统，边界有自动测试。共享计算应直接引用领域模块。开发约定见 [AGENTS.md](AGENTS.md)。

## 文档导航

| 要做的事 | 文档 |
| --- | --- |
| 了解实验流程、模板冻结和账号生命周期 | [教学与账号指南](docs/TEACHING.md) |
| 备课：研究目标、变量和数据限制 | [课题模型兼容范围](RESEARCH_MODEL.md) |
| 配置环境、了解容量与发布检查 | [运行与部署](docs/OPERATIONS.md) |
| 建库、迁移、备份恢复与文件清理 | [数据库操作](DATABASE.md) |
| 理解鉴权、数据披露及依赖风险 | [安全边界](SECURITY.md) |
| 修改主题、样式和共享组件 | [设计系统](DESIGN_SYSTEM.md) |
| 准备演示账号、固定数据和扩充课题 | [演示指南](docs/DEMO.md) |

维护原则：规则只在对应专题维护，README 保留摘要与链接；测试结果以本次执行为准，不保留一次性计划、复盘或验收产物。
