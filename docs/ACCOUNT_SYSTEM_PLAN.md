# 账号体系修复与优化计划

依据：`docs/ACCOUNT_SYSTEM_REVIEW.md`（模型、历史缺陷、已修复项、已移除项）与本轮测试结论。
基线：学生/教师账号**无启用状态**（只有存在与否），班级归属**不可变更**，学生/任务为硬删除。

## 0. 当前基线（本轮已完成）

| 项 | 状态 |
| --- | --- |
| 导入/新增按"班级归属 + 教师归属"分类（跳过 / 指名班级 / 不泄露跨教师班级名） | ✅ |
| 学号全局唯一 + 硬删除释放 + 重导入幂等（真实库覆盖） | ✅ |
| 移除学生/教师账号停用启用、管理员更换授课教师（迁移 `0001`） | ✅ |
| 种子/文档/SECURITY/客户端错误码同步，`check:docs`、`db:seed:check` 通过 | ✅ |
| P0 全部完成：删除影响面预览 + 显式确认、导入并发逐行定位、归属不变量固化 | ✅ |
| 单元 1074（1063 pass / 11 skip / 0 fail）、DB 集成 11、浏览器实测删除确认与名单 | ✅ |
| P1 全部完成：教师删除、学号归属查询与调班、删除守卫提示、导入错误明细 | ✅ |
| 单元 1093（1081 pass / 12 skip / 0 fail）、DB 集成 12、浏览器实测 P1 四项 | ✅ |

## 1. P0：正确性与数据安全 —— ✅ 已完成

### P0-1 硬删除的后果可见化与二次确认 ✅
- 问题：`DELETE /teacher/students/:id` 与任务删除会**静默级联**清空实验、提交、成绩、抽样记录与相关审计事件；当前只有 UI 文案提示，服务端无任何护栏，误删不可恢复。
- 已实现（A + B 的组合，覆盖 UI 与脚本两条路径）：
  - `GET /api/teacher/students/:id/deletion-preview`、`GET /api/teacher/tasks/:id/deletion-preview` 返回 `{ impact: { experiments, submitted, graded }, requiresConfirmation }`；
  - 学生与任务的 `DELETE` 在**同一把行锁事务内**统计影响面；存在 `submitted|graded` 且未带 `?confirm=1` 时返回 409 `SUBMISSIONS_EXIST`（消息含具体条数），否则级联删除；
  - 教师端确认框在删除前拉取影响面，列出「N 条实验记录、已提交 X 条、已批改 Y 条」，确认时按需带上 `confirm=1`；预览失败或收到 409 时保持对话框打开，把下一次点击变成显式确认。
- 验收证据：路由测试 4 条（预览 / 无确认拒绝 / 带确认通过 / 无提交一步删除）+ 任务侧 3 条 + DB 集成测试 `hard deleting a student requires confirming the cascaded submissions`（真实 409 → confirm 后实验行归零）；浏览器实测对话框与 API 行为一致。

### P0-2 导入的原子性与逐行冲突定位 ✅
- 问题：查重分类在事务外，并发导入同一学号时靠唯一约束兜底（409 `CONFLICT`，实测无 500），但**错误不定位到具体行**，批量名单里哪一行冲突无法从响应看出。
- 已实现：插入改为 `ON CONFLICT (student_id) DO NOTHING … RETURNING student_id`，批量插入不再因并发冲突整体失败；未插入的行在事务后重新分类，分别落到 `skippedCount`（本班已存在）或 `errors[]`（指名班级 / 其他教师）。
- 验收证据：路由测试 `student import reports a lost insert race per row instead of failing the file`（插入 0 行 → 1 skipped + 1 命名错误，且插入语句带 `ON CONFLICT DO NOTHING`）；`mock-db` 新增记录该冲突策略以支持断言。

### P0-3 归属不变量固化 ✅
- 问题：班级归属不可变更后，`requireOwnedClass` / 评分的班级锁仍承担"写请求必须属于当前教师"的职责，但缺少一条明确的不变量测试。
- 已实现：
  - 路由测试 `admin class update renames the class and ignores any teacher reassignment`：`PUT /api/admin/classes/:id` 带 `teacherId` 时只写 `name`，且不产生教师查询；
  - DB 集成测试 `a class keeps its teacher: reassignment is not a supported write path`：直接把 `class.teacher_id` 改到另一教师（模拟库外修复）后，原教师的评分返回 404、导入返回 403，新教师的评分返回 200。

## 2. P1：运维与健壮性 —— ✅ 已完成

### P1-1 教师生命周期闭环 ✅
- 问题：教师无删除接口、班级不可移交 → 教师离职后其账号、班级、课题永久保留，只能改名或重置密码，清理需直接操作数据库（R4）。
- 已实现（选择"删除"策略）：`DELETE /api/admin/teachers/:id`，在行锁事务内统计班级与实验模板；有引用时 409 `TEACHER_IN_USE` 并列出数量，否则删除账号、登录会话与教师相关的审计事件（成绩通过 `ON DELETE SET NULL` 保留）。
- 教师列表新增 `topicCount` 与 `deleteBlockers`，教师管理页在删除按钮上禁用并给出原因。
- 验收证据：路由测试 3 条；浏览器实测 T001–T003 显示「仍有 2 个班级、8 个实验模板，无法删除」，无引用的账号可直接删除。

