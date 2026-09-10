# 演示站点 dogfood 结果（2026-09-10）

被测：**线上演示站** `http://5.223.66.40:6363`（`wenjuan-demo.service`）
提交 `7967d7f4891a74a772ca0c9e3ff5a22a66b64bc5`；库 `wenjuan_demo_da73eb9_20260908`；`DEMO_MODE=1` / `NODE_ENV=production` / `TRUST_PROXY=0`
执行方式：`curl` + 只读 SQL + axe-core + `agent-browser` 真实指针；**未**重启服务、**未**改配置、**未**跑负载。

## 一、结论

**全部用例 PASS，0 个 P0/P1/P2 缺陷**，2 条观察（P3）。a11y 三端关键页 **0 违规**。

## 二、用例结果

| ID | 结果 | 证据 |
| --- | --- | --- |
| **DS-01** 产物锁定 | PASS | `/student`(65513ea8…)、`/teacher`(8f78c9cb…)、`/admin`(a792e03a…) 服务端返回与新构建 **逐字节一致**；入口 bundle 可取 |
| **DS-02** DEMO_MODE 门禁 | PASS | `/api/demo/student-credential` → 200，`Cache-Control: no-store, private`，无 `Vary`；端点仅在 `DEMO_MODE=1` 注册（`createDemoStudentRoutes(false) === {}`，见源码与既有测试） |
| **DS-03** 凭据轮换 | PASS | 12 次请求发放 5 个不同账号（S012/S014/S015/S016/S017），**12/12 用返回密码登录成功**；池 = `DEMO_STUDENT_ACCOUNTS` 7 个（S010、S012–S017），与文档 §5 完全一致 |
| **DS-04** 跳过失效账号 | PASS（既有回归覆盖） | `demo-student.test.ts` 已覆盖「密码不再是学号则跳过」与「全部失效 → 503」 |
| **DS-05** 全失效 503 | PASS（既有回归覆盖） | 同上，`DEMO_STUDENT_UNAVAILABLE` |
| **DS-06** 三端 UI 走查 | PASS | 学生：预填 S012/S012 → 任务大厅（吴敏）→ 任务详情 → `/student/task/25/experiment` 阶段 1/4 渲染、编辑器就绪、**控制台 0 error**；教师：T001 登录 → 作业批改（列表 8）→ 成绩分析与导出（应交人次 216）；管理端：admin 登录 → 6 个模块，**控制台 0 error** |
| **DS-07** 鉴权 | PASS | 8 个受保护端点未登录全 **401**；学生跨班 `task 999` → 404；教师 T002 读/写 T001 的 `submitted`/`graded` 实验 → **404**（读写均拒） |
| **DS-08** 路由与资源 | PASS | 深链接无会话 → 200（SPA 壳，API 仍 401）；未知路径 → 404；`/` → 302 `/student`；旧哈希资源 → 200；安全头齐备（CSP、Referrer-Policy、nosniff、X-Frame-Options） |
| **DS-09** 无障碍 | PASS | 6 页 axe-core 4.12.1 **violations=0**：三端登录页各 23 passes；学生任务大厅 33；教师工作台 32；管理端首页 26；学生实验页 37。incomplete 逐条定性见第四节 |
| **DS-10** 数据完整性 | PASS（经还原） | 详见第三节；业务表最终与基线一致：experiments 18、audit_event 2、sampling_attempt 21、students 16、topics 17、tasks 26 |

## 三、⚠️ 本轮在演示库上造成改动并已还原（必须记录）

DS-07 的跨租户**写**用例我用 T001 对 `submitted` 实验发起评分，**成功改动了演示数据**：

| 时间 | 动作 | 影响 |
| --- | --- | --- |
| 14:37 / 14:38 | 以 S012、S010 打开 `/student/task/25/experiment` | `GET /experiment` 惰性创建 → **experiment 19、20**（`in_progress`）；experiments 18 → 20 |
| 14:39:17 | `POST /api/teacher/grading/5`（T001，分数 1/1/1） | experiment 5 `submitted → graded`、`total_score=1.00`、写审计事件 `grade.created` |

