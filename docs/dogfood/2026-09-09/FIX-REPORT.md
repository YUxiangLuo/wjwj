# DF-001 / DF-002 / DF-003 二次确认与修复

日期：2026-09-10，中国标准时间。范围：用户要求再次确认、修复并提交的三个问题；不代表剩余六轮 dogfood 已全部执行。

## 结论

三个问题均在原版本 `3a8d8f6714e8d600476fe51e8ce236005420ae30` 的 6464 生产实例中再次复现；修复后，在独立新发布快照的 6466 生产实例中通过真实浏览器复测。

- 修复代码及回归测试属于本提交。
- 原 6464/6465 常驻实例仍运行旧快照，**没有自动升级**。
- 6466 使用已有恢复演练库及独立 storage，不使用原业务库；验证结束后已停止，数据和新快照保留。
- 无 schema、业务数据修补或依赖变更。浏览器业务操作通过实际页面控件完成，API 仅作只读核对。

## 问题与边界

| 问题 | 再次确认（旧生产版本） | 修复及实际复测 |
|---|---|---|
| DF-001 / P2 | 同一份末尾带额外空行的 CSV 整表被拒绝，显示错列/引号错误 | CSV 两条解析路径跳过真正空白记录，保留原始物理行号。原文件不再整表拒绝，而是正确报告已有学号和缺字段；另用新夹具实际导入 2 个学生，拒绝 2 行，错误准确定位第 6/7 行 |
| DF-002 / P2 | 当前为 `DF-R1-2026秋季`，新建班级默认却是后创建的历史学期 | 未选择时优先 `isCurrent === 1`；无当前学期保持原首项回退；不覆盖手动选择。浏览器默认正确，实际创建的班级经只读核对确属当前学期 |
| DF-003 / P3 | 中断实验 GET 并刷新，页面显示 `Failed to fetch` | 在共用 API 客户端的 fetch 传输边界转为“网络连接失败，请检查网络后重试”。解除拦截并点击重试后，恢复此前未提交的问卷标题草稿 |

### DF-001 的解析契约

- 支持开头、中间、末尾的空行及仅含空白字符的行；CRLF、LF 均有回归覆盖。
- `,,` 等显式字段记录不当作空行丢弃；引号内换行、空白和显式空字符串仍是字段内容。
- 非空错列、未闭合引号继续拒绝，不放宽结构校验。
- 新增按数据记录对齐的 `rowNumbers` 元数据；CSV 使用记录起始物理行，XLSX 使用工作表真实行。教师导入的缺字段、邮箱、重复学号提示使用该行号。
- 不先分割整个无引号文件，避免大量空行带来的数组分配；空行不占数据行限额，超限哨兵仍保留。回归包含 100005 个空行后接超过 100000 条数据。

### DF-002 / DF-003 的兼容边界

- 未配置学期时仍不能创建班级；连续创建时保留用户手动选择的历史学期。
- 网络提示只转换 fetch 传输异常，不覆盖服务器业务错误、身份变化和主动取消信息；原异常保留在包装异常的 `cause` 中，不新增含请求凭据的日志。
- 三角色网络失败后均可重试，继续携带原 `X-Expected-User-Id`；未添加自动写重试。

## 验证

实际运行时：**Bun 1.4.0**。定向测试先在旧实现运行，随后修复并重新验证；组件测试中另修正了 React 输入事件检测所需的 DOM 初始化时序，该测试环境问题不计为产品缺陷。

