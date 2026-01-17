/**
 * 学期 Repository
 */

import type { Semester, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

export class SemesterRepository {
  /**
   * 创建学期
   */
  async create(data: Prisma.SemesterCreateInput): Promise<Semester> {
    return prisma.semester.create({ data })
  }

  /**
   * 根据名称查找
   */
  async findByName(name: string): Promise<Semester | null> {
    return prisma.semester.findUnique({
      where: { name },
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Semester | null> {
    return prisma.semester.findUnique({
      where: { id },
    })
  }

  /**
   * 获取当前学期
   */
  async findCurrent(): Promise<Semester | null> {
    return prisma.semester.findFirst({
      where: { isCurrent: true },
    })
  }

  /**
   * 查找所有学期
   */
  async findMany(): Promise<Semester[]> {
    return prisma.semester.findMany({
      orderBy: { name: 'desc' },
    })
  }

  /**
   * 查找所有学期（包含班级数量统计）
   */
  async findManyWithClassCount() {
    return prisma.semester.findMany({
      orderBy: { name: 'desc' },
      include: {
        _count: { select: { classes: true } },
      },
    })
  }

  /**
   * 更新学期
   */
  async update(
    id: bigint,
    data: Prisma.SemesterUpdateInput
  ): Promise<Semester> {
    return prisma.semester.update({
      where: { id },
      data,
    })
  }

  /**
   * 设为当前学期
   */
  async setCurrent(id: bigint): Promise<Semester> {
    return prisma.$transaction(async (tx) => {
      // 取消其他学期的当前标记
      await tx.semester.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      })

      // 设置当前学期
      return tx.semester.update({
        where: { id },
        data: { isCurrent: true },
      })
    })
  }

  /**
   * 删除学期（仅当没有班级时可删除）
   */
  async delete(id: bigint): Promise<Semester> {
    const classCount = await prisma.class.count({
      where: { semesterId: id },
    })

    if (classCount > 0) {
      throw new Error('无法删除：该学期下存在班级')
    }

    return prisma.semester.delete({
      where: { id },
    })
  }

  /**
   * 统计数量
   */
  async count(): Promise<number> {
    return prisma.semester.count()
  }
}

export const semesterRepository = new SemesterRepository()
