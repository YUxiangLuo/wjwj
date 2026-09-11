// 清理三轮联动测试产生的数据：任务 → 模板 → 学生 → 班级 → 教师 → 学期 → 公告
import { Client, evidenceFile } from "./lib";

const admin = new Client("admin");
const teacherClients = new Map<string, Client>();
await admin.login("/api/admin/login", { username: "admin", password: "admin123" });

const pattern = /^(联动|边界|隔离|宽分层|重复标识|数值口径|非法数值|零方差)/;
/** 列表接口有的返回数组、有的返回 { items, total }，统一取值。 */
const list = (response: any): any[] => {
    const data = response?.body?.data;
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};
const report: Record<string, any> = { tasks: [], topics: [], students: [], classes: [], teachers: [], semesters: [], announcements: [], failures: [] };

// 1) 任务与模板：按归属教师登录后删除
const teachers = list(await admin.get("/api/admin/teachers"));
const testTeachers = teachers.filter((row: any) => /^T[6789]/.test(row.employeeId) && row.employeeId.length > 3);
for (const row of testTeachers) {
    const client = teacherClients.get(row.employeeId) ?? new Client(`t-${row.employeeId}`);
    teacherClients.set(row.employeeId, client);
    const login = await client.login("/api/teacher/login", { employeeId: row.employeeId, password: row.employeeId });
    if (login.status !== 200) { report.failures.push({ kind: "login", id: row.employeeId, status: login.status }); continue; }
    const tasks = list(await client.get("/api/teacher/tasks"));
    for (const task of tasks) {
        if (!pattern.test(String(task.topic ?? ""))) continue;
        const first = await client.del(`/api/teacher/tasks/${task.id}`);
        const result = first.status === 409 ? await client.del(`/api/teacher/tasks/${task.id}?confirm=1`) : first;
        report.tasks.push({ id: task.id, topic: task.topic, status: result.status, firstStatus: first.status });
    }
    const topics = list(await client.get("/api/teacher/topics"));
    for (const topic of topics) {
        if (!pattern.test(String(topic.name ?? ""))) continue;
        // 已发布的模板不能直接删除：先转草稿
        if (Number(topic.status) !== 0) await client.put(`/api/teacher/topics/${topic.id}`, { name: topic.name, status: 0 });
        const result = await client.del(`/api/teacher/topics/${topic.id}`);
        report.topics.push({ id: topic.id, name: topic.name, status: result.status });
    }
}

// 2) 学生 → 班级 → 教师 → 学期
const students = list(await admin.get("/api/admin/students?pageSize=500"));
for (const student of students) {
    if (!/^S[789]/.test(String(student.studentId))) continue;
    const impact = await admin.get(`/api/admin/students/${student.id}/experiments`).catch(() => null);
    void impact;
    const result = await admin.del(`/api/admin/students/${student.id}`);
    report.students.push({ id: student.id, studentId: student.studentId, status: result.status, code: result.body?.error?.code ?? null });
}
const classes = list(await admin.get("/api/admin/classes"));
for (const row of classes) {
    if (!pattern.test(String(row.name ?? ""))) continue;
    const result = await admin.del(`/api/admin/classes/${row.id}`);
    report.classes.push({ id: row.id, name: row.name, status: result.status, code: result.body?.error?.code ?? null });
}
const teachersAgain = list(await admin.get("/api/admin/teachers"));
for (const row of teachersAgain) {
    if (!/^(T[6789])\d{4,}$/.test(row.employeeId) || !["联动测试教师", "边界测试教师", "隔离测试教师", "旁观教师"].includes(row.name)) continue;
    const result = await admin.del(`/api/admin/teachers/${row.id}`);
    report.teachers.push({ id: row.id, employeeId: row.employeeId, name: row.name, status: result.status, code: result.body?.error?.code ?? null });
}
const semesters = list(await admin.get("/api/admin/semesters"));
for (const row of semesters) {
    if (!/(学年|边界学期|隔离学期)/.test(String(row.name ?? ""))) continue;
    const result = await admin.del(`/api/admin/semesters/${row.id}`);
    report.semesters.push({ id: row.id, name: row.name, status: result.status, code: result.body?.error?.code ?? null });
}
const announcements = list(await admin.get("/api/admin/announcements"));
for (const row of announcements) {
    if (!pattern.test(String(row.title ?? ""))) continue;
    const result = await admin.del(`/api/admin/announcements/${row.id}`);
    report.announcements.push({ id: row.id, title: row.title, status: result.status });
}

const stats = (await admin.get("/api/admin/stats")).body?.data;
report.statsAfter = stats;
console.log(JSON.stringify(report, null, 1));
await Bun.write(evidenceFile("cleanup.json"), JSON.stringify(report, null, 2));
