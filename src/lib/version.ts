/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '1.12.0',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-05 18:20',

  // 版本标签
  tag: '正式版' as const,

  // 更新说明 (可选)
  changelog: '1.算法审计表Hover Tooltip交互 2.采购交货记录编辑页面',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
