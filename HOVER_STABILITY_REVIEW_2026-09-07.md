# 三端交互闪烁排查 — 2026-09-07

**确认这不是两个孤立按钮的问题。** 两张截图分别对应共用登录页的“安全登录”和任务大厅的“开始实验”，都继承 Button 的颜色过渡。项目还有多处绕过 Button、独立实现的背景/透明度过渡，需要一起纳入处理范围。

本轮以 **b24d854** 为基线，完成全部 115 个生产 TSX 文件的扫描、TS/CSS 补充检索和 24 个公网代表入口的浏览器检查。**18 个入口复现了快速进出时背景过渡反复取消、反向的现象**；另确认问卷题目行的操作组有透明度过渡叠加。没有修改产品源码或远程部署，原有 DOGFOOD_FRESH_R2_2026-09-07.md 保持原样。

这里的“复现”指鼠标快速进出控件时的反复明暗变化。控件完成过渡后的静止采样窗口均稳定；不把每一个 transition 声明自动算成缺陷，也不宣称已排除所有浏览器/GPU 环境下的静止闪烁。

## 两张截图的直接定位

| 截图按钮 | 页面位置 | 实际样式来源 | 实测 |
| --- | --- | --- | --- |
| 安全登录 | [AuthLoginScreen.tsx](src/components/AuthLoginScreen.tsx) 第 142 行；学生/教师/管理员共用 | [ui/button.tsx](src/components/ui/button.tsx) 第 9、13 行 | 背景 #1d5faf → #174c8c；8 轮快速进出记录到 14 次背景 transitioncancel |
| 开始实验 | [TaskHall.tsx](src/student/pages/TaskHall.tsx) 第 227 行 | Button 的 transition-colors，加页面自己的 primary hover 配色 | 同一组底色与 hover 色；8 轮快速进出也记录到 14 次背景 transitioncancel |

这两个按钮的默认底色已经不透明，图标也已设置 pointer-events:none；它们仍有 **150ms 的颜色过渡**。因此后续修复需要处理共享颜色过渡，而不仅是补底色或调整图标事件。

