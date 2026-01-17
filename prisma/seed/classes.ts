/**
 * 班级 Seed
 */

import type { PrismaClient, Class, Semester, Teacher } from '@prisma/client'

export async function seedClasses(
  prisma: PrismaClient,
  semesters: Semester[],
  teachers: Teacher[]
): Promise<Class[]> {
  const classes: Class[] = []
  const currentSemester = semesters.find((s) => s.isCurrent) || semesters[0]

  // 为每个教师创建 2 个班级
  const classNames = [
    ['统计学2024级1班', '统计学2024级2班'],
    ['数据科学2024级1班', '数据科学2024级2班'],
    ['应用统计2024级1班', '应用统计2024级2班'],
  ]

  for (let i = 0; i < teachers.length; i++) {
    const teacher = teachers[i]
    const names = classNames[i] || [`班级${i * 2 + 1}`, `班级${i * 2 + 2}`]

    for (const name of names) {
      const existingClass = await prisma.class.findFirst({
        where: {
          name,
          semesterId: currentSemester.id,
        },
      })

      if (existingClass) {
        classes.push(existingClass)
      } else {
        const newClass = await prisma.class.create({
          data: {
            name,
            semesterId: currentSemester.id,
            teacherId: teacher.id,
          },
        })
        classes.push(newClass)
      }
    }
  }

  return classes
}
