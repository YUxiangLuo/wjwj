# 交互颜色过渡位置清单

基线 b24d854。以下是源码使用位置，不是独立缺陷计数；不同分组会重叠。动态 map 会把一个位置渲染成多个控件。完整属性及其他控件见 [locations.json](locations.json)。

## 共享 Button 家族（273 个 JSX 位置，含 3 个内部转发点）

| 文件 | 行号 | 位置数 |
| --- | --- | --- |
| [src/admin/AdminApp.tsx](../../../src/admin/AdminApp.tsx) | 64、64 | 2 |
| [src/admin/hooks/useConfirmDialog.tsx](../../../src/admin/hooks/useConfirmDialog.tsx) | 54、60 | 2 |
| [src/admin/pages/AnnouncementManagement.tsx](../../../src/admin/pages/AnnouncementManagement.tsx) | 97、128、143、156、230、239、246 | 7 |
| [src/admin/pages/ClassManagement.tsx](../../../src/admin/pages/ClassManagement.tsx) | 195、319、328、332、412、415、468、471 | 8 |
| [src/admin/pages/Dashboard.tsx](../../../src/admin/pages/Dashboard.tsx) | 83 | 1 |
| [src/admin/pages/SemesterManagement.tsx](../../../src/admin/pages/SemesterManagement.tsx) | 192、305、310、314、380、383、411、414 | 8 |
| [src/admin/pages/StudentManagement.tsx](../../../src/admin/pages/StudentManagement.tsx) | 175、205、209、233、266、269、284、308、318 | 9 |
| [src/admin/pages/TeacherManagement.tsx](../../../src/admin/pages/TeacherManagement.tsx) | 42、44、47、49、49、49、53、53 | 8 |
| [src/components/AuthLoginScreen.tsx](../../../src/components/AuthLoginScreen.tsx) | 143 | 1 |
| [src/components/DatetimePicker24.tsx](../../../src/components/DatetimePicker24.tsx) | 90、159 | 2 |
| [src/components/PageErrorBoundary.tsx](../../../src/components/PageErrorBoundary.tsx) | 27、28、29 | 3 |
| [src/components/PasswordChangeDialog.tsx](../../../src/components/PasswordChangeDialog.tsx) | 128、131 | 2 |
| [src/components/RequestError.tsx](../../../src/components/RequestError.tsx) | 11 | 1 |
| [src/components/questionnaire/QuestionEditor.tsx](../../../src/components/questionnaire/QuestionEditor.tsx) | 251、278、420、428 | 4 |
| [src/components/ui/alert-dialog.tsx](../../../src/components/ui/alert-dialog.tsx) | 140、157 | 2 |
| [src/components/ui/button.tsx](../../../src/components/ui/button.tsx) | 82 | 1 |
| [src/student/StudentApp.tsx](../../../src/student/StudentApp.tsx) | 76、92、158、159 | 4 |
| [src/student/components/CVBasedSampleSizeCalculator.tsx](../../../src/student/components/CVBasedSampleSizeCalculator.tsx) | 320 | 1 |
| [src/student/components/ClusterSamplingCalculator.tsx](../../../src/student/components/ClusterSamplingCalculator.tsx) | 291 | 1 |
| [src/student/components/DesignEffectEstimator.tsx](../../../src/student/components/DesignEffectEstimator.tsx) | 86 | 1 |
| [src/student/components/DomainEstimationManager.tsx](../../../src/student/components/DomainEstimationManager.tsx) | 294、416 | 2 |
| [src/student/components/DraftSaveStatus.tsx](../../../src/student/components/DraftSaveStatus.tsx) | 14 | 1 |
| [src/student/components/ImmersiveQuestionnairePreview.tsx](../../../src/student/components/ImmersiveQuestionnairePreview.tsx) | 326、371、421、463、551、584、604、628、641、673、751、752 | 12 |
| [src/student/components/ImmersiveSamplingAnimation.tsx](../../../src/student/components/ImmersiveSamplingAnimation.tsx) | 604、614、627、855、866 | 5 |
| [src/student/components/MultiVariableSamplePlan.tsx](../../../src/student/components/MultiVariableSamplePlan.tsx) | 276、484、544 | 3 |
| [src/student/components/PrecisionCostTradeoff.tsx](../../../src/student/components/PrecisionCostTradeoff.tsx) | 227、245、485 | 3 |
| [src/student/components/SamplePreviewTable.tsx](../../../src/student/components/SamplePreviewTable.tsx) | 150、160 | 2 |
| [src/student/components/SamplingSuccessState.tsx](../../../src/student/components/SamplingSuccessState.tsx) | 23 | 1 |
| [src/student/components/StratifiedAllocationComparison.tsx](../../../src/student/components/StratifiedAllocationComparison.tsx) | 210、298 | 2 |
| [src/student/components/StratifiedSamplingTab.tsx](../../../src/student/components/StratifiedSamplingTab.tsx) | 420、429、438、450、472 | 5 |
| [src/student/components/immersive-sample-planning/index.tsx](../../../src/student/components/immersive-sample-planning/index.tsx) | 548、557、658、703、704 | 5 |
| [src/student/components/immersive-sample-planning/phases/ChallengePhase.tsx](../../../src/student/components/immersive-sample-planning/phases/ChallengePhase.tsx) | 103、149 | 2 |
| [src/student/components/immersive-sample-planning/phases/DecisionPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/DecisionPhase.tsx) | 289、528、536、578、586、698、714、767、797 | 9 |
| [src/student/components/immersive-sample-planning/phases/FPCPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/FPCPhase.tsx) | 173 | 1 |
| [src/student/components/immersive-sample-planning/phases/FactorsPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/FactorsPhase.tsx) | 94 | 1 |
| [src/student/components/immersive-sample-planning/phases/FourStepPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/FourStepPhase.tsx) | 290 | 1 |
| [src/student/components/immersive-sample-planning/phases/PrecisionPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/PrecisionPhase.tsx) | 163 | 1 |
| [src/student/components/immersive-sample-planning/phases/QuizPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/QuizPhase.tsx) | 155、164、174 | 3 |
| [src/student/components/immersive-sample-planning/phases/shared.tsx](../../../src/student/components/immersive-sample-planning/phases/shared.tsx) | 7 | 1 |
| [src/student/pages/ExperimentLayout.tsx](../../../src/student/pages/ExperimentLayout.tsx) | 190、190、193、237、238、252、252 | 7 |
| [src/student/pages/Profile.tsx](../../../src/student/pages/Profile.tsx) | 97、216 | 2 |
| [src/student/pages/SubmissionDetail.tsx](../../../src/student/pages/SubmissionDetail.tsx) | 54、123 | 2 |
| [src/student/pages/SubmissionPreview.tsx](../../../src/student/pages/SubmissionPreview.tsx) | 184、199、343、372、373 | 5 |
| [src/student/pages/TaskHall.tsx](../../../src/student/pages/TaskHall.tsx) | 211、222、327、380 | 4 |
| [src/student/pages/TopicDetails.tsx](../../../src/student/pages/TopicDetails.tsx) | 175、268、268、295、306、379、389 | 7 |
| [src/student/pages/stages/AnalysisReport.tsx](../../../src/student/pages/stages/AnalysisReport.tsx) | 153、156、735、820、823 | 5 |
| [src/student/pages/stages/QuestionnaireDesign.tsx](../../../src/student/pages/stages/QuestionnaireDesign.tsx) | 457、499、510、521、531、541、611、698、729、933、933、940、950、960、969、999、1000、1011、1011、1027、1028 | 21 |
| [src/student/pages/stages/SamplePlanning.tsx](../../../src/student/pages/stages/SamplePlanning.tsx) | 234、236、333、366、387、397 | 6 |
| [src/student/pages/stages/SamplingExecution.tsx](../../../src/student/pages/stages/SamplingExecution.tsx) | 374、444、539、643、776、856、859、901、902 | 9 |
| [src/teacher/TeacherApp.tsx](../../../src/teacher/TeacherApp.tsx) | 77、78 | 2 |
| [src/teacher/components/StudentAddDialog.tsx](../../../src/teacher/components/StudentAddDialog.tsx) | 80、81 | 2 |
| [src/teacher/components/StudentConfirmDialog.tsx](../../../src/teacher/components/StudentConfirmDialog.tsx) | 43、46 | 2 |
| [src/teacher/components/StudentImportDialog.tsx](../../../src/teacher/components/StudentImportDialog.tsx) | 60、84、85 | 3 |
| [src/teacher/components/TaskExtendDialog.tsx](../../../src/teacher/components/TaskExtendDialog.tsx) | 53、54 | 2 |
| [src/teacher/components/TaskPublishDialog.tsx](../../../src/teacher/components/TaskPublishDialog.tsx) | 112、113 | 2 |
| [src/teacher/components/TopicViewDialog.tsx](../../../src/teacher/components/TopicViewDialog.tsx) | 444 | 1 |
| [src/teacher/components/TopicWizardDialog.tsx](../../../src/teacher/components/TopicWizardDialog.tsx) | 337、406、644、665、683、693、738、747、843、845、848、851、861、871、874、877、880 | 17 |
| [src/teacher/pages/ClassManagement.tsx](../../../src/teacher/pages/ClassManagement.tsx) | 151 | 1 |
| [src/teacher/pages/Dashboard.tsx](../../../src/teacher/pages/Dashboard.tsx) | 120、135、173、181 | 4 |
| [src/teacher/pages/GradeExport.tsx](../../../src/teacher/pages/GradeExport.tsx) | 315、400 | 2 |
| [src/teacher/pages/GradingDetail.tsx](../../../src/teacher/pages/GradingDetail.tsx) | 104、106、134、209、210、227、228 | 7 |
| [src/teacher/pages/GradingManagement.tsx](../../../src/teacher/pages/GradingManagement.tsx) | 91、106、143、152 | 4 |
| [src/teacher/pages/StudentManagement.tsx](../../../src/teacher/pages/StudentManagement.tsx) | 193、262、266、303、306、309 | 6 |
| [src/teacher/pages/TaskManagement.tsx](../../../src/teacher/pages/TaskManagement.tsx) | 254、297、303、317、320、389、392 | 7 |
| [src/teacher/pages/TaskProgressDetail.tsx](../../../src/teacher/pages/TaskProgressDetail.tsx) | 95、277 | 2 |
| [src/teacher/pages/TopicManagement.tsx](../../../src/teacher/pages/TopicManagement.tsx) | 442、480、481、506、507、508、509、513、514、515、537、620、623 | 13 |

