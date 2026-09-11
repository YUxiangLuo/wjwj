# 教师端测试深化规划

目标：把教师端从"路由测试厚、页面/组件薄"补成可防回归的行为测试体系，并用真实浏览器的 dogfood 场景覆盖跨端联动与对抗路径。

> 原则：不为覆盖率保留易碎用例；不新增源码字符串/样式断言（`check:styles` 已覆盖样式）；UI 只测行为与回退，不测文案细节。

## 0. 覆盖地图与差距

| 区域 | 源码行 | 现测试行 | 判定 | 缺口 |
| --- | --- | --- | --- | --- |
| `src/teacher/routes` | 1719 | 2305 | 厚 | `announcements`、班级 CRUD、`auth` 的 me/logout/password、grading 权重边界 |
| `src/teacher/topic` | 1784 | 882 | 中 | `access.ts`、`content-service.ts`、`query-service.ts`、`grade-export-names.ts` 无独立测试 |
| `src/teacher/pages` | 3062 | 352 | 薄 | `TopicManagement`、`TaskProgressDetail`、`ClassManagement`、`TeacherApp`、`Login` 基本未测 |
| `src/teacher/components` | 2042 | 199 | 薄 | `TopicWizardDialog`、`TaskPublishDialog`、`TaskExtendDialog`、`StudentImportDialog`、`StudentConfirmDialog` 未测 |

已有但很浅：`TaskManagement.test.ts`、`StudentManagement.account-state`、`GradingDetail.invalid-id/recovery`。

## 1. 共用设施（先建，避免重复）

1. `test-utils/teacher-harness.ts`：页面渲染统一封装（`MemoryRouter` + mock `teacherApi` + 可选 `useWorkspaceAuth` + DOM 安装/清理 + toast mock）。
2. `test-utils/mock-db` 增强：断言 `for("update")`/`for("share")`、事务内操作顺序、`acquireStorageMutationLock` 调用。
3. `test-utils/teacher-fixtures.ts`：教师（T001 / T002 多班 / T003 历史班级）、班级、学生（重名/跨班）、模板（草稿/已发布/已锁定/零方差/缺 PPS 规模）、任务（未开放/进行中/已截止）、实验（四阶段/已提交/已批改/已驳回）。
4. 总体文件构造器：N/方差/缺失值/重复 ID/负值与零均值/全常量/类别>20/微小数(1e-6)/超大数。
5. 确定性工具：固定时钟、固定种子、请求 ID 递增器。
6. dogfood 骨架：复用 `scripts/test-teaching-flow.ts` 的会话/临时库/证据目录模式，抽公共部分为 `scripts/dogfood-teacher.ts`。

## 2. 单元测试计划

### 2.1 `topic/access.ts`
- 本人模板放行；他人模板 403；不存在模板的既定语义；`teacherId` 非整数/负数；同教师多模板互不干扰。

### 2.2 `topic/task-service.ts`（已有，扩展竞态与边界）
- publish：未发布/无总体/合同不完整/权重不完整 → 拒绝且**不取锁**；含他人班级 → 403 且**全有或全无**；部分已存在 → 只插新班、`skipped` 精确；deadline 过去/非法/非字符串；锁内复核模板被删；`openTime=now`、`deadline` 入库一致（UTC）。
- extend：新截止 ≤ now / ≤ 原截止 → 拒绝；无截止任务可设置；**并发只有一个生效**、后者 409；非本人任务 404。
- delete：级联清 experiment + sampling_attempt + audit_event（数量/表名精确）；非本人 404；锁内 `for("update")`。

### 2.3 `topic/content-service.ts`
- 附件：类型/大小上限、文件名净化、路径逃逸、替换旧文件删除时机（先库后文件）、失败回滚、并发同名。
- 推荐题：整表替换（增/删/排序/ID 复用）、非法题目（空题干、选项<2、单选无选项）、超长/超量。
- `copyTopicWithResources`：总体文件/附件/推荐题/合同/权重一起复制；目标名去重后缀；源文件缺失行为；复制后与原模板解耦。

### 2.4 `topic/query-service.ts`
- `listTeacherTopics`：仅本人；含 `description`/`dataRows`；排序稳定；空列表。
- `getTeacherTopicDetail`：`fieldMapping/samplingPolicy/weightConfig/recommendQuestions` 的字符串/对象两种存储；损坏 JSON 回退。
- `listTeacherTasks`：本人班级；开放/截止派生状态。
- `getTeacherTaskProgress`：分桶与 `buildTaskProgressSnapshot` 一致；无学生班级；全员计入分母（账号无启停用状态）。

### 2.5 `topic/validation.ts`（已有，补边界）
- 映射：目标非空、比例目标必须有类别、PPS 规模≠目标且全正、分层 2–20 类。
- 发布就绪：错误优先级（缺总体 > 缺映射 > 策略冲突 > 缺权重）。
- 值校验：缺失/非数值/重复标识符/超行数（0、1、100000、100001）。

### 2.6 `topic/grade-export-names.ts`
- 优先取 `submissionSnapshot` 的不可变姓名/课题名；快照缺失回退当前值。

### 2.7 路由层补测
- `announcements`：只返回 `status=1` 且 scope∈{all,teacher}；排序 desc。
- `classroom` 班级 CRUD：创建/改名/删除归属校验；删除班级的级联策略。
- `auth`：`me`（会话过期/身份变化）、`logout`（幂等、迟到 logout 不撤销新会话）、`password`（旧密码错、强度不足、成功后会话旋转）。
- `grading`：权重来源（快照优先否则模板）、`total=Σscore×weight` 精确 2 位、非法分数（负/超 100/非数/缺项）、`observedVersion` 冲突 409、驳回清空分数并写 `rejectReason`。
- `export`：筛选组合、空结果、Excel 与预览一致、快照名。

