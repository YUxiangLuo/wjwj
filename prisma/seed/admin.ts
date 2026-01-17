/**
 * 管理员 Seed
 */

import type { PrismaClient, Admin } from '@prisma/client'
import { hashPassword } from './utils'

export async function seedAdmin(prisma: PrismaClient): Promise<Admin> {
  const hashedPassword = await hashPassword('admin123')

  return prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      isFirstLogin: true,
    },
  })
}