## 直接同时写入 hover 背景与颜色过渡（40 个位置）

| 文件 | 行号 | 位置数 |
| --- | --- | --- |
| [src/admin/pages/ClassManagement.tsx](../../../src/admin/pages/ClassManagement.tsx) | 303 | 1 |
| [src/admin/pages/SemesterManagement.tsx](../../../src/admin/pages/SemesterManagement.tsx) | 286 | 1 |
| [src/components/AuthLoginScreen.tsx](../../../src/components/AuthLoginScreen.tsx) | 160 | 1 |
| [src/components/RichTextEditor.tsx](../../../src/components/RichTextEditor.tsx) | 51 | 1 |
| [src/components/ui/dialog.tsx](../../../src/components/ui/dialog.tsx) | 81 | 1 |
| [src/components/ui/table.tsx](../../../src/components/ui/table.tsx) | 55 | 1 |
| [src/student/components/ImmersiveExperimentLaunch.tsx](../../../src/student/components/ImmersiveExperimentLaunch.tsx) | 173 | 1 |
| [src/student/components/ImmersiveQuestionnairePreview.tsx](../../../src/student/components/ImmersiveQuestionnairePreview.tsx) | 295、337、386、438、509、690、731 | 7 |
| [src/student/components/ImmersiveReportPreview.tsx](../../../src/student/components/ImmersiveReportPreview.tsx) | 70、87 | 2 |
| [src/student/components/ImmersiveSamplingAnimation.tsx](../../../src/student/components/ImmersiveSamplingAnimation.tsx) | 636 | 1 |
| [src/student/components/immersive-sample-planning/index.tsx](../../../src/student/components/immersive-sample-planning/index.tsx) | 635、672、682 | 3 |
| [src/student/components/immersive-sample-planning/phases/DecisionPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/DecisionPhase.tsx) | 446 | 1 |
| [src/student/components/immersive-sample-planning/phases/FactorsPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/FactorsPhase.tsx) | 184、432、515 | 3 |
| [src/student/components/immersive-sample-planning/phases/PrecisionPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/PrecisionPhase.tsx) | 113 | 1 |
| [src/student/pages/TaskHall.tsx](../../../src/student/pages/TaskHall.tsx) | 420 | 1 |
| [src/student/pages/TopicDetails.tsx](../../../src/student/pages/TopicDetails.tsx) | 283 | 1 |
| [src/student/pages/stages/QuestionnaireDesign.tsx](../../../src/student/pages/stages/QuestionnaireDesign.tsx) | 475、604、894 | 3 |
| [src/teacher/components/TopicViewDialog.tsx](../../../src/teacher/components/TopicViewDialog.tsx) | 127 | 1 |
| [src/teacher/pages/ClassManagement.tsx](../../../src/teacher/pages/ClassManagement.tsx) | 141 | 1 |
| [src/teacher/pages/Dashboard.tsx](../../../src/teacher/pages/Dashboard.tsx) | 185、212 | 2 |
| [src/teacher/pages/GradeExport.tsx](../../../src/teacher/pages/GradeExport.tsx) | 376 | 1 |
| [src/teacher/pages/GradingManagement.tsx](../../../src/teacher/pages/GradingManagement.tsx) | 110 | 1 |
| [src/teacher/pages/StudentManagement.tsx](../../../src/teacher/pages/StudentManagement.tsx) | 296 | 1 |
| [src/teacher/pages/TaskManagement.tsx](../../../src/teacher/pages/TaskManagement.tsx) | 275 | 1 |
| [src/teacher/pages/TaskProgressDetail.tsx](../../../src/teacher/pages/TaskProgressDetail.tsx) | 261 | 1 |
| [src/teacher/pages/TopicManagement.tsx](../../../src/teacher/pages/TopicManagement.tsx) | 449 | 1 |

