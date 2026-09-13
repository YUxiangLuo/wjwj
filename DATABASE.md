# 数据库与文件维护

PostgreSQL 通过 Drizzle 的 `bun-sql` adapter 访问，运行连接为 `DATABASE_URL`。表结构源在 `src/db/schema.ts`，包括账号、学期/班级、模板/附件、任务/实验、抽样记录、自主分析、公告、审计与会话共 14 张表。配置见[运行与部署](docs/OPERATIONS.md)。

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

### 变量字典增量

`0002` 向 `topic` 增加可空的 `variable_dictionary` JSONB 及确认版本的外层约束；`0003` 增加独立的单调修订计数（旧记录为 0，已有已确认字典承接其修订号）。不回填旧字典、不转换总体文件、不改变原字段映射或成绩。已应用当前基线的数据库使用上述 migrate 命令升级，不需要 reset。

字典基础接口为教师鉴权下的 `GET/PUT /api/teacher/topics/:id/variables`：GET 只读取已确认字典或生成未确认建议，不写入；PUT 使用 `{ dictionary }`，必须带 GET 返回的来源摘要和修订版本，服务器校验全体数据后递增版本。教师可在模板向导“研究目标与字段”步骤保存字段并配置字典，在模板详情只读查看。学生通过 `GET /api/student/tasks/:id/variables` 只读获取本班任务的已确认字典，并可在问卷中声明可选的题目—变量关联；可在阶段4运行、保存单变量自主分析并附到报告；回归工作台仍未实现。合同见 `src/domain/experiment/variable-dictionary.ts`。

- 字典记录精确源字段、类型、单位、类别原值/标签及缺失编码，最大 192 KiB；数字外观不等于连续变量。
- 变量 ID 的作用域是模板及数据版本，内容摘要相同不授予跨模板权限。修订号会跨换源/失效操作持续递增，防止恢复相同数据后旧页面覆盖新配置；未确认建议也可能有正修订号，应以接口的 `confirmed` 状态判断是否已确认。
- 写入受教师归属、发布/任务冻结、存储事务锁及字典版本检查保护；替换总体或改变字段用途时清除字典并递增计数，等价配置保存不清除。
- 复制模板保留同源字典内容并从修订号 1 开始；源内容摘要不符或字典损坏时拒绝复制/发布/分配，不静默修补。
- 新提交携带已确认的字典快照；历史提交缺省仍无字典，批改不会附加当前模板字典。

问卷的 `options: [{ id, label }]` 与版本化 `variableBinding` 记录任务范围、来源/字典修订、题目语义快照和精确编码；运行时不自动回填，抽样计算不变。通用 JSONB 驱动和实验读取边界也只接受原生对象/数组，损坏值返回有界的 `INVALID_JSONB_STORAGE`，不解包 JSON 字符串、不把损坏内容当作空数据。所有阶段保存和新提交统一拒绝重复题目身份、重复/无效选项；已应用高级规划必须附可复核快照，不再按记录年代放行。部署前应检查存量无效记录、缺快照方案及未规范化 CSV，安排明确修正；应用不会自动改写历史记录或源文件。数值题使用 `type: "numeric"` 和必填的 `numberRule`（unit/min/max/decimalPlaces），其 `continuous` 关联只记录 variableId，不存试填答案或伪造选项。沿用当前 JSONB 列，不需要新增 SQL 列或旧格式适配器。新关联随阶段 1 的原版本保护持久化，最终提交再次校验并与字典一同进入快照，无独立必做门槛。禁止通过删除成果或执行 reset 回滚；不要用旧程序写入已升级的选项结构。

### 统一选项增量（0004）

`0004_question_options` 在同一事务内转换模板推荐题、实验问卷及提交问卷快照的选项表示：文本数组与平行身份数组合并为 `options: [{ id, label }]`，删除平行字段。保留标签的精确字符、顺序及已有身份，关联及其语义签名不改写；仅对原来未关联且无身份的选项，显式分配一次确定性身份。服务端已保存问卷与相同提交副本使用相同分配范围。报告、成绩、版本、日期、字典、源文件及抽样记录不变。

