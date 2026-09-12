# 数据库与文件维护

PostgreSQL 通过 Drizzle 的 `bun-sql` adapter 访问，运行连接为 `DATABASE_URL`。表结构源在 `src/db/schema.ts`，包括账号、学期/班级、模板/附件、任务/实验、抽样记录、公告、审计与会话共 13 张表。配置见[运行与部署](docs/OPERATIONS.md)。

## 初始化与迁移

在空数据库执行，迁移角色须能 `CREATE EXTENSION citext`，否则请 DBA 先安装扩展：

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan'
bun run db:migrate
bun run db:bootstrap-admin
```

当前 `drizzle/postgresql/0000` 是完整的空库基线，替代了旧迁移历史。**旧版本数据库不能直接原地升级到该基线。** 应先备份，再选择新库部署，或明确接受丢弃数据后重建；不要把 reset 当作保留数据的升级方式。后续表结构变更按增量迁移维护：

1. 修改 `src/db/schema.ts`。
2. `bun run db:generate`，审查生成的 SQL。
3. `bun run db:migrate`，再运行 `bun run db:check` 检查迁移文件。

不使用 Drizzle Kit 的 `push` / `studio` / `drop`。迁移不自动写 seed；生产只 bootstrap 首个管理员，演示 seed 的准备、失败重建和固定计数见[演示指南](docs/DEMO.md)。

## 真实数据库验证

`db:check` 只检查迁移文件，不验证实际数据库。使用独立、可丢弃的数据库运行合同及并发测试：

```sh
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan_test'
DATABASE_URL="$TEST_DATABASE_URL" bun run db:migrate
bun run test:db
```

`test:db` 只使用 `TEST_DATABASE_URL`，不回退到应用库；运行前会检查是否已迁移。测试覆盖持久化、唯一约束、级联删除、会话与归属锁、当前学期创建/选择/删除的并发不变量。完整测试入口见 [README](README.md#开发与验证)。

共享开发机上的多个应用进程会竞争连接，每进程连接池约 10 个。遇到连接数耗尽时先清理不用的进程；确需提高 PostgreSQL `max_connections` 时，评估内存并安排重启，不要持续盲目重试。

## 危险操作与存储清理

| 命令 | 影响 |
| --- | --- |
| `bun run db:clean` | 删除本项目当前/历史表及 `drizzle` 元数据 schema，不枚举删除其他项目表 |
| `bun run db:reset` | clean → migrate → bootstrap 首个管理员 |
| `bun run db:reset:demo` | clean → migrate → 演示 seed |

上述清表步骤必须提供 `CONFIRM_DATABASE_NAME`，值与连接串中的数据库名完全一致。**清表不可恢复，且不会删除 `storage/`。** 在运行前核对目标库和配套备份。

```sh
bun run storage:audit      # 只读检查孤立文件
```

审阅列表后，按输出的 snapshot token 执行 `bun run storage:clean --confirm=<token>`。清理只删除未被总体、附件或可识别的旧提交路径引用的文件，不直接清空存储目录。

- 替换总体文件先提交数据库更新，再删除旧文件。
- 上传、复制、发布任务、删除任务/模板和存储清理共享 PostgreSQL advisory lock；持锁后重新验证归属与可修改性，避免删除尚在提交的文件引用。
- 学生与任务硬删除会级联清除实验、抽样记录和相关审计明细；学生会话在同一事务清除。已分配模板在全部任务删除前受保护。产品侧确认规则见[教学与账号指南](docs/TEACHING.md)。

## 单实例配套备份与恢复

**PostgreSQL 与 `storage/` 必须作为同一套备份。** 当前本地文件系统按单实例设计；多实例需要共享卷或对象存储，不能仅增加应用进程。

### 备份

进入维护窗口，停止所有能上传、替换或删除文件的应用进程，再用同一时间戳把两部分保存到仓库外：

```sh
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir=/safe/path
pg_dump "$DATABASE_URL" --format=custom --file="$backup_dir/wenjuan-$stamp.dump"
tar -C "$(pwd)" -czf "$backup_dir/wenjuan-storage-$stamp.tar.gz" storage
(
  cd "$backup_dir"
  sha256sum "wenjuan-$stamp.dump" "wenjuan-storage-$stamp.tar.gz" \
    > "wenjuan-$stamp.sha256"
)
```

一并保留校验清单、应用 commit 与迁移版本。校验清单使用相对文件名，移动整套备份后仍可校验。

### 恢复演练

使用相同应用版本、**独立空测试库和不存在的目标 storage 目录**；不能只恢复其中一部分或覆盖现有生产目录：

```sh
stamp=20260814T120000Z
backup_dir=/safe/path
app_dir=/srv/wenjuan
RESTORE_DATABASE_URL='postgresql://restore_user:password@127.0.0.1:5432/wenjuan_restore_test'

(cd "$backup_dir" && sha256sum --check "wenjuan-$stamp.sha256")
pg_restore --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" "$backup_dir/wenjuan-$stamp.dump"
test ! -e "$app_dir/storage" || { echo "restore storage path must not exist" >&2; exit 1; }
tar -C "$app_dir" -xzf "$backup_dir/wenjuan-storage-$stamp.tar.gz"

cd "$app_dir"
DATABASE_URL="$RESTORE_DATABASE_URL" bun run db:migrate
TEST_DATABASE_URL="$RESTORE_DATABASE_URL" bun run test:db
DATABASE_URL="$RESTORE_DATABASE_URL" bun run storage:audit
```

确认每步成功后再继续。验证通过后，以恢复库启动应用并检查典型附件和总体下载，才可接受这套备份。不要在生产库上运行恢复测试。

## 排序规则版本不一致

系统 libc/ICU 升级可能使 PostgreSQL 记录的 collation 版本落后。**先重建索引，再刷新版本标记**；仅刷新标记不能修复索引顺序。

```sql
SELECT datname, datcollversion AS recorded_version,
       pg_database_collation_actual_version(oid) AS actual_version
FROM pg_database WHERE datname = current_database();
```

维护窗口中停止写入、使用 `pg_dump` 备份，然后在受影响的数据库连接中执行（替换为实际数据库标识符）：

```sql
REINDEX DATABASE wenjuan_pg_dev;
-- 仅在 REINDEX 成功后执行：
ALTER DATABASE wenjuan_pg_dev REFRESH COLLATION VERSION;
```

重新查询版本并验证大小写不敏感的查找。数据库测试只能在独立恢复/测试库运行；验证完成前保留备份。
