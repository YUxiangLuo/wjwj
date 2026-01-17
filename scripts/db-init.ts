#!/usr/bin/env tsx
/**
 * 数据库初始化脚本
 *
 * 功能：
 * 1. 检查数据库连接
 * 2. 创建数据库（如果不存在）
 * 3. 推送 Prisma schema
 * 4. 运行 seed
 *
 * 使用方式: npx tsx scripts/db-init.ts
 */

import { execSync } from 'child_process'
import mysql from 'mysql2/promise'

// 从环境变量解析数据库配置
function parseDatabaseUrl(url: string) {
  const match = url.match(
    /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
  )
  if (!match) {
    throw new Error('无法解析 DATABASE_URL')
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5].split('?')[0],
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ 请设置 DATABASE_URL 环境变量')
    console.error('   例如: DATABASE_URL="mysql://root:password@localhost:3306/sampling_simulation"')
    process.exit(1)
  }

  console.log('🔧 数据库初始化开始...\n')

  // 1. 解析数据库配置
  const config = parseDatabaseUrl(databaseUrl)
  console.log(`📡 数据库主机: ${config.host}:${config.port}`)
  console.log(`📦 数据库名称: ${config.database}\n`)

  // 2. 检查连接并创建数据库
  console.log('🔌 检查数据库连接...')
  try {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    })

    // 创建数据库（如果不存在）
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\`
       DEFAULT CHARACTER SET utf8mb4
       DEFAULT COLLATE utf8mb4_general_ci`
    )
    console.log(`   ✓ 数据库 "${config.database}" 已就绪\n`)

    await connection.end()
  } catch (error: any) {
    console.error('❌ 数据库连接失败:', error.message)
    process.exit(1)
  }

  // 3. 生成 Prisma Client
  console.log('⚙️  生成 Prisma Client...')
  try {
    execSync('npx prisma generate', { stdio: 'inherit' })
    console.log('   ✓ Prisma Client 生成完成\n')
  } catch {
    console.error('❌ Prisma Client 生成失败')
    process.exit(1)
  }

  // 4. 推送 Schema 到数据库
  console.log('📤 推送 Schema 到数据库...')
  try {
    execSync('npx prisma db push', { stdio: 'inherit' })
    console.log('   ✓ Schema 推送完成\n')
  } catch {
    console.error('❌ Schema 推送失败')
    process.exit(1)
  }

  // 5. 运行 Seed
  console.log('🌱 运行 Seed 脚本...')
  try {
    execSync('npx prisma db seed', { stdio: 'inherit' })
  } catch {
    console.error('❌ Seed 运行失败')
    process.exit(1)
  }

  console.log('\n✅ 数据库初始化完成!')
  console.log('\n📝 默认账号信息:')
  console.log('   管理员: admin / admin123')
  console.log('   教师:   T0001 / T0001, T0002 / T0002, T0003 / T0003')
  console.log('   学生:   20240001 / 20240001 (以此类推)')
}

main()
