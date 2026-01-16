// Mock data for Admin Panel
import type { Teacher, Assistant, Semester, Class, Student, Announcement, DashboardStats, SystemMetrics, Alert } from '@/types'

// Users
export const mockAdmin = {
    id: 1,
    username: 'admin',
    isFirstLogin: false,
}

export const mockTeachers: Teacher[] = [
    { id: 1, employeeId: 'T2024001', name: '张伟', status: 1, classCount: 3, lastLogin: '2024-03-15 10:30', createdAt: '2024-01-01' },
    { id: 2, employeeId: 'T2024002', name: '李明', status: 0, classCount: 2, lastLogin: '2024-02-01 09:00', createdAt: '2024-01-01' },
    { id: 3, employeeId: 'T2024003', name: '王芳', status: 1, classCount: 4, lastLogin: '2024-03-16 14:20', createdAt: '2024-01-15' },
    { id: 4, employeeId: 'T2024004', name: '刘洋', status: 1, classCount: 2, lastLogin: '2024-03-14 08:45', createdAt: '2024-02-01' },
]

export const mockAssistants: Assistant[] = [
    { id: 1, account: 'ta_wang', name: '王芳', status: 1, creatorName: '张伟', classNames: ['统计101-A班', '统计101-B班'], lastLogin: '2024-03-15 11:00', createdAt: '2024-02-01' },
    { id: 2, account: 'ta_li', name: '李华', status: 0, creatorName: '李明', classNames: ['统计102-A班'], lastLogin: '2024-01-15 09:30', createdAt: '2024-02-01' },
    { id: 3, account: 'ta_zhang', name: '张丽', status: 1, creatorName: '张伟', classNames: ['统计101-C班'], lastLogin: '2024-03-16 09:00', createdAt: '2024-02-15' },
]

export const mockSemesters: Semester[] = [
    { id: 1, name: '2024-Spring', isCurrent: true, classCount: 12, createdAt: '2024-01-01' },
    { id: 2, name: '2023-Fall', isCurrent: false, classCount: 10, createdAt: '2023-08-01' },
    { id: 3, name: '2023-Spring', isCurrent: false, classCount: 8, createdAt: '2023-01-01' },
]

export const mockClasses: Class[] = [
    { id: 1, name: '统计101-A班', semesterId: 1, semesterName: '2024-Spring', teacherId: 1, teacherName: '张伟', studentCount: 45, createdAt: '2024-01-20' },
    { id: 2, name: '统计101-B班', semesterId: 1, semesterName: '2024-Spring', teacherId: 1, teacherName: '张伟', studentCount: 42, createdAt: '2024-01-20' },
    { id: 3, name: '统计101-C班', semesterId: 1, semesterName: '2024-Spring', teacherId: 3, teacherName: '王芳', studentCount: 48, createdAt: '2024-01-20' },
    { id: 4, name: '统计102-A班', semesterId: 1, semesterName: '2024-Spring', teacherId: 2, teacherName: '李明', studentCount: 40, createdAt: '2024-01-21' },
]

export const mockStudents: Student[] = [
    { id: 1, studentId: '2024010001', name: '王小明', classId: 1, className: '统计101-A班', status: 1, lastLogin: '2024-03-15 14:30', createdAt: '2024-01-20' },
    { id: 2, studentId: '2024010002', name: '张小红', classId: 1, className: '统计101-A班', status: 1, lastLogin: '2024-03-16 09:15', createdAt: '2024-01-20' },
    { id: 3, studentId: '2024010003', name: '李小刚', classId: 1, className: '统计101-A班', status: 0, lastLogin: '2024-02-01 10:00', createdAt: '2024-01-20' },
]

export const mockAnnouncements: Announcement[] = [
    { id: 1, title: '系统维护通知', content: '系统将于3月20日凌晨2:00-4:00进行维护升级...', status: 1, readCount: 127, totalCount: 250, createdAt: '2024-03-10 09:00' },
    { id: 2, title: '新学期开始公告', content: '欢迎回来！本学期我们有许多新功能上线...', status: 1, readCount: 89, totalCount: 250, createdAt: '2024-03-01 08:00' },
    { id: 3, title: '测试公告', content: '这是一个测试公告内容...', status: 0, readCount: 45, totalCount: 250, createdAt: '2024-02-15 10:00' },
]

// Dashboard statistics
export const mockDashboardStats: DashboardStats = {
    currentSemester: '2024-Spring',
    totalTeachers: 15,
    totalClasses: 12,
    totalStudents: 450,
    totalAssistants: 8,
    todayActiveUsers: 47,
    todayLogins: 328,
}

// System metrics
export const mockSystemMetrics: SystemMetrics = {
    cpu: 45,
    memory: 62,
    disk: 78,
    status: 'normal',
}

export const mockAlerts: Alert[] = [
    { id: 1, level: 'warning', message: '磁盘使用率超过75%', time: '2小时前' },
]
