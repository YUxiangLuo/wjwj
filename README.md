# 抽样调查虚拟仿真实验平台

面向统计学课堂的抽样调查实验系统。学生完成问卷设计、样本量规划、按模板策略选择概率抽样方法并比较估计结果；教师配置实验模板、发布实验任务与批改；管理员维护学期、班级和账号。

运行时是单一 `Bun.serve` 进程，挂三个独立 SPA：

| 入口 | 路径 | 用途 |
| --- | --- | --- |
| 学生端 | `/student` | 任务大厅、四阶段实验、提交与结果 |
| 教师端 | `/teacher` | 实验模板/总体数据、班级、实验任务、批改与成绩分析导出 |
| 管理端 | `/admin` | 学期、教师、班级、学生、公告 |
| 根路径 | `/` | 302 到 `/student` |

界面为桌面端、浅色主题，时间按中国标准时间（UTC+8）展示。

## 学生实验

每个开放任务走四个阶段。问卷、样本规划和报告编辑会按实验版本自动保存到当前浏览器，退出登录后保留，最后编辑后保留 7 天；页面显示保存状态，失败时可重试；抽样结果每次执行即落库；点击「完成并进入下一步」后，当前阶段正式写入服务器并推进流程：

1. **问卷预试**：欢迎语、题目、结束语，可用教师推荐题，需完成认知预试；预试答案不进入后续估计。
2. **样本量规划**：比例或均值估计；先以设计效应调整 Cochran \(n_0\)，再对调整后的目标完成量做有限总体校正 \(n_{fpc}=n_{deff}N/(N-1+n_{deff})\)，最后按无回答率换算邀请数并以总体规模 \(N\) 封顶；封顶时会重新显示实际可达精度。
3. **抽样执行**：教师在实验模板中设置必做、选做和不适用方法。简单随机固定必做，学生需完成所有必做方法且至少实际完成两种启用方法；系统和分层抽样使用规划样本量，PPS 可在规划样本量的 80%–120% 内调整。
   - 简单随机
   - 系统抽样（允许分数间隔 \(K=N/n\)，抽满规划人数）
   - PPS（不放回 \(\pi\)ps，默认选名称像规模的字段；分析用 Hájek 加权均值）
   - 分层抽样（按比例 / 等额 / 奈曼；奈曼需要层内标准差，溢出后回灌）
4. **分析与报告**：只比较实际完成的方法，完成误差与代表性分析后撰写报告并提交。教师可评分或驳回重做，并查看每个实验最近 100 次服务端抽样执行记录；更早记录会在新抽样成功时自动清理。

已完成阶段默认以只读快照打开；只有显式选择“重新编辑此阶段”并确认清理影响后，才会重开阶段。问卷设计提供三套可编辑标准骨架，并可下载 `调查问卷设计规范与模板.docx` 或预览对应 PDF。学生成绩页只显示总分、评分权重和教师评语，不公开分项具体分数。

抽样页面、提交详情和批改详情只水合并返回每种方法前 50 行预览，且不向 SPA 返回服务端重放索引。PPS 页面另返回最多 10 行的包含概率与设计权重说明；完整样本及 PPS 概率通过 CSV 导出获取。总体文件解析采用有界 LRU 热缓存（每个线程最多 4 项、估算内存合计 256 MiB），同一文件的并发冷读取会合并为一次解析。分析接口在单个常驻 Worker 中执行文件解析、样本还原和所有设计指标计算，复用总体和 PPS 标准误缓存；主服务线程不执行这些分析计算。Worker 按需启动，一次计算一个任务，最多等待 16 个任务；等待与计算合计超过 30 秒会返回可重试错误。主线程与 Worker 各有独立缓存，部署时需为两者及解析临时对象预留内存。

教师端术语分为三层：**实验模板**是可复用的总体数据和教学配置，**实验任务**是模板分配到一个班级后的实例，**学生实验**是学生在任务中的个人进度与提交。教师首页展示当前活动实验任务；“成绩分析与导出”提供任务状态漏斗、总分分布、均值/中位数和三项平均分。

