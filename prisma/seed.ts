/**
 * 抽样统计虚拟仿真教学系统 - 数据库 Seed 脚本
 *
 * 运行方式: npm run db:seed
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from './seed/utils'
import { systemConfigs } from './seed/data/system-config'
import { seedAdmin } from './seed/admin'
import { seedTeachers } from './seed/teachers'
import { seedSemesters } from './seed/semesters'
import { seedClasses } from './seed/classes'
import { seedStudents } from './seed/students'
import { seedTopics } from './seed/topics'
import { seedTasks } from './seed/tasks'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始填充数据库...\n')

  // 1. 系统配置
  console.log('📋 填充系统配置...')
  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { configKey: config.configKey },
      update: {
        configValue: config.configValue,
        valueType: config.valueType,
        description: config.description,
      },
      create: config,
    })
  }
  console.log(`   ✓ 已创建 ${systemConfigs.length} 条系统配置\n`)

  // 2. 管理员
  console.log('👤 填充管理员账号...')
  const admin = await seedAdmin(prisma)
  console.log(`   ✓ 管理员: ${admin.username}\n`)

  // 3. 学期
  console.log('📅 填充学期数据...')
  const semesters = await seedSemesters(prisma)
  console.log(`   ✓ 已创建 ${semesters.length} 个学期\n`)

  // 4. 教师
  console.log('👨‍🏫 填充教师数据...')
  const teachers = await seedTeachers(prisma)
  console.log(`   ✓ 已创建 ${teachers.length} 名教师\n`)

  // 5. 班级
  console.log('🏫 填充班级数据...')
  const classes = await seedClasses(prisma, semesters, teachers)
  console.log(`   ✓ 已创建 ${classes.length} 个班级\n`)

  // 6. 学生
  console.log('👨‍🎓 填充学生数据...')
  const students = await seedStudents(prisma, classes)
  console.log(`   ✓ 已创建 ${students.length} 名学生\n`)

  // 7. 课题
  console.log('📚 填充课题数据...')
  const topics = await seedTopics(prisma, teachers)
  console.log(`   ✓ 已创建 ${topics.length} 个课题\n`)

  // 8. 任务
  console.log('📝 填充任务数据...')
  const tasks = await seedTasks(prisma, topics, classes)
  console.log(`   ✓ 已创建 ${tasks.length} 个任务\n`)

  console.log('✅ 数据库填充完成!')
  console.log('\n📊 数据统计:')
  console.log(`   - 系统配置: ${systemConfigs.length} 条`)
  console.log(`   - 管理员: 1 个`)
  console.log(`   - 学期: ${semesters.length} 个`)
  console.log(`   - 教师: ${teachers.length} 名`)
  console.log(`   - 班级: ${classes.length} 个`)
  console.log(`   - 学生: ${students.length} 名`)
  console.log(`   - 课题: ${topics.length} 个`)
  console.log(`   - 任务: ${tasks.length} 个`)
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
