# 抽样统计虚拟仿真实验教学系统

基于 Bun + React + Drizzle + MySQL 的一体化教学平台，覆盖管理员、教师/助教、学生三端。

## 功能概览

- 学生端：任务大厅、四阶段实验流程、提交预览、历史记录、通知与会话管理
- 教师端：课题管理（Excel/字段映射/权重/附件）、任务发布、批改、成绩导出、助教协作
- 管理员端：学期/班级/账号管理、公告、系统监控、系统设置、备份与恢复
- 通用能力：登录失败锁定、单设备会话、站内通知、操作日志、自动备份

详细业务规范参考：`docs/v3/功能描述_v3.md`

## 技术栈

- Runtime/Server: Bun (`Bun.serve`)
- Frontend: React 19, React Router 7, Tailwind CSS 4, shadcn/ui
- ORM/DB: Drizzle ORM + MySQL (`mysql2`)
- Data/PDF: `xlsx`, `pdfkit`

## 项目结构

```text
src/
  index.ts                 # 服务入口与路由聚合
  admin/                   # 管理员端页面与 API
  teacher/                 # 教师/助教端页面与 API
  student/                 # 学生端页面与 API
  db/                      # schema、迁移、清理、种子脚本
  server/                  # 通用 HTTP 工具
drizzle/                   # drizzle 迁移文件
docs/v3/                   # V3 功能与数据库设计文档
public/templates/          # 导入模板与说明
storage/uploads/           # 上传与生成文件目录
backups/                   # 备份产物目录
```

## 环境要求

- Bun >= 1.3
- MySQL 8+

在项目根目录创建 `.env`（Bun 会自动加载）：

```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=wenjuan_dev
```

测试环境使用 `.env.test`，可从 `.env.test.example` 复制：

```bash
cp .env.test.example .env.test
```

## 快速开始

1) 安装依赖

```bash
bun install
```

2) 初始化数据库结构

```bash
bun run db:push
```

3) （推荐）重置并写入本地演示数据

```bash
bun run db:reset
```

4) （可选）仅写入演示数据

```bash
bun run src/db/seeds/default.ts
```

5) 启动开发环境

```bash
bun dev
```

默认访问地址：

- 学生端：`http://127.0.0.1:3000/student`
- 教师端：`http://127.0.0.1:3000/teacher`
- 管理员端：`http://127.0.0.1:3000/admin`

## 测试说明

- 单元测试：`bun test` / `bun run test:unit`

## 常用脚本

```bash
bun dev                 # 开发模式（热更新）
bun start               # 生产模式启动

bun test                # 运行单元测试（src + env.test.ts）
bun run test:watch      # 单元测试监听模式
bun run test:all        # 运行全部测试

bun run db:generate     # 生成迁移
bun run db:migrate      # 执行迁移脚本
bun run db:push         # 直接同步 schema 到数据库
bun run db:studio       # 打开 Drizzle Studio
bun run db:drop         # 删除数据库对象
bun run db:check        # 检查数据库差异
bun run db:reset        # 清空并重建数据库 + 写入种子
```

## 默认演示账号（执行 seed 后）

- 管理员：`admin`
- 教师：`teacher`
- 助教：`assistant`
- 学生：`student`
- 默认密码：`123456`

首次登录与密码策略以系统配置和业务规则为准。

## 文件与数据说明

- 上传文件、导出文件、生成 PDF 默认写入 `storage/uploads/`
- 自动/手动备份写入 `backups/`
- 示例总体数据文件可见 `storage/uploads/population.xlsx`

## 开发备注

- 项目是单服务多前端路由模式，统一由 `src/index.ts` 聚合
- API 返回格式统一为 `{ success, data | error }`
- 鉴权与会话逻辑分别在：
  - `src/admin/routes/auth.ts`
  - `src/teacher/routes/auth.ts`
  - `src/student/routes/auth.ts`