## 技术栈

- **运行时**：Bun `1.4.0`，不用 Node / Express / Vite
- **前端**：React 19、React Router 7、Tailwind 4，语义色写在 `styles/theme.css`
- **后端**：`src/index.ts` 里的 `Bun.serve` 路由
- **数据**：PostgreSQL（`citext`、`jsonb`），Drizzle + `bun:sql`
- **请求与上传**：普通 JSON 请求体最多 256 KiB；课题总体表仅支持 `.csv` / `.xlsx` 且不超过 20 MiB；附件落在 `storage/`（图片 10 MiB、文档 50 MiB、视频 120 MiB）

总体样本行会出现在学生的抽样结果和导出文件中，且学生可在实验阶段重新抽样。因此总体文件必须使用合成或充分脱敏的数据，不得上传真实姓名、联系方式、证件号等不应向全班披露的信息。

实验模板一旦分配给任一班级，名称、描述、推荐题、教学资料、总体数据、研究目标与字段、抽样策略和评分规则都转为只读；需要调整时应复制为新模板后重新发布，确保同一任务的学生始终看到同一份实验内容。

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
| `DEMO_MODE` | 仅供内部演示；`1` 启用演示凭据预填和随机学生端点。优先使用 `start:demo`，不要在公开部署中设置 |
| `SEED_ADMIN_PASSWORD` | 可选。覆盖 seed 管理员初始密码 |
| `SEED_NOW` | 可选。默认 seed 的 ISO 时间锚点；未设置时使用当前时间 |
| `PPS_MONTE_CARLO_REPLICATES` | 可选，默认 `512`，范围 `32`–`1024`。控制分析页 PPS 设计标准误的重复抽样次数；越高通常模拟误差越小、计算越慢 |
| `PASSWORD_WORK_CONCURRENCY` | 可选，默认 `4`，范围 `2`–`4`。限制单进程 Argon2 并发量 |
| `PASSWORD_WORK_QUEUE_LIMIT` | 可选，默认 `32`，范围 `4`–`128`。密码服务等待队列上限，超限返回 429 |
| `TRUST_PROXY` | 仅当应用只接受可信反向代理流量时设为 `1`；此时才信任转发的主机名和 HTTPS 协议头，用于还原公开访问源 |
| `BOOTSTRAP_ADMIN_USERNAME` | 生产初始化管理员名，默认 `admin` |
| `BOOTSTRAP_ADMIN_PASSWORD` | 可选；未设置时 bootstrap 生成并只显示一次随机初始密码，传入值不会写入日志 |
| `TEST_DATABASE_URL` | 跑 `bun run test:db` 时使用的一次性库 |

开发鉴权开启时，三个登录页会预填演示账号。`bun run start` / 生产构建会把前端的 `DEV_AUTH_MODE` 内联为 `"0"`，不会把开发预填带入普通生产包。不要用未构建的 `NODE_ENV=production bun src/index.ts`。

## 本地启动

```sh
bun install
cp .env.example .env   # 改成你的 DATABASE_URL
bun run db:migrate     # 空库；旧库见 DATABASE.md
bun run db:bootstrap-admin  # 仅创建首个管理员
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
bun run db:reset:demo   # 演示库：重建 seed，管理员可直接进入（会清空 DATABASE_URL 指向的本项目表）
bun run start:demo      # 演示构建 + 带随机学生凭据端点的生产进程
```

`bun run start:demo` 会同时在浏览器构建和服务端启用 `DEMO_MODE=1`。学生登录页每次刷新都会从 seed 的「2024级统计学实验班」随机选择一个可用学生，密码与学号相同；教师固定为 `T001` / `T001`，管理员固定为 `admin` / `admin123`。

随机凭据端点只在服务端 `DEMO_MODE=1` 时注册，响应禁止缓存；普通生产构建和普通 `bun run start` 不包含该端点，也不会预填账号。演示模式会公开演示凭据，只适合内部演示，切勿对外部署。

