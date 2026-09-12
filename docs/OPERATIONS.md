# 运行与部署

启动命令见 [README](../README.md)；迁移和配套备份见 [DATABASE.md](../DATABASE.md)；鉴权、HTTP 防护与依赖风险见 [SECURITY.md](../SECURITY.md)。

## 环境变量

Bun 自动加载 `.env`。使用 Bun 1.4.0，与 `package.json` 和 CI 保持一致。

| 变量 | 默认值 / 作用 |
| --- | --- |
| `DATABASE_URL` | 必填，PostgreSQL 连接串 |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `NODE_ENV` | `production` 从 `dist/` 提供前端，并始终关闭开发鉴权 |
| `DEV_AUTH_MODE` | 非生产时 `1` 开启、`0` 关闭；未设置时开发开启、test 关闭。生产构建固定内联为 `"0"` |
| `DEMO_MODE` | `1` 启用演示预填及公开演示凭据端点；仅限内部演示，见[演示指南](DEMO.md) |
| `TRUST_PROXY` | 仅当应用只接受可信反向代理流量时设 `1`，信任转发的主机与 HTTPS 协议头 |
| `PASSWORD_WORK_CONCURRENCY` | `4`，范围 2–4；单进程 Argon2 并发上限 |
| `PASSWORD_WORK_QUEUE_LIMIT` | `64`，范围 4–128；超限返回 429 和 `Retry-After` |
| `ANALYSIS_QUEUE_LIMIT` | `64`，范围 1–256；分析 Worker 等待任务上限 |
| `POPULATION_STATS_QUEUE_LIMIT` | `64`，范围 1–256；总体统计独立 Worker 等待任务上限 |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin`，首个生产管理员用户名 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 可选；未设置时生成并仅显示一次随机初始密码，传入值不写日志 |
| `SEED_ADMIN_PASSWORD` | 可选，覆盖演示 seed 管理员初始密码 |
| `SEED_NOW` | 可选，带时区的 ISO 时间锚点；默认当前时间，用于演示任务的相对开放/截止时间 |
| `TEST_DATABASE_URL` | 数据库测试的独立一次性库；浏览器教学测试用该连接创建临时库 |

`db:clean` / reset 另需 `CONFIRM_DATABASE_NAME`，规则见[数据库操作](../DATABASE.md)。

## 资源与容量

| 项目 | 当前限制 |
| --- | --- |
| 普通 JSON 请求体 | 256 KiB |
| 总体表 | `.csv` / `.xlsx`，20 MiB，最多 100,000 行、50 列 |
| 附件 | 图片 10 MiB、文档 50 MiB、视频 120 MiB |
| Bun 全局请求体 / HTTP 空闲超时 | 128 MiB / 60 秒 |
| Worker 任务期限 | 等待与计算合计 30 秒，超时或繁忙返回可重试错误 |

分析和总体统计各使用一个按需启动的常驻 Worker，每个服务一次处理一个任务。**分析请求的**总体解析、样本还原与指标计算在分析 Worker 内完成；抽样、部分详情及导出仍可能在主线程解析/还原数据，不能认为所有 CPU 工作都已隔离。

- 总体解析：每个线程独立 LRU，最多 4 项、估算 256 MiB；相同输入的并发冷读取合并。
- 总体统计：按文件版本与映射缓存成功结果，最多 8 项、估算 16 MiB；相同在途请求合并，离开页面可取消无人等待的排队任务。这不是整份实验分析结果的全局缓存。
- 内存预算须计入主线程、各 Worker 的独立缓存和解析临时对象。队列增大只增加接纳量，不等于计算吞吐提升。
- 默认配置面向 50 人课堂的同步登录与分析请求；这是容量目标，不是任意硬件上的性能保证。学生登录与统计读取遇到明确繁忙响应时最多自动重试 3 次；分析页提供保留草稿的手动重试。

压测入口：`bun run scripts/benchmark-analysis.ts`。实际容量需在目标硬件、数据规模和冷/热缓存条件下复测。

## 发布检查

1. 确认环境无 `DEMO_MODE=1`，数据库和 `storage/` 可配套恢复；当前本地文件存储按单实例设计，多实例须先解决共享存储。
2. 运行 `bun run verify`，并单独完成真实数据库和浏览器教学测试；命令与安全前提见 [README](../README.md#开发与验证)。
3. 使用 `bun run start`，或先 `bun run build` 再运行 `NODE_ENV=production bun src/index.ts`；不要以未构建的生产模式上课。
4. 反向代理负责 TLS；仅确认全部流量强制 HTTPS 后开启 HSTS。代理超时应允许服务端 30 秒计算期限后的 JSON 错误正常返回。
5. 验证三个入口、深链、附件与总体下载，以及登录、抽样、提交、批改闭环。
