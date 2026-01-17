/**
 * 学生 Seed
 */

import type { PrismaClient, Student, Class } from '@prisma/client'
import { hashPassword, generateStudentId, generateChineseName } from './utils'

// 每个班级的学生数量
const STUDENTS_PER_CLASS = 30

export async function seedStudents(
  prisma: PrismaClient,
  classes: Class[]
): Promise<Student[]> {
  const students: Student[] = []
  let studentIndex = 1

  for (const cls of classes) {
    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
      const studentId = generateStudentId(2024, studentIndex)
      const name = generateChineseName()

      // 初始密码为学号
      const hashedPassword = await hashPassword(studentId)

      const existingStudent = await prisma.student.findUnique({
        where: { studentId },
      })

      if (existingStudent) {
        students.push(existingStudent)
      } else {
        const student = await prisma.student.create({
          data: {
            studentId,
            name,
            password: hashedPassword,
            classId: cls.id,
            isFirstLogin: true,
            status: 1,
          },
        })
        students.push(student)
      }

      studentIndex++
    }
  }

  return students
}
