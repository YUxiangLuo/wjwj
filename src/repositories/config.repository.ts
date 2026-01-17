/**
 * 系统配置 Repository
 */

import type { SystemConfig, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

export class ConfigRepository {
  /**
   * 根据键获取配置
   */
  async get(key: string): Promise<SystemConfig | null> {
    return prisma.systemConfig.findUnique({
      where: { key },
    })
  }

  /**
   * 获取配置值
   */
  async getValue(key: string): Promise<string | null> {
    const config = await this.get(key)
    return config?.value ?? null
  }

  /**
   * 获取配置值（带默认值）
   */
  async getValueOrDefault(key: string, defaultValue: string): Promise<string> {
    const value = await this.getValue(key)
    return value ?? defaultValue
  }

  /**
   * 获取数字配置值
   */
  async getNumberValue(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getValue(key)
    if (value === null) return defaultValue
    const num = parseFloat(value)
    return isNaN(num) ? defaultValue : num
  }

  /**
   * 获取布尔配置值
   */
  async getBooleanValue(
    key: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    const value = await this.getValue(key)
    if (value === null) return defaultValue
    return value === 'true' || value === '1'
  }

  /**
   * 获取 JSON 配置值
   */
  async getJsonValue<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.getValue(key)
    if (value === null) return defaultValue
    try {
      return JSON.parse(value) as T
    } catch {
      return defaultValue
    }
  }

  /**
   * 设置配置值
   */
  async set(key: string, value: string): Promise<SystemConfig> {
    return prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }

  /**
   * 设置配置值（带描述）
   */
  async setWithDescription(
    key: string,
    value: string,
    description: string
  ): Promise<SystemConfig> {
    return prisma.systemConfig.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    })
  }

  /**
   * 批量设置配置
   */
  async setMany(
    configs: { key: string; value: string; description?: string }[]
  ): Promise<void> {
    await prisma.$transaction(
      configs.map((config) =>
        prisma.systemConfig.upsert({
          where: { key: config.key },
          update: { value: config.value, description: config.description },
          create: config,
        })
      )
    )
  }

  /**
   * 获取所有配置
   */
  async getAll(): Promise<SystemConfig[]> {
    return prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    })
  }

  /**
   * 按前缀获取配置
   */
  async getByPrefix(prefix: string): Promise<SystemConfig[]> {
    return prisma.systemConfig.findMany({
      where: {
        key: { startsWith: prefix },
      },
      orderBy: { key: 'asc' },
    })
  }

  /**
   * 删除配置
   */
  async delete(key: string): Promise<SystemConfig> {
    return prisma.systemConfig.delete({
      where: { key },
    })
  }

  /**
   * 检查配置是否存在
   */
  async exists(key: string): Promise<boolean> {
    const count = await prisma.systemConfig.count({
      where: { key },
    })
    return count > 0
  }

  /**
   * 统计数量
   */
  async count(): Promise<number> {
    return prisma.systemConfig.count()
  }

  // ========== 常用配置的快捷方法 ==========

  /**
   * 获取登录失败锁定阈值
   */
  async getLoginFailLockThreshold(): Promise<number> {
    return this.getNumberValue('login.fail_lock_threshold', 5)
  }

  /**
   * 获取登录锁定时长（分钟）
   */
  async getLoginLockDuration(): Promise<number> {
    return this.getNumberValue('login.lock_duration_minutes', 30)
  }

  /**
   * 获取会话超时时间（小时）
   */
  async getSessionTimeout(): Promise<number> {
    return this.getNumberValue('session.timeout_hours', 24)
  }

  /**
   * 获取最大会话数
   */
  async getMaxSessions(): Promise<number> {
    return this.getNumberValue('session.max_per_user', 5)
  }

  /**
   * 获取文件大小限制（MB）
   */
  async getFileSizeLimit(): Promise<number> {
    return this.getNumberValue('upload.file_size_limit_mb', 10)
  }

  /**
   * 获取 Excel 行数限制
   */
  async getExcelRowLimit(): Promise<number> {
    return this.getNumberValue('upload.excel_row_limit', 1000)
  }

  /**
   * 获取通知保留天数
   */
  async getNotificationRetentionDays(): Promise<number> {
    return this.getNumberValue('notification.retention_days', 30)
  }

  /**
   * 是否启用实验自动保存
   */
  async isAutoSaveEnabled(): Promise<boolean> {
    return this.getBooleanValue('experiment.auto_save_enabled', true)
  }

  /**
   * 获取自动保存间隔（秒）
   */
  async getAutoSaveInterval(): Promise<number> {
    return this.getNumberValue('experiment.auto_save_interval_seconds', 30)
  }

  /**
   * 获取允许的文件类型
   */
  async getAllowedFileTypes(): Promise<string[]> {
    return this.getJsonValue('upload.allowed_file_types', [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'jpg',
      'jpeg',
      'png',
      'gif',
    ])
  }

  /**
   * 获取成绩权重配置
   */
  async getDefaultWeightConfig(): Promise<Record<string, number>> {
    return this.getJsonValue('grading.default_weight_config', {
      stage1: 25,
      stage2: 25,
      stage3: 25,
      stage4: 25,
    })
  }
}

export const configRepository = new ConfigRepository()