## 仅直接匹配到 hover 文字/边框与颜色过渡（47 个位置）

| 文件 | 行号 | 位置数 |
| --- | --- | --- |
| [src/admin/pages/ClassManagement.tsx](../../../src/admin/pages/ClassManagement.tsx) | 202、213、224、235 | 4 |
| [src/admin/pages/SemesterManagement.tsx](../../../src/admin/pages/SemesterManagement.tsx) | 199、210、221、232 | 4 |
| [src/components/AuthLoginScreen.tsx](../../../src/components/AuthLoginScreen.tsx) | 174、178 | 2 |
| [src/components/questionnaire/QuestionEditor.tsx](../../../src/components/questionnaire/QuestionEditor.tsx) | 332 | 1 |
| [src/student/components/ImmersiveReportPreview.tsx](../../../src/student/components/ImmersiveReportPreview.tsx) | 257 | 1 |
| [src/student/components/immersive-sample-planning/phases/FormulaPhase.tsx](../../../src/student/components/immersive-sample-planning/phases/FormulaPhase.tsx) | 68、80 | 2 |
| [src/student/pages/SubmissionPreview.tsx](../../../src/student/pages/SubmissionPreview.tsx) | 211、218 | 2 |
| [src/student/pages/TaskHall.tsx](../../../src/student/pages/TaskHall.tsx) | 148、340、347、354、361、426 | 6 |
| [src/student/pages/TopicDetails.tsx](../../../src/student/pages/TopicDetails.tsx) | 289 | 1 |
| [src/teacher/components/StudentImportDialog.tsx](../../../src/teacher/components/StudentImportDialog.tsx) | 44 | 1 |
| [src/teacher/components/TopicViewDialog.tsx](../../../src/teacher/components/TopicViewDialog.tsx) | 341 | 1 |
| [src/teacher/components/TopicWizardDialog.tsx](../../../src/teacher/components/TopicWizardDialog.tsx) | 314、680 | 2 |
| [src/teacher/pages/ClassManagement.tsx](../../../src/teacher/pages/ClassManagement.tsx) | 58、69、80 | 3 |
| [src/teacher/pages/Dashboard.tsx](../../../src/teacher/pages/Dashboard.tsx) | 33 | 1 |
| [src/teacher/pages/GradeExport.tsx](../../../src/teacher/pages/GradeExport.tsx) | 189、201、212、224 | 4 |
| [src/teacher/pages/StudentManagement.tsx](../../../src/teacher/pages/StudentManagement.tsx) | 210、221、232 | 3 |
| [src/teacher/pages/TaskManagement.tsx](../../../src/teacher/pages/TaskManagement.tsx) | 177、188、199、210 | 4 |
| [src/teacher/pages/TaskProgressDetail.tsx](../../../src/teacher/pages/TaskProgressDetail.tsx) | 119 | 1 |
| [src/teacher/pages/TopicManagement.tsx](../../../src/teacher/pages/TopicManagement.tsx) | 369、380、391、402 | 4 |

