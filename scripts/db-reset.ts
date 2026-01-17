#!/usr/bin/env tsx
/**
 * 数据库重置脚本
 *
 * 功能：
 * 1. 删除所有数据
 * 2. 重新运行 seed
 *
 * 使用方式: npx tsx scripts/db-reset.ts
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import readline from 'readline'

const prisma = new PrismaClient()

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

async function main() {
  console.log('⚠️  数据库重置警告')
  console.log('   这将删除所有数据并重新填充测试数据。\n')

  const confirmed = await confirm('确定要继续吗？')
  if (!confirmed) {
    console.log('已取消。')
    process.exit(0)
  }

  console.log('\n🗑️  删除所有数据...')

  // 按照外键依赖顺序删除数据
  const deleteOrder = [
    'submission',
    'experiment',
    'task',
    'topicRecommendQuestion',
    'topicAttachment',
    'topic',
    'studentTransfer',
    'assistantClass',
    'student',
    'class',
    'assistant',
    'teacher',
    'semester',
    'admin',
    'notification',
    'userSession',
    'loginLog',
    'operationLog',
    'systemMetrics',
    'announcementRead',
    'announcement',
    'systemConfig',
  ]

  for (const table of deleteOrder) {
    try {
      // @ts-ignore - 动态访问模型
      await prisma[table].deleteMany({})
      console.log(`   ✓ 已清空 ${table}`)
    } catch (e) {
      // 表可能不存在或其他错误，忽略
    }
  }

  console.log('\n🌱 重新运行 Seed...')
  execSync('npx prisma db seed', { stdio: 'inherit' })

  console.log('\n✅ 数据库重置完成!')
}

main()
  .catch((e) => {
    console.error('❌ 重置失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
