/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '3.14.0',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-19 15:23',

  // 版本标签
  tag: '新功能' as const,

  // 更新说明 (可选)
  changelog: '发运单模块全面优化：修复报关费用计算、添加预计发运日期功能、新增目的仓库快捷添加、草稿保存功能',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
