# 抽样调查虚拟仿真实验平台

面向统计学课堂的抽样调查实验系统。学生完成问卷设计、样本量规划、四种概率抽样和估计比较；教师发布课题与批改；管理员维护学期、班级和账号。

运行时是单一 `Bun.serve` 进程，挂三个独立 SPA：

| 入口 | 路径 | 用途 |
| --- | --- | --- |
| 学生端 | `/student` | 任务大厅、四阶段实验、提交与结果 |
| 教师端 | `/teacher` | 课题/总体数据、班级、任务发布、批改与成绩导出 |
| 管理端 | `/admin` | 学期、教师、班级、学生、公告 |
| 根路径 | `/` | 302 到 `/student` |

界面为桌面端、浅色主题，时间按中国标准时间（UTC+8）展示。

## 学生实验

每个开放任务走四个阶段，只在点击「完成并进入下一步」时落库：

1. **问卷设计**：欢迎语、题目、结束语，可用教师推荐题，需完成模拟填写。
2. **样本量规划**：比例或均值估计；Cochran \(n_0\)、有限总体校正 \(n_1=n_0/(1+(n_0-1)/N)\)，再按设计效应与无回答率膨胀，结果不超过总体规模 \(N\)。
3. **抽样执行**：同一规划样本量下做四种方法。
   - 简单随机
   - 系统抽样（允许分数间隔 \(K=N/n\)，抽满规划人数）
   - PPS（不放回 \(\pi\)ps，默认选名称像规模的字段；分析用 Hájek 加权均值）
   - 分层抽样（按比例 / 等额 / 奈曼；奈曼需要层内标准差，溢出后回灌）
4. **分析与报告**：方法对比、误差与代表性，撰写报告后提交。教师可评分或驳回重做。

## 技术栈

- **运行时**：Bun（`>=1.3.0`），不用 Node / Express / Vite
- **前端**：React 19、React Router 7、Tailwind 4，语义色写在 `styles/theme.css`
- **后端**：`src/index.ts` 里的 `Bun.serve` 路由
- **数据**：PostgreSQL（`citext`、`jsonb`），Drizzle + `bun:sql`
- **上传**：课题总体表仅支持 `.csv` / `.xlsx` 且不超过 20 MiB；附件落在 `storage/`（图片 10 MiB、文档 50 MiB、视频 120 MiB）

## 环境要求

- Bun `>= 1.3.0`
- PostgreSQL，且执行迁移的角色能 `CREATE EXTENSION citext`
- 复制 `.env.example` 为 `.env`，至少设置 `DATABASE_URL`

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 必填。Postgres 连接串 |
| `PORT` | 默认 `3000` |
| `HOST` | 默认 `0.0.0.0` |
| `NODE_ENV` | `production` 时从 `dist/` 提供前端，并默认关闭开发鉴权 |
| `DEV_AUTH_MODE` | 非生产环境中：`1` 强制开启开发鉴权，`0` 强制关闭。未设置时本地开发开启、`test` 关闭；`production` 始终关闭 |
| `SEED_ADMIN_PASSWORD` | 可选。覆盖 seed 管理员初始密码 |
| `TEST_DATABASE_URL` | 跑 `bun run test:db` 时使用的一次性库 |

开发鉴权开启时，三个登录页会预填演示账号，并跳过首次改密。`bun run start` / 生产构建会把前端的 `DEV_AUTH_MODE` 内联为 `"0"`，上课环境必须走改密门禁。不要用未构建的 `NODE_ENV=production bun src/index.ts`。

## 本地启动

```sh
bun install
cp .env.example .env   # 改成你的 DATABASE_URL
bun run db:migrate     # 空库；旧库见 DATABASE.md
bun run db:seed        # 或 bun run db:reset 清表后重建
bun run dev
```

浏览器打开：

- http://127.0.0.1:3000/student
- http://127.0.0.1:3000/teacher
- http://127.0.0.1:3000/admin

生产启动（先打包再跑）：

```sh
bun run start
```

等价于 `bun run build && NODE_ENV=production bun src/index.ts`。

## 默认 seed

`src/db/seeds/default.ts` 写入一学期、一个班、一份 200 人总体（年级 80/60/40/20）和四条任务。初始密码等于学号/工号；开发鉴权下管理员为 `admin` / `admin123`。关闭开发鉴权时管理员密码为随机值，除非设置了 `SEED_ADMIN_PASSWORD`。首次登录（开发鉴权关闭）必须改密：至少 8 位，含字母、数字和特殊字符，且不能包含学号/工号。

| 账号 | 角色 | 学生端状态 |
| --- | --- | --- |
| S010 林清 | 学生 | 未开始，完整闭环 |
| S011 周宁 | 学生 | 问卷已完成 |
| S012 吴敏 | 学生 | 已提交 |
| S013 郑华 | 学生 | 已批改 |
| S014 孙琪 | 学生 | 已驳回，可改后重交 |
| S015 马丽 | 学生 | 已停用（登录与错密同文案） |
| T001 张老师 | 教师 | — |
| admin | 管理员 | — |

任务：已开放的「校园学习体验抽样调查」、已截止练习、尚未开放课题、软删示范课题。推荐样本量在 95% / ±5% / deff=1 下为 132。

## 常用命令

```sh
bun run dev              # 热更新开发
bun run build            # 生产前端到 dist/
bun run start            # 构建 + 生产进程
bun run verify           # 类型/样式、单测、构建、迁移检查、依赖门禁
bun test                 # 单元测试
bun run typecheck        # tsc + 样式门禁
bun run check:styles     # 禁止调色板类、dark:、响应式断点
bun run db:generate      # 根据 schema 生成迁移
bun run db:migrate
bun run db:check
bun run db:reset         # 清本项目表 → 迁移 → seed（不删 storage/）
bun run storage:audit    # 只读检查孤立上传
bun run storage:clean    # 删除未被引用的上传
bun run test:db          # 需要 TEST_DATABASE_URL
bun audit && bun run audit:applicable
```

改表结构：编辑 `src/db/schema.ts` → `bun run db:generate` → 检查 `drizzle/postgresql` → `bun run db:migrate`。不要用 Drizzle Kit 的 `push` / `studio` / `drop`。

## 目录

```
src/index.ts          进程入口与路由
src/student/          学生 SPA 与 /api/student
src/teacher/          教师 SPA 与 /api/teacher
src/admin/            管理 SPA 与 /api/admin
src/student/sampling.ts
src/student/experiment/   样本量、抽样、分析、提交
src/db/               schema、迁移、seed
styles/theme.css      唯一主题源
public/templates/     教师上传模板
storage/              课题数据与附件
```

## 更多文档

- [DATABASE.md](DATABASE.md) — 建库、迁移、旧库切换、校对版本修复
- [SECURITY.md](SECURITY.md) — 依赖审计、生产 HTTP 头、CSP
- [AGENTS.md](AGENTS.md) — 本仓库的 Bun / 前端 / 样式约定
