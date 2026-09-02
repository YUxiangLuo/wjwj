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

每个开放任务走四个阶段。问卷、样本规划和报告编辑会按实验版本自动保存到当前浏览器；抽样结果每次执行即落库；点击「完成并进入下一步」后，当前阶段正式写入服务器并推进流程：

1. **问卷预试**：欢迎语、题目、结束语，可用教师推荐题，需完成认知预试；预试答案不进入后续估计。
2. **样本量规划**：比例或均值估计；先以设计效应调整 Cochran \(n_0\)，再对调整后的目标完成量做有限总体校正 \(n_{fpc}=n_{deff}N/(N-1+n_{deff})\)，最后按无回答率换算邀请数并以总体规模 \(N\) 封顶；封顶时会重新显示实际可达精度。
3. **抽样执行**：简单随机、系统和分层抽样必须使用规划样本量；PPS 可在规划样本量的 80%–120% 内调整。
   - 简单随机
   - 系统抽样（允许分数间隔 \(K=N/n\)，抽满规划人数）
   - PPS（不放回 \(\pi\)ps，默认选名称像规模的字段；分析用 Hájek 加权均值）
   - 分层抽样（按比例 / 等额 / 奈曼；奈曼需要层内标准差，溢出后回灌）
4. **分析与报告**：方法对比、误差与代表性，撰写报告后提交。教师可评分或驳回重做，并查看每个实验最近 100 次服务端抽样执行记录；更早记录会在新抽样成功时自动清理。

抽样页面、提交详情和批改详情只水合并返回每种方法前 50 行预览，且不向 SPA 返回服务端重放索引；完整样本通过 CSV 导出获取。总体文件解析采用有界 LRU 热缓存（最多 4 项、合计约 12 万行），同一文件的并发冷读取会合并为一次解析。

## 技术栈

- **运行时**：Bun `1.4.0`，不用 Node / Express / Vite
- **前端**：React 19、React Router 7、Tailwind 4，语义色写在 `styles/theme.css`
- **后端**：`src/index.ts` 里的 `Bun.serve` 路由
- **数据**：PostgreSQL（`citext`、`jsonb`），Drizzle + `bun:sql`
- **请求与上传**：普通 JSON 请求体最多 256 KiB；课题总体表仅支持 `.csv` / `.xlsx` 且不超过 20 MiB；附件落在 `storage/`（图片 10 MiB、文档 50 MiB、视频 120 MiB）

总体样本行会出现在学生的抽样结果和导出文件中，且学生可在实验阶段重新抽样。因此总体文件必须使用合成或充分脱敏的数据，不得上传真实姓名、联系方式、证件号等不应向全班披露的信息。

课题一旦分配给任一班级，名称、描述、推荐题、附件、总体数据、字段映射和评分权重都转为只读；需要调整时应复制为新课题后重新发布，确保同一任务的学生始终看到同一份实验内容。

## 环境要求

- Bun `1.4.0`（与 `packageManager`、本地工具链和 CI 固定一致）
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
| `SEED_NOW` | 可选。默认 seed 的 ISO 时间锚点；未设置时使用当前时间 |
| `PPS_MONTE_CARLO_REPLICATES` | 可选，默认 `512`，范围 `32`–`1024`。控制分析页 PPS 设计标准误的重复抽样次数；越高通常模拟误差越小、计算越慢 |
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

## 演示构建（demo 模式）

```sh
SEED_ADMIN_PASSWORD=admin123 bun run db:reset   # 演示库：固定管理员密码（会清空 DATABASE_URL 指向的库）
bun run start:demo                              # 演示构建 + 生产进程
```

`bun run build:demo`（等价于 `DEMO_MODE=1 bun run scripts/build.ts`）产出演示构建：三个登录页自动填入与默认 seed 一致的演示账号和密码——学生 `S010` / `Student!010`、教师 `T001` / `Teacher!2026`、管理员 `admin` / `admin123`，点击即可登录。