### 2.8 页面/组件（最大缺口，行为优先）
- `TeacherApp`：未登录跳登录、会话失效整页跳转、`*` 回首页、错误边界、懒加载 fallback。
- `TopicManagement`：创建→草稿→发布→锁定；`editingTopicId`/`mode` 切换；步骤保存失败不推进；发布前校验拦截；删除确认；列表刷新与详情重载顺序。
- `TopicWizardDialog`：7 步每步"下一步禁用条件"；智能推荐后改目标；已发布只读；小总体预警（N<100）；创建期名称/描述不被覆盖；`mode` 标题不变。
- `StudyContractEditor`：`resolveResearchQuestionForTargetChange`/`buildDefaultStudyContract`/`isStudyContractComplete`；目标类型切换重置合同。
- `TaskManagement`：`compareTeacherTasks` 排序；多班发布去重；延期成功/冲突；删除确认；加载失败不伪装空态。
- `TaskPublishDialog`/`TaskExtendDialog`：提交禁用条件、就地校验错误、单一出口、成功回调只触发一次。
- `TaskProgressDetail`：分桶渲染、搜索过滤、空态、失败重试。
- `GradingManagement`：迟到响应忽略、失败重试、分页/总数。
- `GradingDetail`：版本冲突保留输入、重试、驳回、非法 ID 终态、切换学生不串数据。
- `GradeExport`：筛选联动、预览与导出、空结果、analytics 与预览独立错误态。
- `ClassManagement`/`StudentManagement`：班级下拉、分页搜索、重置密码后刷新、删除确认、导入对话框（文件校验/部分失败/重复学号）。
- `api-client`：`X-Expected-User-Id` 注入、409 SESSION_CHANGED、下载鉴权、超时与重试边界。

### 2.9 共享纯逻辑
- `scoring-weights`、`sampling-policy`、`analysis-target`、`questionnaire-normalize`、`spreadsheet`、`busy-retry` 的教师调用侧边界。

## 3. Dogfood 计划（浏览器，教师端）

每条：步骤 → 预期观察 → 证据 → 通过判据。

**D1 模板全生命周期**
1. 创建（7 步）→ 草稿仅本人可见 → 发布（缺总体/合同/权重分别被拒）→ 分配后转只读（UI+API 双验）。
2. 复制副本 → 改副本不影响原任务学生快照。
3. 删除未分配模板成功；已分配被拒。
4. 边界：零方差均值、全常量比例、PPS 无合格规模、分层>20、N<100 预警、微小数显示与导出。

**D2 任务与截止**
5. 多班发布（跳过已存在）；三态排序；延期成功；**两窗口并发延期**不倒退；截止后新写入被拒、已通过检查的请求可完成。

**D3 班级与学生**
6. 导入含空行/重复学号/非法列/超限 → 明确报错、不半途写入；重置密码后会话失效；删除学生级联；删除班级影响确认。
7. 班级归属不可变更（管理员只能改名），旧教师写请求仍受班级归属校验保护。

**D4 批改**
8. 评分（加权总分 2 位、写入时间/批改人）→ 学生端即时可见。
9. 两窗口并发批改 → 一成一 `VERSION_CONFLICT`；冲突页保留输入、显式刷新不丢。
10. 驳回 → 学生改后重交 → 教师见新版本；评分后快照姓名/课题名不随改名变化。

**D5 成绩分析与导出**
11. 漏斗/分布/均值与库一致；按学期/班级/模板筛选；单任务与批量 Excel；空结果与失败态；文件名与编码。

**D6 教师↔学生联动（每轮必跑）**
12. 建模板→发布→分配→学生四阶段→提交→批改→学生可见→教师进度更新；每步 DB 与 UI 对账。
13. 推荐题双向：教师推荐→学生引用→进入快照→批改可见。
14. 抽样策略联动：必做/选做/不适用 在完成门禁与结果过滤上一致。

**D7 对抗与恢复**
15. 会话：跨角色 cookie 隔离、标签页切换账号、退出后回退。
16. 网络：断网/500/超时提示与重试（不伪装空态）。
17. 并发：同模板并发发布不同班；同学生并发重置密码；删除任务与归属校验竞争。
18. 脏输入：20 MiB 边界、xlsx 公式、CSV 注入、超长名称、中文/emoji 文件名。
19. 视口/键盘：sticky 操作条不遮挡（含换行）、Tab 顺序、弹窗焦点返回。

## 4. 数据与夹具
- 扩展 `db:seed:demo` 或新增仅测试库使用的 `db:seed:teacher-fixtures`：覆盖上述矩阵与总体文件。
- dogfood 用 `TEST_DATABASE_URL` 临时库，跑完删除；证据写入 `test-results/dogfood-teacher-<日期>/`。

## 5. 优先级与阶段

| 阶段 | 内容 | 目标 |
| --- | --- | --- |
| P0 正确性/安全 | 2.1、2.2、2.7 grading/classroom/auth、D6、D2/D3 并发 | 防回归与越权 |
| P1 状态机/恢复 | 2.8 的 Topic*/Task*/Grading*/GradeExport、D4/D5 | UI 行为与恢复 |
| P2 Dogfood 广度 | D1/D2/D5/D7 全场景 | 真实端到端 |
| P3 工具化 | `dogfood-teacher.ts` + nightly CI | 可持续 |

## 6. 度量与退出标准
- 页面/组件测试从 ≈10% 提升到 **≥50%**（行为覆盖优先）。
- 每个 `topic` 服务导出函数至少 1 组边界。
- 连续 3 次全量 + 2 次随机顺序全绿（零 flake）。
- 每个 P0 场景同时具备单测与 dogfood 证据（截图 + DB 对账）。
