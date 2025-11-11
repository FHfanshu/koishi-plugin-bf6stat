import { Buffer } from 'node:buffer'
import { Context, Schema, Logger, h } from 'koishi'
import { createCanvas, loadImage, CanvasRenderingContext2D, Image } from '@napi-rs/canvas'

const API_ENDPOINT = 'https://api.gametools.network/bf6/stats/'

const PLATFORM_ALIASES: Record<string, 'pc' | 'ps' | 'xbox'> = {
  pc: 'pc',
  steam: 'pc',
  origin: 'pc',
  playstation: 'ps',
  ps: 'ps',
  psn: 'ps',
  ps4: 'ps',
  ps5: 'ps',
  xbox: 'xbox',
  xbl: 'xbox',
  xb: 'xbox',
  xboxone: 'xbox',
  xboxseries: 'xbox',
}

export const name = 'bf6-stats'

export interface Config {
  defaultPlatform: 'pc' | 'ps' | 'xbox'
  language: string
  accentColor: string
  cardWidth: number
  cardHeight: number
}

export const Config: Schema<Config> = Schema.object({
  defaultPlatform: Schema.union(['pc', 'ps', 'xbox']).default('pc').description('默认查询平台'),
  language: Schema.string().default('zh-CN').description('接口语言代码 (lang)'),
  accentColor: Schema.string().default('#2563eb').description('战绩卡片强调色'),
  cardWidth: Schema.number().default(940).description('战绩卡片宽度'),
  cardHeight: Schema.number().default(520).description('战绩卡片高度'),
})

export function apply(ctx: Context, config: Config) {
  const logger = new Logger('bf6-stats')

  ctx.command('bf6 <player:text> [platform]', '查询 Battlefield 6 玩家战绩')
    .alias('battlefield6')
    .usage('示例：bf6 playerName 或 bf6 playerName xbox')
    .action(async ({}, player?: string, platform?: string) => {
      if (!player) {
        return '请提供要查询的 EA ID。'
      }

      const resolvedPlatform = resolvePlatform(platform, config.defaultPlatform)
      if (!resolvedPlatform) {
        return '未知平台。可选：pc / ps / xbox。'
      }

      try {
        const stats = await fetchStats(ctx, player, resolvedPlatform, config.language)
        const buffer = await renderStatsCard(ctx, stats, {
          player,
          platform: resolvedPlatform,
          accentColor: config.accentColor,
          width: config.cardWidth,
          height: config.cardHeight,
          logger,
        })
        return h.image(buffer, 'image/png')
      } catch (error) {
        logger.warn(error)
        return (error as Error).message || '查询失败，请稍后重试。'
      }
    })
}

function resolvePlatform(input: string | undefined, fallback: Config['defaultPlatform']) {
  if (!input) return PLATFORM_ALIASES[fallback]
  const key = input.toLowerCase()
  return PLATFORM_ALIASES[key]
}

interface BattlefieldStats {
  hasResults?: boolean
  errors?: string[]
  avatar?: string
  userName?: string
  personaName?: string
  rank?: number
  rankName?: string
  rankImg?: string
  weapons?: BattlefieldWeapon[]
  secondsPlayed?: number
  kills?: number
  deaths?: number
  killDeath?: number
  killsPerMinute?: number
  wins?: number
  loses?: number
  winPercent?: string
  accuracy?: string
  shotsHit?: number
  shotsFired?: number
}

interface BattlefieldWeapon {
  type?: string
  weaponName: string
  image?: string
  altImage?: string
  kills?: number
  killsPerMinute?: number
  accuracy?: string
}

async function fetchStats(ctx: Context, player: string, platform: string, language: string) {
  try {
    const data = await ctx.http.get<BattlefieldStats>(API_ENDPOINT, {
      params: {
        name: player,
        platform,
        lang: language,
      },
    })

    if (!data || data.hasResults === false) {
      throw new Error('未找到该玩家的战绩。')
    }

    if (Array.isArray(data.errors) && data.errors.length) {
      throw new Error(data.errors[0] || '接口返回错误。')
    }

    return data
  } catch (err: any) {
    if (err?.response?.data?.errors?.length) {
      throw new Error(err.response.data.errors[0])
    }
    if (err?.response?.status === 404) {
      throw new Error('未找到该玩家的战绩。')
    }
    throw new Error('请求统计数据时出错。')
  }
}

interface RenderOptions {
  player: string
  platform: string
  accentColor: string
  width: number
  height: number
  logger: Logger
}

