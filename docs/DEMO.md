# 内部演示指南

**演示模式公开演示凭据，不能对外部署。** 正式教学应使用 `db:bootstrap-admin`，不要写入演示 seed。

## 准备

只在独立空演示库中运行，并先核对 `.env` 的 `DATABASE_URL`：

```sh
bun run db:migrate
bun run db:seed:demo
bun run db:seed:check
bun run start:demo
```

`start:demo` 启用账号预填和随机学生凭据端点；普通 `start` 不包含演示密码。默认管理员为 `admin` / `admin123`，教师和学生初始密码分别为工号、学号。

Seed **非幂等且只支持空库**。失败可能留下部分记录或文件，不要直接重跑；确认可以丢弃后，按 [DATABASE.md](../DATABASE.md) 的保护流程执行 `db:reset:demo`。该命令不清理 `storage/`。`SEED_NOW` 可设置带时区的 ISO 时间锚点，过早的值可能令任务过期。

默认演示内容及账号以 `src/db/seeds/default.ts` 和 `dogfood-fixtures.ts` 为准；不要在文档维护人数、样本量或状态快照。用 `bun run db:seed:check` 检查实际演示库。

扩充课题使用 `scripts/add-demo-research-topics.ts`。运行时提供 `DEMO_BASE_URL` 和持久保存的 `DEMO_CATALOG_MANIFEST`；清单用于中断续跑和防重复，重复执行必须沿用同一清单。扩充后按清单验证，不要因默认 seed 数量不符而 reset。支持的研究目标与数据边界见[课题模型](../RESEARCH_MODEL.md)。
