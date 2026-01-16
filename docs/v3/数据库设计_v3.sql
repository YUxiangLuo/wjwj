-- ============================================================
-- 抽样统计虚拟仿真教学系统 - 数据库设计 V3.0
-- ============================================================
-- 数据库：MySQL 8.0+
-- 字符集：utf8mb4
-- 排序规则：utf8mb4_general_ci
--
-- V3.0 变更内容：
-- 1. 用户表新增登录锁定字段 (login_fail_count, locked_until)
-- 2. 新增会话管理表 (user_session)
-- 3. 新增通知表 (notification)
-- 4. 新增系统配置表 (system_config)
-- 5. 新增学生转班记录表 (student_transfer)
-- 6. topic/task 表新增软删除字段 (deleted_at)
-- 7. topic 表新增编辑锁定字段 (locked_by, locked_at)
-- 8. submission 表新增批改锁定字段
-- 9. experiment 表新增自动保存和版本控制字段
-- 10. student 表新增软删除字段
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS sampling_simulation
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

USE sampling_simulation;

-- ============================================================
-- 一、用户域（4表）
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 管理员表 (admin)
-- 说明：系统预置唯一管理员账号
-- V3.0变更：新增 login_fail_count, locked_until
-- ------------------------------------------------------------
CREATE TABLE admin (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    username            VARCHAR(50) NOT NULL COMMENT '登录账号',
    password            VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    is_first_login      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',

    -- V3.0 登录锁定
    login_fail_count    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until        DATETIME DEFAULT NULL COMMENT '锁定截止时间（NULL表示未锁定）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='管理员表';

-- ------------------------------------------------------------
-- 1.2 教师表 (teacher)
-- V3.0变更：新增 login_fail_count, locked_until
-- ------------------------------------------------------------
CREATE TABLE teacher (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employee_id         VARCHAR(50) NOT NULL COMMENT '工号（用于登录）',
    name                VARCHAR(100) NOT NULL COMMENT '姓名',
    password            VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    is_first_login      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',

    -- V3.0 登录锁定
    login_fail_count    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until        DATETIME DEFAULT NULL COMMENT '锁定截止时间（NULL表示未锁定）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_employee_id (employee_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='教师表';

-- ------------------------------------------------------------
-- 1.3 助教表 (assistant)
-- V3.0变更：新增 login_fail_count, locked_until
-- ------------------------------------------------------------
CREATE TABLE assistant (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    account             VARCHAR(50) NOT NULL COMMENT '助教账号（用于登录）',
    name                VARCHAR(100) NOT NULL COMMENT '姓名',
    password            VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    creator_teacher_id  BIGINT UNSIGNED NOT NULL COMMENT '创建该助教的教师ID',
    is_first_login      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',

    -- V3.0 登录锁定
    login_fail_count    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until        DATETIME DEFAULT NULL COMMENT '锁定截止时间（NULL表示未锁定）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_account (account),
    KEY idx_creator_teacher_id (creator_teacher_id),
    KEY idx_status (status),

    CONSTRAINT fk_assistant_teacher FOREIGN KEY (creator_teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='助教表';

-- ------------------------------------------------------------
-- 1.4 学生表 (student)
-- V3.0变更：新增 login_fail_count, locked_until, deleted_at
-- ------------------------------------------------------------
CREATE TABLE student (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    student_id          VARCHAR(50) NOT NULL COMMENT '学号（用于登录）',
    name                VARCHAR(100) NOT NULL COMMENT '姓名',
    password            VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    class_id            BIGINT UNSIGNED NOT NULL COMMENT '所属班级ID',
    is_first_login      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',

    -- V3.0 登录锁定
    login_fail_count    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until        DATETIME DEFAULT NULL COMMENT '锁定截止时间（NULL表示未锁定）',

    -- V3.0 软删除
    deleted_at          DATETIME DEFAULT NULL COMMENT '删除时间（NULL表示未删除）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_student_id (student_id),
    KEY idx_class_id (class_id),
    KEY idx_status (status),
    KEY idx_deleted (deleted_at)

    -- 外键约束在class表创建后添加
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学生表';

-- ============================================================
-- 二、组织域（4表，含V3.0新增的转班记录表）
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 学期表 (semester)
-- ------------------------------------------------------------
CREATE TABLE semester (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name                VARCHAR(20) NOT NULL COMMENT '学期名称，格式：YYYY-Spring 或 YYYY-Fall',
    is_current          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前学期：1-是，0-否',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学期表';

-- ------------------------------------------------------------
-- 2.2 班级表 (class)
-- ------------------------------------------------------------
CREATE TABLE class (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name                VARCHAR(100) NOT NULL COMMENT '班级名称',
    semester_id         BIGINT UNSIGNED NOT NULL COMMENT '所属学期ID',
    teacher_id          BIGINT UNSIGNED NOT NULL COMMENT '授课教师ID',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    KEY idx_semester_id (semester_id),
    KEY idx_teacher_id (teacher_id),

    CONSTRAINT fk_class_semester FOREIGN KEY (semester_id) REFERENCES semester(id),
    CONSTRAINT fk_class_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='班级表';

-- 添加学生表的外键约束
ALTER TABLE student ADD CONSTRAINT fk_student_class FOREIGN KEY (class_id) REFERENCES class(id);

-- ------------------------------------------------------------
-- 2.3 助教-班级绑定表 (assistant_class)
-- ------------------------------------------------------------
CREATE TABLE assistant_class (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    assistant_id        BIGINT UNSIGNED NOT NULL COMMENT '助教ID',
    class_id            BIGINT UNSIGNED NOT NULL COMMENT '班级ID',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    UNIQUE KEY uk_assistant_class (assistant_id, class_id),
    KEY idx_class_id (class_id),

    CONSTRAINT fk_ac_assistant FOREIGN KEY (assistant_id) REFERENCES assistant(id) ON DELETE CASCADE,
    CONSTRAINT fk_ac_class FOREIGN KEY (class_id) REFERENCES class(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='助教-班级绑定表';

-- ------------------------------------------------------------
-- 2.4 【V3.0 新增】学生转班记录表 (student_transfer)
-- 说明：记录学生转班历史，用于审计追踪
-- ------------------------------------------------------------
CREATE TABLE student_transfer (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    student_id          BIGINT UNSIGNED NOT NULL COMMENT '学生ID',
    from_class_id       BIGINT UNSIGNED NOT NULL COMMENT '原班级ID',
    to_class_id         BIGINT UNSIGNED NOT NULL COMMENT '新班级ID',
    reason              VARCHAR(500) DEFAULT NULL COMMENT '转班原因（可选）',
    operated_by         BIGINT UNSIGNED NOT NULL COMMENT '操作人（管理员ID）',
    transferred_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '转班时间',

    KEY idx_student (student_id),
    KEY idx_from_class (from_class_id),
    KEY idx_to_class (to_class_id),

    CONSTRAINT fk_transfer_student FOREIGN KEY (student_id) REFERENCES student(id),
    CONSTRAINT fk_transfer_from FOREIGN KEY (from_class_id) REFERENCES class(id),
    CONSTRAINT fk_transfer_to FOREIGN KEY (to_class_id) REFERENCES class(id),
    CONSTRAINT fk_transfer_admin FOREIGN KEY (operated_by) REFERENCES admin(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学生转班记录表';

-- ============================================================
-- 三、教学域（4表）
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 课题表 (topic)
-- V3.0变更：新增 locked_by, locked_at, deleted_at
-- ------------------------------------------------------------
CREATE TABLE topic (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    teacher_id          BIGINT UNSIGNED NOT NULL COMMENT '创建教师ID',
    name                VARCHAR(200) NOT NULL COMMENT '课题名称',
    description         TEXT COMMENT '背景描述（富文本）',

    -- 数据文件相关
    excel_file_path     VARCHAR(500) COMMENT 'Excel总体数据文件存储路径',
    excel_row_count     INT UNSIGNED DEFAULT 0 COMMENT '总体数据行数（总体规模N）',

    -- 字段映射配置（JSON格式）
    field_mapping       JSON COMMENT '字段映射配置',

    -- 评分权重配置（JSON格式）
    weight_config       JSON COMMENT '评分权重配置',

    status              TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-草稿，1-已发布',
    is_deleted          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除（软删除）：1-是，0-否（兼容V2）',

    -- V3.0 编辑锁定
    locked_by           BIGINT UNSIGNED DEFAULT NULL COMMENT '当前编辑锁定人（教师ID）',
    locked_at           DATETIME DEFAULT NULL COMMENT '锁定开始时间',

    -- V3.0 软删除时间
    deleted_at          DATETIME DEFAULT NULL COMMENT '删除时间（NULL表示未删除）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    KEY idx_teacher_id (teacher_id),
    KEY idx_status (status),
    KEY idx_deleted (deleted_at),

    CONSTRAINT fk_topic_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题表';

-- ------------------------------------------------------------
-- 3.2 课题附件表 (topic_attachment)
-- ------------------------------------------------------------
CREATE TABLE topic_attachment (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id            BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    file_name           VARCHAR(255) NOT NULL COMMENT '文件名',
    file_path           VARCHAR(500) NOT NULL COMMENT '文件存储路径',
    file_type           VARCHAR(50) NOT NULL COMMENT '文件类型：image/video/document',
    file_size           BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    KEY idx_topic_id (topic_id),

    CONSTRAINT fk_attachment_topic FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题附件表';

-- ------------------------------------------------------------
-- 3.3 课题推荐题目表 (topic_recommend_question)
-- ------------------------------------------------------------
CREATE TABLE topic_recommend_question (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id            BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    question_type       TINYINT NOT NULL COMMENT '题目类型：1-判断题，2-单选题，3-多选题，4-满意度量表',
    content             VARCHAR(500) NOT NULL COMMENT '题目内容',
    options             JSON COMMENT '选项配置',
    sort_order          INT NOT NULL DEFAULT 0 COMMENT '排序序号',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    KEY idx_topic_id (topic_id),

    CONSTRAINT fk_rq_topic FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题推荐题目表';

-- ------------------------------------------------------------
-- 3.4 任务表 (task)
-- V3.0变更：新增 deleted_at
-- ------------------------------------------------------------
CREATE TABLE task (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id            BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    class_id            BIGINT UNSIGNED NOT NULL COMMENT '班级ID',
    open_time           DATETIME COMMENT '开放时间（为空表示立即开放）',
    deadline            DATETIME COMMENT '截止时间（为空表示无截止限制）',

    -- V3.0 软删除
    deleted_at          DATETIME DEFAULT NULL COMMENT '删除时间（NULL表示未删除）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_topic_class (topic_id, class_id),
    KEY idx_class_id (class_id),
    KEY idx_deleted (deleted_at),

    CONSTRAINT fk_task_topic FOREIGN KEY (topic_id) REFERENCES topic(id),
    CONSTRAINT fk_task_class FOREIGN KEY (class_id) REFERENCES class(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='任务表';

-- ============================================================
-- 四、实验域（2表）
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 学生实验记录表 (experiment)
-- V3.0变更：新增 last_saved_at, version
-- ------------------------------------------------------------
CREATE TABLE experiment (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    student_id          BIGINT UNSIGNED NOT NULL COMMENT '学生ID',
    task_id             BIGINT UNSIGNED NOT NULL COMMENT '任务ID',

    -- 当前进度
    current_stage       TINYINT NOT NULL DEFAULT 0 COMMENT '当前阶段：0-未开始，1-问卷设计，2-样本量规划，3-抽样执行，4-分析报告',
    status              TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-进行中，1-已提交，2-已批改，3-被驳回',

    -- 阶段一：问卷设计（JSON格式）
    questionnaire       JSON COMMENT '问卷设计数据',

    -- 阶段二：样本量规划（JSON格式）
    sample_plan         JSON COMMENT '样本量规划数据',

    -- 阶段三：抽样结果（JSON格式）
    sampling_results    JSON COMMENT '抽样执行结果',
    sampling_data_path  VARCHAR(500) COMMENT '抽样结果文件存储目录（大数据量时使用）',

    -- 阶段四：分析报告
    report_content      TEXT COMMENT '分析报告内容（富文本）',

    -- 时间记录
    stage1_completed_at DATETIME COMMENT '阶段一完成时间',
    stage2_completed_at DATETIME COMMENT '阶段二完成时间',
    stage3_completed_at DATETIME COMMENT '阶段三完成时间',
    stage4_completed_at DATETIME COMMENT '阶段四完成时间',

    -- V3.0 自动保存和版本控制
    last_saved_at       DATETIME DEFAULT NULL COMMENT '最后自动保存时间',
    version             INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本号（乐观锁）',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_student_task (student_id, task_id),
    KEY idx_task_id (task_id),
    KEY idx_status (status),

    CONSTRAINT fk_experiment_student FOREIGN KEY (student_id) REFERENCES student(id),
    CONSTRAINT fk_experiment_task FOREIGN KEY (task_id) REFERENCES task(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学生实验记录表';

-- ------------------------------------------------------------
-- 4.2 提交记录表 (submission)
-- V3.0变更：新增 locked_by_type, locked_by_id, locked_at
-- ------------------------------------------------------------
CREATE TABLE submission (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    experiment_id       BIGINT UNSIGNED NOT NULL COMMENT '实验记录ID',

    -- 提交内容快照
    questionnaire_pdf_path VARCHAR(500) COMMENT '问卷PDF文件路径',
    report_pdf_path     VARCHAR(500) COMMENT '实验报告PDF文件路径',

    -- 评分
    score_questionnaire DECIMAL(5,2) COMMENT '问卷设计得分（0-100）',
    score_process       DECIMAL(5,2) COMMENT '实验过程得分（0-100）',
    score_report        DECIMAL(5,2) COMMENT '实验报告得分（0-100）',
    total_score         DECIMAL(5,2) COMMENT '总分',

    -- 评语
    teacher_comment     TEXT COMMENT '教师评语',
    reject_reason       TEXT COMMENT '驳回理由（被驳回时填写）',

    -- 状态：0-批改草稿，1-待批改，2-已批改（通过），3-被驳回
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '状态',

    -- 批改人（可以是教师或助教）
    graded_by_type      TINYINT COMMENT '批改人类型：2-教师，3-助教',
    graded_by_id        BIGINT UNSIGNED COMMENT '批改人ID',

    -- V3.0 批改锁定
    locked_by_type      TINYINT DEFAULT NULL COMMENT '锁定人类型：2-教师，3-助教',
    locked_by_id        BIGINT UNSIGNED DEFAULT NULL COMMENT '锁定人ID',
    locked_at           DATETIME DEFAULT NULL COMMENT '锁定开始时间',

    submitted_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
    graded_at           DATETIME COMMENT '批改时间',

    KEY idx_experiment_id (experiment_id),
    KEY idx_status (status),
    KEY idx_locked (locked_at),

    CONSTRAINT fk_submission_experiment FOREIGN KEY (experiment_id) REFERENCES experiment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='提交记录表';

-- ============================================================
-- 五、系统域（8表，含V3.0新增的3表）
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 公告表 (announcement)
-- ------------------------------------------------------------
CREATE TABLE announcement (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    title               VARCHAR(100) NOT NULL COMMENT '公告标题',
    content             TEXT NOT NULL COMMENT '公告内容（富文本）',
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-已发布，0-已下架',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='公告表';

-- ------------------------------------------------------------
-- 5.2 公告已读表 (announcement_read)
-- ------------------------------------------------------------
CREATE TABLE announcement_read (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    announcement_id     BIGINT UNSIGNED NOT NULL COMMENT '公告ID',
    user_type           TINYINT NOT NULL COMMENT '用户类型：1-管理员，2-教师，3-助教，4-学生',
    user_id             BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    read_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '阅读时间',

    UNIQUE KEY uk_announcement_user (announcement_id, user_type, user_id),
    KEY idx_user (user_type, user_id),

    CONSTRAINT fk_ar_announcement FOREIGN KEY (announcement_id) REFERENCES announcement(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='公告已读表';

-- ------------------------------------------------------------
-- 5.3 登录日志表 (login_log)
-- ------------------------------------------------------------
CREATE TABLE login_log (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_type           TINYINT NOT NULL COMMENT '用户类型：1-管理员，2-教师，3-助教，4-学生',
    user_id             BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    login_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
    ip_address          VARCHAR(45) COMMENT '登录IP地址（支持IPv6）',
    user_agent          VARCHAR(500) COMMENT '浏览器/客户端信息',

    KEY idx_user (user_type, user_id),
    KEY idx_login_at (login_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='登录日志表';

-- ------------------------------------------------------------
-- 5.4 系统监控数据表 (system_metrics)
-- ------------------------------------------------------------
CREATE TABLE system_metrics (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    metric_type         VARCHAR(50) NOT NULL COMMENT '指标类型：cpu, memory, disk, active_users, api_requests 等',
    metric_value        DECIMAL(10,2) NOT NULL COMMENT '指标值',
    recorded_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',

    KEY idx_type_time (metric_type, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='系统监控数据表';

-- ------------------------------------------------------------
-- 5.5 操作日志表 (operation_log)
-- ------------------------------------------------------------
CREATE TABLE operation_log (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_type           TINYINT NOT NULL COMMENT '操作者类型：1-管理员，2-教师，3-助教，4-学生',
    user_id             BIGINT UNSIGNED NOT NULL COMMENT '操作者ID',
    action              VARCHAR(100) NOT NULL COMMENT '操作类型',
    target_type         VARCHAR(50) COMMENT '操作对象类型',
    target_id           BIGINT UNSIGNED COMMENT '操作对象ID',
    detail              JSON COMMENT '操作详情（JSON格式）',
    ip_address          VARCHAR(45) COMMENT '操作IP地址',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',

    KEY idx_user (user_type, user_id),
    KEY idx_action (action),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作日志表';

-- ------------------------------------------------------------
-- 5.6 【V3.0 新增】会话管理表 (user_session)
-- 说明：管理用户登录会话，支持单设备登录、会话超时
-- ------------------------------------------------------------
CREATE TABLE user_session (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    session_token       VARCHAR(128) NOT NULL COMMENT '会话令牌（UUID或随机字符串）',
    user_type           TINYINT NOT NULL COMMENT '用户类型：1-管理员，2-教师，3-助教，4-学生',
    user_id             BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    device_info         VARCHAR(500) COMMENT '设备信息（浏览器UA、IP等）',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    expires_at          DATETIME NOT NULL COMMENT '过期时间',
    last_active_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活动时间',

    UNIQUE KEY uk_token (session_token),
    KEY idx_user (user_type, user_id),
    KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='会话管理表';

-- ------------------------------------------------------------
-- 5.7 【V3.0 新增】通知表 (notification)
-- 说明：站内通知，点对点消息
-- ------------------------------------------------------------
CREATE TABLE notification (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',

    -- 接收者信息
    receiver_type       TINYINT NOT NULL COMMENT '接收者类型：1-管理员，2-教师，3-助教，4-学生',
    receiver_id         BIGINT UNSIGNED NOT NULL COMMENT '接收者ID',

    -- 通知内容
    type                VARCHAR(50) NOT NULL COMMENT '通知类型：TASK_PUBLISHED/SUBMISSION_GRADED/SUBMISSION_REJECTED等',
    title               VARCHAR(200) NOT NULL COMMENT '标题',
    content             TEXT NOT NULL COMMENT '内容',

    -- 关联信息（用于点击跳转）
    related_type        VARCHAR(50) COMMENT '关联对象类型：task/submission等',
    related_id          BIGINT UNSIGNED COMMENT '关联对象ID',

    -- 状态
    is_read             TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：0-未读，1-已读',
    read_at             DATETIME COMMENT '阅读时间',

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    KEY idx_receiver (receiver_type, receiver_id, is_read),
    KEY idx_type (type),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='通知表';

-- ------------------------------------------------------------
-- 5.8 【V3.0 新增】系统配置表 (system_config)
-- 说明：存储可动态调整的系统配置参数
-- ------------------------------------------------------------
CREATE TABLE system_config (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    config_key          VARCHAR(100) NOT NULL COMMENT '配置键',
    config_value        TEXT NOT NULL COMMENT '配置值',
    value_type          VARCHAR(20) NOT NULL DEFAULT 'string' COMMENT '值类型：string/int/boolean/json',
    description         VARCHAR(500) COMMENT '配置说明',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='系统配置表';

-- ============================================================
-- 六、初始化数据
-- ============================================================

-- ------------------------------------------------------------
-- 6.1 默认管理员账号
-- 默认账号：admin，默认密码：admin123（实际应用中需要加密）
-- ------------------------------------------------------------
INSERT INTO admin (username, password, is_first_login) VALUES ('admin', 'admin123', 1);

-- ------------------------------------------------------------
-- 6.2 【V3.0 新增】系统配置初始化
-- ------------------------------------------------------------
INSERT INTO system_config (config_key, config_value, value_type, description) VALUES
-- 登录安全配置
('login.max_fail_count', '5', 'int', '登录失败锁定阈值（次数）'),
('login.lock_duration_minutes', '30', 'int', '登录失败锁定时长（分钟）'),

-- 会话超时配置
('session.admin_timeout_minutes', '30', 'int', '管理员会话超时时间（分钟）'),
('session.teacher_timeout_minutes', '120', 'int', '教师会话超时时间（分钟）'),
('session.assistant_timeout_minutes', '120', 'int', '助教会话超时时间（分钟）'),
('session.student_timeout_minutes', '240', 'int', '学生会话超时时间（分钟）'),

-- 文件限制配置
('file.excel_max_rows', '100000', 'int', 'Excel总体数据最大行数'),
('file.excel_max_size_mb', '50', 'int', 'Excel文件最大大小（MB）'),
('file.image_max_size_mb', '10', 'int', '图片附件最大大小（MB）'),
('file.video_max_size_mb', '200', 'int', '视频附件最大大小（MB）'),
('file.document_max_size_mb', '50', 'int', '文档附件最大大小（MB）'),
('file.batch_import_max_rows', '500', 'int', '批量导入学生最大行数'),

-- 业务规则配置
('questionnaire.min_questions', '5', 'int', '问卷最少题目数'),
('questionnaire.max_questions', '50', 'int', '问卷最多题目数'),
('sample.min_size', '30', 'int', '最小样本量'),
('report.min_length', '100', 'int', '分析报告最少字数'),
('report.max_length', '5000', 'int', '分析报告最多字数'),

-- 通知配置
('notification.deadline_reminder_hours', '24', 'int', '截止提醒提前时间（小时）'),
('notification.retention_days', '90', 'int', '通知保留天数'),

-- 批改配置
('grading.lock_timeout_minutes', '30', 'int', '批改锁定超时时间（分钟）'),
('grading.topic_lock_timeout_minutes', '30', 'int', '课题编辑锁定超时时间（分钟）'),

-- 自动保存配置
('autosave.interval_seconds', '30', 'int', '自动保存间隔（秒）'),

-- 数据清理配置
('cleanup.login_log_days', '90', 'int', '登录日志保留天数'),
('cleanup.system_metrics_days', '30', 'int', '系统监控数据保留天数'),
('cleanup.operation_log_days', '365', 'int', '操作日志保留天数');

-- ============================================================
-- 七、视图
-- ============================================================

-- ------------------------------------------------------------
-- 7.1 班级学生数量统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_class_student_count AS
SELECT
    c.id AS class_id,
    c.name AS class_name,
    c.semester_id,
    c.teacher_id,
    COUNT(s.id) AS student_count
FROM class c
LEFT JOIN student s ON c.id = s.class_id AND s.status = 1 AND s.deleted_at IS NULL
GROUP BY c.id, c.name, c.semester_id, c.teacher_id;

-- ------------------------------------------------------------
-- 7.2 任务进度统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_task_progress AS
SELECT
    t.id AS task_id,
    t.topic_id,
    t.class_id,
    tp.name AS topic_name,
    c.name AS class_name,
    t.deadline,
    COUNT(DISTINCT s.id) AS total_students,
    COUNT(DISTINCT e.id) AS started_count,
    SUM(CASE WHEN e.status = 1 THEN 1 ELSE 0 END) AS submitted_count,
    SUM(CASE WHEN e.status = 2 THEN 1 ELSE 0 END) AS graded_count,
    SUM(CASE WHEN e.status = 3 THEN 1 ELSE 0 END) AS rejected_count
FROM task t
JOIN topic tp ON t.topic_id = tp.id
JOIN class c ON t.class_id = c.id
LEFT JOIN student s ON c.id = s.class_id AND s.status = 1 AND s.deleted_at IS NULL
LEFT JOIN experiment e ON t.id = e.task_id AND s.id = e.student_id
WHERE t.deleted_at IS NULL AND tp.deleted_at IS NULL
GROUP BY t.id, t.topic_id, t.class_id, tp.name, c.name, t.deadline;

-- ------------------------------------------------------------
-- 7.3 待批改作业视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_submissions AS
SELECT
    sub.id AS submission_id,
    sub.experiment_id,
    sub.submitted_at,
    sub.status AS submission_status,
    sub.locked_by_type,
    sub.locked_by_id,
    sub.locked_at,
    e.student_id,
    s.student_id AS student_no,
    s.name AS student_name,
    t.id AS task_id,
    tp.id AS topic_id,
    tp.name AS topic_name,
    c.id AS class_id,
    c.name AS class_name,
    c.teacher_id
FROM submission sub
JOIN experiment e ON sub.experiment_id = e.id
JOIN student s ON e.student_id = s.id
JOIN task t ON e.task_id = t.id
JOIN topic tp ON t.topic_id = tp.id
JOIN class c ON t.class_id = c.id
WHERE sub.status IN (0, 1)  -- 批改草稿或待批改
  AND t.deleted_at IS NULL
  AND tp.deleted_at IS NULL;

-- ------------------------------------------------------------
-- 7.4 用户最后登录时间视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_last_login AS
SELECT
    user_type,
    user_id,
    MAX(login_at) AS last_login_at
FROM login_log
GROUP BY user_type, user_id;

-- ------------------------------------------------------------
-- 7.5 今日登录统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_today_login_stats AS
SELECT
    user_type,
    COUNT(*) AS login_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM login_log
WHERE DATE(login_at) = CURDATE()
GROUP BY user_type;

-- ------------------------------------------------------------
-- 7.6 【V3.0 新增】用户未读通知数视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_unread_notification_count AS
SELECT
    receiver_type,
    receiver_id,
    COUNT(*) AS unread_count
FROM notification
WHERE is_read = 0
GROUP BY receiver_type, receiver_id;

-- ------------------------------------------------------------
-- 7.7 【V3.0 新增】活跃会话统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_session_stats AS
SELECT
    user_type,
    COUNT(*) AS session_count,
    COUNT(DISTINCT user_id) AS user_count
FROM user_session
WHERE expires_at > NOW()
GROUP BY user_type;

-- ------------------------------------------------------------
-- 7.8 【V3.0 新增】用户未读公告数视图（优化版）
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_unread_announcement_count AS
SELECT
    u.user_type,
    u.user_id,
    COUNT(a.id) AS unread_count
FROM (
    SELECT 1 AS user_type, id AS user_id FROM admin
    UNION ALL SELECT 2, id FROM teacher WHERE status = 1
    UNION ALL SELECT 3, id FROM assistant WHERE status = 1
    UNION ALL SELECT 4, id FROM student WHERE status = 1 AND deleted_at IS NULL
) u
CROSS JOIN announcement a
LEFT JOIN announcement_read ar ON a.id = ar.announcement_id
    AND ar.user_type = u.user_type
    AND ar.user_id = u.user_id
WHERE a.status = 1 AND ar.id IS NULL
GROUP BY u.user_type, u.user_id;

-- ============================================================
-- 八、存储过程
-- ============================================================

-- ------------------------------------------------------------
-- 8.1 清理过期会话
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_expired_sessions()
BEGIN
    DELETE FROM user_session WHERE expires_at < NOW();
    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.2 清理过期通知（保留90天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_notifications()
BEGIN
    DECLARE retention_days INT DEFAULT 90;

    -- 从配置表读取保留天数
    SELECT CAST(config_value AS UNSIGNED) INTO retention_days
    FROM system_config
    WHERE config_key = 'notification.retention_days';

    DELETE FROM notification
    WHERE created_at < DATE_SUB(NOW(), INTERVAL retention_days DAY);

    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.3 清理过期登录日志（保留90天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_login_log()
BEGIN
    DECLARE retention_days INT DEFAULT 90;

    SELECT CAST(config_value AS UNSIGNED) INTO retention_days
    FROM system_config
    WHERE config_key = 'cleanup.login_log_days';

    DELETE FROM login_log
    WHERE login_at < DATE_SUB(NOW(), INTERVAL retention_days DAY);

    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.4 清理过期系统监控数据（保留30天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_system_metrics()
BEGIN
    DECLARE retention_days INT DEFAULT 30;

    SELECT CAST(config_value AS UNSIGNED) INTO retention_days
    FROM system_config
    WHERE config_key = 'cleanup.system_metrics_days';

    DELETE FROM system_metrics
    WHERE recorded_at < DATE_SUB(NOW(), INTERVAL retention_days DAY);

    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.5 清理过期操作日志（保留365天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_operation_log()
BEGIN
    DECLARE retention_days INT DEFAULT 365;

    SELECT CAST(config_value AS UNSIGNED) INTO retention_days
    FROM system_config
    WHERE config_key = 'cleanup.operation_log_days';

    DELETE FROM operation_log
    WHERE created_at < DATE_SUB(NOW(), INTERVAL retention_days DAY);

    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.6 【V3.0 新增】释放过期的批改锁定
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_release_expired_grading_locks()
BEGIN
    DECLARE lock_timeout INT DEFAULT 30;

    SELECT CAST(config_value AS UNSIGNED) INTO lock_timeout
    FROM system_config
    WHERE config_key = 'grading.lock_timeout_minutes';

    UPDATE submission
    SET locked_by_type = NULL,
        locked_by_id = NULL,
        locked_at = NULL
    WHERE locked_at IS NOT NULL
      AND locked_at < DATE_SUB(NOW(), INTERVAL lock_timeout MINUTE);

    SELECT ROW_COUNT() AS released_locks;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.7 【V3.0 新增】释放过期的课题编辑锁定
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_release_expired_topic_locks()
BEGIN
    DECLARE lock_timeout INT DEFAULT 30;

    SELECT CAST(config_value AS UNSIGNED) INTO lock_timeout
    FROM system_config
    WHERE config_key = 'grading.topic_lock_timeout_minutes';

    UPDATE topic
    SET locked_by = NULL,
        locked_at = NULL
    WHERE locked_at IS NOT NULL
      AND locked_at < DATE_SUB(NOW(), INTERVAL lock_timeout MINUTE);

    SELECT ROW_COUNT() AS released_locks;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 8.8 【V3.0 新增】统一清理过期数据（调用所有清理存储过程）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_all()
BEGIN
    CALL sp_cleanup_expired_sessions();
    CALL sp_cleanup_notifications();
    CALL sp_cleanup_login_log();
    CALL sp_cleanup_system_metrics();
    CALL sp_cleanup_operation_log();
    CALL sp_release_expired_grading_locks();
    CALL sp_release_expired_topic_locks();
END //
DELIMITER ;

-- ============================================================
-- 九、定时事件（可选，需要开启事件调度器）
-- ============================================================

-- 开启事件调度器（需要在MySQL配置或运行时设置）
-- SET GLOBAL event_scheduler = ON;

-- ------------------------------------------------------------
-- 9.1 每小时清理过期会话和释放过期锁
-- ------------------------------------------------------------
-- CREATE EVENT IF NOT EXISTS evt_hourly_cleanup
-- ON SCHEDULE EVERY 1 HOUR
-- DO
-- BEGIN
--     CALL sp_cleanup_expired_sessions();
--     CALL sp_release_expired_grading_locks();
--     CALL sp_release_expired_topic_locks();
-- END;

-- ------------------------------------------------------------
-- 9.2 每天凌晨2点清理过期日志
-- ------------------------------------------------------------
-- CREATE EVENT IF NOT EXISTS evt_daily_cleanup
-- ON SCHEDULE EVERY 1 DAY
-- STARTS TIMESTAMP(CURRENT_DATE, '02:00:00')
-- DO
-- BEGIN
--     CALL sp_cleanup_notifications();
--     CALL sp_cleanup_login_log();
--     CALL sp_cleanup_system_metrics();
--     CALL sp_cleanup_operation_log();
-- END;

-- ============================================================
-- 十、索引优化建议（根据实际查询情况调整）
-- ============================================================

-- 如果经常按学期和教师查询班级
-- ALTER TABLE class ADD INDEX idx_semester_teacher (semester_id, teacher_id);

-- 如果经常按状态和时间查询提交记录
-- ALTER TABLE submission ADD INDEX idx_status_submitted (status, submitted_at);

-- 如果经常按班级和状态查询实验
-- ALTER TABLE experiment ADD INDEX idx_task_status (task_id, status);

-- 如果经常按创建时间查询通知
-- ALTER TABLE notification ADD INDEX idx_receiver_created (receiver_type, receiver_id, created_at);

-- ============================================================
-- 文档结束
-- ============================================================
