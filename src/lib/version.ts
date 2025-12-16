/**
 * 版本信息配置
 *
 * ⚠️ 重要：每次代码更新时，Claude 必须自动更新此文件
 * 规则已写入 CLAUDE.md
 */

export const VERSION = {
  // 版本号 (语义化版本)
  number: '3.3.7',

  // 更新时间 (中国时区 CST/UTC+8)
  updatedAt: '2025-12-16 20:15',

  // 版本标签
  tag: 'V3模拟引擎 Phase 3' as const,

  // 更新说明 (可选)
  changelog: 'perf: 优化逆向排程审计查询性能，响应时间从5-8秒降至1-2秒',
}

// 格式化显示
export const getVersionDisplay = () => ({
  full: `v${VERSION.number}`,
  short: `v${VERSION.number.split('.').slice(0, 2).join('.')}`,
  date: `更新于 ${VERSION.updatedAt} CST`,
  tag: VERSION.tag,
})
