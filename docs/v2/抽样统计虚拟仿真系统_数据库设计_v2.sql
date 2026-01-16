-- ============================================================
-- 抽样统计虚拟仿真教学系统 - 数据库设计 V2.0
-- 数据库：MySQL 8.0+
-- 字符集：utf8mb4
-- 排序规则：utf8mb4_general_ci
-- 
-- 优化内容：
-- 1. 新增 login_log 登录日志表
-- 2. 新增 announcement_read 公告已读表
-- 3. 新增 system_metrics 系统监控表
-- 4. 新增 operation_log 操作日志表
-- 5. admin 表增加 is_first_login 字段
-- 6. teacher/assistant 表增加 status 字段
-- 7. experiment 表增加 sampling_data_path 字段
-- 8. submission 表 status 增加草稿状态
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS sampling_simulation
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

USE sampling_simulation;

-- ============================================================
-- 一、用户相关表
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 管理员表
-- 说明：系统预置唯一管理员账号
-- 【V2.0 变更】新增 is_first_login 字段
-- ------------------------------------------------------------
CREATE TABLE admin (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    username VARCHAR(50) NOT NULL COMMENT '登录账号',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='管理员表';

-- ------------------------------------------------------------
-- 1.2 教师表
-- 【V2.0 变更】新增 status 字段
-- ------------------------------------------------------------
CREATE TABLE teacher (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employee_id VARCHAR(50) NOT NULL COMMENT '工号（用于登录）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_employee_id (employee_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='教师表';

-- ------------------------------------------------------------
-- 1.3 助教表
-- 【V2.0 变更】新增 status 字段
-- ------------------------------------------------------------
CREATE TABLE assistant (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    account VARCHAR(50) NOT NULL COMMENT '助教账号（用于登录）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    creator_teacher_id BIGINT UNSIGNED NOT NULL COMMENT '创建该助教的教师ID',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_account (account),
    KEY idx_creator_teacher_id (creator_teacher_id),
    KEY idx_status (status),
    
    CONSTRAINT fk_assistant_teacher FOREIGN KEY (creator_teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='助教表';

-- ------------------------------------------------------------
-- 1.4 学生表
-- ------------------------------------------------------------
CREATE TABLE student (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    student_id VARCHAR(50) NOT NULL COMMENT '学号（用于登录）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    class_id BIGINT UNSIGNED NOT NULL COMMENT '所属班级ID',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态：1-正常，0-停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_student_id (student_id),
    KEY idx_class_id (class_id),
    KEY idx_status (status)
    
    -- 外键约束在class表创建后添加
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学生表';

-- ============================================================
-- 二、组织架构相关表
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 学期表
-- ------------------------------------------------------------
CREATE TABLE semester (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(20) NOT NULL COMMENT '学期名称，格式：YYYY-Spring 或 YYYY-Fall',
    is_current TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前学期：1-是，0-否',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学期表';

-- ------------------------------------------------------------
-- 2.2 班级表
-- ------------------------------------------------------------
CREATE TABLE class (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(100) NOT NULL COMMENT '班级名称',
    semester_id BIGINT UNSIGNED NOT NULL COMMENT '所属学期ID',
    teacher_id BIGINT UNSIGNED NOT NULL COMMENT '授课教师ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    KEY idx_semester_id (semester_id),
    KEY idx_teacher_id (teacher_id),
    
    CONSTRAINT fk_class_semester FOREIGN KEY (semester_id) REFERENCES semester(id),
    CONSTRAINT fk_class_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='班级表';

-- 添加学生表的外键约束
ALTER TABLE student ADD CONSTRAINT fk_student_class FOREIGN KEY (class_id) REFERENCES class(id);

-- ------------------------------------------------------------
-- 2.3 助教-班级绑定表
-- ------------------------------------------------------------
CREATE TABLE assistant_class (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    assistant_id BIGINT UNSIGNED NOT NULL COMMENT '助教ID',
    class_id BIGINT UNSIGNED NOT NULL COMMENT '班级ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    
    UNIQUE KEY uk_assistant_class (assistant_id, class_id),
    KEY idx_class_id (class_id),
    
    CONSTRAINT fk_ac_assistant FOREIGN KEY (assistant_id) REFERENCES assistant(id) ON DELETE CASCADE,
    CONSTRAINT fk_ac_class FOREIGN KEY (class_id) REFERENCES class(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='助教-班级绑定表';

-- ============================================================
-- 三、课题相关表
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 课题表
-- ------------------------------------------------------------
CREATE TABLE topic (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    teacher_id BIGINT UNSIGNED NOT NULL COMMENT '创建教师ID',
    name VARCHAR(200) NOT NULL COMMENT '课题名称',
    description TEXT COMMENT '背景描述（富文本）',
    
    -- 数据文件相关
    excel_file_path VARCHAR(500) COMMENT 'Excel总体数据文件存储路径',
    excel_row_count INT UNSIGNED DEFAULT 0 COMMENT '总体数据行数（总体规模N）',
    
    -- 字段映射配置（JSON格式）
    -- 结构示例：
    -- {
    --   "fields": [
    --     {"name": "性别", "type": "stratification", "unique_values": ["男", "女"]},
    --     {"name": "收入", "type": "numeric"},
    --     {"name": "职业", "type": "categorical"},
    --     {"name": "ID", "type": "identifier"}
    --   ]
    -- }
    field_mapping JSON COMMENT '字段映射配置',
    
    -- 评分权重配置（JSON格式）
    -- 结构示例：
    -- {
    --   "questionnaire_weight": 30,
    --   "process_weight": 40,
    --   "report_weight": 30
    -- }
    weight_config JSON COMMENT '评分权重配置',
    
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-草稿，1-已发布',
    is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除（软删除）：1-是，0-否',
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    KEY idx_teacher_id (teacher_id),
    KEY idx_status (status),
    
    CONSTRAINT fk_topic_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题表';

-- ------------------------------------------------------------
-- 3.2 课题附件表
-- ------------------------------------------------------------
CREATE TABLE topic_attachment (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    file_name VARCHAR(255) NOT NULL COMMENT '文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '文件存储路径',
    file_type VARCHAR(50) NOT NULL COMMENT '文件类型：image/video/document',
    file_size BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    
    KEY idx_topic_id (topic_id),
    
    CONSTRAINT fk_attachment_topic FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题附件表';

-- ------------------------------------------------------------
-- 3.3 课题推荐题目表
-- ------------------------------------------------------------
CREATE TABLE topic_recommend_question (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    question_type TINYINT NOT NULL COMMENT '题目类型：1-判断题，2-单选题，3-多选题，4-满意度量表',
    content VARCHAR(500) NOT NULL COMMENT '题目内容',
    
    -- 选项配置（JSON格式）
    -- 判断题：null 或 {"options": ["是", "否"]}
    -- 单选/多选题：{"options": ["选项A", "选项B", "选项C"]}
    -- 满意度量表：{"min_label": "非常不满意", "max_label": "非常满意"}
    options JSON COMMENT '选项配置',
    
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    KEY idx_topic_id (topic_id),
    
    CONSTRAINT fk_rq_topic FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='课题推荐题目表';

-- ============================================================
-- 四、任务相关表
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 任务表（课题发布到班级的实例）
-- ------------------------------------------------------------
CREATE TABLE task (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    topic_id BIGINT UNSIGNED NOT NULL COMMENT '课题ID',
    class_id BIGINT UNSIGNED NOT NULL COMMENT '班级ID',
    open_time DATETIME COMMENT '开放时间（为空表示立即开放）',
    deadline DATETIME COMMENT '截止时间（为空表示无截止限制）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_topic_class (topic_id, class_id),
    KEY idx_class_id (class_id),
    
    CONSTRAINT fk_task_topic FOREIGN KEY (topic_id) REFERENCES topic(id),
    CONSTRAINT fk_task_class FOREIGN KEY (class_id) REFERENCES class(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='任务表';

-- ============================================================
-- 五、实验相关表
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 学生实验记录表
-- 说明：记录学生在某个任务上的实验进度和数据
-- 【V2.0 变更】新增 sampling_data_path 字段
-- ------------------------------------------------------------
CREATE TABLE experiment (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    student_id BIGINT UNSIGNED NOT NULL COMMENT '学生ID',
    task_id BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
    
    -- 当前进度
    current_stage TINYINT NOT NULL DEFAULT 0 COMMENT '当前阶段：0-未开始，1-问卷设计，2-样本量规划，3-抽样执行，4-分析报告',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-进行中，1-已提交，2-已批改，3-被驳回',
    
    -- 阶段一：问卷设计（JSON格式）
    -- 结构示例：
    -- {
    --   "title": "问卷标题",
    --   "welcome_message": "欢迎语内容",
    --   "closing_message": "结束语内容",
    --   "questions": [
    --     {
    --       "id": 1,
    --       "type": 2,
    --       "content": "您的性别是？",
    --       "options": ["男", "女"]
    --     }
    --   ],
    --   "machine_score": 85
    -- }
    questionnaire JSON COMMENT '问卷设计数据',
    
    -- 阶段二：样本量规划（JSON格式）
    -- 结构示例：
    -- {
    --   "confidence_level": 95,
    --   "margin_of_error": 5,
    --   "z_value": 1.96,
    --   "suggested_sample_size": 384,
    --   "final_sample_size": 400
    -- }
    sample_plan JSON COMMENT '样本量规划数据',
    
    -- 阶段三：抽样结果（JSON格式）
    -- 小数据量时存储完整数据，大数据量时只存元数据
    -- 结构示例：
    -- {
    --   "simple_random": {
    --     "sample_count": 400,
    --     "sample_data": [{...}, {...}]  // 或 "data_file": "simple_random.json"
    --   },
    --   "systematic": {
    --     "k_value": 25,
    --     "sample_count": 400,
    --     "sample_data": [{...}, {...}]
    --   },
    --   "stratified": {
    --     "stratify_field": "性别",
    --     "allocation": [
    --       {"layer": "男", "count": 240},
    --       {"layer": "女", "count": 160}
    --     ],
    --     "sample_count": 400,
    --     "sample_data": [{...}, {...}]
    --   }
    -- }
    sampling_results JSON COMMENT '抽样执行结果',
    
    -- 【V2.0 新增】大数据量时，抽样结果存储到文件
    sampling_data_path VARCHAR(500) COMMENT '抽样结果文件存储目录（大数据量时使用）',
    
    -- 阶段四：分析报告
    report_content TEXT COMMENT '分析报告内容（富文本）',
    
    -- 时间记录
    stage1_completed_at DATETIME COMMENT '阶段一完成时间',
    stage2_completed_at DATETIME COMMENT '阶段二完成时间',
    stage3_completed_at DATETIME COMMENT '阶段三完成时间',
    stage4_completed_at DATETIME COMMENT '阶段四完成时间',
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_student_task (student_id, task_id),
    KEY idx_task_id (task_id),
    KEY idx_status (status),
    
    CONSTRAINT fk_experiment_student FOREIGN KEY (student_id) REFERENCES student(id),
    CONSTRAINT fk_experiment_task FOREIGN KEY (task_id) REFERENCES task(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='学生实验记录表';

-- ------------------------------------------------------------
-- 5.2 提交记录表
-- 说明：记录每次提交的快照，支持驳回重做后的历史查看
-- 【V2.0 变更】status 值调整，增加草稿状态
-- ------------------------------------------------------------
CREATE TABLE submission (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    experiment_id BIGINT UNSIGNED NOT NULL COMMENT '实验记录ID',
    
    -- 提交内容快照
    questionnaire_pdf_path VARCHAR(500) COMMENT '问卷PDF文件路径',
    report_pdf_path VARCHAR(500) COMMENT '实验报告PDF文件路径',
    
    -- 评分
    score_questionnaire DECIMAL(5,2) COMMENT '问卷设计得分（0-100）',
    score_process DECIMAL(5,2) COMMENT '实验过程得分（0-100）',
    score_report DECIMAL(5,2) COMMENT '实验报告得分（0-100）',
    total_score DECIMAL(5,2) COMMENT '总分',
    
    -- 评语
    teacher_comment TEXT COMMENT '教师评语',
    reject_reason TEXT COMMENT '驳回理由（被驳回时填写）',
    
    -- 【V2.0 变更】状态值调整
    -- 0-批改草稿（新增），1-待批改，2-已批改（通过），3-被驳回
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：0-批改草稿，1-待批改，2-已批改，3-被驳回',
    
    -- 批改人（可以是教师或助教）
    graded_by_type TINYINT COMMENT '批改人类型：1-教师，2-助教',
    graded_by_id BIGINT UNSIGNED COMMENT '批改人ID',
    
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
    graded_at DATETIME COMMENT '批改时间',
    
    KEY idx_experiment_id (experiment_id),
    KEY idx_status (status),
    
    CONSTRAINT fk_submission_experiment FOREIGN KEY (experiment_id) REFERENCES experiment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='提交记录表';

-- ============================================================
-- 六、系统相关表
-- ============================================================

-- ------------------------------------------------------------
-- 6.1 公告表
-- ------------------------------------------------------------
CREATE TABLE announcement (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    title VARCHAR(100) NOT NULL COMMENT '公告标题',
    content TEXT NOT NULL COMMENT '公告内容（富文本）',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-已发布，0-已下架',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='公告表';

-- ------------------------------------------------------------
-- 6.2 公告已读表
-- 【V2.0 新增】记录用户已读公告
-- ------------------------------------------------------------
CREATE TABLE announcement_read (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    announcement_id BIGINT UNSIGNED NOT NULL COMMENT '公告ID',
    user_type TINYINT NOT NULL COMMENT '用户类型：1-管理员，2-教师，3-助教，4-学生',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '阅读时间',
    
    UNIQUE KEY uk_announcement_user (announcement_id, user_type, user_id),
    KEY idx_user (user_type, user_id),
    
    CONSTRAINT fk_ar_announcement FOREIGN KEY (announcement_id) REFERENCES announcement(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='公告已读表';

-- ------------------------------------------------------------
-- 6.3 登录日志表
-- 【V2.0 新增】记录用户登录历史
-- ------------------------------------------------------------
CREATE TABLE login_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_type TINYINT NOT NULL COMMENT '用户类型：1-管理员，2-教师，3-助教，4-学生',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
    ip_address VARCHAR(45) COMMENT '登录IP地址（支持IPv6）',
    user_agent VARCHAR(500) COMMENT '浏览器/客户端信息',
    
    KEY idx_user (user_type, user_id),
    KEY idx_login_at (login_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='登录日志表';

-- ------------------------------------------------------------
-- 6.4 系统监控数据表
-- 【V2.0 新增】存储系统监控指标
-- ------------------------------------------------------------
CREATE TABLE system_metrics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    metric_type VARCHAR(50) NOT NULL COMMENT '指标类型：cpu, memory, disk, active_users, api_requests 等',
    metric_value DECIMAL(10,2) NOT NULL COMMENT '指标值',
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    
    KEY idx_type_time (metric_type, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='系统监控数据表';

-- ------------------------------------------------------------
-- 6.5 操作日志表
-- 【V2.0 新增】记录关键业务操作
-- ------------------------------------------------------------
CREATE TABLE operation_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_type TINYINT NOT NULL COMMENT '操作者类型：1-管理员，2-教师，3-助教，4-学生',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '操作者ID',
    action VARCHAR(100) NOT NULL COMMENT '操作类型：如 TOPIC_CREATE, SUBMISSION_GRADE 等',
    target_type VARCHAR(50) COMMENT '操作对象类型：如 topic, submission, student 等',
    target_id BIGINT UNSIGNED COMMENT '操作对象ID',
    detail JSON COMMENT '操作详情（JSON格式）',
    ip_address VARCHAR(45) COMMENT '操作IP地址',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    
    KEY idx_user (user_type, user_id),
    KEY idx_action (action),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作日志表';

-- ============================================================
-- 七、初始化数据
-- ============================================================

-- 插入默认管理员账号（密码需要在应用层加密，这里仅为示例）
-- 默认账号：admin，默认密码：admin123（实际应用中需要加密）
INSERT INTO admin (username, password, is_first_login) VALUES ('admin', 'admin123', 1);

-- ============================================================
-- 八、视图（用于简化常用查询）
-- ============================================================

-- ------------------------------------------------------------
-- 8.1 班级学生数量统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_class_student_count AS
SELECT 
    c.id AS class_id,
    c.name AS class_name,
    c.semester_id,
    c.teacher_id,
    COUNT(s.id) AS student_count
FROM class c
LEFT JOIN student s ON c.id = s.class_id AND s.status = 1
GROUP BY c.id, c.name, c.semester_id, c.teacher_id;

-- ------------------------------------------------------------
-- 8.2 任务进度统计视图
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
LEFT JOIN student s ON c.id = s.class_id AND s.status = 1
LEFT JOIN experiment e ON t.id = e.task_id AND s.id = e.student_id
GROUP BY t.id, t.topic_id, t.class_id, tp.name, c.name, t.deadline;

-- ------------------------------------------------------------
-- 8.3 待批改作业视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_submissions AS
SELECT 
    sub.id AS submission_id,
    sub.experiment_id,
    sub.submitted_at,
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
WHERE sub.status = 1;

-- ------------------------------------------------------------
-- 8.4 【V2.0 新增】用户最后登录时间视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_last_login AS
SELECT 
    user_type,
    user_id,
    MAX(login_at) AS last_login_at
FROM login_log
GROUP BY user_type, user_id;

-- ------------------------------------------------------------
-- 8.5 【V2.0 新增】今日登录统计视图
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_today_login_stats AS
SELECT 
    user_type,
    COUNT(*) AS login_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM login_log
WHERE DATE(login_at) = CURDATE()
GROUP BY user_type;

-- ============================================================
-- 九、数据清理存储过程（可选）
-- ============================================================

-- ------------------------------------------------------------
-- 9.1 清理过期登录日志（保留90天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_login_log()
BEGIN
    DELETE FROM login_log WHERE login_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 9.2 清理过期系统监控数据（保留30天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_system_metrics()
BEGIN
    DELETE FROM system_metrics WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ------------------------------------------------------------
-- 9.3 清理过期操作日志（保留365天）
-- ------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_cleanup_operation_log()
BEGIN
    DELETE FROM operation_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY);
    SELECT ROW_COUNT() AS deleted_rows;
END //
DELIMITER ;

-- ============================================================
-- 十、索引优化建议（根据实际查询情况调整）
-- ============================================================

-- 如果经常按学期查询班级，可以添加复合索引
-- ALTER TABLE class ADD INDEX idx_semester_teacher (semester_id, teacher_id);

-- 如果经常按状态和时间查询提交记录，可以添加复合索引
-- ALTER TABLE submission ADD INDEX idx_status_submitted (status, submitted_at);

-- 如果经常按班级和状态查询实验，可以添加复合索引
-- ALTER TABLE experiment ADD INDEX idx_task_status (task_id, status);

-- ============================================================
-- 文档结束
-- ============================================================