async function renderStatsCard(ctx: Context, stats: BattlefieldStats, options: RenderOptions) {
  const { width, height } = options
  const canvas = createCanvas(width, height)
  const c = canvas.getContext('2d')

  const gradient = c.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#0f172a')
  gradient.addColorStop(1, '#020617')
  c.fillStyle = gradient
  c.fillRect(0, 0, width, height)

  c.fillStyle = hexToRgba(options.accentColor, 0.25)
  c.beginPath()
  c.moveTo(width, 0)
  c.lineTo(width, height * 0.6)
  c.lineTo(width * 0.55, height * 0.3)
  c.closePath()
  c.fill()

  const avatarSize = 140
  const avatar = await loadRemoteImage(ctx, stats.avatar, options.logger)
  if (avatar) {
    drawRoundedImage(c, avatar, 40, 40, avatarSize, avatarSize, 28)
  }

  c.fillStyle = '#e2e8f0'
  c.font = 'bold 46px "Segoe UI", sans-serif'
  const title = (stats.userName || stats.personaName || options.player).toUpperCase()
  c.fillText(title, 40 + (avatar ? avatarSize + 24 : 0), 94)

  c.font = '24px "Segoe UI", sans-serif'
  c.fillStyle = '#94a3b8'
  const subtitle = `Platform: ${options.platform.toUpperCase()}  ·  Rank: ${formatRank(stats)}`
  c.fillText(subtitle, 40 + (avatar ? avatarSize + 24 : 0), 136)

  const rankImg = await loadRemoteImage(ctx, stats.rankImg, options.logger)
  if (rankImg) {
    const rankSize = 120
    c.drawImage(rankImg, width - rankSize - 40, 40, rankSize, rankSize)
  }

  const metrics = buildMetrics(stats)
  const gridLeft = 40
  const gridTop = 190
  const gridColWidth = (width - gridLeft * 2) / 3
  const gridRowHeight = 86

  metrics.forEach((metric, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = gridLeft + col * gridColWidth
    const y = gridTop + row * gridRowHeight
    drawMetricBlock(c, x, y, gridColWidth - 30, gridRowHeight - 22, metric, options.accentColor)
  })

  const topWeapon = pickTopWeapon(stats.weapons)
  if (topWeapon) {
    await drawWeaponBlock(ctx, c, topWeapon, {
      x: 40,
      y: height - 140,
      width: width - 80,
      height: 100,
      accent: options.accentColor,
      logger: options.logger,
    })
  }

  c.fillStyle = '#64748b'
  c.font = '18px "Segoe UI", sans-serif'
  c.fillText(`数据来源: api.gametools.network · 生成时间: ${new Date().toLocaleString()}`, 40, height - 24)

  return canvas.toBuffer('image/png')
}

interface Metric {
  label: string
  value: string
}

function buildMetrics(stats: BattlefieldStats): Metric[] {
  return [
    { label: '时间', value: formatDuration(stats.secondsPlayed) },
    { label: '击杀', value: formatInteger(stats.kills) },
    { label: '死亡', value: formatInteger(stats.deaths) },
    { label: 'K/D', value: formatNumber(stats.killDeath, 2) },
    { label: 'KPM', value: formatNumber(stats.killsPerMinute, 2) },
    { label: '胜场', value: formatInteger(stats.wins) },
    { label: '败场', value: formatInteger(stats.loses) },
    { label: '胜率', value: stats.winPercent || calcWinRate(stats.wins, stats.loses) },
    { label: '命中率', value: stats.accuracy || calcAccuracy(stats.shotsHit, stats.shotsFired) },
  ]
}

function drawMetricBlock(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, metric: Metric, accentColor: string) {
  c.save()
  c.fillStyle = hexToRgba('#1e293b', 0.85)
  roundRect(c, x, y, width, height, 16)
  c.fill()

  c.fillStyle = hexToRgba(accentColor, 0.45)
  roundRect(c, x, y, width, 6, 16, 16, 0, 0)
  c.fill()

  c.fillStyle = '#94a3b8'
  c.font = '20px "Segoe UI", sans-serif'
  c.fillText(metric.label, x + 18, y + height / 2 - 6)

  c.fillStyle = '#f8fafc'
  c.font = 'bold 30px "Segoe UI", sans-serif'
  c.fillText(metric.value, x + 18, y + height / 2 + 30)
  c.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radiusTopLeft = 10, radiusTopRight = 10, radiusBottomRight = 10, radiusBottomLeft = 10) {
  ctx.beginPath()
  ctx.moveTo(x + radiusTopLeft, y)
  ctx.arcTo(x + width, y, x + width, y + height, radiusTopRight)
  ctx.arcTo(x + width, y + height, x, y + height, radiusBottomRight)
  ctx.arcTo(x, y + height, x, y, radiusBottomLeft)
  ctx.arcTo(x, y, x + width, y, radiusTopLeft)
  ctx.closePath()
}

