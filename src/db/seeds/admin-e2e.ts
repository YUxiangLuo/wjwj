import { db } from "../index";
import { admin, class_, semester, student, systemConfig, teacher } from "../schema";

async function seedAdminE2E() {
    console.log("🌱 Initializing admin e2e database...\n");

    const defaultPassword = "123456";
    const passwordHash = await Bun.password.hash(defaultPassword);

    await db.insert(systemConfig).values([
        { configKey: "system_name", configValue: "E2E 管理端测试系统", valueType: "string", description: "系统名称" },
        { configKey: "login.max_fail_count", configValue: "5", valueType: "number", description: "最大登录失败次数" },
        { configKey: "login.lock_duration_minutes", configValue: "30", valueType: "number", description: "账号锁定时长(分钟)" },
        { configKey: "session.admin_timeout_minutes", configValue: "30", valueType: "number", description: "管理员会话超时(分钟)" },
    ]);

    const [adminInsert] = await db.insert(admin).values({
        username: "admin",
        password: passwordHash,
        isFirstLogin: 0,
    });
    const adminId = adminInsert.insertId as number;

    const [teacherInsert] = await db.insert(teacher).values({
        employeeId: "teacher",
        name: "E2E教师",
        password: passwordHash,
        isFirstLogin: 0,
        status: 1,
    });
    const teacherId = teacherInsert.insertId as number;

    const [semesterInsert] = await db.insert(semester).values({
        name: "2026-2027学年 第一学期",
        isCurrent: 1,
    });
    const semesterId = semesterInsert.insertId as number;

    const [classInsert] = await db.insert(class_).values({
        name: "E2E 初始班级",
        semesterId,
        teacherId,
    });
    const classId = classInsert.insertId as number;

    await db.insert(student).values({
        studentId: "student",
        name: "E2E学生",
        password: passwordHash,
        classId,
        isFirstLogin: 0,
        status: 1,
    });

    console.log("✅ Admin e2e seed completed.");
    console.log("------------------------------------------");
    console.log(`Admin: admin / ${defaultPassword}`);
    console.log(`Teacher count seed: 1 (owner id: ${teacherId})`);
    console.log(`Semester id: ${semesterId}, class id: ${classId}`);
    console.log(`Seeded admin id: ${adminId}`);
    console.log("------------------------------------------");
}

seedAdminE2E().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("❌ Admin e2e seed failed:", err);
    process.exit(1);
});
