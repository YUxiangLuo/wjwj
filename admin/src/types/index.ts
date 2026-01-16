// Type definitions for Admin Panel

export interface Admin {
    id: number
    username: string
    isFirstLogin: boolean
}

export interface Teacher {
    id: number
    employeeId: string
    name: string
    status: 0 | 1
    classCount: number
    lastLogin: string
    createdAt: string
}

export interface Assistant {
    id: number
    account: string
    name: string
    status: 0 | 1
    creatorName: string
    classNames: string[]
    lastLogin: string
    createdAt: string
}

export interface Semester {
    id: number
    name: string
    isCurrent: boolean
    classCount: number
    createdAt: string
}

export interface Class {
    id: number
    name: string
    semesterId: number
    semesterName: string
    teacherId: number
    teacherName: string
    studentCount: number
    createdAt: string
}

export interface Student {
    id: number
    studentId: string
    name: string
    classId: number
    className: string
    status: 0 | 1
    lastLogin: string
    createdAt: string
}

export interface Announcement {
    id: number
    title: string
    content: string
    status: 0 | 1
    readCount: number
    totalCount: number
    createdAt: string
}

export interface DashboardStats {
    currentSemester: string
    totalTeachers: number
    totalClasses: number
    totalStudents: number
    totalAssistants: number
    todayActiveUsers: number
    todayLogins: number
}

export interface SystemMetrics {
    cpu: number
    memory: number
    disk: number
    status: 'normal' | 'warning' | 'critical'
}

export interface Alert {
    id: number
    level: 'info' | 'warning' | 'critical'
    message: string
    time: string
}
