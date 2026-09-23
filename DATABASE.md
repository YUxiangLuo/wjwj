# 数据库与文件维护

运行连接为 `DATABASE_URL`，表结构源为 `src/db/schema.ts`。配置见[运行与部署](docs/OPERATIONS.md)。

## 初始化、迁移与测试

空数据库的迁移角色须能创建 `citext`：

```sh
bun run db:migrate
bun run db:bootstrap-admin
```

`drizzle/postgresql/0000` 是完整空库基线，替代旧迁移历史。**旧数据库不能原地应用：先备份，再迁往新库；只有明确接受数据丢失时才重建。reset 不是升级手段。**

结构变更：修改 `src/db/schema.ts`，运行 `bun run db:generate` 并审查 SQL，再运行 `bun run db:migrate` 和 `bun run db:check`。不要使用 Drizzle Kit 的 `push`、`studio` 或 `drop`。

真实数据库测试只能使用独立、已迁移、可丢弃的库：

```sh
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan_test'
DATABASE_URL="$TEST_DATABASE_URL" bun run db:migrate
bun run test:db
```

`test:db` 不回退到应用库。共享开发机连接耗尽时先清理闲置进程；提高 PostgreSQL `max_connections` 前评估内存与重启窗口。

本地 CI 使用 `TEST_DATABASE_URL` 的角色创建随机命名的一次性数据库，并在结束时删除；不会写入连接串中指定的基准数据库：

```sh
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/postgres'
bun run ci:local          # 原 push/PR 阻断门禁
bun run ci:local:full     # 再执行随机顺序测试和浏览器教学闭环
```

该角色必须拥有 `CREATE DATABASE` 权限。异常中断若来不及清理，可人工删除 `wj_local_ci_` 或 `wj_browser_` 前缀的临时数据库；不要按前缀批量删除未确认归属的库。

## 危险操作与存储

| 命令 | 影响 |
| --- | --- |
| `bun run db:clean` | 删除本项目表及迁移元数据 |
| `bun run db:reset` | clean → migrate → 首个管理员 |
| `bun run db:reset:demo` | clean → migrate → 演示 seed |

三者都必须提供与目标连接串数据库名完全一致的 `CONFIRM_DATABASE_NAME`。**清表不可恢复且不会删除 `storage/`；执行前核对目标库并确认数据库与文件已有配套备份。**

`bun run storage:audit` 只读列出孤立文件；审阅后用输出的 token 执行 `bun run storage:clean --confirm=<token>`。不要直接清空存储目录。替换总体文件应先提交数据库更新，再删除旧文件。学生或任务硬删除会级联删除实验、成绩、抽样记录和审计明细，规则见[教学指南](docs/TEACHING.md)。

## 配套备份与恢复

**PostgreSQL 与 `storage/` 必须作为同一套备份。** 本地文件系统只支持单实例；多实例须使用共享卷或对象存储。

在维护窗口停止所有会修改文件的进程，以同一时间戳保存到仓库外：

```sh
stamp="$(date -u +%Y%m%dT%H%M%SZ)"; backup_dir=/safe/path
pg_dump "$DATABASE_URL" --format=custom --file="$backup_dir/wenjuan-$stamp.dump"
tar -C "$(pwd)" -czf "$backup_dir/wenjuan-storage-$stamp.tar.gz" storage
(cd "$backup_dir" && sha256sum "wenjuan-$stamp.dump" \
  "wenjuan-storage-$stamp.tar.gz" > "wenjuan-$stamp.sha256")
```

同时记录应用 commit 和迁移版本。定期在**独立空测试库和不存在的目标 storage 路径**演练恢复；不能只恢复一部分、覆盖生产文件或在生产库演练：

```sh
(cd "$backup_dir" && sha256sum --check "wenjuan-$stamp.sha256")
pg_restore --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" \
  "$backup_dir/wenjuan-$stamp.dump"
test ! -e "$app_dir/storage" || exit 1
tar -C "$app_dir" -xzf "$backup_dir/wenjuan-storage-$stamp.tar.gz"
(cd "$app_dir" && DATABASE_URL="$RESTORE_DATABASE_URL" bun run db:migrate)
(cd "$app_dir" && DATABASE_URL="$RESTORE_DATABASE_URL" bun run storage:audit)
```

每步成功后再继续。核对恢复前后的关键表行数、典型提交快照与文件校验和；在 `$app_dir` 以恢复库启动应用，检查历史提交、样本导出和附件下载后才接受备份。`storage:audit` 只列出孤立文件，不能代替已引用文件的完整性检查。

**不要在恢复库运行 `test:db`，也不要为通过测试清空恢复数据。** 集成测试会写入测试夹具（例如另一个当前学期），与已恢复的业务数据产生唯一约束冲突；它不适合作为恢复验收。需要数据库回归时，另建空的已迁移、可丢弃测试库，按上文“初始化、迁移与测试”执行。

## Collation 版本

libc/ICU 升级后，若 PostgreSQL collation 版本不一致，应在停止写入并完成备份后**先 `REINDEX DATABASE <数据库>`，成功后才 `ALTER DATABASE <数据库> REFRESH COLLATION VERSION`**。只刷新版本不能修复索引。随后复查版本和大小写不敏感查询，并保留备份至验证完成。