### P1-2 跨教师学号占用的处理路径 ✅
- 问题：学号被其他教师班级占用时，导入只能报"学号已被其他教师使用"，教师无从推进（R3）。
- 已实现：
  - `GET /api/admin/students/lookup?studentId=` 返回学生、所属班级/授课教师与实验影响面；
  - `PUT /api/admin/students/:id/class` 在事务内改 `class_id`、撤销全部学生会话并写 `student.class_changed` 审计事件；同班级时为幂等 no-op；
  - 教师端跨教师冲突文案改为「学号已被其他教师使用，请联系管理员确认归属后重试」；
  - 管理员学生页新增「学号归属查询」卡片：查归属 → 显示班级/教师/实验条数 → 选择目标班级调整。
- 验收证据：路由测试 7 条 + DB 集成测试 `moving a student to another class keeps the history and revokes the old session`（实验行保留、旧会话 401）；UI 测试 3 条；浏览器实测跨教师导入提示与真实调班（调班后学生出现在新班级，旧会话失效）。

### P1-3 学期/班级删除守卫与前端提示一致 ✅
- 问题：`class DELETE`、`semester DELETE` 的阻断原因在服务端是具体的，但前端仅在失败后 toast 报错；学期管理页在选择当前学期/有班级学期时没有前置提示。
- 已实现：班级列表返回 `taskCount` 与 `deleteBlockers`（`N 名学生`／`N 个任务`），学期列表返回 `deleteBlockers`（`当前学期`／`N 个班级`）；班级管理页与学期管理页在按钮上禁用并通过 `title` 显示原因，服务端仍是最终裁决。
- 验收证据：`management.counts.test.ts` 4 条断言 + 班级管理 UI 测试；浏览器实测班级 1/2 禁用、空班级可删，当前学期禁用。

### P1-4 导入可诊断性 ✅
- 已实现：导入结果面板新增「下载错误明细（CSV）」，输出带 BOM 的 `行号,原因` 清单；CSV 生成复用 `src/lib/csv.ts` 的 `rowsToCsv`（含公式前缀防护）。
- 验收证据：`rowsToCsv` 纯函数测试；浏览器实测上传含非法邮箱的名单 → 面板显示失败 1 条 → 下载得到 `行号,原因 / 2,邮箱格式无效`。

## 3. P2：一致性与可维护性

### P2-1 账号数量/状态纳入文档门禁
- 问题：本轮移除演示账号后，README 的"3 教师 / 15 学生"与 A 任务分桶只能靠人工同步（`check:docs` 只校验课题/任务/实验计数）。
- 方案：把 `DOGFOOD_COUNTS.teacher/student` 与主任务分桶写进 `check-docs.ts` 的必需片段。
- 验收：改动种子数量但不更新 README 时 `check:docs` 失败。

### P2-2 删除审计留痕
- 问题：删除学生会同时删除该学生的审计事件（隐私取舍），连"某学生被删除"这一动作本身也无痕迹。
- 方案：保留一条不可归属到个人的删除事件（记录学号哈希、班级、操作者、时间），其余明细按隐私策略清理。
- 验收：删除后能查到"操作者 + 时间 + 班级"，但不含姓名/邮箱等个人信息。

### P2-3 危险操作文案与交互统一
- 方案：硬删除统一使用 destructive 样式 + 后果清单（学生：实验/成绩；任务：提交/成绩；班级：仅阻断说明），空态与阻断态文案统一走 `PageHeader`/`StatusBadge` 语义。
- 验收：`check:styles` 通过，三类删除确认框结构一致。

## 4. 测试策略（延续现有原则）

- **纯函数/规则**：直接单测（分类、校验、格式化）。
- **路由/页面**：只测行为、终态与回退，不测 DOM 结构与文案细节；`mock-db` 只表达数据库语义。
- **真实数据库**：账号生命周期、唯一约束、并发冲突、级联删除等只能用 `test:db` 验证的不变量必须落集成测试（现有 16 条）。
- **浏览器**：只验证跨页面真实链路（导入→名单→登录）与关键 UI 状态，不重复覆盖已有自动化断言。

## 5. 执行顺序

1. ✅ P0-1（数据安全）→ P0-3（不变量）→ P0-2（导入定位）
2. ✅ P1-2（跨教师学号）→ P1-3（删除守卫提示）→ P1-1（教师生命周期）→ P1-4（导入可诊断）
3. P2-1 → P2-3 → P2-2（下一批）

## 6. 明确不做

- 不恢复账号停用/启用（本轮已按决策移除）。
- 不恢复班级更换授课教师、不引入学生转班（换班走"删除+重建"）。
- 不为纯样式/源码字符串新增测试（`check:styles` 已覆盖）。