| 检查 | 结果 |
|---|---|
| 四个文件的定向回归 | 64 pass、0 fail |
| 新增回归数量 | 17 项：解析 7、API 客户端 4、班级组件 4、教师导入路由 2 |
| `bun run verify` | 通过：类型、样式、文档、两轮单测、生产构建、迁移元数据检查、依赖适用性门禁 |
| 全量正常顺序 / 随机顺序 | 各 1032 pass、15 skip、0 fail；随机种子 20260903 |
| 独立库 `test:db` | 15 pass、0 fail，149 assertions；不把前述 skip 计为通过 |
| `test:teaching` | 通过：问卷、规划、草稿恢复、四阶段/PPS、提交、驳回、重交、评分及 Excel 核对 |
| 新快照独立安装及生产构建 | frozen lockfile 安装成功；87 assets；DEV_AUTH_MODE=0、DEMO_MODE=0 |
| agent-browser 生产复测 | 三问题修复、实际新学生导入、实际班级创建、错误恢复和草稿保留全部通过 |
| 凭据扫描与差异检查 | 文本证据未含当前随机管理员密码、数据库凭据 URL 或会话 token；`git diff --check` 通过 |

依赖门禁仍接受已记录的两项不适用于本应用的 esbuild 开发依赖公告，不宣称原始依赖审计零公告。

教学闭环脚本使用自己的临时库和 development 服务器，并包含 API 准备步骤；它是额外回归，不冒充纯页面生产闭环。上述三个缺陷的生产复测则通过实际页面操作完成。

## 仓库证据

- [旧版本再次复现结果](results/fixes-before.json)
- [新版本同场景复测结果](results/fixes-after.json)
- [实际导入与创建结果](results/fixes-positive-ui.json)
- [含空行的新学生夹具](results/fixes-students-with-blank-lines.json)：JSON 中的 `content` 是原始 CSV 文本，保留 CRLF、空格和制表符，附 SHA256。用 `Bun.write(fixture.filename, fixture.content)` 可还原。（合成数据；不要在已有同学号的环境中期待再次成功插入。）

| 问题 | 再次复现截图 | 修复截图 |
|---|---|---|
| DF-001 | [修复前](screenshots/DF-001-recheck-before.png) | [成功导入及原行号错误](screenshots/DF-001-fixed.png) |
| DF-002 | [修复前](screenshots/DF-002-recheck-before.png) | [默认当前学期](screenshots/DF-002-fixed.png) |
| DF-003 | [修复前](screenshots/DF-003-recheck-before.png) | [中文提示](screenshots/DF-003-fixed.png)、[重试后草稿](screenshots/DF-003-fixed-recovered.png) |

## 本机完整证据与保留环境

```text
ROOT=/home/alice/pros/wenjuan/deployments/wj-dogfood-20260909-3a8d8f6
$ROOT/release-fixes-20260910/            独立新发布快照；src 与本次修复一致
$ROOT/evidence/recheck-fixes.ts         两版本生产页面复测步骤
$ROOT/evidence/fixes/positive-ui.ts     新夹具页面导入、默认班级实际创建
$ROOT/evidence/fixes/before/            再次复现的快照、截图及结果
$ROOT/evidence/fixes/after/             修复后快照、截图、夹具及结果
$ROOT/evidence/fixes/verify.log         完整门禁日志
$ROOT/evidence/fixes/green-tests.log    定向回归日志
$ROOT/evidence/fixes/test-db.log        独立数据库测试日志
$ROOT/evidence/fixes/teaching-flow/     教学闭环脚本产物
$ROOT/evidence/fixes/final-state.log    停止临时实例及原服务健康结果
```

结束状态：临时 unit `wj-fixes-check-20260910` 已停止；测试浏览器会话关闭、网络拦截清除；3000、6464、6465 的 `/admin` 均 HTTP 200（根路径是正常的 302 跳转）。

恢复演练库 `wj_restore_20260909_r1` 此次新增 2 名修复验证学生和 1 个验证班级，以及测试会话/审计记录；不再等同于 R5 初次恢复校验时的数据摘要。clean、dogfood 库未写入这些新记录。复测脚本是状态相关步骤，不可盲目重跑。

此前 [第一批执行报告](EXECUTION-REPORT.md) 和用例台账保留当时的 FAIL 记录；本报告是后续修复闭环，不改写历史结果。统计极端值、完整写权限/并发矩阵、50 人负载、长稳和全量无障碍等待测范围保持不变。