- 先停止所有应用写入，完成数据库与 storage 配套备份，再运行 `db:migrate`；只在通过演练后部署新代码。该迁移没有新增业务列，迁移函数只存在于当前连接的临时 schema。
- 混合形态、错误身份数量/类型、重复身份、已有绑定却缺少身份、字符串化问卷等使整个迁移回滚；错误只包含表/记录位置，不输出题目内容。需人工核对并明确修正后重试，不自动猜测、跳过或 reset。
- 表示转换不修复重复标签或无效评分规则，也不重新解释历史成绩；当前保存和提交仍按严格规则检查。历史快照仅改变选项编码形态，不改变教学内容。
- 无双格式运行时适配。浏览器中的旧形态草稿不自动转换或覆盖：暂停编辑/自动保存，提供原草稿备份及明确丢弃后重新加载服务端记录的入口。
- 需要回滚时停止写入，用迁移前的成套备份和对应旧应用恢复到独立环境验证；不让旧写入路径继续操作已升级数据。

### 自主分析增量（0005）

`0005_research_analysis` 新增 `research_analysis_run`，成功运行以独立记录保存，不覆盖既有成果；`experiment.analysis_references` 是可选报告引用的身份数组（默认空），`sampling_revision` 是抽样阶段成果的单调代次。已有完成抽样的记录以其现有 `version` 显式锚定初始代次；其他记录为0。不改变原版本、日期、报告、问卷、快照或成绩，不为历史实验补造分析记录。

- 停止写入、配套备份、在恢复库演练后再迁移并部署。阶段3完成时把新版本号写入抽样代次，避免同一毫秒、同一随机种子的重做让旧分析复活；报告编辑不改变该代次。
- `GET/POST /api/student/tasks/:id/research-analyses` 仅针对当前学生、本班任务。POST 只接收 `spec`、`observedVersion`、`requestKey`，不接受样本、权重或结果；同一请求键与不同配置/输入版本冲突。
- 计算在有界Worker中执行（1个活动、2个等待、30秒）；成功后在实验行及归属锁下再次核验版本、状态、来源、班级及容量，再插入记录。运行不改正文或实验版本；被取消/超时/中断的未完成计算没有永久“运行中”记录，可明确重试。
- 每实验最多30条保存结果、报告最多引用10条；不自动删除旧结果。重新打开上游阶段按原规则清空下游报告及引用，历史分析仍保留并标为过期。
- 保存报告和最终提交都校验引用归属与来源；被选记录进入提交快照，教师和学生读取同一附录，不以当前运行表补齐历史快照。未选任何分析时，原完成规则及评分权重不变。

## 真实数据库验证

`db:check` 只检查迁移文件，不验证实际数据库。使用独立、可丢弃的数据库运行合同及并发测试：

```sh
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/wenjuan_test'
DATABASE_URL="$TEST_DATABASE_URL" bun run db:migrate
bun run test:db
```

`test:db` 只使用 `TEST_DATABASE_URL`，不回退到应用库；运行前会检查是否已应用全部当前迁移；可升级的旧迁移前缀不等于测试库已就绪。测试覆盖持久化、唯一约束、级联删除、会话与归属锁、当前学期创建/选择/删除，以及变量字典并发确认和发布冻结的并发不变量；选项迁移测试通过临时表验证整事务回滚、编码/身份保留和历史成果不变；自主分析测试覆盖实际SQL并发幂等、计算中来源/班级/提交状态变化、单调代次、引用与级联删除。完整测试入口见 [README](README.md#开发与验证)。

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
- 学生与任务硬删除会级联清除实验、抽样记录、自主分析成果和相关审计明细；学生会话在同一事务清除。已分配模板在全部任务删除前受保护。产品侧确认规则见[教学与账号指南](docs/TEACHING.md)。

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
