/**
 * Comprehensive Database Seed Script
 *
 * Creates a rich, realistic development dataset covering every table and
 * relationship in the system.  Designed to run on a freshly-pushed schema
 * (after `bun run db:reset`).
 *
 * Run with:  bun run db:seed
 */

import { db } from "../index";
import {
    admin,
    teacher,
    assistant,
    student,
    semester,
    class_,
    assistantClass,
    studentTransfer,
    topic,
    topicAttachment,
    topicRecommendQuestion,
    task,
    experiment,
    submission,
    announcement,
    announcementRead,
    systemConfig,
    systemMetrics,
    notification,
    operationLog,
    loginLog,
} from "../schema";
import { eq, and } from "drizzle-orm";

// ── helpers ──────────────────────────────────────────────────
function daysFromNow(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}
function daysAgo(n: number) {
    return daysFromNow(-n);
}

async function insertOrGet<T extends { id: number }>(
    table: any,
    where: any,
    values: any,
): Promise<number> {
    const [exist] = await db.select().from(table).where(where);
    if (exist) return (exist as T).id;
    const [res] = await db.insert(table).values(values);
    return res.insertId;
}

// ── main ─────────────────────────────────────────────────────
async function seed() {
    console.log("🌱 开始初始化数据库数据…\n");

    const defaultPassword = "123456";
    const hashedPassword = await Bun.password.hash(defaultPassword);

    const USER = { admin: 1, teacher: 2, assistant: 3, student: 4 } as const;

    // ========================================================
    // 1. 系统配置 & 管理员
    // ========================================================
    console.log("🔧 系统配置与管理员…");

    const configs = [
        { key: "system_name", value: "抽样统计虚拟仿真实验教学系统", desc: "系统名称" },
        { key: "allow_registration", value: "true", valueType: "boolean", desc: "允许学生登录开关" },
        { key: "max_upload_size", value: "10", valueType: "number", desc: "最大上传限制(MB)" },
        { key: "login.max_fail_count", value: "5", valueType: "number", desc: "最大登录失败次数" },
        { key: "login.lock_duration_minutes", value: "30", valueType: "number", desc: "账号锁定时间(分钟)" },
        { key: "session.admin_timeout_minutes", value: "30", valueType: "number", desc: "管理员会话超时" },
        { key: "session.teacher_timeout_minutes", value: "120", valueType: "number", desc: "教师会话超时" },
        { key: "session.student_timeout_minutes", value: "240", valueType: "number", desc: "学生会话超时" },
    ];
    for (const c of configs) {
        await db
            .insert(systemConfig)
            .values({ configKey: c.key, configValue: c.value, valueType: c.valueType, description: c.desc })
            .onDuplicateKeyUpdate({ set: { configValue: c.value, valueType: c.valueType } });
    }

    await db
        .insert(admin)
        .values({ username: "admin", password: hashedPassword, isFirstLogin: 0 })
        .onDuplicateKeyUpdate({ set: { username: "admin" } });

    // ========================================================
    // 2. 学期  (往期 / 当前 / 下学期)
    // ========================================================
    console.log("📅 学期…");

    const semesterRows = [
        { name: "2023-2024学年 第二学期", isCurrent: 0 },
        { name: "2024-2025学年 第一学期", isCurrent: 1 },
        { name: "2024-2025学年 第二学期", isCurrent: 0 },
    ];
    const semIds: number[] = [];
    for (const s of semesterRows) {
        semIds.push(
            await insertOrGet(semester, eq(semester.name, s.name), s),
        );
    }
    const [prevSemId, currSemId, nextSemId] = semIds as [number, number, number];

    // ========================================================
    // 3. 教师 (5 位，含特殊状态)
    // ========================================================
    console.log("👨‍🏫 教师…");

    const teachersData: {
        employeeId: string;
        name: string;
        isFirstLogin: number;
        status: number;
        loginFailCount?: number;
        lockedUntil?: Date | null;
    }[] = [
        { employeeId: "teacher", name: "张教授（演示）", isFirstLogin: 0, status: 1 },
        { employeeId: "T002", name: "李博士", isFirstLogin: 0, status: 1 },
        { employeeId: "T003", name: "王讲师", isFirstLogin: 0, status: 1 },
        { employeeId: "T004", name: "赵副教授（首次登录）", isFirstLogin: 1, status: 1 },
        { employeeId: "T005", name: "刘老师（已停用）", isFirstLogin: 0, status: 0 },
    ];
    const teacherIds: number[] = [];
    for (const t of teachersData) {
        teacherIds.push(
            await insertOrGet(
                teacher,
                eq(teacher.employeeId, t.employeeId),
                { ...t, password: hashedPassword },
            ),
        );
    }

    // ========================================================
    // 4. 助教 (4 位)
    // ========================================================
    console.log("👩‍🏫 助教…");

    const assistantsData = [
        { account: "assistant", name: "演示助教", creator: teacherIds[0]!, isFirstLogin: 0 },
        { account: "A002", name: "助教小陈", creator: teacherIds[0]!, isFirstLogin: 0 },
        { account: "A003", name: "助教小赵", creator: teacherIds[1]!, isFirstLogin: 0 },
        { account: "A004", name: "助教小周（首次登录）", creator: teacherIds[2]!, isFirstLogin: 1 },
    ];
    const assistantIds: number[] = [];
    for (const a of assistantsData) {
        assistantIds.push(
            await insertOrGet(
                assistant,
                eq(assistant.account, a.account),
                { account: a.account, name: a.name, password: hashedPassword, creatorTeacherId: a.creator, isFirstLogin: a.isFirstLogin },
            ),
        );
    }

    // ========================================================
    // 5. 班级 (6 个，横跨多学期 / 多教师)
    // ========================================================
    console.log("🏫 班级…");

    const classesData = [
        // ── 当前学期 ──
        { name: "统计学原理 A班", sem: currSemId, teacher: teacherIds[0]! },     // 0
        { name: "统计学原理 B班", sem: currSemId, teacher: teacherIds[1]! },     // 1
        { name: "数据挖掘导论", sem: currSemId, teacher: teacherIds[2]! },      // 2
        { name: "市场调研方法", sem: currSemId, teacher: teacherIds[0]! },      // 3
        // ── 往期学期 ──
        { name: "统计学原理 (往期)", sem: prevSemId, teacher: teacherIds[0]! }, // 4
        // ── 下学期（预创建） ──
        { name: "高级抽样技术", sem: nextSemId, teacher: teacherIds[1]! },     // 5
    ];
    const classIds: number[] = [];
    for (const c of classesData) {
        classIds.push(
            await insertOrGet(
                class_,
                and(eq(class_.name, c.name), eq(class_.semesterId, c.sem)),
                { name: c.name, semesterId: c.sem, teacherId: c.teacher },
            ),
        );
    }

    // ── 助教-班级关联 ──
    const assistantClassPairs = [
        { assistantId: assistantIds[0]!, classId: classIds[0]! },
        { assistantId: assistantIds[0]!, classId: classIds[3]! },
        { assistantId: assistantIds[1]!, classId: classIds[0]! },
        { assistantId: assistantIds[2]!, classId: classIds[1]! },
        { assistantId: assistantIds[3]!, classId: classIds[2]! },
    ];
    for (const ac of assistantClassPairs) {
        await db
            .insert(assistantClass)
            .values(ac)
            .onDuplicateKeyUpdate({ set: { assistantId: ac.assistantId } });
    }

    // ========================================================
    // 6. 学生 (30 位，横跨多班级 + 特殊状态)
    // ========================================================
    console.log("👨‍🎓 学生…");

    const studentDefs: {
        studentId: string;
        name: string;
        classId: number;
        isFirstLogin?: number;
        status?: number;
        email?: string;
        loginFailCount?: number;
        lockedUntil?: Date | null;
    }[] = [
        // ── A班 (当前学期) 15 名 ──
        { studentId: "student", name: "演示学生", classId: classIds[0]!, email: "demo@example.edu" },
        { studentId: "2024001", name: "钱二", classId: classIds[0]! },
        { studentId: "2024002", name: "孙三", classId: classIds[0]! },
        { studentId: "2024003", name: "李四", classId: classIds[0]! },
        { studentId: "2024004", name: "周五", classId: classIds[0]! },
        { studentId: "2024005", name: "吴六", classId: classIds[0]! },
        { studentId: "2024006", name: "郑七", classId: classIds[0]! },
        { studentId: "2024007", name: "王八", classId: classIds[0]! },
        { studentId: "2024008", name: "冯九", classId: classIds[0]! },
        { studentId: "2024009", name: "陈十", classId: classIds[0]! },
        { studentId: "2024010", name: "褚一一", classId: classIds[0]! },
        { studentId: "2024011", name: "卫一二", classId: classIds[0]! },
        { studentId: "2024012", name: "蒋一三", classId: classIds[0]! },
        { studentId: "2024013", name: "沈一四（首次登录）", classId: classIds[0]!, isFirstLogin: 1 },
        { studentId: "2024014", name: "韩一五（已锁定）", classId: classIds[0]!, loginFailCount: 5, lockedUntil: daysFromNow(1) },
        // ── B班 (当前学期) 8 名 ──
        { studentId: "2024101", name: "杨二一", classId: classIds[1]! },
        { studentId: "2024102", name: "朱二二", classId: classIds[1]! },
        { studentId: "2024103", name: "秦二三", classId: classIds[1]! },
        { studentId: "2024104", name: "尤二四", classId: classIds[1]! },
        { studentId: "2024105", name: "许二五", classId: classIds[1]! },
        { studentId: "2024106", name: "何二六", classId: classIds[1]! },
        { studentId: "2024107", name: "吕二七", classId: classIds[1]! },
        { studentId: "2024108", name: "施二八", classId: classIds[1]! },
        // ── 数据挖掘班 (当前学期) 4 名 ──
        { studentId: "2024201", name: "张三一", classId: classIds[2]! },
        { studentId: "2024202", name: "孔三二", classId: classIds[2]! },
        { studentId: "2024203", name: "曹三三", classId: classIds[2]! },
        { studentId: "2024204", name: "严三四（已停用）", classId: classIds[2]!, status: 0 },
        // ── 往期班 3 名 ──
        { studentId: "2023001", name: "往期陈一", classId: classIds[4]! },
        { studentId: "2023002", name: "往期赵二", classId: classIds[4]! },
        { studentId: "2023003", name: "往期钱三", classId: classIds[4]! },
    ];

    const studentIds: number[] = [];
    for (const s of studentDefs) {
        studentIds.push(
            await insertOrGet(
                student,
                eq(student.studentId, s.studentId),
                {
                    studentId: s.studentId,
                    name: s.name,
                    password: hashedPassword,
                    classId: s.classId,
                    email: s.email ?? null,
                    isFirstLogin: s.isFirstLogin ?? 0,
                    status: s.status ?? 1,
                    loginFailCount: s.loginFailCount ?? 0,
                    lockedUntil: s.lockedUntil ?? null,
                },
            ),
        );
    }

    // ── 转班记录 ──
    await db.insert(studentTransfer).values([
        {
            studentId: studentIds[9]!,
            fromClassId: classIds[1]!,
            toClassId: classIds[0]!,
            reason: "课程时间冲突，由 B 班转入 A 班",
            operatedBy: 1,
            transferredAt: daysAgo(15),
        },
        {
            studentId: studentIds[12]!,
            fromClassId: classIds[2]!,
            toClassId: classIds[0]!,
            reason: "跨专业选修调整",
            operatedBy: 1,
            transferredAt: daysAgo(7),
        },
    ]);

    // ========================================================
    // 7. 课题  (8 个 + 丰富资源)
    // ========================================================
    console.log("📚 课题与资源…");

    /*  每个课题拥有：
     *  - 独立的 description (带 HTML 格式)
     *  - 独立的 fieldMapping / weightConfig
     *  - 多个附件（不同类型）
     *  - 多条推荐问题（覆盖 4 种题型）
     */

    const topicsDefs: {
        name: string;
        teacher: number;
        status: number;
        desc: string;
        rows: number;
        excelPath: string;
        fieldMapping: object;
        weightConfig?: object;
        isDeleted?: number;
        deletedAt?: Date;
    }[] = [
        // ── 0: 消费者行为 ──
        {
            name: "消费者行为分析实验",
            teacher: teacherIds[0]!,
            status: 1,
            desc: "<p><strong>实验目标</strong></p><ul><li>掌握问卷调查设计的基本原则</li><li>学会运用简单随机抽样与分层抽样方法</li><li>能够对消费者行为数据进行初步统计分析</li></ul><p><strong>背景说明</strong></p><p>某连锁零售企业希望了解 18-55 岁城市居民的日常消费习惯与品牌偏好。请根据提供的总体数据，设计一份至少 10 题的调查问卷，完成抽样并撰写分析报告。</p>",
            rows: 10000,
            excelPath: "/storage/uploads/topics/consumer_population.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender", "age_group", "education"], numeric: ["income", "monthly_expense"], others: ["city"] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        },
        // ── 1: 网购趋势 ──
        {
            name: "大学生网购趋势调查",
            teacher: teacherIds[1]!,
            status: 1,
            desc: "<p><strong>实验目标</strong></p><ul><li>了解大学生群体的网购行为特征</li><li>掌握系统抽样方法的应用</li><li>学会使用量表设计满意度调查</li></ul><p><strong>背景说明</strong></p><p>本课题关注在校大学生的网购频率、品类偏好和支付方式选择。总体数据包含某高校全体本科生的基本信息。</p>",
            rows: 5000,
            excelPath: "/storage/uploads/topics/student_shopping.xlsx",
            fieldMapping: { identifier: "student_no", stratified: ["gender", "grade"], numeric: ["monthly_spending", "order_count"], others: ["major"] },
            weightConfig: { questionnaire: 35, process: 25, report: 40 },
        },
        // ── 2: 市场调研基础 ──
        {
            name: "市场调研基础方法",
            teacher: teacherIds[0]!,
            status: 1,
            desc: "<p><strong>实验目标</strong></p><ul><li>理解市场调研的基本流程</li><li>掌握简单随机抽样与整群抽样</li><li>学会撰写规范的调研报告</li></ul><p><strong>背景说明</strong></p><p>一家新创餐饮品牌希望评估目标社区的餐饮消费需求。请从提供的社区人口数据中抽样并完成调研。</p>",
            rows: 8000,
            excelPath: "/storage/uploads/topics/community_dining.xlsx",
            fieldMapping: { identifier: "resident_id", stratified: ["age_group", "household_size"], numeric: ["dining_expense", "satisfaction"], others: ["district"] },
            weightConfig: { questionnaire: 25, process: 35, report: 40 },
        },
        // ── 3: 数据分析实战 ──
        {
            name: "数据分析基础实战",
            teacher: teacherIds[1]!,
            status: 1,
            desc: "<p><strong>实验目标</strong></p><ul><li>熟悉数据清洗与描述性统计</li><li>掌握分层抽样与置信区间估计</li><li>学会用图表展现分析结论</li></ul><p><strong>背景说明</strong></p><p>某在线教育平台提供了其用户行为日志数据。请通过抽样分析用户的学习时长、课程完成率等指标。</p>",
            rows: 15000,
            excelPath: "/storage/uploads/topics/education_platform.xlsx",
            fieldMapping: { identifier: "user_id", stratified: ["vip_level", "region"], numeric: ["study_hours", "completion_rate", "quiz_score"], others: ["register_channel"] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        },
        // ── 4: 社交媒体（草稿） ──
        {
            name: "社交媒体影响力分析（草稿）",
            teacher: teacherIds[0]!,
            status: 0,
            desc: "<p>课题尚在编写中，暂未发布。</p>",
            rows: 20000,
            excelPath: "/storage/uploads/topics/social_media.xlsx",
            fieldMapping: { identifier: "account_id", stratified: ["platform", "verified"], numeric: ["followers", "engagement_rate"], others: [] },
        },
        // ── 5: 健康与运动 ──
        {
            name: "居民健康与运动习惯调查",
            teacher: teacherIds[2]!,
            status: 1,
            desc: "<p><strong>实验目标</strong></p><ul><li>了解城市居民运动频率与健康指标的关联</li><li>掌握配额抽样与加权分析</li></ul><p><strong>背景说明</strong></p><p>某市卫生部门对辖区 20-60 岁常住居民进行了体检信息采集。请利用该总体数据完成抽样与分析。</p>",
            rows: 12000,
            excelPath: "/storage/uploads/topics/health_exercise.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender", "age_group"], numeric: ["bmi", "exercise_hours_per_week", "sleep_hours"], others: ["chronic_disease"] },
            weightConfig: { questionnaire: 30, process: 35, report: 35 },
        },
        // ── 6: 已删除的课题（测试软删除） ──
        {
            name: "已归档课题——旧版消费调查",
            teacher: teacherIds[0]!,
            status: 1,
            desc: "<p>此课题已被归档删除。</p>",
            rows: 6000,
            excelPath: "/storage/uploads/topics/archived.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["income"], others: [] },
            isDeleted: 1,
            deletedAt: daysAgo(30),
        },
        // ── 7: 往期课题（已完成） ──
        {
            name: "2023年消费趋势研究（往期）",
            teacher: teacherIds[0]!,
            status: 1,
            desc: "<p>上一学期已结束的课题。所有学生均已完成实验与评分。</p>",
            rows: 9000,
            excelPath: "/storage/uploads/topics/2023_consumer.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender", "city_tier"], numeric: ["age", "income", "spending"], others: [] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        },
    ];

    const topicIds: number[] = [];
    for (const t of topicsDefs) {
        const [res] = await db.insert(topic).values({
            teacherId: t.teacher,
            name: t.name,
            description: t.desc,
            status: t.status,
            excelRowCount: t.rows,
            excelFilePath: t.excelPath,
            fieldMapping: t.fieldMapping,
            weightConfig: t.weightConfig ?? null,
            isDeleted: t.isDeleted ?? 0,
            deletedAt: t.deletedAt ?? null,
        });
        topicIds.push(res.insertId);
    }

    // ── 附件（多种文件类型） ──
    const attachmentsDefs: { topicIdx: number; fileName: string; filePath: string; fileType: string; fileSize: number }[] = [
        { topicIdx: 0, fileName: "消费者行为分析-实验指导书.pdf", filePath: "/storage/uploads/topics/consumer_guide.pdf", fileType: "application/pdf", fileSize: 1_670 },
        { topicIdx: 0, fileName: "调查问卷模板.docx", filePath: "/storage/uploads/topics/consumer_template.docx", fileType: "application/docx", fileSize: 1_833 },
        { topicIdx: 1, fileName: "网购趋势调查-实验指导书.pdf", filePath: "/storage/uploads/topics/shopping_guide.pdf", fileType: "application/pdf", fileSize: 1_657 },
        { topicIdx: 1, fileName: "参考文献汇总.pdf", filePath: "/storage/uploads/topics/shopping_refs.pdf", fileType: "application/pdf", fileSize: 1_663 },
        { topicIdx: 2, fileName: "市场调研方法-指导手册.pdf", filePath: "/storage/uploads/topics/market_guide.pdf", fileType: "application/pdf", fileSize: 1_626 },
        { topicIdx: 3, fileName: "数据分析入门讲义.pdf", filePath: "/storage/uploads/topics/data_analysis_slides.pdf", fileType: "application/pdf", fileSize: 1_630 },
        { topicIdx: 3, fileName: "示例数据集说明.xlsx", filePath: "/storage/uploads/topics/data_analysis_example.xlsx", fileType: "application/xlsx", fileSize: 17_448 },
        { topicIdx: 5, fileName: "健康调查-实验手册.pdf", filePath: "/storage/uploads/topics/health_guide.pdf", fileType: "application/pdf", fileSize: 1_635 },
        { topicIdx: 5, fileName: "体检指标参考范围.png", filePath: "/storage/uploads/topics/health_reference.png", fileType: "image/png", fileSize: 17_361 },
        { topicIdx: 7, fileName: "2023年消费趋势-指导书.pdf", filePath: "/storage/uploads/topics/2023_consumer_guide.pdf", fileType: "application/pdf", fileSize: 1_588 },
    ];
    for (const a of attachmentsDefs) {
        await db.insert(topicAttachment).values({
            topicId: topicIds[a.topicIdx]!,
            fileName: a.fileName,
            filePath: a.filePath,
            fileType: a.fileType,
            fileSize: a.fileSize,
        });
    }

    // ── 推荐问题（覆盖 boolean/single/multiple/scale 4 种题型） ──
    type RecQ = { topicIdx: number; questionType: number; content: string; options?: string[]; sortOrder: number };
    const recQuestions: RecQ[] = [
        // 课题 0: 消费者行为
        { topicIdx: 0, questionType: 1, content: "您是否在过去一个月内有过线上购物行为？", sortOrder: 1 },
        { topicIdx: 0, questionType: 2, content: "您的年龄段是？", options: ["18-25岁", "26-35岁", "36-45岁", "46-55岁"], sortOrder: 2 },
        { topicIdx: 0, questionType: 3, content: "您通常购买哪些品类？（可多选）", options: ["电子数码", "服饰鞋包", "家居生活", "美妆护肤", "食品饮料", "图书文具"], sortOrder: 3 },
        { topicIdx: 0, questionType: 4, content: "请对您最近一次购物体验打分", sortOrder: 4 },
        { topicIdx: 0, questionType: 2, content: "您月均消费金额大约是？", options: ["500元以下", "500-1000元", "1000-3000元", "3000-5000元", "5000元以上"], sortOrder: 5 },
        // 课题 1: 网购趋势
        { topicIdx: 1, questionType: 1, content: "您是否使用过跨境电商平台？", sortOrder: 1 },
        { topicIdx: 1, questionType: 2, content: "您最常使用的网购平台是？", options: ["淘宝/天猫", "京东", "拼多多", "抖音商城", "其他"], sortOrder: 2 },
        { topicIdx: 1, questionType: 3, content: "影响您购物决策的因素有哪些？（可多选）", options: ["价格", "品牌", "评价", "物流速度", "售后服务", "直播推荐"], sortOrder: 3 },
        { topicIdx: 1, questionType: 4, content: "请对网购整体满意度评分", sortOrder: 4 },
        // 课题 2: 市场调研
        { topicIdx: 2, questionType: 1, content: "您每周是否至少外出就餐一次？", sortOrder: 1 },
        { topicIdx: 2, questionType: 2, content: "您倾向于选择哪种餐饮类型？", options: ["中式快餐", "西式快餐", "火锅/烧烤", "日韩料理", "轻食沙拉"], sortOrder: 2 },
        { topicIdx: 2, questionType: 4, content: "请对社区周边餐饮配套满意度评分", sortOrder: 3 },
        // 课题 3: 数据分析
        { topicIdx: 3, questionType: 2, content: "您每天平均在线学习时长约为？", options: ["不足30分钟", "30-60分钟", "1-2小时", "2小时以上"], sortOrder: 1 },
        { topicIdx: 3, questionType: 3, content: "您学习中遇到的困难有哪些？（可多选）", options: ["缺乏自律", "课程内容难", "缺少互动", "时间不够", "设备不足"], sortOrder: 2 },
        { topicIdx: 3, questionType: 4, content: "您对在线教育平台的推荐意愿评分", sortOrder: 3 },
        // 课题 5: 健康运动
        { topicIdx: 5, questionType: 1, content: "您是否有定期体检的习惯？", sortOrder: 1 },
        { topicIdx: 5, questionType: 2, content: "您每周运动次数约为？", options: ["0次", "1-2次", "3-4次", "5次及以上"], sortOrder: 2 },
        { topicIdx: 5, questionType: 3, content: "您常参与的运动类型有哪些？（可多选）", options: ["跑步", "游泳", "健身房器械", "球类运动", "瑜伽/太极", "骑行"], sortOrder: 3 },
        { topicIdx: 5, questionType: 4, content: "请对自己目前的健康状况评分", sortOrder: 4 },
        // 课题 7: 往期
        { topicIdx: 7, questionType: 2, content: "您所在的城市等级是？", options: ["一线城市", "新一线城市", "二线城市", "三线及以下"], sortOrder: 1 },
        { topicIdx: 7, questionType: 4, content: "您对 2023 年整体消费体验的评分", sortOrder: 2 },
    ];
    for (const q of recQuestions) {
        await db.insert(topicRecommendQuestion).values({
            topicId: topicIds[q.topicIdx]!,
            questionType: q.questionType,
            content: q.content,
            options: q.options ?? null,
            sortOrder: q.sortOrder,
        });
    }

    // ========================================================
    // 8. 任务  (多班级 × 多截止状态)
    // ========================================================
    console.log("📋 任务分配…");

    const now = new Date();
    const taskDefs: { topicIdx: number; classIdx: number; openTime: Date; deadline: Date; deleted?: boolean }[] = [
        // ── A 班 4 个任务 ──
        { topicIdx: 0, classIdx: 0, openTime: daysAgo(20), deadline: daysFromNow(25) },       // 正常进行中
        { topicIdx: 2, classIdx: 0, openTime: daysAgo(10), deadline: daysFromNow(3) },        // 即将截止
        { topicIdx: 3, classIdx: 0, openTime: daysAgo(60), deadline: daysAgo(5) },            // 已过期
        { topicIdx: 5, classIdx: 0, openTime: daysFromNow(5), deadline: daysFromNow(40) },    // 尚未开始
        // ── B 班 2 个任务 ──
        { topicIdx: 1, classIdx: 1, openTime: daysAgo(15), deadline: daysFromNow(20) },
        { topicIdx: 3, classIdx: 1, openTime: daysAgo(5), deadline: daysFromNow(30) },
        // ── 数据挖掘班 1 个任务 ──
        { topicIdx: 3, classIdx: 2, openTime: daysAgo(10), deadline: daysFromNow(15) },
        // ── 市场调研方法班 1 个任务 ──
        { topicIdx: 2, classIdx: 3, openTime: daysAgo(7), deadline: daysFromNow(28) },
        // ── 往期班 (已结束) ──
        { topicIdx: 7, classIdx: 4, openTime: daysAgo(120), deadline: daysAgo(60) },
        // ── 已删除任务 ──
        { topicIdx: 0, classIdx: 1, openTime: daysAgo(30), deadline: daysAgo(1), deleted: true },
    ];

    const taskIds: number[] = [];
    for (const t of taskDefs) {
        await db.insert(task).values({
            topicId: topicIds[t.topicIdx]!,
            classId: classIds[t.classIdx]!,
            openTime: t.openTime,
            deadline: t.deadline,
            deletedAt: t.deleted ? daysAgo(1) : null,
        }).onDuplicateKeyUpdate({ set: { deadline: t.deadline } });

        const [taskRow] = await db
            .select({ id: task.id })
            .from(task)
            .where(
                and(
                    eq(task.topicId, topicIds[t.topicIdx]!),
                    eq(task.classId, classIds[t.classIdx]!),
                ),
            );
        taskIds.push(taskRow!.id);
    }

    // ========================================================
    // 9. 实验 & 提交  (涵盖每个阶段 × 每种状态)
    // ========================================================
    console.log("🧪 实验与提交记录…");

    // ── 预定义的 JSON 模板 ──

    const questionnaireComplete = {
        title: "消费行为调查问卷",
        welcomeText: "<p>欢迎参与本次消费者行为调查！本问卷约需 5 分钟，所有信息仅用于学术研究。</p>",
        endingText: "<p>感谢您的参与！您的回答对我们的研究非常有价值。</p>",
        questions: [
            { id: "q_001", type: "boolean", content: "您是否在过去一个月内有过线上购物行为？" },
            { id: "q_002", type: "single", content: "您的年龄段是？", options: ["18-25岁", "26-35岁", "36-45岁", "46-55岁"] },
            { id: "q_003", type: "single", content: "您的最高学历是？", options: ["高中及以下", "大专", "本科", "硕士及以上"] },
            { id: "q_004", type: "multiple", content: "您经常购买哪些品类？（可多选）", options: ["电子数码", "服饰鞋包", "家居生活", "美妆护肤", "食品饮料", "图书文具"], minSelect: 1, maxSelect: 4 },
            { id: "q_005", type: "single", content: "您月均消费金额大约是？", options: ["500元以下", "500-1000元", "1000-3000元", "3000-5000元", "5000元以上"] },
            { id: "q_006", type: "boolean", content: "您是否会参考直播带货进行购买决策？" },
            { id: "q_007", type: "multiple", content: "影响您购物决策的主要因素有哪些？", options: ["价格", "品牌", "评价", "物流", "售后", "推荐"], minSelect: 1, maxSelect: 3 },
            { id: "q_008", type: "scale", content: "请对您最近一次购物体验的满意度评分", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
            { id: "q_009", type: "scale", content: "您推荐该平台给朋友的意愿是？", scaleMin: 1, scaleMax: 10, scaleMinLabel: "完全不愿意", scaleMaxLabel: "非常愿意" },
            { id: "q_010", type: "single", content: "您更偏好哪种支付方式？", options: ["微信支付", "支付宝", "银行卡", "信用卡", "现金"] },
            { id: "q_011", type: "boolean", content: "您是否关注过消费者权益保护的相关政策？" },
            { id: "q_012", type: "multiple", content: "您认为网购存在哪些问题？", options: ["质量难以保证", "售后困难", "个人信息泄露", "虚假宣传", "物流慢"], minSelect: 1, maxSelect: 5 },
        ],
    };

    const questionnairePartial = {
        title: "我的调查问卷（编辑中）",
        welcomeText: "",
        endingText: "",
        questions: [
            { id: "q_p01", type: "single", content: "您的性别是？", options: ["男", "女"] },
            { id: "q_p02", type: "single", content: "您的年龄段是？", options: ["18-25岁", "26-35岁", "36岁及以上"] },
        ],
    };

    const samplePlanComplete = {
        confidenceLevel: "0.95",
        marginOfError: 5,
        recommendedSize: 370,
        finalSampleSize: 400,
    };

    const samplingResultsComplete = {
        simple: { completed: true, sampleCount: 400, seed: 42 },
        systematic: { completed: true, kValue: 25, sampleCount: 400, seed: 42 },
        stratified: {
            completed: true,
            stratifyBy: "gender",
            layers: [
                { name: "男", count: 4800, ratio: 0.48, sampleCount: 192 },
                { name: "女", count: 5200, ratio: 0.52, sampleCount: 208 },
            ],
            seed: 42,
        },
    };

    const reportComplete =
        "## 实验总结报告\n\n" +
        "### 一、研究背景与目的\n\n" +
        "本次实验旨在通过对城市 18-55 岁消费者的抽样调查，了解其日常消费习惯、品牌偏好及线上购物行为特征。\n\n" +
        "### 二、问卷设计\n\n" +
        "本问卷共 12 道题目，涵盖人口统计信息、消费频次、品类偏好、满意度评价等维度。采用了是非题、单选题、多选题和量表题四种题型。\n\n" +
        "### 三、抽样方案\n\n" +
        "总体规模 N = 10,000，置信水平 95%，允许误差 5%，计算得推荐样本量 370，最终抽样 400 份。分别采用简单随机抽样、系统抽样和按性别分层抽样三种方法。\n\n" +
        "### 四、数据分析\n\n" +
        "1. **年龄分布**：26-35 岁群体占比最高（38%），其次是 18-25 岁（32%）。\n" +
        "2. **消费品类**：服饰鞋包（62%）和食品饮料（55%）是最受欢迎的品类。\n" +
        "3. **满意度**：平均满意度为 3.8/5，物流速度和售后服务是主要抱怨点。\n" +
        "4. **分层对比**：女性在美妆护肤品类上的消费显著高于男性（p < 0.01）。\n\n" +
        "### 五、结论与建议\n\n" +
        "建议企业重点关注 18-35 岁消费主力群体，优化物流体验和售后服务。同时可考虑针对不同性别制定差异化营销策略。";

    const reportPartial =
        "## 实验报告（编写中）\n\n" +
        "### 一、研究背景\n\n" +
        "待补充……\n\n" +
        "### 二、分析结果\n\n" +
        "初步统计显示……";

    // ── 实验场景定义 ──
    type ExpDef = {
        label: string;
        studentIdx: number;
        taskIdx: number;
        currentStage: number;
        status: number;
        questionnaire?: object | null;
        samplePlan?: object | null;
        samplingResults?: object | null;
        reportContent?: string | null;
        stages?: [Date | null, Date | null, Date | null, Date | null];
    };

    const stageTs = (stage: number): [Date | null, Date | null, Date | null, Date | null] => {
        const ts: (Date | null)[] = [null, null, null, null];
        for (let i = 0; i < Math.min(stage, 4); i++) ts[i] = daysAgo(20 - i * 4);
        return ts as [Date | null, Date | null, Date | null, Date | null];
    };

    const experiments: ExpDef[] = [
        // ── A 班 / Task 0 (消费者行为, 正常) ──
        { label: "演示学生-刚开始问卷", studentIdx: 0, taskIdx: 0, currentStage: 1, status: 0, questionnaire: questionnairePartial },
        { label: "钱二-完成全部并提交", studentIdx: 1, taskIdx: 0, currentStage: 4, status: 1, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "孙三-已批改(高分)", studentIdx: 2, taskIdx: 0, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "李四-已驳回", studentIdx: 3, taskIdx: 0, currentStage: 4, status: 3, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportPartial, stages: stageTs(4) },
        { label: "周五-阶段2(设计抽样方案)", studentIdx: 4, taskIdx: 0, currentStage: 2, status: 0, questionnaire: questionnaireComplete, stages: stageTs(1) },
        { label: "吴六-阶段3(执行抽样)", studentIdx: 5, taskIdx: 0, currentStage: 3, status: 0, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, stages: stageTs(2) },
        { label: "郑七-阶段4(撰写报告)", studentIdx: 6, taskIdx: 0, currentStage: 4, status: 0, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportPartial, stages: stageTs(3) },
        { label: "王八-未开始", studentIdx: 7, taskIdx: 0, currentStage: 0, status: 0 },
        { label: "冯九-已批改(低分)", studentIdx: 8, taskIdx: 0, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "陈十-提交待批", studentIdx: 9, taskIdx: 0, currentStage: 4, status: 1, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },

        // ── A 班 / Task 1 (市场调研, 即将截止) ──
        { label: "演示学生-阶段2", studentIdx: 0, taskIdx: 1, currentStage: 2, status: 0, questionnaire: questionnaireComplete, stages: stageTs(1) },
        { label: "钱二-阶段1", studentIdx: 1, taskIdx: 1, currentStage: 1, status: 0, questionnaire: questionnairePartial },
        { label: "孙三-未开始", studentIdx: 2, taskIdx: 1, currentStage: 0, status: 0 },

        // ── A 班 / Task 2 (数据分析, 已过期) ──
        { label: "演示学生-已过期提交", studentIdx: 0, taskIdx: 2, currentStage: 4, status: 1, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },

        // ── B 班 / Task 4 (网购趋势) ──
        { label: "杨二一-完成提交", studentIdx: 15, taskIdx: 4, currentStage: 4, status: 1, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "朱二二-阶段3", studentIdx: 16, taskIdx: 4, currentStage: 3, status: 0, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, stages: stageTs(2) },
        { label: "秦二三-阶段1", studentIdx: 17, taskIdx: 4, currentStage: 1, status: 0, questionnaire: questionnairePartial },
        { label: "尤二四-未开始", studentIdx: 18, taskIdx: 4, currentStage: 0, status: 0 },

        // ── 数据挖掘班 / Task 6 ──
        { label: "张三一-完成已批改", studentIdx: 23, taskIdx: 6, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "孔三二-阶段2", studentIdx: 24, taskIdx: 6, currentStage: 2, status: 0, questionnaire: questionnaireComplete, stages: stageTs(1) },

        // ── 往期班 / Task 8 (全部完成) ──
        { label: "往期陈一-已批改", studentIdx: 27, taskIdx: 8, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "往期赵二-已批改", studentIdx: 28, taskIdx: 8, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
        { label: "往期钱三-已批改", studentIdx: 29, taskIdx: 8, currentStage: 4, status: 2, questionnaire: questionnaireComplete, samplePlan: samplePlanComplete, samplingResults: samplingResultsComplete, reportContent: reportComplete, stages: stageTs(4) },
    ];

    const experimentIds: number[] = [];
    for (const e of experiments) {
        const [res] = await db
            .insert(experiment)
            .values({
                studentId: studentIds[e.studentIdx]!,
                taskId: taskIds[e.taskIdx]!,
                currentStage: e.currentStage,
                status: e.status,
                questionnaire: e.questionnaire ?? null,
                samplePlan: e.samplePlan ?? null,
                samplingResults: e.samplingResults ?? null,
                reportContent: e.reportContent ?? null,
                stage1CompletedAt: e.stages?.[0] ?? null,
                stage2CompletedAt: e.stages?.[1] ?? null,
                stage3CompletedAt: e.stages?.[2] ?? null,
                stage4CompletedAt: e.stages?.[3] ?? null,
                version: e.currentStage > 0 ? e.currentStage : 1,
            })
            .onDuplicateKeyUpdate({ set: { currentStage: e.currentStage } });
        experimentIds.push(res.insertId);
    }

    // ── 提交 & 评分记录 ──
    type SubDef = {
        expIdx: number;
        status: number;
        scoreQ?: string;
        scoreP?: string;
        scoreR?: string;
        total?: string;
        comment?: string;
        rejectReason?: string;
        gradedByType?: number;
        gradedById?: number;
        submittedAgo?: number;
        lockedByType?: number;
        lockedById?: number;
    };

    const submissions: SubDef[] = [
        // 钱二 - 待批改 (pending)
        { expIdx: 1, status: 1, submittedAgo: 5 },
        // 孙三 - 已批改 (高分), 助教正在锁定复查
        { expIdx: 2, status: 2, scoreQ: "92.00", scoreP: "88.50", scoreR: "95.00", total: "92.10", comment: "问卷设计完整，分析深入，报告逻辑清晰，做得非常好！", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 12, lockedByType: USER.assistant, lockedById: assistantIds[0]! },
        // 李四 - 已驳回
        { expIdx: 3, status: 3, rejectReason: "报告部分内容不完整，请补充数据分析章节后重新提交。", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 10 },
        // 冯九 - 已批改 (低分)
        { expIdx: 8, status: 2, scoreQ: "65.00", scoreP: "60.00", scoreR: "58.00", total: "60.60", comment: "问卷设计较为简单，抽样过程存在遗漏，报告分析不够深入，建议多参考指导书。", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 8 },
        // 陈十 - 待批改
        { expIdx: 9, status: 1, submittedAgo: 3 },
        // 演示学生 - 已过期任务提交 (待批改)
        { expIdx: 13, status: 1, submittedAgo: 6 },
        // 杨二一 (B班) - 待批改
        { expIdx: 14, status: 1, submittedAgo: 4 },
        // 张三一 (数据挖掘) - 已批改
        { expIdx: 18, status: 2, scoreQ: "85.00", scoreP: "82.00", scoreR: "88.00", total: "85.00", comment: "整体良好，数据分析方法运用得当。", gradedByType: USER.teacher, gradedById: teacherIds[2]!, submittedAgo: 9 },
        // 往期陈一
        { expIdx: 20, status: 2, scoreQ: "78.00", scoreP: "80.00", scoreR: "82.00", total: "80.20", comment: "达到实验要求。", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 65 },
        // 往期赵二
        { expIdx: 21, status: 2, scoreQ: "90.00", scoreP: "92.00", scoreR: "88.00", total: "89.80", comment: "优秀，分析透彻。", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 63 },
        // 往期钱三
        { expIdx: 22, status: 2, scoreQ: "72.00", scoreP: "70.00", scoreR: "75.00", total: "72.60", comment: "基本合格，建议加强报告写作。", gradedByType: USER.teacher, gradedById: teacherIds[0]!, submittedAgo: 64 },
    ];

    for (const s of submissions) {
        // Fetch experiment row to get its id
        const expDef = experiments[s.expIdx]!;
        const [expRow] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, studentIds[expDef.studentIdx]!),
                    eq(experiment.taskId, taskIds[expDef.taskIdx]!),
                ),
            );
        if (!expRow) continue;

        await db.insert(submission).values({
            experimentId: expRow.id,
            status: s.status,
            scoreQuestionnaire: s.scoreQ ?? null,
            scoreProcess: s.scoreP ?? null,
            scoreReport: s.scoreR ?? null,
            totalScore: s.total ?? null,
            teacherComment: s.comment ?? null,
            rejectReason: s.rejectReason ?? null,
            gradedByType: s.gradedByType ?? null,
            gradedById: s.gradedById ?? null,
            gradedAt: s.status === 2 || s.status === 3 ? daysAgo(2) : null,
            submittedAt: daysAgo(s.submittedAgo ?? 1),
            lockedByType: s.lockedByType ?? null,
            lockedById: s.lockedById ?? null,
            lockedAt: s.lockedByType ? daysAgo(0) : null,
        });
    }

    // ========================================================
    // 10. 公告 (多条 × 不同范围 × 已读/未读)
    // ========================================================
    console.log("📢 公告…");

    const announcementsDefs = [
        { title: "系统维护通知", content: "系统将于本周六 24:00 进行例行维护升级，预计耗时 2 小时，请各位师生提前保存数据。", targetScope: "all", status: 1 },
        { title: "期中实验进度提醒", content: "请各位同学注意：期中节点已过，请确保至少完成第二阶段（抽样方案设计）。未按时完成的同学请尽快补齐进度。", targetScope: "student", status: 1 },
        { title: "新学期教学安排", content: "2024-2025 学年第一学期课程安排已发布，请各位教师登录系统查看并确认课题与班级设置。", targetScope: "teacher", status: 1 },
        { title: "助教培训通知", content: "定于下周三 14:00 在教学楼 B302 举行助教操作培训，请所有助教准时参加。", targetScope: "assistant", status: 1 },
        { title: "数据备份说明（已下线）", content: "此通知已过期。", targetScope: "all", status: 0 },
    ];

    const announcementIds: number[] = [];
    for (const a of announcementsDefs) {
        const [res] = await db.insert(announcement).values(a);
        announcementIds.push(res.insertId);
    }

    // 已读记录
    const readsDefs = [
        { annoIdx: 0, userType: USER.teacher, userId: teacherIds[0]! },
        { annoIdx: 0, userType: USER.student, userId: studentIds[0]! },
        { annoIdx: 0, userType: USER.student, userId: studentIds[1]! },
        { annoIdx: 1, userType: USER.student, userId: studentIds[0]! },
        { annoIdx: 2, userType: USER.teacher, userId: teacherIds[0]! },
        { annoIdx: 2, userType: USER.teacher, userId: teacherIds[1]! },
        { annoIdx: 3, userType: USER.assistant, userId: assistantIds[0]! },
    ];
    for (const r of readsDefs) {
        await db
            .insert(announcementRead)
            .values({ announcementId: announcementIds[r.annoIdx]!, userType: r.userType, userId: r.userId })
            .onDuplicateKeyUpdate({ set: { userType: r.userType } });
    }

    // ========================================================
    // 11. 通知 (多种类型 × 已读/未读)
    // ========================================================
    console.log("🔔 通知…");

    const notifDefs = [
        // 学生通知
        { rt: USER.student, rid: studentIds[0]!, type: "TASK_ASSIGNED", title: "新任务发布", content: "您有一个新的实验任务：消费者行为分析实验，请及时完成。", isRead: 0 },
        { rt: USER.student, rid: studentIds[0]!, type: "TASK_ASSIGNED", title: "新任务发布", content: "您有一个新的实验任务：市场调研基础方法，截止日期临近，请抓紧。", isRead: 0 },
        { rt: USER.student, rid: studentIds[0]!, type: "DEADLINE_REMINDER", title: "截止日期提醒", content: "您的任务「市场调研基础方法」将于 3 天后截止，请尽快完成。", isRead: 0 },
        { rt: USER.student, rid: studentIds[1]!, type: "TASK_ASSIGNED", title: "新任务发布", content: "您有一个新的实验任务：消费者行为分析实验。", isRead: 1 },
        { rt: USER.student, rid: studentIds[3]!, type: "TASK_ASSIGNED", title: "实验被驳回", content: "您提交的「消费者行为分析实验」报告被驳回，请查看原因并重新提交。", isRead: 0 },
        { rt: USER.student, rid: studentIds[15]!, type: "TASK_ASSIGNED", title: "新任务发布", content: "您有一个新的实验任务：大学生网购趋势调查。", isRead: 0 },
        // 教师通知
        { rt: USER.teacher, rid: teacherIds[0]!, type: "TASK_ASSIGNED", title: "有新提交待批改", content: "学生「钱二」提交了「消费者行为分析实验」的实验报告，请及时批改。", isRead: 0 },
        { rt: USER.teacher, rid: teacherIds[0]!, type: "TASK_ASSIGNED", title: "有新提交待批改", content: "学生「陈十」提交了「消费者行为分析实验」的实验报告。", isRead: 0 },
        { rt: USER.teacher, rid: teacherIds[1]!, type: "TASK_ASSIGNED", title: "有新提交待批改", content: "学生「杨二一」提交了「大学生网购趋势调查」的实验报告。", isRead: 0 },
    ];
    for (const n of notifDefs) {
        await db.insert(notification).values({
            receiverType: n.rt,
            receiverId: n.rid,
            type: n.type,
            title: n.title,
            content: n.content,
            isRead: n.isRead,
            readAt: n.isRead ? daysAgo(1) : null,
        });
    }

    // ========================================================
    // 12. 登录日志 (多角色 × 多天)
    // ========================================================
    console.log("📝 登录日志…");

    const loginDefs = [
        { ut: USER.admin, uid: 1, ip: "10.0.0.1", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", ago: 0 },
        { ut: USER.admin, uid: 1, ip: "10.0.0.1", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", ago: 1 },
        { ut: USER.teacher, uid: teacherIds[0]!, ip: "192.168.1.100", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.4", ago: 0 },
        { ut: USER.teacher, uid: teacherIds[0]!, ip: "192.168.1.100", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.4", ago: 1 },
        { ut: USER.teacher, uid: teacherIds[0]!, ip: "192.168.1.100", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.4", ago: 3 },
        { ut: USER.teacher, uid: teacherIds[1]!, ip: "192.168.1.101", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/125.0", ago: 0 },
        { ut: USER.teacher, uid: teacherIds[2]!, ip: "172.16.0.50", ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0", ago: 2 },
        { ut: USER.assistant, uid: assistantIds[0]!, ip: "192.168.1.200", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/124.0", ago: 0 },
        { ut: USER.student, uid: studentIds[0]!, ip: "10.200.1.10", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/17.4", ago: 0 },
        { ut: USER.student, uid: studentIds[0]!, ip: "10.200.1.10", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/17.4", ago: 1 },
        { ut: USER.student, uid: studentIds[0]!, ip: "10.200.1.10", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/17.4", ago: 5 },
        { ut: USER.student, uid: studentIds[1]!, ip: "10.200.1.11", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", ago: 0 },
        { ut: USER.student, uid: studentIds[2]!, ip: "10.200.1.12", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/124.0", ago: 1 },
        { ut: USER.student, uid: studentIds[4]!, ip: "10.200.1.14", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", ago: 0 },
        { ut: USER.student, uid: studentIds[15]!, ip: "10.200.2.1", ua: "Mozilla/5.0 (Android 14; Mobile) Chrome/124.0", ago: 0 },
    ];
    for (const l of loginDefs) {
        await db.insert(loginLog).values({
            userType: l.ut,
            userId: l.uid,
            loginAt: daysAgo(l.ago),
            ipAddress: l.ip,
            userAgent: l.ua,
        });
    }

    // ========================================================
    // 13. 操作日志
    // ========================================================
    console.log("📝 操作日志…");

    const opDefs = [
        { ut: USER.teacher, uid: teacherIds[0]!, action: "CREATE_TOPIC", targetType: "topic", targetId: topicIds[0]!, detail: { name: "消费者行为分析实验" } },
        { ut: USER.teacher, uid: teacherIds[0]!, action: "CREATE_TOPIC", targetType: "topic", targetId: topicIds[2]!, detail: { name: "市场调研基础方法" } },
        { ut: USER.teacher, uid: teacherIds[1]!, action: "CREATE_TOPIC", targetType: "topic", targetId: topicIds[1]!, detail: { name: "大学生网购趋势调查" } },
        { ut: USER.teacher, uid: teacherIds[1]!, action: "CREATE_TOPIC", targetType: "topic", targetId: topicIds[3]!, detail: { name: "数据分析基础实战" } },
        { ut: USER.teacher, uid: teacherIds[2]!, action: "CREATE_TOPIC", targetType: "topic", targetId: topicIds[5]!, detail: { name: "居民健康与运动习惯调查" } },
        { ut: USER.admin, uid: 1, action: "CREATE_BACKUP", targetType: "system", targetId: null as any, detail: { reason: "日常备份" } },
        { ut: USER.admin, uid: 1, action: "CREATE_BACKUP", targetType: "system", targetId: null as any, detail: { reason: "版本升级前备份" } },
    ];
    for (const o of opDefs) {
        await db.insert(operationLog).values({
            userType: o.ut,
            userId: o.uid,
            action: o.action,
            targetType: o.targetType,
            targetId: o.targetId,
            detail: o.detail,
            ipAddress: "127.0.0.1",
        });
    }

    // ========================================================
    // 14. 系统指标（模拟历史数据）
    // ========================================================
    console.log("📊 系统指标…");

    const metricTypes = ["cpu_usage", "memory_usage", "disk_usage", "active_users"];
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
        for (const mt of metricTypes) {
            let value: number;
            switch (mt) {
                case "cpu_usage":
                    value = 15 + Math.round(Math.random() * 40);
                    break;
                case "memory_usage":
                    value = 40 + Math.round(Math.random() * 30);
                    break;
                case "disk_usage":
                    value = 55 + Math.round(Math.random() * 10);
                    break;
                case "active_users":
                    value = 5 + Math.round(Math.random() * 20);
                    break;
                default:
                    value = 0;
            }
            await db.insert(systemMetrics).values({
                metricType: mt,
                metricValue: String(value),
                recordedAt: daysAgo(dayOffset),
            });
        }
    }

    // ========================================================
    // Done!
    // ========================================================
    console.log("\n✅ 数据库初始化完成！");
    console.log("══════════════════════════════════════════");
    console.log(`🔑 通用密码: ${defaultPassword}`);
    console.log("");
    console.log("👤 管理员:   admin");
    console.log("👨‍🏫 教师:     teacher (演示)  |  T002  |  T003  |  T004 (首次登录)  |  T005 (已停用)");
    console.log("👩‍🏫 助教:     assistant (演示)  |  A002  |  A003  |  A004 (首次登录)");
    console.log("👨‍🎓 学生:     student (演示)  |  2024001-2024014 (A班)  |  2024101-2024108 (B班)");
    console.log("                2024201-2024204 (数据挖掘)  |  2023001-2023003 (往期)");
    console.log("");
    console.log("📌 特殊账号:");
    console.log("   T004 / 2024013   → 首次登录（需修改密码）");
    console.log("   T005             → 已停用教师");
    console.log("   2024014          → 已锁定学生");
    console.log("   2024204          → 已停用学生");
    console.log("══════════════════════════════════════════");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ 初始化失败:", err);
    process.exit(1);
});
