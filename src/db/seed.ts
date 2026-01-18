/**
 * 数据库种子脚本
 * 创建测试数据用于开发
 */

import { db } from "./index";
import {
    semester,
    teacher,
    class_,
    student,
    topic,
    task,
} from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
    console.log("🌱 开始创建测试数据...\n");

    // 1. 创建学期
    console.log("📅 创建学期...");
    const [existingSemester] = await db.select().from(semester).limit(1);
    let semesterId: number;

    if (existingSemester) {
        semesterId = existingSemester.id;
        console.log(`   使用现有学期: ${existingSemester.name} (ID: ${semesterId})`);
    } else {
        const [result] = await db.insert(semester).values({
            name: "2024-2025学年第一学期",
            isCurrent: 1,
        });
        semesterId = result.insertId;
        console.log(`   创建学期: 2024-2025学年第一学期 (ID: ${semesterId})`);
    }

    // 2. 创建教师
    console.log("👨‍🏫 创建教师...");
    const [existingTeacher] = await db.select().from(teacher).limit(1);
    let teacherId: number;

    if (existingTeacher) {
        teacherId = existingTeacher.id;
        console.log(`   使用现有教师: ${existingTeacher.name} (ID: ${teacherId})`);
    } else {
        const hashedPassword = await Bun.password.hash("T001");
        const [result] = await db.insert(teacher).values({
            employeeId: "T001",
            name: "张老师",
            password: hashedPassword,
            status: 1,
            isFirstLogin: 0,
        });
        teacherId = result.insertId;
        console.log(`   创建教师: 张老师 (ID: ${teacherId})`);
    }

    // 3. 创建班级
    console.log("🏫 创建班级...");
    const [existingClass] = await db.select().from(class_).limit(1);
    let classId: number;

    if (existingClass) {
        classId = existingClass.id;
        console.log(`   使用现有班级: ${existingClass.name} (ID: ${classId})`);
    } else {
        const [result] = await db.insert(class_).values({
            name: "统计学2024级1班",
            semesterId: semesterId,
            teacherId: teacherId,
        });
        classId = result.insertId;
        console.log(`   创建班级: 统计学2024级1班 (ID: ${classId})`);
    }

    // 4. 创建学生
    console.log("👨‍🎓 创建学生...");
    const [existingStudent] = await db.select().from(student).limit(1);

    if (existingStudent) {
        console.log(`   已存在学生: ${existingStudent.name} (ID: ${existingStudent.id})`);
    } else {
        const students = [
            { studentId: "2024001", name: "张明" },
            { studentId: "2024002", name: "李华" },
            { studentId: "2024003", name: "王芳" },
            { studentId: "2024004", name: "刘强" },
            { studentId: "2024005", name: "陈静" },
        ];

        for (const s of students) {
            const hashedPassword = await Bun.password.hash(s.studentId);
            await db.insert(student).values({
                studentId: s.studentId,
                name: s.name,
                password: hashedPassword,
                classId: classId,
                status: 1,
                isFirstLogin: 0,
            });
            console.log(`   创建学生: ${s.name} (学号: ${s.studentId})`);
        }
    }

    // 5. 创建课题
    console.log("📚 创建课题...");
    const [existingTopic] = await db.select().from(topic).where(eq(topic.status, 1)).limit(1);
    let topicId: number;

    if (existingTopic) {
        topicId = existingTopic.id;
        console.log(`   使用现有课题: ${existingTopic.name} (ID: ${topicId})`);
    } else {
        const [result] = await db.insert(topic).values({
            teacherId: teacherId,
            name: "消费者行为调研",
            description: `## 研究背景

在当今竞争激烈的市场环境中，了解消费者行为对于企业制定营销策略至关重要。本课题旨在通过科学的抽样调查方法，收集和分析消费者在购物决策过程中的行为特征和影响因素。

## 研究目标

1. 了解目标消费群体的基本特征
2. 分析影响购买决策的关键因素
3. 探索不同人群消费偏好的差异
4. 为企业营销策略提供数据支持

## 研究要求

- 设计科学合理的调查问卷
- 正确计算并确定样本量
- 掌握三种基本抽样方法的应用
- 撰写完整的调研报告`,
            excelRowCount: 10000,
            status: 1, // 已发布
        });
        topicId = result.insertId;
        console.log(`   创建课题: 消费者行为调研 (ID: ${topicId})`);
    }

    // 6. 创建任务（将课题分配给班级）
    console.log("📋 创建任务...");
    const [existingTask] = await db
        .select()
        .from(task)
        .where(eq(task.classId, classId))
        .limit(1);

    if (existingTask) {
        console.log(`   已存在任务 (ID: ${existingTask.id})`);
    } else {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30); // 30天后截止

        const [result] = await db.insert(task).values({
            topicId: topicId,
            classId: classId,
            openTime: new Date(),
            deadline: deadline,
        });
        console.log(`   创建任务: 课题 ${topicId} -> 班级 ${classId} (ID: ${result.insertId})`);
    }

    console.log("\n✅ 测试数据创建完成！");
    console.log("\n📝 测试账号信息:");
    console.log("   学生: 张明 (学号: 2024001)");
    console.log("   教师: 张老师 (工号: T001)");
    console.log("\n🌐 访问 http://localhost:3000/student 查看学生端");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ 创建测试数据失败:", err);
    process.exit(1);
});