## TableRow 使用位置（39 个）

| 文件 | 行号 | 位置数 |
| --- | --- | --- |
| [src/admin/pages/ClassManagement.tsx](../../../src/admin/pages/ClassManagement.tsx) | 292、303、347 | 3 |
| [src/admin/pages/SemesterManagement.tsx](../../../src/admin/pages/SemesterManagement.tsx) | 276、286、330 | 3 |
| [src/admin/pages/StudentManagement.tsx](../../../src/admin/pages/StudentManagement.tsx) | 238、249、341、351、360 | 5 |
| [src/admin/pages/TeacherManagement.tsx](../../../src/admin/pages/TeacherManagement.tsx) | 46、47、49 | 3 |
| [src/student/components/SamplePreviewTable.tsx](../../../src/student/components/SamplePreviewTable.tsx) | 109、119 | 2 |
| [src/student/components/StratifiedSamplingTab.tsx](../../../src/student/components/StratifiedSamplingTab.tsx) | 353、362、383、389 | 4 |
| [src/student/pages/stages/analysis-params-panels.tsx](../../../src/student/pages/stages/analysis-params-panels.tsx) | 162、171 | 2 |
| [src/teacher/pages/ClassManagement.tsx](../../../src/teacher/pages/ClassManagement.tsx) | 131、141、161 | 3 |
| [src/teacher/pages/GradeExport.tsx](../../../src/teacher/pages/GradeExport.tsx) | 330、357、361、365、376 | 5 |
| [src/teacher/pages/StudentManagement.tsx](../../../src/teacher/pages/StudentManagement.tsx) | 275、285、296 | 3 |
| [src/teacher/pages/TaskManagement.tsx](../../../src/teacher/pages/TaskManagement.tsx) | 263、275、337 | 3 |
| [src/teacher/pages/TaskProgressDetail.tsx](../../../src/teacher/pages/TaskProgressDetail.tsx) | 248、261、297 | 3 |

