/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '3.10.0',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-19 15:00',

  // 版本标签
  tag: '待发货摘要' as const,

  // 更新说明 (可选)
  changelog: 'feat: 在发货管理页面添加剩余预计发货摘要功能；fix: 修复采购模块类型错误',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
