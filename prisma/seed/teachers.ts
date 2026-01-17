/**
 * 教师 Seed
 */

import type { PrismaClient, Teacher } from '@prisma/client'
import { hashPassword, generateEmployeeId, generateChineseName } from './utils'

// 预设教师数据
const teacherData = [
  { name: '张明', employeeId: 'T0001' },
  { name: '李华', employeeId: 'T0002' },
  { name: '王芳', employeeId: 'T0003' },
]

export async function seedTeachers(prisma: PrismaClient): Promise<Teacher[]> {
  const teachers: Teacher[] = []

  for (const data of teacherData) {
    // 初始密码为工号
    const hashedPassword = await hashPassword(data.employeeId)

    const teacher = await prisma.teacher.upsert({
      where: { employeeId: data.employeeId },
      update: {},
      create: {
        employeeId: data.employeeId,
        name: data.name,
        password: hashedPassword,
        isFirstLogin: true,
        status: 1,
      },
    })
    teachers.push(teacher)
  }

  return teachers
}