**还原方式与核对**：从**发布前备份** `/root/deploy-backups/wenjuan-7967d7f-20260910T141927Z/wenjuan-demo.dump` 恢复到临时库 `wj_restore_probe`，取出 experiment 5 原值（`version=1`、`status=submitted`、各分项与总分/评分人/评分时间均为 NULL）后逐列还原；删除我产生的 `audit_event(id=3)`；删除惰性创建的 experiment 19、20（确认二者无 `sampling_attempt` 等依赖）。**逐列比对与备份原值完全一致 ✅**；探针库已 drop。

**残留影响（如实列出，不可消除）**：`experiment.version` 已从 1 升至 2 后被我改回 1（值已还原）；`user_session` 由 12 增至 32 —— 全部由本轮验收登录产生，属预期且为瞬态数据（文档亦记录过「会话记录因测试登录发生预期变化」）。**未**改动 storage（16 文件 sha256 未变）。

**方法学更正**：在**线上演示库**上执行写路径用例是不当做法。后续对演示站的 dogfood 应遵循：写路径要么在**隔离恢复副本**上验证（用恢复出的库 + 独立端口起临时实例），要么只做**读**与**幂等/可回滚**验证。本轮的教训已写入纪律。

## 四、incomplete 逐条定性（axe 0 违规但有 2 项需复核）

| 元素 | 规则 | 定性 |
| --- | --- | --- |
| 账户菜单按钮 `.px-1` | `aria-valid-attr-value` | **良性**。`aria-controls="radix-_r_0_"` 指向的目标在菜单**关闭时未挂载**（`getElementById` 为 null），是 Radix 懒挂载惯例；`aria-expanded=false` 状态齐备，屏幕阅读器不依赖悬空 `aria-controls`。修它需改 Radix 内部，不值得。 |
| 欢迎语编辑器 `#welcome` | `aria-input-field-name` | **非命名缺失**。无障碍树实测为 `textbox "欢迎语"`，元素确有 `aria-label="欢迎语"` 与 `aria-multiline=true`；axe 对 `contenteditable` div 的该规则返回“需复核”。**已定性为可接受**。 |

## 五、观察项

| 编号 | 级别 | 内容 |
| --- | --- | --- |
| DS-OBS-01 | P3 | **`GET /experiment` 惰性创建记录**：学生只要**打开**某任务的实验页（`开始实验` → GET），即使不做任何操作，也会创建 `experiment` 行并把该学生从教师端进度漏斗的「未开始」变为「进行中」。本轮实证：仅访问两次即新增 2 行。属刻意的 get-or-create，但「查看即改状态」值得产品确认；若要避免，可在真正保存首个阶段时才创建。 |
| DS-OBS-02 | P3 | **教师批改面只暴露已提交作业**：`baseConditions` 限定 `status in (submitted, graded, rejected)`，因此教师对**进行中**实验调用 `/api/teacher/grading/:id` 得到 404 而非 403/明确提示。行为一致（列表与详情同一条件），但错误码无法区分「不存在」与「尚未提交」。 |

## 六、测试侧自我更正

1. **我怀疑文档 §5 的学生池与实际不符** —— 查 `DEMO_STUDENT_ACCOUNTS` 后确认**恰好是 S010、S012–S017 共 7 个**，与文档完全一致；S011/S018 在班级内但不在池中（设计如此）。**该怀疑撤销**。
2. `T001 → grading/1: 404` 一度被我当作缺陷 —— 查 `baseConditions` 后确认 experiment 1 是 `in_progress`，被状态条件正确排除。**非缺陷。**
3. 教师跨租户检查第一次因 `$OTHER` 为空而无效（所有实验都属教师 1）—— 改用 T002 重做后才得到有效结论。
4. 本轮最重要的更正见第三节：**不该在线上演示库跑写路径用例**。

## 七、未执行

- 远程 50 人负载认证（共用 2 vCPU 主机，且非本轮目标）
- 完整四阶段学生走查（本轮为冒烟级：登录 → 任务 → 实验壳）
- 草稿恢复的逐步交互复核
- 破坏性操作（演示库**未**执行 drop/reset/seed）

## 八、附带产出

- 补齐 `src/server/demo-student.test.ts` 中**未被覆盖的姓名守卫分支**（`if (row.name !== account.name) continue;`）：新增 2 个用例（改名账号被跳过；整池改名 → 503），本地 `bun test` 6 pass / 0 fail。
