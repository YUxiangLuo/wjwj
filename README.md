# sampling-vlab

基于 Bun、React 19、Drizzle ORM 和 MySQL 的抽样统计虚拟仿真实验教学平台。

项目包含三个独立前端入口和一套 Bun 服务端 API：

- 学生端：任务大厅、四阶段实验流程、提交记录、通知与个人资料
- 教师端：班级管理、课题管理、任务发布、作业批改、助教协作、成绩导出
- 管理端：学期/教师/助教/班级/学生管理、公告、系统监控、系统设置

默认路由：

- `/student`
- `/teacher`
- `/admin`

## 技术栈

- 运行时：Bun
- 前端：React 19、React Router 7、Tailwind CSS 4、Radix UI
- 服务端：`Bun.serve()`
- 数据库：MySQL + Drizzle ORM
- 文件与报表：Bun 文件 API、PDFKit、XLSX
- 测试：`bun test`

## 当前能力概览

### 学生端

- 任务大厅，按状态展示未开始、进行中、已提交、批改中、已批改、被驳回任务
- 四阶段实验流转：
  - 问卷设计
  - 样本量规划
  - 抽样执行
  - 分析与报告
- 实验过程保存、阶段回退、截止时间校验
- 提交历史、提交详情、附件下载、报告导出
- 首次登录改密、会话到期提示、通知中心

### 教师端

- 班级、学生、助教管理
- 课题创建、Excel 数据上传、字段映射、推荐题目与权重配置
- 任务发布、任务延期、进度跟踪
- 批改列表、批改详情、PDF 下载
- 成绩预览、数据导出与 Excel 导出
- 教师与助教共用登录体系，不同权限菜单不同

### 管理端

- 学期、教师、助教、班级、学生维护
- 学生转班、账号启停、解锁、重置密码
- 公告发布与统计
- 系统监控：CPU、内存、磁盘、网络、活跃会话
- 系统设置：登录失败阈值、锁定时长、各角色会话时长等

### 后台任务

- 通知清理
- 临近截止任务提醒
- 提交 PDF 补偿处理

## 本地启动

### 1. 安装依赖

```sh
bun install
```

### 2. 配置环境变量

项目依赖 Bun 自动加载 `.env`。至少需要：

```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=wenjuan_dev
PORT=3000
HOST=0.0.0.0
```

可选环境变量：

- `NODE_ENV=production`：生产模式
- `DISABLE_NOTIFICATION_CLEANUP=1`：关闭通知清理任务
- `DISABLE_DEADLINE_REMINDER=1`：关闭截止提醒任务

测试环境示例见 [`.env.test.example`](/home/alice/pros/wj/.env.test.example)。

### 3. 初始化数据库

首次启动建议直接重置数据库并导入演示数据：

```sh
bun run db:reset
```

该命令会依次执行：

- 清空表
- 同步 Drizzle schema
- 导入默认种子数据

如需拆开执行：

```sh
bun run db:push
bun run db:seed
```

### 4. 启动开发环境

```sh
bun run dev
```

默认服务地址：`http://localhost:3000`

## 常用脚本

```sh
bun run dev
bun run start
bun run test
bun run typecheck

bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
bun run db:drop
bun run db:check
bun run db:clean
bun run db:seed
bun run db:reset
```

## 默认演示账号

执行 `bun run db:seed` 后，会生成一批演示数据。通用初始密码为：

```txt
123456
```

常用演示账号：

- 管理员：`admin`
- 教师：`teacher`
- 助教：`assistant`
- 学生：`student`

种子数据还包含：

- 首次登录需改密账号
- 被禁用账号
- 被锁定账号
- 多学期、班级、课题、任务、提交、公告和通知数据

相关逻辑位于 [`src/db/seeds/default.ts`](/home/alice/pros/wj/src/db/seeds/default.ts)。

## 目录结构

```txt
src/
  admin/       管理端页面、API 与路由
  teacher/     教师/助教端页面、API 与路由
  student/     学生端页面、实验流程、API 与路由
  components/  通用组件与 UI 封装
  db/          Drizzle schema、迁移脚本、清理与种子
  server/      HTTP 工具、后台任务、系统配置、模板文件
  hooks/       通用认证、通知、轮询、会话 hooks
  lib/         领域逻辑与纯函数
  utils/       格式化与富文本工具

public/
  fonts/       中文字体
  templates/   上传模板与说明文件

storage/
  uploads/     课题附件、提交产物
```

## 数据与存储

- 数据库 schema 定义在 [`src/db/schema.ts`](/home/alice/pros/wj/src/db/schema.ts)
- Drizzle 配置在 [`drizzle.config.ts`](/home/alice/pros/wj/drizzle.config.ts)
- 服务端连接在 [`src/db/index.ts`](/home/alice/pros/wj/src/db/index.ts)
- 上传与生成文件默认写入 `storage/`
- 静态模板通过 `/templates/:name` 对外提供下载

核心领域表包括：

- 用户域：`admin`、`teacher`、`assistant`、`student`
- 组织域：`semester`、`class`、`assistant_class`、`student_transfer`
- 教学域：`topic`、`topic_attachment`、`task`、`experiment`、`submission`
- 系统域：`announcement`、`notification`、`system_config`、`login_log`、`operation_log`、`user_session`

## 测试

项目当前包含大量单元测试与组件测试，测试文件主要位于 `src/**/*.test.ts` 和 `src/**/*.test.tsx`，当前数量约为 85 个。

运行方式：

```sh
bun test src
```

或：

```sh
bun run test
```

## 运行入口

主服务入口是 [`src/index.ts`](/home/alice/pros/wj/src/index.ts)，负责：

- 挂载学生端、教师端、管理端 HTML 入口
- 注册三端 API 路由
- 提供模板文件下载
- 启动后台任务
- 注册优雅停机逻辑

## 已知实现特征

- 当前数据库驱动实际使用的是 `mysql2`，并非 Bun 原生 SQL
- 前端由 Bun 直接托管 HTML 入口，不依赖 Vite
- 生产环境需要可写的 `storage/` 目录与可访问的 MySQL 实例

## 适合补充的后续文档

如果后面还要继续完善文档，优先建议补这几类：

- 部署说明
- 数据库表关系图
- 三端权限矩阵
- 课题导入 Excel 格式约束
- 学生实验流程截图
