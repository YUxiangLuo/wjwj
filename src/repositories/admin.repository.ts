/**
 * 管理员 Repository
 */

import type { Admin, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class AdminRepository {
  /**
   * 根据用户名查找管理员
   */
  async findByUsername(username: string): Promise<Admin | null> {
    return prisma.admin.findUnique({
      where: { username },
    })
  }

  /**
   * 根据 ID 查找管理员
   */
  async findById(id: bigint): Promise<Admin | null> {
    return prisma.admin.findUnique({
      where: { id },
    })
  }

  /**
   * 更新管理员信息
   */
  async update(id: bigint, data: Prisma.AdminUpdateInput): Promise<Admin> {
    return prisma.admin.update({
      where: { id },
      data,
    })
  }

  /**
   * 更新密码
   */
  async updatePassword(
    id: bigint,
    hashedPassword: string,
    isFirstLogin: boolean = false
  ): Promise<Admin> {
    return prisma.admin.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin,
      },
    })
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(id: bigint): Promise<Admin> {
    const admin = await this.findById(id)
    if (!admin) throw new Error('Admin not found')

    const newFailCount = admin.loginFailCount + 1
    const maxFailCount = 5 // TODO: 从配置读取
    const lockDurationMinutes = 30

    return prisma.admin.update({
      where: { id },
      data: {
        loginFailCount: newFailCount,
        lockedUntil:
          newFailCount >= maxFailCount
            ? new Date(Date.now() + lockDurationMinutes * 60 * 1000)
            : undefined,
      },
    })
  }

  /**
   * 清除登录失败记录
   */
  async clearLoginFailure(id: bigint): Promise<Admin> {
    return prisma.admin.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }

  /**
   * 检查账号是否被锁定
   */
  async isLocked(id: bigint): Promise<boolean> {
    const admin = await this.findById(id)
    if (!admin) return false

    return admin.lockedUntil !== null && admin.lockedUntil > new Date()
  }

  /**
   * 解锁账号
   */
  async unlock(id: bigint): Promise<Admin> {
    return prisma.admin.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }
}

export const adminRepository = new AdminRepository()
