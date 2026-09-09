# 全新本地部署与 R0 基线结果

日期：2026-09-09（中国标准时间 UTC+8；主机为 JST，终端日期可能显示 09-10）。

> 执行后更新：6464 已完成 R1 建课，不再是空白库；管理员已通过页面改密，当前凭据保存在 `$ROOT/clean/current-admin.env`（0600），原 bootstrap 密码已失效。两常驻 unit 已加入 `SuccessExitStatus=143`。新建的 6466 恢复验证实例已停止，数据保留。详情见 [第一批执行报告](EXECUTION-REPORT.md)。以下是 R0 部署检查点记录。

> 2026-09-10 修复验证：新建 `release-fixes-20260910/`，在恢复库的临时 6466 生产实例完成三项修复复测后停止。6464/6465 仍运行本页所述旧快照，未自动升级；详情见[修复闭环报告](FIX-REPORT.md)。

## 1. 部署清单

源码版本：`3a8d8f6714e8d600476fe51e8ce236005420ae30`。

独立部署根目录（下文 `$ROOT`）：

```sh
ROOT=/home/alice/pros/wenjuan/deployments/wj-dogfood-20260909-3a8d8f6
BUN="$ROOT/release/node_modules/bun/bin/bun.exe"
```

| 环境 | 地址 | 数据库 | 用途 |
|---|---|---|---|
| clean | http://127.0.0.1:6464/admin | `wj_clean_20260909_3a8d8f6` | 从空库初始化，仅 1 管理员；供 R1 纯页面建课 |
| dogfood | http://127.0.0.1:6465/student | `wj_dogfood_20260909_3a8d8f6` | 合成数据、阶段状态矩阵；教师 `/teacher`，管理员 `/admin` |
| test | 无常驻 HTTP 服务 | `wj_test_20260909_3a8d8f6` | 单独的数据库集成测试库；教学脚本另建临时库并自动清理 |

- 用 `git archive HEAD` 导出独立源码，再 `bun install --frozen-lockfile`；没有拷贝现有 `.env`、数据库、dist 或上传数据。
- 锁定的实际服务/构建/测试运行时为 **Bun 1.4.0**；不使用全局 1.4.2 运行服务。
- `release/` 为独立源码及生产构建；`clean/`、`dogfood/` 分别是工作目录，有独立 `.env`、`storage/`，只共享只读用途的 `public`、`drizzle` 符号链接。
- 两实例均为 `NODE_ENV=production`、`DEV_AUTH_MODE=0`、`DEMO_MODE=0`、`TRUST_PROXY=0`，只监听 `127.0.0.1`。
- dogfood 的 seed 命令一次性使用 `DEMO_MODE=1`，运行中的应用及浏览器构建不启用 demo，不预填密码，不提供随机凭据接口。
- 原仓库业务源码、原 `.env`、原数据库、原 `storage/` 和原 3000 等服务均未改动。
- 测试库与应用库使用本机既有 agent 角色；这是本地测试环境，不是数据库最小权限隔离方案。不要对公网开放。

## 2. 账号

clean 管理员名为 `admin`，独立随机密码只保存在：

```text
$ROOT/clean/bootstrap.env
```

文件权限为 0600，部署根目录为 0700；密码不写入仓库、报告、截图或命令输出。

dogfood 合成账号：

| 账号 | 密码 | 用途 |
|---|---|---|
| admin | admin123 | 测试环境管理员 |
| T001 | T001 | 主教师，管理两个班级 |
| T002 / T003 | 对应工号 | 不同教师/历史班级权限 |
| T004 | T004 | 停用教师，应不能登录 |
| S010–S018 | 对应学号 | 分阶段、未开始、提交、批改、驳回分支 |
| S019 | S019 | 停用学生，应不能登录 |
| P101–P106 | 对应学号 | 服务时段研究及跨班级测试 |

seed 完整性检查：1 管理员、4 教师、3 学期、4 班级、16 学生、7 模板、6 任务、15 实验、12 抽样记录、5 公告、2 附件。主任务覆盖 8 个进度桶。总体文件均为新生成的合成数据。

不要依赖演示账号命名猜测业务状态；每轮开始通过页面及只读 API 确认当时状态和任务 ID。

## 3. 服务管理

持久化用户服务已启用，用户 linger 已启用；进程异常自动重启。尚未进行整机重启验收。

```sh
systemctl --user status wj-clean-local-20260909 wj-dogfood-local-20260909
systemctl --user restart wj-clean-local-20260909 wj-dogfood-local-20260909
journalctl --user -u wj-clean-local-20260909 -u wj-dogfood-local-20260909 -f

# 仅在不再需要这两个测试环境时停止并取消自启动；不删除数据库或文件
systemctl --user disable --now wj-clean-local-20260909 wj-dogfood-local-20260909
```

unit 文件在 `~/.config/systemd/user/`。不要在测试中停止旧项目服务或系统 PostgreSQL。

发布源码是独立快照，原仓库后续修复不会自动进入这两个实例。修复后应创建新 release、用同版本 Bun 安装/构建/验证，备份后更新 unit 的 ExecStart；不要在运行中的 release 上构建或修改源码。若 schema 变化，先验证迁移路径，不得以 reset 代替升级。

