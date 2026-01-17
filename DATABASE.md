# 数据库说明

## 技术栈

- **数据库**: MySQL 8.0+
- **ORM**: Prisma
- **运行时**: Node.js + TypeScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改数据库连接信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL="mysql://root:your_password@localhost:3306/sampling_simulation"
```

### 3. 初始化数据库

```bash
npm run db:init
```

这个命令会：
1. 创建数据库（如果不存在）
2. 生成 Prisma Client
3. 推送 Schema 到数据库
4. 运行 Seed 填充初始数据

## 数据库命令

| 命令 | 说明 |
|------|------|
| `npm run db:init` | 完整初始化（创建库 + schema + seed） |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:push` | 推送 Schema 到数据库（不创建迁移） |
| `npm run db:migrate` | 创建并运行迁移（开发环境） |
| `npm run db:migrate:prod` | 运行迁移（生产环境） |
| `npm run db:seed` | 运行 Seed 脚本 |
| `npm run db:reset` | 重置数据库（清空数据 + 重新 seed） |
| `npm run db:studio` | 启动 Prisma Studio（可视化数据库管理） |

## 数据库结构

共 22 张表，分为 5 个域：

### 用户域（4表）

| 表名 | 说明 |
|------|------|
| `admin` | 管理员表 |
| `teacher` | 教师表 |
| `assistant` | 助教表 |
| `student` | 学生表 |

### 组织域（4表）

| 表名 | 说明 |
|------|------|
| `semester` | 学期表 |
| `class` | 班级表 |
| `assistant_class` | 助教-班级绑定表 |
| `student_transfer` | 学生转班记录表 |

### 教学域（4表）

| 表名 | 说明 |
|------|------|
| `topic` | 课题表 |
| `topic_attachment` | 课题附件表 |
| `topic_recommend_question` | 推荐题目表 |
| `task` | 任务表 |

### 实验域（2表）

| 表名 | 说明 |
|------|------|
| `experiment` | 学生实验记录表 |
| `submission` | 提交记录表 |

### 系统域（8表）

| 表名 | 说明 |
|------|------|
| `announcement` | 公告表 |
| `announcement_read` | 公告已读表 |
| `login_log` | 登录日志表 |
| `system_metrics` | 系统监控表 |
| `operation_log` | 操作日志表 |
| `user_session` | 会话管理表 |
| `notification` | 通知表 |
| `system_config` | 系统配置表 |

## 默认账号

运行 seed 后会创建以下测试账号：

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | admin | admin123 | 系统管理员 |
| 教师 | T0001 | T0001 | 张明老师 |
| 教师 | T0002 | T0002 | 李华老师 |
| 教师 | T0003 | T0003 | 王芳老师 |
| 学生 | 20240001 | 20240001 | 第1个学生 |
| 学生 | 20240002 | 20240002 | 第2个学生 |
| ... | ... | ... | 共180名学生 |

> 所有账号首次登录需要修改密码

## Seed 数据内容

运行 seed 后会创建：

- **系统配置**: 26 条配置项
- **管理员**: 1 个
- **学期**: 2 个（当前学期 + 上一学期）
- **教师**: 3 名
- **班级**: 6 个（每个教师 2 个班级）
- **学生**: 180 名（每个班级 30 人）
- **课题**: 3 个（已发布，含推荐题目）
- **任务**: 6 个（每个课题发布到对应教师的班级）

## 目录结构

```
prisma/
├── schema.prisma          # Prisma Schema 定义
├── seed.ts                # Seed 入口文件
└── seed/
    ├── index.ts           # 模块导出
    ├── utils.ts           # 工具函数
    ├── admin.ts           # 管理员 seed
    ├── semesters.ts       # 学期 seed
    ├── teachers.ts        # 教师 seed
    ├── classes.ts         # 班级 seed
    ├── students.ts        # 学生 seed
    ├── topics.ts          # 课题 seed
    ├── tasks.ts           # 任务 seed
    └── data/
        └── system-config.ts  # 系统配置数据

scripts/
├── db-init.ts             # 数据库初始化脚本
└── db-reset.ts            # 数据库重置脚本
```

## 迁移管理

### 开发环境

使用 `prisma db push` 快速同步 schema（不创建迁移记录）：

```bash
npm run db:push
```

或使用 `prisma migrate dev` 创建迁移：

```bash
npm run db:migrate
```

### 生产环境

使用 `prisma migrate deploy` 部署迁移：

```bash
npm run db:migrate:prod
```

## 常见问题

### Q: 如何重置所有数据？

```bash
npm run db:reset
```

这会清空所有数据并重新运行 seed。

### Q: 如何只运行 seed 而不清空数据？

```bash
npm run db:seed
```

注意：seed 使用 upsert，不会创建重复数据。

### Q: 如何查看数据库内容？

```bash
npm run db:studio
```

这会启动 Prisma Studio，在浏览器中查看和编辑数据。

### Q: 如何修改 Schema？

1. 编辑 `prisma/schema.prisma`
2. 运行 `npm run db:push` 或 `npm run db:migrate`
3. 运行 `npm run db:generate` 更新 Prisma Client