与 `DEV_AUTH_MODE` 不同，demo 模式只预填凭据，不跳过首次登录改密门禁，服务端行为不变：seed 的管理员是首次登录，首次进入会被要求完成一次改密（S010、T001 均非首次登录，不受门禁影响）。普通生产构建把 `DEMO_MODE` 内联为 `"0"`，预填在运行时恒为关闭，登录页不会自动填入任何账号。演示构建只适合内部演示，切勿对外公开部署。

## 默认 seed

`src/db/seeds/default.ts` 面向空库写入一套固定的深度走查数据：1 管理员、3 教师、2 学期、2 班级、11 学生、7 课题、6 任务、11 实验、4 条服务端抽样审计记录、4 公告和 1 个附件。阶段 4 与终态实验使用与生产一致的 compact 抽样结果（只存重放索引，不重复存总体行），S015 的主任务可在教师批改页查看四种方法的审计记录。seed 还生成两份 clone-local 总体文件：200 行的比例/PPS 总体，以及 24 行、可做均值分析但无可用 PPS 规模变量的总体。可用 `SEED_NOW=2026-06-15T08:30:00.000Z` 固定开放/截止/锁定等相对时间；seed 会打印实际锚点。运行后用 `bun run db:seed:check` 做只读完整性检查。`db:seed` 非幂等，只用于空库；失败时先修复报错原因，再运行 `bun run db:reset` 清理并完整重建，不要在部分写入的库上重复 seed。

管理员 `admin` 首次登录，密码来自 `SEED_ADMIN_PASSWORD`；未设置时开发鉴权使用 `admin123`，其他情况生成并打印安全随机值。管理员首次登录改密至少 12 位；教师和学生至少 8 位。三者都需包含字母、数字和特殊字符，且不能包含对应账号。

| 账号 / 密码 | 状态 |
| --- | --- |
| T001 / `Teacher!2026` | 张老师，启用，非首次登录；主班教师 |
| T002 / `T002` | 李老师，启用，首次登录；历史空班教师 |
| T003 / `T003` | 停用教师，登录应失败 |
| S010 / `Student!010` | 未开始，非首次登录，完整闭环入口 |
| S011 / `S011` | 首次登录；A 任务 stage1 |
| S012–S017 / `Student!012`…`Student!017` | 依次覆盖 stage2、stage3、stage4、已提交、90 分已批改、已驳回 |
| S018 / `S018` | 首次登录，锁定至时间锚点后 1 天 |
| S019 / `S019` | 停用 |
| S020 / `S020` | 软删除，保留历史提交 |

主任务「均值对照（PPS 可用）」在非软删班级成员中精确覆盖 8 个进度桶：未开始 3 人，其余 stage1–4、已提交、已批改、已驳回各 1 人。另外包含「均值-无PPS」、未发布草稿、已截止、尚未开放、课题软删但有历史提交、任务软删但有历史提交等过滤分支。主任务推荐样本量为 49；「均值-无PPS」任务样本量由生产计算函数得到 15。

## 常用命令

```sh
bun run dev              # 热更新开发
bun run build            # 生产前端到 dist/
bun run build:demo       # 演示构建：登录页预填演示账号密码
bun run start            # 构建 + 生产进程
bun run start:demo       # 演示构建 + 生产进程
bun run verify           # 类型/样式、单测、构建、迁移检查、依赖门禁
bun test                 # 单元测试
bun run typecheck        # tsc + 样式门禁
bun run check:docs       # README/DATABASE 的 fixture 描述与 seed 对账
bun run check:styles     # 禁止调色板类、dark:、响应式断点
bun run db:generate      # 根据 schema 生成迁移
bun run db:migrate
bun run db:check
bun run db:seed:check    # 只读校验默认 seed 的计数、状态、抽样结果和文件
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
src/student/experiment/   样本量、抽样、紧凑结果存储、分析、提交
src/db/               schema、迁移、seed
styles/theme.css      唯一主题源
public/templates/     教师上传模板
storage/              课题数据与附件
```

## 更多文档

- [DATABASE.md](DATABASE.md) — 建库、迁移、旧库切换、校对版本修复
- [SECURITY.md](SECURITY.md) — 依赖审计、生产 HTTP 头、CSP
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — 主题 token、组件分层与本地 shadcn fork 约定
- [AGENTS.md](AGENTS.md) — 本仓库的 Bun / 前端 / 样式约定