## 4. 已执行的 R0

| 检查 | 实测结果 | 证据（`$ROOT/evidence/`） |
|---|---|---|
| 全新安装、两空库迁移 | 成功 | `install.log`、`*-migrate.log` |
| clean bootstrap | 成功，独立随机密码 | `bootstrap.log` |
| dogfood seed 对账 | 全部计数与 compact 抽样结果通过 | `seed-check.log` |
| 类型、样式、文档 fixture 门禁 | 通过 | `verify.log` |
| 单测，正常顺序 | 1015 pass、15 skip、0 fail | `verify.log` |
| 单测，随机顺序 | 1015 pass、15 skip、0 fail | `verify.log` |
| 专用 PostgreSQL 集成/并发测试 | 15 pass、0 fail，149 assertions | `test-db.log` |
| 普通生产构建 | 通过，87 assets；三端初始 JS gzip 约 126/129/145 KB | `build.log`、`verify.log` |
| Drizzle 迁移元数据检查 | 通过，不等于备份恢复验证 | `verify.log` |
| 原始依赖审计 | 退出 1：1 moderate、1 low，均为已记录的 esbuild 开发依赖公告 | `bun-audit.log` |
| 依赖适用性门禁 | 通过，仅接受文档中的 2 项残留 | `verify.log` |
| 既有教学闭环脚本 | 通过：四阶段、PPS 分析、草稿恢复、提交、驳回、重交、评分、Excel 内容核对 | `teaching-flow.log`、`teaching-flow/result.json`、截图 |
| 新生产实例真实浏览器 smoke | clean 管理员及 dogfood 三端登录、空库/seed 计数、学生 90 分结果、生产 Worker 分析通过 | `production-smoke.json`、`*-authenticated.png` |
| 安全 smoke | 登录无预填；demo 接口 404；无身份访问 401；预期身份不匹配 409；跨源写入 403；API no-store；深链及 CSP 正常 | `production-smoke.json` |
| storage 只读审计 | 6 引用、6 文件、0 孤立文件 | `storage-audit.log` |
| 服务重新启动 | 两新实例恢复 HTTP 200 | systemd journal |
| 一致性基线备份 | 停止两新实例写入后备份 DB + storage；SHA256 全部通过 | `backups/` |

### 验证边界

- 教学闭环脚本在**自己创建的临时库和 development 服务器**运行，不是直接对常驻生产实例完成整条教学流程。
- 该脚本使用真实浏览器，但模板准备、部分抽样和重交内容等由已登录浏览器调用真实 API；不能算“完全靠页面从零完成”。R1 专门补上这一缺口。
- 生产 smoke 使用 agent-browser 0.36.0 / Chrome 153，1440×900；教学脚本含 1280×800 布局检查。截图已检查，不能据此宣称所有页面视觉通过。
- R0 没有执行 50 人实测、统计独立算法 oracle、全角色越权矩阵、完整备份恢复或无障碍全量验收；这些属于后续计划。
- 不把单测中的 15 skip 计为通过；这 15 项已在独立 `test:db` 中实际通过。

### 部署过程观察

1. 首次从隔离工作目录运行迁移时缺 `drizzle/meta` 路径；为 runtime 目录补充指向 release 的 `drizzle` 链接后成功。项目部分资源路径依赖 cwd，运维必须保持上述布局。
2. bootstrap 使用显式 `--env-file=bootstrap.env` 时不会同时自动加载所需 `.env`；改为 `--env-file=.env --env-file=bootstrap.env` 后成功。两次初始失败日志保留，没有清库或影响旧环境。
3. 文档仍有待核对项：README 的分析等待队列 16/64 描述不一致；README 说部分学习自检可跳过，而当前教学脚本明确验证强制理解检查。R1 开始前应确定产品验收口径，不能据旧文档自动判 UI 缺陷。

## 5. 证据与备份

```text
$ROOT/evidence/                  完整门禁、浏览器、截图、JSON 结果
$ROOT/evidence/production-smoke.ts  本轮可复跑的生产冒烟脚本（从本地安全文件读取 clean 密码）
$ROOT/backups/clean-baseline.dump
$ROOT/backups/clean-storage-baseline.tar.gz
$ROOT/backups/dogfood-baseline.dump
$ROOT/backups/dogfood-storage-baseline.tar.gz
$ROOT/backups/SHA256SUMS
$ROOT/test.env                   专用 TEST_DATABASE_URL，不提交仓库
```

备份点为 R0 只读验收后，包含测试登录产生的会话；新库恢复时必须限制在本机并考虑撤销旧会话。备份校验和已验证，但**恢复演练尚未执行**。

任何回滚先恢复到新命名数据库、新空 storage 目录和新端口，验证后再切换，不覆盖当前环境。不得在现有或扩充后的库上重新运行非幂等 seed；R1/R2 数据用每轮唯一前缀隔离。

全面 dogfood 的范围、用例和退出门禁见 [PLAN.md](PLAN.md)。
