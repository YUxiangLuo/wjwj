# 运行与部署

启动见 [README](../README.md)，数据库恢复见 [DATABASE.md](../DATABASE.md)，安全规则见 [SECURITY.md](../SECURITY.md)。Bun 自动加载 `.env`；本地 CI 固定使用 Bun 1.4.2。

## 关键环境变量

| 变量 | 作用 |
| --- | --- |
| `DATABASE_URL` | 必填，PostgreSQL 连接串 |
| `HOST` / `PORT` | 默认 `0.0.0.0` / `3000` |
| `NODE_ENV` | `production` 从 `dist/` 提供前端并关闭开发鉴权 |
| `DEV_AUTH_MODE` | 仅非生产开发鉴权；生产构建固定为 `"0"` |
| `DEMO_MODE` | 公开演示凭据，仅限内部演示 |
| `TRUST_PROXY` | 仅当应用只接受可信反向代理流量时设 `1` |
| `TEST_DATABASE_URL` | 独立可丢弃测试库；教学测试需角色可创建临时库 |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | 首个管理员；不提供密码时随机生成并只显示一次 |

容量调节使用 `PASSWORD_WORK_CONCURRENCY`、`PASSWORD_WORK_QUEUE_LIMIT`、`ANALYSIS_QUEUE_LIMIT` 和 `POPULATION_STATS_QUEUE_LIMIT`；增大队列不提高计算吞吐。危险数据库命令另需 `CONFIRM_DATABASE_NAME`，见 [DATABASE.md](../DATABASE.md)。

## 容量边界

- 普通 JSON：256 KiB；总体 `.csv/.xlsx`：20 MiB、100,000 行、50 列；附件：图片 10 MiB、文档 50 MiB、视频 120 MiB。
- Bun 请求体上限 128 MiB、HTTP 空闲超时 60 秒；Worker 等待与计算合计期限 30 秒。
- 分析和总体统计各有一个常驻 Worker 及独立缓存，但抽样、详情和导出仍可能占用主线程。容量须在目标硬件、实际数据和冷/热缓存下用 `bun run scripts/benchmark-analysis.ts` 复测。
- 本地文件存储只支持单实例；多实例前必须改用共享存储。

## 发布检查

1. 确认没有 `DEMO_MODE=1`，并已演练数据库与 `storage/` 的配套恢复。
2. 运行 `bun run ci:local:full`；数据库角色与浏览器前置条件见 [README](../README.md)。
3. 用 `bun run start` 启动；不要用未构建的生产模式上课。
4. 由反向代理终止 TLS；仅在全部流量强制 HTTPS 后开启 HSTS。仅在代理可信且应用不接受直连时启用 `TRUST_PROXY=1`；代理超时须允许服务端 30 秒期限后的错误响应返回。
5. 验证三个入口、深链、总体/附件下载和登录—抽样—提交—批改闭环。

## 内部演示

**演示模式公开演示凭据，不得对外部署。** 只在独立空库运行：

```sh
bun run db:migrate
bun run db:seed:demo
bun run db:seed:check
bun run start:demo
```

`start:demo` 启用账号预填和随机学生凭据端点，普通 `start` 不包含演示密码。默认管理员是 `admin` / `admin123`，教师和学生初始密码分别为工号、学号。

Seed 非幂等且仅支持空库；失败后不要直接重跑。确认数据库可丢弃后，按 [DATABASE.md](../DATABASE.md) 的保护流程运行 `db:reset:demo`，该命令不清理 `storage/`。`SEED_NOW` 可指定带时区的 ISO 时间锚点。演示内容以 `src/db/seeds/default.ts` 和 `dogfood-fixtures.ts` 为准，使用 `bun run db:seed:check` 验证，不在文档维护数量或状态快照。

扩充课题使用 `scripts/add-demo-research-topics.ts`，并提供 `DEMO_BASE_URL` 和持久保存的 `DEMO_CATALOG_MANIFEST`；中断续跑必须沿用同一清单。
