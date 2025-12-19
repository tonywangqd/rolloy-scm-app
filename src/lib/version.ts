/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '3.13.0',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-19 23:10',

  // 版本标签
  tag: '新功能' as const,

  // 更新说明 (可选)
  changelog: 'feat: 发运单创建页面添加快速新增仓库功能，可直接在创建发运单时添加目的仓库',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