## TabsTrigger 使用位置（23 个，主要为激活状态过渡）

| 文件 | 行号 | 位置数 |
| --- | --- | --- |
| [src/components/SamplingResultsSnapshot.tsx](../../../src/components/SamplingResultsSnapshot.tsx) | 89 | 1 |
| [src/components/questionnaire/QuestionEditor.tsx](../../../src/components/questionnaire/QuestionEditor.tsx) | 203 | 1 |
| [src/student/pages/SubmissionDetail.tsx](../../../src/student/pages/SubmissionDetail.tsx) | 97、98、99、100 | 4 |
| [src/student/pages/SubmissionPreview.tsx](../../../src/student/pages/SubmissionPreview.tsx) | 211、218 | 2 |
| [src/student/pages/stages/AnalysisReport.tsx](../../../src/student/pages/stages/AnalysisReport.tsx) | 588、598、608、623、624、625、626 | 7 |
| [src/student/pages/stages/SamplingExecution.tsx](../../../src/student/pages/stages/SamplingExecution.tsx) | 472、480、489、498 | 4 |
| [src/teacher/pages/GradingDetail.tsx](../../../src/teacher/pages/GradingDetail.tsx) | 123、124、125、126 | 4 |

## 浏览器复现

数值表示每个控件在八轮快速进出中的背景 transitioncancel 次数，不是用户操作次数。

