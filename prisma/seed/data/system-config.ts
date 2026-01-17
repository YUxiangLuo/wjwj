/**
 * 系统配置初始数据
 */

export interface SystemConfigData {
  configKey: string
  configValue: string
  valueType: string
  description: string
}

export const systemConfigs: SystemConfigData[] = [
  // ========== 登录安全配置 ==========
  {
    configKey: 'login.max_fail_count',
    configValue: '5',
    valueType: 'int',
    description: '登录失败锁定阈值（次数）',
  },
  {
    configKey: 'login.lock_duration_minutes',
    configValue: '30',
    valueType: 'int',
    description: '登录失败锁定时长（分钟）',
  },

  // ========== 会话超时配置 ==========
  {
    configKey: 'session.admin_timeout_minutes',
    configValue: '30',
    valueType: 'int',
    description: '管理员会话超时时间（分钟）',
  },
  {
    configKey: 'session.teacher_timeout_minutes',
    configValue: '120',
    valueType: 'int',
    description: '教师会话超时时间（分钟）',
  },
  {
    configKey: 'session.assistant_timeout_minutes',
    configValue: '120',
    valueType: 'int',
    description: '助教会话超时时间（分钟）',
  },
  {
    configKey: 'session.student_timeout_minutes',
    configValue: '240',
    valueType: 'int',
    description: '学生会话超时时间（分钟）',
  },

  // ========== 文件限制配置 ==========
  {
    configKey: 'file.excel_max_rows',
    configValue: '100000',
    valueType: 'int',
    description: 'Excel总体数据最大行数',
  },
  {
    configKey: 'file.excel_max_size_mb',
    configValue: '50',
    valueType: 'int',
    description: 'Excel文件最大大小（MB）',
  },
  {
    configKey: 'file.image_max_size_mb',
    configValue: '10',
    valueType: 'int',
    description: '图片附件最大大小（MB）',
  },
  {
    configKey: 'file.video_max_size_mb',
    configValue: '200',
    valueType: 'int',
    description: '视频附件最大大小（MB）',
  },
  {
    configKey: 'file.document_max_size_mb',
    configValue: '50',
    valueType: 'int',
    description: '文档附件最大大小（MB）',
  },
  {
    configKey: 'file.batch_import_max_rows',
    configValue: '500',
    valueType: 'int',
    description: '批量导入学生最大行数',
  },

  // ========== 业务规则配置 ==========
  {
    configKey: 'questionnaire.min_questions',
    configValue: '5',
    valueType: 'int',
    description: '问卷最少题目数',
  },
  {
    configKey: 'questionnaire.max_questions',
    configValue: '50',
    valueType: 'int',
    description: '问卷最多题目数',
  },
  {
    configKey: 'sample.min_size',
    configValue: '30',
    valueType: 'int',
    description: '最小样本量',
  },
  {
    configKey: 'report.min_length',
    configValue: '100',
    valueType: 'int',
    description: '分析报告最少字数',
  },
  {
    configKey: 'report.max_length',
    configValue: '5000',
    valueType: 'int',
    description: '分析报告最多字数',
  },

  // ========== 通知配置 ==========
  {
    configKey: 'notification.deadline_reminder_hours',
    configValue: '24',
    valueType: 'int',
    description: '截止提醒提前时间（小时）',
  },
  {
    configKey: 'notification.retention_days',
    configValue: '90',
    valueType: 'int',
    description: '通知保留天数',
  },

  // ========== 批改配置 ==========
  {
    configKey: 'grading.lock_timeout_minutes',
    configValue: '30',
    valueType: 'int',
    description: '批改锁定超时时间（分钟）',
  },
  {
    configKey: 'grading.topic_lock_timeout_minutes',
    configValue: '30',
    valueType: 'int',
    description: '课题编辑锁定超时时间（分钟）',
  },

  // ========== 自动保存配置 ==========
  {
    configKey: 'autosave.interval_seconds',
    configValue: '30',
    valueType: 'int',
    description: '自动保存间隔（秒）',
  },

  // ========== 数据清理配置 ==========
  {
    configKey: 'cleanup.login_log_days',
    configValue: '90',
    valueType: 'int',
    description: '登录日志保留天数',
  },
  {
    configKey: 'cleanup.system_metrics_days',
    configValue: '30',
    valueType: 'int',
    description: '系统监控数据保留天数',
  },
  {
    configKey: 'cleanup.operation_log_days',
    configValue: '365',
    valueType: 'int',
    description: '操作日志保留天数',
  },
]