## 显式演示 seed

`src/db/seeds/default.ts` 只允许由 `db:seed:demo` 在 `DEMO_MODE=1` 下调用，面向空库写入一套固定的深度走查数据：1 管理员、4 教师、3 学期、4 班级、16 学生、7 实验模板、6 实验任务、15 学生实验、12 条服务端抽样审计记录、5 公告和 2 个附件。阶段 4 与终态实验使用与生产一致的 compact 抽样结果（只存重放索引，不重复存总体行）。seed 会生成四套 clone-local 合成总体：200 名本科生的学习投入均值/PPS、24 名学生的阅读时长均值/PPS 不可用、160 名毕业生的直接就业比例/PPS，以及 96 个餐厅服务时段的平均等待时间/PPS。它们同时覆盖默认选做策略、PPS 禁用、分层必做、PPS 必做，以及只完成两种方法进入分析。可用 `SEED_NOW=2026-06-15T08:30:00.000Z` 固定开放和截止等相对时间；seed 会打印实际锚点。运行后用 `bun run db:seed:check` 做只读完整性检查。演示 seed 非幂等，只用于空库。

生产初始化不会写入下列任何演示账号。`db:bootstrap-admin` 只创建一个使用独立密码的管理员；演示模式才使用固定的 `admin123`。新建或重置学生时密码为学号，新建或重置教师时密码为工号，用户无需首次强制改密，也可在登录后主动设置符合强度规则的个人密码。学生、实验任务和未分配的实验模板均使用不可恢复的硬删除；删除学生或任务会级联清除实验、成绩、抽样记录及相关审计事件。删除后再次导入同一学号会创建全新账号。

| 账号 / 密码 | 状态 |
| --- | --- |
| T001 / `T001` | 张岚，启用；固定演示教师，管理两个班级和四类研究场景 |
| T002 / `T002` | 李文博，启用 |
| T003 / `T003` | 周妍，启用；历史班级教师 |
| T004 / `T004` | 停用教师，登录应失败 |
| S010 / `S010` | 毕业去向比例任务 stage2，学习投入任务未开始 |
| S011 / `S011` | A 任务 stage1 |
| S012–S017 / 对应学号 | 依次覆盖 stage2、stage3、stage4、已提交、90 分已批改、已驳回 |
| S018 / `S018` | 启用的备用学生 |
| S019 / `S019` | 停用 |
| P101–P106 / 对应学号 | 公共管理调查班；覆盖餐厅服务时段研究的 stage1、待批改和已驳回等状态 |

主任务「大学生学习投入与满意度」在班级成员中精确覆盖 8 个进度桶：未开始 3 人，其余 stage1–4、已提交、已批改、已驳回各 1 人。另外包含「校园阅读行为与阅读时长」、毕业生比例、餐厅服务时段、未发布草稿、已截止和尚未开放等分支。主任务推荐样本量为 49；「校园阅读行为与阅读时长」任务样本量由生产计算函数得到 15。

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
bun run audit:shadcn     # 用固定 CLI 版本比较本地 UI primitives 与上游
bun run db:generate      # 根据 schema 生成迁移
bun run db:migrate
bun run db:check
bun run db:bootstrap-admin # 生产空库只创建首个管理员
bun run db:seed:demo     # 仅显式演示库
bun run db:seed:check    # 只读校验默认 seed 的计数、状态、抽样结果和文件
bun run db:reset         # 确认数据库名后：清表 → 迁移 → bootstrap 管理员（不删 storage/）
bun run db:reset:demo    # 清本项目表 → 迁移 → demo-ready seed
bun run storage:audit    # 只读检查孤立上传
bun run storage:clean    # 先审计，再按输出补 --confirm=<token> 删除孤立上传
bun run test:db          # 需要 TEST_DATABASE_URL
bun run scripts/benchmark-analysis.ts # 独立客户端进程对比分析并发及普通请求延迟
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
