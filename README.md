# Sampling VLab

抽样统计虚拟仿真实验教学平台。项目使用 Bun 构建全栈单体应用，一个服务同时提供管理端、教师/助教端、学生端，以及对应的后端 API。

## 技术栈

- Runtime: Bun 1.3+
- Frontend: React 19, React Router 7
- UI: Tailwind CSS v4, shadcn/ui Radix base, lucide-react
- Backend: `Bun.serve()`
- Database: PostgreSQL, Drizzle ORM, `bun:sql`
- Rich text and files: TipTap, xlsx, pdfkit
- Tests: `bun test`

## 功能模块

- 管理端 `/admin`
  - 学期、教师、助教、班级、学生管理
  - 公告管理
  - 系统监控与系统设置
- 教师端 `/teacher`
  - 班级与学生管理
  - 课题、附件、Excel 数据、字段映射、权重配置
  - 任务发布、进度查看
  - 作业批改、成绩导出
  - 助教管理
- 学生端 `/student`
  - 任务大厅
  - 问卷设计
  - 样本量规划
  - 抽样执行
  - 分析报告
  - 提交历史与 PDF 下载

## 快速开始

先确保 Bun 在 PATH 中：

```sh
export PATH=/home/alice/.bun/bin:$PATH
```

安装依赖：

```sh
bun install
```

创建 `.env`：

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=sampling_vlab
```

可选服务端变量：

```env
HOST=0.0.0.0
PORT=3000
NODE_ENV=development
```

初始化数据库：

```sh
bun run db:reset
```

启动开发服务：

```sh
bun run dev
```

默认访问地址：

- 学生端：http://localhost:3000/student
- 教师端：http://localhost:3000/teacher
- 管理端：http://localhost:3000/admin

根路径 `/` 会跳转到 `/student`。

## 数据库命令

```sh
bun run db:generate   # 根据 schema 生成 Drizzle migration
bun run db:migrate    # 执行 migration
bun run db:push       # generate + migrate
bun run db:seed       # 写入演示数据
bun run db:clean      # 清空业务数据
bun run db:reset      # clean + push + seed
bun run db:check      # 检查 Drizzle schema/migration
bun run db:drop       # 删除 migration
```

Drizzle 配置在 `drizzle.config.ts`，schema 在 `src/db/schema.ts`，生成的迁移文件输出到 `drizzle-pg/`。

## 演示账号

运行 `bun run db:seed` 或 `bun run db:reset` 后会创建演示数据。

通用密码：

```txt
123456
```

常用账号：

- 管理员：`admin`
- 首次登录管理员：`admin_first`
- 教师：`teacher`、`T002`、`T003`
- 首次登录教师：`T004`
- 助教：`assistant`、`A002`、`A003`
- 首次登录助教：`A004`
- 学生：`student`、`2024001` 到 `2024014`、`2024101` 到 `2024108`

特殊状态账号：

- `T005`：已停用教师
- `T006`：已锁定教师
- `A005`：已锁定助教
- `2024014`：已锁定学生
- `2024204`：已停用学生

## 开发命令

```sh
bun run dev        # 热更新开发服务
bun run start      # 生产模式启动
bun run typecheck  # TypeScript 类型检查
bun test src       # 运行全部测试
bun run test       # 等同于项目单元测试脚本
```

项目默认使用 Bun。不要用 `npm run`、`pnpm`、`yarn`、`node` 或 `npx` 替代已有 Bun 命令。

## 目录结构

```txt
src/
  index.ts              # Bun 服务入口
  admin/                # 管理端页面、API client、后端路由
  teacher/              # 教师/助教端页面、API client、后端路由、课题服务
  student/              # 学生端页面、实验流程、抽样算法、后端路由
  components/           # 共享组件与 shadcn/ui 组件
  hooks/                # 共享 React hooks
  lib/                  # 共享业务工具与校验逻辑
  server/               # HTTP、session、系统配置、后台任务等服务端工具
  db/                   # Drizzle schema、连接、迁移、种子脚本
  utils/                # 时间、富文本等工具

public/
  fonts/                # PDF 中文字体
  templates/            # 上传说明与 CSV 模板

storage/
  uploads/              # 上传文件、抽样数据、提交 PDF

styles/
  globals.css           # Tailwind v4 全局样式与主题变量
```

## API 入口

API 路由按角色分组注册：

- `src/admin/api.ts` -> `/api/admin/*`
- `src/teacher/api.ts` -> `/api/teacher/*`
- `src/student/api.ts` -> `/api/student/*`

共享响应格式在 `src/server/http.ts`：

```ts
{ success: true, data: ... }
{ success: false, error: { code, message } }
```

## 会话与安全

- 使用 HttpOnly Cookie 保存 session token
- session 数据保存在 `user_session` 表
- 同一账号默认单设备登录，新登录会清理旧 session
- 写请求会执行 Same-Origin/CSRF 检查
- 登录失败会累计次数并按配置锁定账号
- 首次登录用户必须修改密码后才能访问主要功能
- 修改密码后会保留当前 session，并清理同账号其他 session

## 文件与模板

- 上传文件和生成的 PDF 默认写入 `storage/uploads/`
- 模板文件位于 `public/templates/`
- `/templates/:name` 提供模板下载
- PDF 生成依赖 `public/fonts/NotoSansSC-Regular.otf` 以支持中文文本

## 测试状态

当前项目测试覆盖了认证、路由权限、抽样算法、实验提交、PDF 状态、教师批改、导出、上传校验和部分 UI 行为。

常用检查：

```sh
bun run typecheck
bun test src
```