interface WeaponLayout {
  x: number
  y: number
  width: number
  height: number
  accent: string
  logger: Logger
}

async function drawWeaponBlock(ctx: Context, c: CanvasRenderingContext2D, weapon: BattlefieldWeapon, layout: WeaponLayout) {
  c.save()
  c.fillStyle = hexToRgba('#1e293b', 0.82)
  roundRect(c, layout.x, layout.y, layout.width, layout.height, 18)
  c.fill()

  c.fillStyle = hexToRgba(layout.accent, 0.35)
  roundRect(c, layout.x, layout.y, layout.width, 6, 18, 18, 0, 0)
  c.fill()

  const padding = 24
  const textX = layout.x + padding + 96

  const weaponImg = await loadRemoteImage(ctx, weapon.image || weapon.altImage, layout.logger)
  if (weaponImg) {
    c.drawImage(weaponImg, layout.x + padding, layout.y + 10, 96, layout.height - 20)
  }

  c.fillStyle = '#f1f5f9'
  c.font = 'bold 28px "Segoe UI", sans-serif'
  c.fillText(`主武器：${weapon.weaponName}`, textX, layout.y + 46)

  c.fillStyle = '#cbd5f5'
  c.font = '20px "Segoe UI", sans-serif'
  const statsLine = `击杀 ${formatInteger(weapon.kills)} · 击杀/分钟 ${formatNumber(weapon.killsPerMinute, 2)} · 命中率 ${weapon.accuracy || 'N/A'}`
  c.fillText(statsLine, textX, layout.y + 82)

  c.restore()
}

function pickTopWeapon(weapons: BattlefieldWeapon[] = []): BattlefieldWeapon | undefined {
  const sorted = weapons.filter((w) => Number(w.kills) > 0).sort((a, b) => Number(b.kills) - Number(a.kills))
  return sorted.length ? sorted[0] : weapons[0]
}

function formatRank(stats: BattlefieldStats) {
  if (stats.rankName) return stats.rankName
  if (typeof stats.rank === 'number') return `#${stats.rank}`
  return '未知'
}

function formatInteger(value: number | undefined) {
  const num = Number(value) || 0
  return num.toLocaleString('zh-CN')
}

function formatNumber(value: number | undefined, fractionDigits = 2) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toFixed(fractionDigits)
}

function calcWinRate(wins: number | undefined, losses: number | undefined) {
  const win = Number(wins) || 0
  const lose = Number(losses) || 0
  const total = win + lose
  if (!total) return '0%'
  return `${((win / total) * 100).toFixed(1)}%`
}

function calcAccuracy(hits: number | undefined, shots: number | undefined) {
  const hit = Number(hits) || 0
  const shot = Number(shots) || 0
  if (!shot) return '0%'
  return `${((hit / shot) * 100).toFixed(1)}%`
}

function formatDuration(seconds: number | undefined) {
  const total = Number(seconds) || 0
  if (total <= 0) return '0h'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (!days && minutes) parts.push(`${minutes}m`)
  return parts.join(' ') || '0h'
}

function hexToRgba(hex: string, alpha = 1) {
  const parsed = hex.replace('#', '')
  let r = 0
  let g = 0
  let b = 0

  if (parsed.length === 3) {
    r = parseInt(parsed[0] + parsed[0], 16)
    g = parseInt(parsed[1] + parsed[1], 16)
    b = parseInt(parsed[2] + parsed[2], 16)
  } else if (parsed.length >= 6) {
    r = parseInt(parsed.substring(0, 2), 16)
    g = parseInt(parsed.substring(2, 4), 16)
    b = parseInt(parsed.substring(4, 6), 16)
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

async function loadRemoteImage(ctx: Context, url: string | undefined, logger: Logger) {
  if (!url) return null
  try {
    const buffer = await ctx.http.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
    const data = Buffer.from(buffer)
    if (!data.length) return null
    return await loadImage(data)
  } catch (error) {
    logger.debug(`加载图片失败: ${url}`)
    return null
  }
}

function drawRoundedImage(ctx: CanvasRenderingContext2D, image: Image, x: number, y: number, width: number, height: number, radius: number) {
  ctx.save()
  roundRect(ctx, x, y, width, height, radius)
  ctx.clip()
  ctx.drawImage(image, x, y, width, height)
  ctx.restore()
}
