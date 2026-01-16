-- ============================================================
-- 抽样统计虚拟仿真教学系统 - 数据库设计
-- 数据库：MySQL 8.0+
-- 字符集：utf8mb4
-- 排序规则：utf8mb4_general_ci
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
-- ------------------------------------------------------------
CREATE TABLE admin (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    username VARCHAR(50) NOT NULL COMMENT '登录账号',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='管理员表';

-- ------------------------------------------------------------
-- 1.2 教师表
-- ------------------------------------------------------------
CREATE TABLE teacher (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employee_id VARCHAR(50) NOT NULL COMMENT '工号（用于登录）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='教师表';

-- ------------------------------------------------------------
-- 1.3 助教表
-- ------------------------------------------------------------
CREATE TABLE assistant (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    account VARCHAR(50) NOT NULL COMMENT '助教账号（用于登录）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    password VARCHAR(255) NOT NULL COMMENT '密码（加密存储）',
    creator_teacher_id BIGINT UNSIGNED NOT NULL COMMENT '创建该助教的教师ID',
    is_first_login TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否首次登录：1-是，0-否',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_account (account),
    KEY idx_creator_teacher_id (creator_teacher_id),
    
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
    KEY idx_class_id (class_id)
    
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
    -- 结构示例：
    -- {
    --   "simple_random": {
    --     "sample_count": 400,
    --     "sample_data": [{...}, {...}]
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
    
    -- 状态：1-待批改，2-已批改（通过），3-被驳回
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-待批改，2-已批改，3-被驳回',
    
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
-- 六、公告表
-- ============================================================

CREATE TABLE announcement (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    title VARCHAR(100) NOT NULL COMMENT '公告标题',
    content TEXT NOT NULL COMMENT '公告内容（富文本）',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-已发布，0-已下架',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='公告表';

-- ============================================================
-- 七、初始化数据
-- ============================================================

-- 插入默认管理员账号（密码需要在应用层加密，这里仅为示例）
-- 默认账号：admin，默认密码：admin123（实际应用中需要加密）
INSERT INTO admin (username, password) VALUES ('admin', 'admin123');

-- ============================================================
-- 八、视图（可选，方便查询）
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

-- ============================================================
-- 九、索引优化建议（根据实际查询情况调整）
-- ============================================================

-- 如果经常按学期查询班级，可以添加复合索引
-- ALTER TABLE class ADD INDEX idx_semester_teacher (semester_id, teacher_id);

-- 如果经常按状态和时间查询提交记录，可以添加复合索引
-- ALTER TABLE submission ADD INDEX idx_status_submitted (status, submitted_at);

-- ============================================================
-- 文档结束
-- ============================================================
