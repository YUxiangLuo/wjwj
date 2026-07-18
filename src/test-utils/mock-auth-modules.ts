import type { RouteDefinition } from "../server/route-types";

type ModuleOverrides = Record<string, unknown>;

const teacherUser = {
    id: 9,
    type: "teacher" as const,
    name: "教师",
    employeeId: "T001",
};

/**
 * Bun keeps mock.module registrations for the lifetime of the test process. Keep
 * the complete runtime export shape here so a route test cannot remove exports
 * required by a test that happens to run later in the same process.
 */
export function createTeacherAuthModuleMock(overrides: ModuleOverrides = {}) {
    const getTeacherUser = () => teacherUser;
    return {
        TEACHER_USER_TYPE: 2,
        TEACHER_SESSION_COOKIE: "teacher_session",
        getTeacherAuth: () => ({ user: teacherUser, error: null }),
        getTeacherUser,
        getPrimaryTeacherIdOrThrow: () => getTeacherUser().id,
        requireTeacherAuth: async () => ({ user: teacherUser, error: null }),
        withTeacherAuth: (routes: RouteDefinition) => routes,
        teacherLoginRoutes: {},
        teacherLogoutRoutes: {},
        teacherMeRoutes: {},
        teacherPasswordRoutes: {},
        ...overrides,
    };
}

const studentUser = {
    id: 11,
    studentId: "S001",
    name: "学生",
    classId: 7,
    status: 1,
};

export function createStudentAuthModuleMock(overrides: ModuleOverrides = {}) {
    const authResult = { student: studentUser, error: null, sessionExpiresAt: null };
    return {
        STUDENT_USER_TYPE: 3,
        STUDENT_SESSION_COOKIE: "student_session",
        getCurrentStudent: async () => authResult,
        requireAuth: async () => authResult,
        loginRoutes: {},
        logoutRoutes: {},
        meRoutes: {},
        passwordRoutes: {},
        ...overrides,
    };
}
