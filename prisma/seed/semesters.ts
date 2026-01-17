/**
 * 学期 Seed
 */

import type { PrismaClient, Semester } from '@prisma/client'
import { getCurrentSemesterName } from './utils'

export async function seedSemesters(prisma: PrismaClient): Promise<Semester[]> {
  const currentSemester = getCurrentSemesterName()
  const now = new Date()
  const year = now.getFullYear()

  // 创建当前学期和前一个学期
  const semesterNames = [
    currentSemester,
    currentSemester.includes('Spring') ? `${year - 1}-Fall` : `${year}-Spring`,
  ]

  const semesters: Semester[] = []

  for (let i = 0; i < semesterNames.length; i++) {
    const semester = await prisma.semester.upsert({
      where: { name: semesterNames[i] },
      update: {},
      create: {
        name: semesterNames[i],
        isCurrent: i === 0, // 第一个是当前学期
      },
    })
    semesters.push(semester)
  }

  return semesters
}
