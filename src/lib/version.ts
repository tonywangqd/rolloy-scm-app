/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '3.10.1',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-19 15:30',

  // 版本标签
  tag: '性能优化' as const,

  // 更新说明 (可选)
  changelog: 'fix: 全面优化交货页面性能，修复日期选择器卡顿和页面重渲染问题',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
