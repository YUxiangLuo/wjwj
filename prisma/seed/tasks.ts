/**
 * 任务 Seed
 */

import type { PrismaClient, Task, Topic, Class } from '@prisma/client'
import { randomFutureDate } from './utils'

export async function seedTasks(
  prisma: PrismaClient,
  topics: Topic[],
  classes: Class[]
): Promise<Task[]> {
  const tasks: Task[] = []

  // 为每个已发布的课题创建任务
  for (const topic of topics) {
    if (topic.status !== 1) continue // 只处理已发布的课题

    // 找到该教师的班级
    const teacherClasses = classes.filter(
      (cls) => cls.teacherId === topic.teacherId
    )

    for (const cls of teacherClasses) {
      // 检查是否已存在
      const existingTask = await prisma.task.findUnique({
        where: {
          topicId_classId: {
            topicId: topic.id,
            classId: cls.id,
          },
        },
      })

      if (existingTask) {
        tasks.push(existingTask)
        continue
      }

      // 创建新任务
      const task = await prisma.task.create({
        data: {
          topicId: topic.id,
          classId: cls.id,
          openTime: new Date(), // 立即开放
          deadline: randomFutureDate(30), // 30天内的随机截止时间
        },
      })
      tasks.push(task)
    }
  }

  return tasks
}
