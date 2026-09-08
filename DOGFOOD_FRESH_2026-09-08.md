**全新本地部署与深度 dogfood 测试 · 2026-09-08**

本轮在当前工作区的完整快照上重新安装依赖、创建空数据库、迁移、初始化管理员并构建生产版本。重点覆盖开始时的 40 个已跟踪修改文件和 31 个未跟踪文件，未使用旧部署或旧实验数据，也未把历史兼容性列为验收条件。

结论：在本轮覆盖的场景中，未发现新的统计计算错误或阻断教学流程的问题；最初确认了 **1 个 P3 展示问题**：新增高级规划快照显示原始 UTC 时间，未遵循全站中国标准时间的约定。初次 dogfood 只测试并记录；随后按用户要求修复了该问题，复验结果如下。

**已修复：DF-01 / P3，高级规划快照的应用时间未按全站时区格式化**

- 位置：[src/components/AdvancedPlanDetails.tsx:49](src/components/AdvancedPlanDetails.tsx#L49)。修复前直接插入 `plan.appliedAt`。
- 复现：教师 T900 打开任务 3 的作业批改 `/teacher/grading/4` →「方案」；学生 S900 打开任务 3 的结果 →「抽样方案」。
- 修复前：成本工具显示 `应用时间：2026-09-08T03:17:44.279Z`。
- 修复后：依据 [README.md](README.md) 的 UTC+8 约定和 [src/utils/format.ts](src/utils/format.ts) 的共享时间格式化函数，按全站精确到分钟的格式显示 `2026/09/08 11:17`。
- 影响：学生与教师核对方案应用时间时，需要自行识别 UTC 并换算；跨午夜时日期也会不同。样本量、参数和统计结果不受影响。
- 修复：展示时使用 `formatDateTimeDisplay(plan.appliedAt)`，存储继续保留 ISO 时间。
- 已通过教师页面刷新、学生结果页面和源码三处交叉确认。[复现数据](test-results/dogfood-fresh-2026-09-08/53-timezone-finding.json)、[学生端复验](test-results/dogfood-fresh-2026-09-08/57-student-timezone-confirmed.json)、[截图](test-results/dogfood-fresh-2026-09-08/confirmed-utc-snapshot.png)。

修复后的生产构建已更新到下述本地服务。agent-browser 复查教师「方案」与学生「抽样方案」，均显示 `2026/09/08 11:17`，API 中保存的 ISO 时间未变。既有组件测试改为校验跨日期换算：`2026-09-07T23:17:44.279Z` → `2026/09/08 07:17`。在 `TZ=America/Los_Angeles` 下运行完整 `bun run verify` 通过，包括类型、样式、文档、普通与随机顺序单测、生产构建、数据库schema及依赖适用性审计；两轮单测各860通过、1跳过、0失败。[修复后记录](test-results/dogfood-fresh-2026-09-08/60-p3-fixed.json)、[教师截图](test-results/dogfood-fresh-2026-09-08/p3-fixed-teacher.png)、[学生截图](test-results/dogfood-fresh-2026-09-08/p3-fixed-student.png)、[校验日志](test-results/dogfood-fresh-2026-09-08/p3-verify.log)。

**部署与复查入口**

| 项目 | 本轮环境 |
| --- | --- |
| 服务 | http://127.0.0.1:3240 ，保持运行 |
| 模式 | `NODE_ENV=production`、`DEV_AUTH_MODE=0`、`DEMO_MODE=0` |
| Bun | 锁定的 1.4.0 |
| 基础提交 | `c4e487f24198fd728725c8be81823aca0d510452`，叠加全部当前未提交文件 |
| 独立工作目录 | `/tmp/wj-dogfood-fresh-20260908-p0j_2e36` |
| 独立数据库 | `wj_dogfood_fresh_p0j_2e36` |
| 存储 | 独立工作目录内的 storage，不复用原项目数据 |
| 进程 | PID `1674155` |
| 浏览器 | agent-browser 0.36.0；各角色使用独立浏览器会话 |

| 角色 | 账号 | 本地测试密码 | 入口 |
| --- | --- | --- | --- |
| 管理员 | admin | FreshLab!2026 | http://127.0.0.1:3240/admin |
| 教师 | T900 | T900 | http://127.0.0.1:3240/teacher |
| 学生 | S900 | S900 | http://127.0.0.1:3240/student |

主环境没有导入演示种子。管理员初始页面确认教师、班级和学生均为 0；随后通过页面创建学期、教师、班级和学生。数据库契约测试在初始化账号前运行并清理测试记录，因此业务 ID 不从 1 开始。

快照拥有独立安装的 node_modules，`bun install --frozen-lockfile` 安装 203 个包。开始时记录了 552 个源文件的 SHA-256；完成测试时原有文件均未改变。[部署记录](test-results/dogfood-fresh-2026-09-08/deployment.json)、[源码完整性](test-results/dogfood-fresh-2026-09-08/54-source-integrity.json)。

**实际操作与覆盖范围**

主任务 2 从教师七步模板配置开始，通过页面完成 CSV 上传、字段映射、研究合同、四种方法设为必做、发布到班级；学生通过页面套用行为与习惯问卷、逐题试填、走完规划教学步骤、自检、应用高级工具、执行四种抽样、写报告、刷新恢复草稿、提交；教师驳回，学生修改重交，教师评分，学生查看结果并导出。

另外建立了 11 个独立边界任务。其总体数据通过真实上传 API 入库，研究合同、规划、抽样和分析也通过正常鉴权接口执行；成本、整群及关键结果页面另外进行了浏览器操作。没有绕过服务端校验直接写入实验结果。附带运行的 `test:teaching` 使用另一套临时演示数据库，是补充回归，不计为主环境的全新账号流程。

| 范围 | 验证结果与证据 |
| --- | --- |
| 问卷文案与预试 | 「过去 7 天」次数题的 0 次、时长半开区间及「从未进行，不适用」均完成实际试填；6 题提交后保存，问卷仍明确为预试、不进入估计。[记录](test-results/dogfood-fresh-2026-09-08/08-questionnaire-ui.json) |
| 规划教学 | 均值、比例两条路径均走过精度、影响因素、公式、FPC、四步法和决策面板；核对绝对误差、百分点、方差口径和条件限定文案。[均值页面记录](test-results/dogfood-fresh-2026-09-08/09-planning-walk-pages.json) |
| 多变量 | 比例 2、−0.1 无法应用；0、1 采用已说明的保守规划；多个变量取需求最大值，99% 工具参数和95%基础参数分别保存、展示。[非法值](test-results/dogfood-fresh-2026-09-08/10-multivar-invalid-2.json) |
| CV 工具 | 正值均值目标下应用 n=25；CV 大且回答率低时显示未达标，需要显式采用。99% 仅用于区间换算，与基础95%区分。[未达标](test-results/dogfood-fresh-2026-09-08/11-cv-unmet-ui.json)、[保存结果](test-results/dogfood-fresh-2026-09-08/12-main-plan-persisted.json) |
| 成本工具 | N=100,000、电话调查预算50,000时，预算容量3,000、精度目标需求383、成本10,745分别一致；预算低于固定成本不能应用。[默认情景](test-results/dogfood-fresh-2026-09-08/21-cost-default.json)、[超预算](test-results/dogfood-fresh-2026-09-08/25-cost-underbudget.json) |
| 成本封顶 | N=100、目标1个百分点、无回答率50%时，预算充足仍显示精度未达标；显式采用后 `feasible=false` 和输入假设保持不变。[页面](test-results/dogfood-fresh-2026-09-08/37-cost-cap-unmet.json)、[服务端保存](test-results/dogfood-fresh-2026-09-08/55-unmet-cost-saved.json) |
| 整群规划 | 合法情景保存99%、deff=2、群规模50、27群、n=1,350；封顶仍达不到目标时无法应用；不把实际抽样方法改成整群。[保存结果](test-results/dogfood-fresh-2026-09-08/30-cost-cluster-persisted.json)、[不可达情景](test-results/dogfood-fresh-2026-09-08/38-cluster-unreachable.json) |
| 四类高级快照 | 学生分析页、教师批改页都能看到完整假设及结果；基础95%仍单独显示。四类非法参数请求均返回400，实验版本未改变。[教师页面](test-results/dogfood-fresh-2026-09-08/46-teacher-cost-cluster.json)、[接口拒绝](test-results/dogfood-fresh-2026-09-08/42-four-tool-api-rejection.json) |
| 四种抽样 | 简单随机、系统、PPS、分层各实际抽取25个单位；PPS自动使用独立的size字段；分层使用奈曼分配，各层样本合计25。[执行结果](test-results/dogfood-fresh-2026-09-08/15-four-methods-ui.json) |
| 分类归一化 | ` Ｃ２０ ` 与 `C20` 合并；总体目标比例为1/21；图表保留目标类别并聚合其他类别，偏差仍用全部21类别复算。[完整类别核对](test-results/dogfood-fresh-2026-09-08/32-category-fullspace.json)、[页面](test-results/dogfood-fresh-2026-09-08/39-category-chart-ui.json) |
| 教学闭环 | 提交→教师驳回→修改重交→评分→学生结果正常；报告刷新后保留；80/90/95按30%/30%/40%加权为89。[最终结果](test-results/dogfood-fresh-2026-09-08/27-graded-result.json) |
| 导出 | 四个单方法CSV各25行，合并CSV为100行；PPS包含包含概率与设计权重；实际XLSX工作表总分为89。[XLSX内容核对](test-results/dogfood-fresh-2026-09-08/47-xlsx-content.json) |
| 版本与权限 | 过期版本写入返回409，学生访问教师接口被拒绝，已发布映射及已评分抽样结果不可修改。[记录](test-results/dogfood-fresh-2026-09-08/43-version-auth-locks.json) |
| 上传边界 | .xls、重复列名、保留前缀、空白数据行均被真实上传接口拒绝。[记录](test-results/dogfood-fresh-2026-09-08/44-upload-rejection.json) |

**独立统计复算**

主总体 N=1,000，总体均值35.358，分母N的方差80.090586，分母N−1的方差80.17075675675676。规划和设计标准误采用各自对应的方差口径，结果一致。

独立 Python 程序从原始总体和实际导出的样本复算，没有导入项目统计函数。SRS采用有限总体设计方差，分层采用各层方差加权，系统抽样枚举40个起点。PPS使用60位十进制精度枚举1,000个起点区间，计算 Hájek 估计量的设计均值与标准差。

| 方法 | 实际样本点估计 | 独立设计SE | 服务端设计SE |
| --- | ---: | ---: | ---: |
| 简单随机 | 37.84 | 1.7682362719708906 | 1.7682362719708906 |
| 系统 | 36.33 | 1.7878327662284301 | 1.7878327662284292 |
| PPS | 34.59358084683019 | 2.615706231719835 | 2.615706231719813 |
| 分层 | 32.75 | 1.7735384850856604 | 1.77353848508566 |

PPS设计均值为35.369724276993405，与总体真值相差约0.011724277，验证了页面保留“比估计可能有偏”的必要性；精确设计SE不能当作无偏或覆盖率的保证。[复算结果](test-results/dogfood-fresh-2026-09-08/29-independent-main-oracle.json)。基础公式另与 [Penn State 的 SRS 课程](https://online.stat.psu.edu/stat506/Lesson01)、[分层抽样课程](https://online.stat.psu.edu/stat506/Lesson06)和[系统抽样课程](https://online.stat.psu.edu/stat506/Lesson08)交叉核对；PPS精确值来自上述独立枚举。

额外数值检查包括：

- N=3、n=1，size为 `[1e-200,1,1]`，y为 `[0,1e-125,2e-125]`：PPS SE约5e-126，等效SRS样本量12/7，误差半宽非零，可靠性保留caution；页面以科学计数法显示。[数据](test-results/dogfood-fresh-2026-09-08/31-tiny-weight-value.json)、[再次核对](test-results/dogfood-fresh-2026-09-08/58-final-worker-verification.json)。
- 规模字段含1e-320时，普通目标尺度的PPS SE仍正确；目标缩放至1e-160时，非零SE未因先平方而丢失。
- 无法可靠表示的加权字段仅该字段返回null；同一总体的常量字段SE仍为0。真实正SE低于浮点范围时返回null，未错误认证为零。[字段隔离](test-results/dogfood-fresh-2026-09-08/33-field-specific-unavailable.json)、[下溢边界](test-results/dogfood-fresh-2026-09-08/34-subfloat-unavailable.json)。
- N=997、n=113，间距8.823008849557523，目标为1e9附近的微小变化：独立枚举997个起点区间，系统SE为3.87877516298047e-5，服务端为3.878775162979494e-5。[独立复算](test-results/dogfood-fresh-2026-09-08/52-fractional-independent-oracle.json)。
- 覆盖全部总体时，三种方法均返回真值和零设计SE。另验证成本规划假定50%无回答、执行却完整观测所有100行时，分析仍正确显示零设计SE，并保留规划未达标的独立假设。[普查](test-results/dogfood-fresh-2026-09-08/35-census.json)、[规划与执行口径](test-results/dogfood-fresh-2026-09-08/56-planned-nonresponse-vs-complete-observation.json)。

成本SVG另将全部100,000个整数n的折线值与公式对照：96个绘图点包含准确的n=383与n=3,000参考点；本次最大绝对插值误差约0.0027601个百分点，出现在n=99,968的近普查端。源码采用中点自适应阈值，这不等于全区间严格误差上界；本轮未将其误报为计算值错误，也不声称折线没有近似误差。[实际误差记录](test-results/dogfood-fresh-2026-09-08/24-cost-svg-independent.json)。

**性能、界面与文档**

通过生产服务真实上传了100,000行、49列（48个数值字段）的总体并执行n=1,000的三种抽样。全部48个PPS数值字段返回有限SE；上传、映射和发布约2.59秒，规划保存、三次抽样、阶段转换及分析合计约3.89秒。这是本机单次观测，不是并发或性能保证。[结果](test-results/dogfood-fresh-2026-09-08/48-wide-pps.json)。

管理员首页、教师批改页、学生结果页的 axe WCAG 2A/2AA/2.1AA 抽查均为0个违规，三个浏览器会话均无页面异常记录。另检查1440、768、390宽度：项目按既有桌面端定位保留1280最小布局，窄屏需要横向滚动，不将其描述为移动端适配通过。[页面检查](test-results/dogfood-fresh-2026-09-08/49-ui-accessibility-errors.json)、[窄屏尺寸记录](test-results/dogfood-fresh-2026-09-08/50-viewport-390.json)。

通过新服务下载两份PDF和问卷DOCX，SHA-256与当前工作区文件一致。使用PDF技能渲染并逐页检查两份PDF共5页；未见文字遮挡或内容缺失。.xls不支持的说明、明确时间范围、次数选项及问卷预试限制均与当前功能一致。问卷PDF为A4，上传规范PDF目前是Letter；版面可读，但不能声称两份PDF的纸张规格相同。[下载核对](test-results/dogfood-fresh-2026-09-08/documents/download-check.json)、[页尺寸和文字边界](test-results/dogfood-fresh-2026-09-08/documents/page-boxes.json)。

**自动校验**

| 命令/校验 | 结果 |
| --- | --- |
| `bun install --frozen-lockfile` | 通过，独立安装 |
| `bun run db:migrate`、`db:bootstrap-admin` | 通过 |
| `bun run build` | 生产构建通过 |
| `bun run typecheck`（含check:styles） | 通过 |
| `bun run check:docs`、`bun run db:check` | 通过 |
| `bun run test:unit` | 860通过、1跳过、0失败，15,872断言 |
| `bun run test:unit:random` | 随机种子20260903；860通过、1跳过、0失败 |
| `bun run test:db` | 独立数据库契约测试1通过、53断言；补足上面跳过项 |
| `bun run test:teaching` | 完整通过，含请求失败重试、页面错误恢复、报告草稿保留、PPS精确模式、驳回重交、评分及Excel导出 |
| `bun run audit:applicable` | 通过；2条既有esbuild开发服务器公告按仓库规则判定不适用，未声称依赖公告为零 |

最初单元测试与schema校验未传入DATABASE_URL，产生环境初始化错误；补齐独立部署的.env后重跑通过。应以 [unit-configured.log](test-results/dogfood-fresh-2026-09-08/unit-configured.log)、[schema-configured.log](test-results/dogfood-fresh-2026-09-08/schema-configured.log)及[random日志](test-results/dogfood-fresh-2026-09-08/unit-random.log)为最终结果，原始失败日志保留用于追溯。

**证据与边界**

截图、实际接口返回、上传总体、导出文件、独立复算程序及校验日志均在 [test-results/dogfood-fresh-2026-09-08](test-results/dogfood-fresh-2026-09-08/)。该目录被git忽略，跨环境移交时需另带附件；本报告是本轮新增的项目文件。测试脚本存档在该目录的harness中，部分脚本引用本轮任务ID和临时环境，属于分步复核记录，不是一键重新部署脚本。

覆盖包含普通操作、统计边界、接口校验、单次大数据分析和部分可访问性；没有进行多用户长时间并发压测、全浏览器兼容矩阵、真实外部网络部署或完整安全渗透测试。对未测试场景不作无缺陷保证。