| 入口 | 背景过渡取消 | 其他说明 |
| --- | --- | --- |
| 管理员行内编辑按钮 | 10 | 静止采样稳定，位置尺寸未变 |
| 管理员学期表格行 | 16 | 静止采样稳定，位置尺寸未变 |
| 登录页其他端入口链接 | 10 | 静止采样稳定，位置尺寸未变 |
| 分析标签页 hover（对照） | 0 | 没有复现 hover 背景动画 |
| 学生公告列表项 | 11 | 静止采样稳定，位置尺寸未变 |
| 统计卡片（边框变化） | 0 | 仅边框过渡 |
| 共享弹窗右上角关闭 | 13 | 静止采样稳定，位置尺寸未变 |
| 禁用的删除按钮（对照） | 0 | 没有复现 hover 背景动画 |
| 已修复的侧栏（对照） | 0 | 没有复现 hover 背景动画 |
| 教师批改列表卡片按钮 | 14 | 静止采样稳定，位置尺寸未变 |
| 三端共用的安全登录按钮 | 14 | 静止采样稳定，位置尺寸未变 |
| 教师搜索按钮（outline） | 10 | 静止采样稳定，位置尺寸未变 |
| 样本量教学参数按钮 | 14 | 静止采样稳定，位置尺寸未变 |
| 问卷试填是/否选项 | 11 | 静止采样稳定，位置尺寸未变 |
| 问卷试填多选项 | 14 | 静止采样稳定，位置尺寸未变 |
| 问卷试填评分选项 | 13 | 静止采样稳定，位置尺寸未变 |
| 问卷试填单选项 | 11 | 静止采样稳定，位置尺寸未变 |
| 问卷题目行及隐藏操作组 | 16 | 子操作组另有 16 次 opacity 取消 |
| 富文本加粗工具按钮 | 12 | 静止采样稳定，位置尺寸未变 |
| 下拉选项（对照） | 0 | 没有复现 hover 背景动画 |
| 批改状态下拉触发器（对照） | 0 | 没有复现 hover 背景动画 |
| 任务大厅开始实验 | 14 | 静止采样稳定，位置尺寸未变 |
| 教师模板卡片 | 16 | 静止采样稳定，位置尺寸未变 |
| 教师模板详情内的原生标签按钮 | 16 | 静止采样稳定，位置尺寸未变 |

详细结果见 [browser-cases.json](browser-cases.json)。仅下拉选项产生了预期的高亮属性切换，所有有效案例的矩形位置保持一致。