快速进出时会启动新过渡并中断原过渡；这个机制符合 [CSS Transitions 的中断反向规则](https://www.w3.org/TR/css-transitions-1/#reversing)。本轮测得的相关按钮位置、尺寸和 class 没有随 hover 反复变化，当前证据指向视觉过渡，而非这些控件自身的反复布局或状态重建。

## 所有需要覆盖的同类来源

以下按共享来源和独立实现归组。一个源码位置可能渲染很多实例，复用关系也会重叠，不能把下表数字相加当作独立缺陷数。

| 来源 | 覆盖位置与行为 | 确认方式 |
| --- | --- | --- |
| **共享 Button / IconButton** | [button.tsx](src/components/ui/button.tsx) 第 9 行。普通、outline、ghost、destructive、success、secondary 按钮都有颜色过渡；包含登录、开始/继续实验、搜索、保存、发布、返回、分页、图标操作等 | 登录、开始实验、搜索、行内编辑实测；其余沿共同定义追踪 |
| **AlertDialog 的确认/取消** | [alert-dialog.tsx](src/components/ui/alert-dialog.tsx) 第 131–163 行内部转发到 Button；删除、退出、重开阶段等确认对话框也继承它 | 源码确认，未为了测试而执行破坏性操作 |
| **共享弹窗右上角关闭按钮** | [dialog.tsx](src/components/ui/dialog.tsx) 第 81–83 行自己声明 transition-colors，覆盖默认带关闭按钮的 Dialog | 管理员修改密码弹窗的关闭按钮实测；只打开和关闭，未保存密码 |
| **共享表格行** | [table.tsx](src/components/ui/table.tsx) 第 55–58 行：透明 → muted 背景，使用颜色过渡；39 个 TableRow 使用位置 | 管理员学期表格行实测；学生/教师其他表格沿共同定义确认 |
| **富文本工具栏** | [RichTextEditor.tsx](src/components/RichTextEditor.tsx) 第 51–64 行的原生 ToolbarButton；12 个工具调用，覆盖问卷、报告、公告等编辑器 | 已有学生分析报告中的“加粗”按钮实测，未修改正文 |
| **登录页其他身份入口链接** | [AuthLoginScreen.tsx](src/components/AuthLoginScreen.tsx) 第 160–164 行，原生 a 单独设置背景、边框和文字过渡 | 登录页“管理员登录”链接实测 |
| **教师的原生卡片/列表交互** | [Dashboard.tsx](src/teacher/pages/Dashboard.tsx) 第 185、212 行；[GradingManagement.tsx](src/teacher/pages/GradingManagement.tsx) 第 110 行；[TopicManagement.tsx](src/teacher/pages/TopicManagement.tsx) 第 449 行 | 批改列表和模板卡片实测；概览入口源码确认 |
| **教师模板详情内部标签按钮** | [TopicViewDialog.tsx](src/teacher/components/TopicViewDialog.tsx) 第 127–136 行，不是共享 TabsTrigger；未选中时 hover 背景过渡，标签之间还有 gap | 模板查看弹窗的“数据概览”标签实测 |
| **学生公告列表、附件及题目条目** | [TaskHall.tsx](src/student/pages/TaskHall.tsx) 第 420 行；[TopicDetails.tsx](src/student/pages/TopicDetails.tsx) 第 283 行；[QuestionnaireDesign.tsx](src/student/pages/stages/QuestionnaireDesign.tsx) 第 475、604 行 | 公告条目、问卷题目行实测；附件和推荐题目条目源码确认 |
| **问卷试填四类选项** | [ImmersiveQuestionnairePreview.tsx](src/student/components/ImmersiveQuestionnairePreview.tsx) 第 295、337、386、438 行，分别为是/否、单选、多选、评分 | 四种未选中选项均完成公网实测，未提交答案或完成阶段 |
| **教学参数与高级工具按钮** | [PrecisionPhase.tsx](src/student/components/immersive-sample-planning/phases/PrecisionPhase.tsx) 第 113 行；[FactorsPhase.tsx](src/student/components/immersive-sample-planning/phases/FactorsPhase.tsx) 第 184、432、515 行；[DecisionPhase.tsx](src/student/components/immersive-sample-planning/phases/DecisionPhase.tsx) 第 446 行 | 样本量参数按钮实测；其他未选中参数与高级工具按钮源码确认 |
| **全屏教学、预览和抽样动画的关闭/返回/前进按钮** | [ImmersiveExperimentLaunch.tsx](src/student/components/ImmersiveExperimentLaunch.tsx) 第 173 行；[ImmersiveQuestionnairePreview.tsx](src/student/components/ImmersiveQuestionnairePreview.tsx) 第 509、690、731 行；[ImmersiveReportPreview.tsx](src/student/components/ImmersiveReportPreview.tsx) 第 70、87 行；[ImmersiveSamplingAnimation.tsx](src/student/components/ImmersiveSamplingAnimation.tsx) 第 636 行；[规划向导](src/student/components/immersive-sample-planning/index.tsx) 第 635、672、682 行 | 独立原生按钮的源码确认，不依赖 Button 根定义 |

**复用规模：** Button 家族共有 273 个 JSX 使用位置：Button 240、IconButton 8、AlertDialogAction 12、AlertDialogCancel 13。其中 3 个是组件内部转发点，外部使用点为 270。按源码目录统计为学生端 135、教师端 77、管理员端 45、共享组件 16。这些数字描述影响范围，不表示每一种 disabled、link 或同色覆盖状态都会闪。

另找到 **40 个直接同时包含 hover 背景和颜色过渡的 JSX 位置，分布在 26 个文件**；其中有与共享 TableRow 重叠的位置。逐项文件/行号见 [位置清单](docs/reviews/hover-stability-2026-09-07/locations.md)，全部 663 个相关 JSX 记录、继承分类和 139 条过渡源码行见 [机器可读清单](docs/reviews/hover-stability-2026-09-07/locations.json)。

## 额外确认的两类叠加问题

**1. 问卷题目行的操作组会单独淡入淡出。**

[QuestionnaireDesign.tsx](src/student/pages/stages/QuestionnaireDesign.tsx) 第 498 行是：

~~~text
opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100
~~~

鼠标进出题目行时，整行背景和编辑/复制/删除按钮组分别执行动画。该入口本轮记录到 **16 次背景过渡取消，以及子操作组 16 次 opacity 过渡取消**。仅处理 Button 本身不足以覆盖这个父级透明度动画。

**2. 三种试填选项重复声明 hover 背景。**

[ImmersiveQuestionnairePreview.tsx](src/student/components/ImmersiveQuestionnairePreview.tsx) 第 302、344、396 行的同一未选中分支同时含有：

~~~text
hover:bg-card hover:bg-muted
~~~

这三处应清理为一个明确状态。当前样式加载稳定后，CSS 优先级会选出固定结果；本轮没有发现它们在两个颜色间自行竞争，所以将其列为样式冲突隐患，**不把重复声明直接认定为持续闪烁的原因**。

## 相似声明中应当区分的情况

- **禁用按钮：** 实测没有 hover 背景变化；现有 disabled 和自定义 hover 排除规则有效。源码也未发现同时使用 asChild 与 disabled 的 Button 调用。本轮没有认定为禁用态失效。
- **SelectTrigger / SelectItem：** 默认触发器虽声明背景/边框/阴影过渡，但本轮 hover 背景不变。下拉选项通过高亮属性切换背景，实测没有颜色过渡事件；17 次属性变更属于正常高亮反馈。
- **TabsTrigger：** 23 个使用位置主要在激活状态改变时过渡。分析页标签本轮 hover 没有背景动画。教师模板详情的原生标签则确实有 hover 背景过渡，二者需要分别处理。
- **Input、Textarea、Switch：** 分别有 73、4、1 个使用位置，主要涉及焦点、禁用或 checked 状态。不能仅因含 transition 就算成截图同类 hover 背景问题。
- **Badge / StatusBadge：** 本轮未发现 asChild 用法，主要是只读 span；仅对 a 生效的 hover 规则没有应用到这些只读实例。
- **文字/边框变化：** 另有 47 个直接匹配“颜色过渡 + hover 文字或边框”的位置，其中 29 个是 Card。管理员统计卡片实测只出现边框过渡，背景一直保持白色；登录页指南/隐私提示、步骤指示器及部分筛选按钮也属于这个层级。
- **已修复的共享侧栏：** 本轮作为对照再次实测，hover 立即换成不透明颜色，0 过渡事件。之前的修复有效，但它的规则只作用于 workspace-nav-link。
- **加载、进度、教学动画：** animate-spin、进度条宽度/transform、开关滑块位移、教学页面进出和实验启动层的 opacity 动画，与 hover 触发不同。不应将全部动画一并认定为本问题。

本轮源码没有发现业务 JSX 通过 onMouseEnter/onMouseLeave 等处理器反复切换按钮状态，也没有发现 hover 改变宽高、内外边距、缩放等几何尺寸的类。上述 18 个正例的矩形位置都保持一致，DOM/class 变更均为 0。

## 浏览器证据与边界

使用 agent-browser 与系统 Chromium，通过公网登录和只读页面检查，针对每个控件进行八轮“中心—外侧”快速往返，随后等待 350ms，再取 20 个间隔 40ms 的静止样本。较长页面先将控件居中，避免固定页头遮挡；没有实际进入 hover 的初次定位结果不计入结论。

| 实测入口 | 背景 transitioncancel 次数 |
| --- | ---: |
| 安全登录 | 14 |
| 开始实验 | 14 |
| 登录页其他身份链接 | 10 |
| 管理员表格行 | 16 |
| 管理员行内编辑 | 10 |
| 教师批改列表卡片 | 14 |
| outline 搜索按钮 | 10 |
| 弹窗默认关闭按钮 | 13 |
| 学生公告列表项 | 11 |
| 富文本工具栏 | 12 |
| 教师模板详情原生标签 | 16 |
| 教师模板卡片 | 16 |
| 问卷题目行 | 16 |
| 单选 / 多选 / 是非 / 评分选项 | 11 / 14 / 11 / 13 |
| 样本量参数按钮 | 14 |

这些次数是该压力序列产生的事件数，不是用户日常闪烁的发生率。24 个有效入口的静止采样背景都保持单一值，所有位置尺寸都没有变化。详情见 [browser-cases.json](docs/reviews/hover-stability-2026-09-07/browser-cases.json)。

原始帧/事件、选择器、屏幕证据及探针保存在 test-results/interaction-audit-2026-09-07（本地忽略目录）；关键摘要与完整位置清单保存在 docs/reviews，便于后续修复逐项核销。

## 后续统一修复应覆盖的范围

1. 将按钮、链接、可交互行和卡片的颜色反馈统一为即时切换，同时覆盖共享定义和独立原生写法。
2. 处理问卷题目操作组的透明度动画，并给三个重复 hover 背景分支保留唯一状态。
3. 统一 active、hover、focus、disabled 的优先级；保留清晰的键盘焦点和正确的禁用行为。
4. 对连续选择区/工具栏审查命中空隙，独立动作按钮则保留合理间距；不机械套用整行侧栏布局。
5. 保留加载、进度与教学表达所需的功能动画。背景稳定性验收应直接检查中间色、过渡取消、命中与几何变化，不能只靠截图或搜索 transition。

本轮交付是完整排查清单与复现结果；尚未修改这些基础控件，因此除已修复的侧栏外，上述现象目前仍存在。
