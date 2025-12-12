/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '2.4.3',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-12 17:13',

  // 版本标签
  tag: 'V2升级版' as const,

  // 更新说明 (可选)
  changelog: 'fix: 算法验证正推 - 预计出厂扣减已实际出厂总量（剩余=下单-已出厂）',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
