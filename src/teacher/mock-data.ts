export const mockClasses = [
    { id: 1, name: "统计学2024-1班", semester: "2024-Spring", studentCount: 45, createdAt: "2024-02-01" },
    { id: 2, name: "统计学2024-2班", semester: "2024-Spring", studentCount: 42, createdAt: "2024-02-01" },
    { id: 3, name: "统计学2024-3班", semester: "2024-Spring", studentCount: 38, createdAt: "2024-02-15" },
];

export const mockStudents = [
    { id: 1, studentId: "2024001", name: "张明", email: "zhangming@edu.cn", status: "active", lastLogin: "2024-03-15 14:30" },
    { id: 2, studentId: "2024002", name: "李华", email: "lihua@edu.cn", status: "active", lastLogin: "2024-03-15 10:20" },
    { id: 3, studentId: "2024003", name: "王芳", email: "wangfang@edu.cn", status: "active", lastLogin: "2024-03-14 16:45" },
    { id: 4, studentId: "2024004", name: "刘强", email: "liuqiang@edu.cn", status: "disabled", lastLogin: "2024-03-10 09:10" },
    { id: 5, studentId: "2024005", name: "赵丽", email: "zhaoli@edu.cn", status: "active", lastLogin: "2024-03-15 08:00" },
];

export const mockAssistants = [
    { id: 1, name: "陈助教", studentId: "TA2024001", email: "chenta@edu.cn", assignedClasses: ["统计学2024-1班", "统计学2024-2班"], status: "active" },
    { id: 2, name: "周助教", studentId: "TA2024002", email: "zhouta@edu.cn", assignedClasses: ["统计学2024-3班"], status: "active" },
];
