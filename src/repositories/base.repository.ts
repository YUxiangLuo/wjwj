/**
 * 基础 Repository 抽象类
 *
 * 提供通用的 CRUD 操作
 */

import type { PaginationParams, PaginatedResult } from '../lib/types'

export abstract class BaseRepository<
  T,
  CreateInput,
  UpdateInput,
  WhereUniqueInput,
  WhereInput,
> {
  /**
   * 创建记录
   */
  abstract create(data: CreateInput): Promise<T>

  /**
   * 根据唯一标识查找
   */
  abstract findUnique(where: WhereUniqueInput): Promise<T | null>

  /**
   * 根据条件查找第一条
   */
  abstract findFirst(where: WhereInput): Promise<T | null>

  /**
   * 根据条件查找多条
   */
  abstract findMany(where?: WhereInput): Promise<T[]>

  /**
   * 分页查询
   */
  abstract findManyPaginated(
    where: WhereInput | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<T>>

  /**
   * 更新记录
   */
  abstract update(where: WhereUniqueInput, data: UpdateInput): Promise<T>

  /**
   * 删除记录
   */
  abstract delete(where: WhereUniqueInput): Promise<T>

  /**
   * 统计数量
   */
  abstract count(where?: WhereInput): Promise<number>

  /**
   * 计算分页信息
   */
  protected calculatePagination(
    total: number,
    params: PaginationParams
  ): { page: number; pageSize: number; totalPages: number; skip: number } {
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)
    const skip = (page - 1) * pageSize

    return { page, pageSize, totalPages, skip }
  }
}
