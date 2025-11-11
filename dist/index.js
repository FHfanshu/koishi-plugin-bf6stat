"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.name = void 0;
exports.apply = apply;
const node_buffer_1 = require("node:buffer");
const koishi_1 = require("koishi");
const canvas_1 = require("@napi-rs/canvas");
const API_ENDPOINT = 'https://api.gametools.network/bf6/stats/';
const PLATFORM_ALIASES = {
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
};
exports.name = 'bf6-stats';
exports.Config = koishi_1.Schema.object({
    defaultPlatform: koishi_1.Schema.union(['pc', 'ps', 'xbox']).default('pc').description('默认查询平台'),
    language: koishi_1.Schema.string().default('zh-CN').description('接口语言代码 (lang)'),
    accentColor: koishi_1.Schema.string().default('#2563eb').description('战绩卡片强调色 (十六进制颜色值)'),
    cardWidth: koishi_1.Schema.number().min(200).max(1200).default(800).description('战绩卡片宽度 (200-1200px)'),
    cardHeight: koishi_1.Schema.number().min(150).max(800).default(500).description('战绩卡片高度 (150-800px)'),
    primaryMetricColumns: koishi_1.Schema.number().min(1).max(8).default(6).description('主要指标网格列数 (1-8)'),
    secondaryMetricColumns: koishi_1.Schema.number().min(1).max(6).default(3).description('次要指标网格列数 (1-6)'),
    topWeaponsCount: koishi_1.Schema.number().min(0).max(10).default(3).description('显示的武器数量 (0-10, 0表示不显示)'),
    enableCache: koishi_1.Schema.boolean().default(false).description('启用图片缓存 (实验性功能)'),
});
function apply(ctx, config) {
    const logger = new koishi_1.Logger('bf6-stats');
    // Validate configuration
    validateConfig(config, logger);
    // Add process error handlers to prevent crashes
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
    ctx.command('bf6 <player:text> [platform]', '查询 Battlefield 6 玩家战绩')
        .alias('battlefield6')
        .usage('示例：bf6 playerName 或 bf6 playerName xbox')
        .action(async ({}, player, platform) => {
        if (!player) {
            return '请提供要查询的 EA ID。';
        }
        const resolvedPlatform = resolvePlatform(platform, config.defaultPlatform);
        if (!resolvedPlatform) {
            return '未知平台。可选：pc / ps / xbox。';
        }
        try {
            const stats = await fetchStats(ctx, player, resolvedPlatform, config.language);
            const buffer = await renderStatsCard(ctx, stats, {
                player,
                platform: resolvedPlatform,
                accentColor: config.accentColor,
                width: config.cardWidth,
                height: config.cardHeight,
                primaryMetricColumns: config.primaryMetricColumns,
                secondaryMetricColumns: config.secondaryMetricColumns,
                topWeaponsCount: config.topWeaponsCount,
                logger,
            });
            return koishi_1.h.image(buffer, 'image/png');
        }
        catch (error) {
            logger.warn(error);
            return error.message || '查询失败，请稍后重试。';
        }
    });
}
function validateConfig(config, logger) {
    // Validate accent color format
    if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(config.accentColor)) {
        logger.warn(`Invalid accentColor: ${config.accentColor}, using default #2563eb`);
        config.accentColor = '#2563eb';
    }
    // Validate language code format
    if (!config.language || config.language.length < 2) {
        logger.warn(`Invalid language: ${config.language}, using default zh-CN`);
        config.language = 'zh-CN';
    }
    // Log configuration summary
    logger.debug('Plugin configuration validated:', {
        platform: config.defaultPlatform,
        language: config.language,
        cardSize: `${config.cardWidth}x${config.cardHeight}`,
        primaryColumns: config.primaryMetricColumns,
        secondaryColumns: config.secondaryMetricColumns,
        topWeapons: config.topWeaponsCount,
    });
}
function resolvePlatform(input, fallback) {
    if (!input)
        return PLATFORM_ALIASES[fallback];
    const key = input.toLowerCase();
    return PLATFORM_ALIASES[key];
}
async function fetchStats(ctx, player, platform, language) {
    var _a, _b, _c, _d;
    try {
        const data = await ctx.http.get(API_ENDPOINT, {
            params: {
                name: player,
                platform,
                lang: language,
            },
            timeout: 15000 // 15 second timeout
        });
        if (!data || data.hasResults === false) {
            throw new Error('未找到该玩家的战绩。');
        }
        if (Array.isArray(data.errors) && data.errors.length) {
            throw new Error(data.errors[0] || '接口返回错误。');
        }
        return data;
    }
    catch (err) {
        if (err && typeof err === 'object' && 'response' in err) {
            const responseErr = err;
            if ((_c = (_b = (_a = responseErr === null || responseErr === void 0 ? void 0 : responseErr.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.errors) === null || _c === void 0 ? void 0 : _c.length) {
                throw new Error(responseErr.response.data.errors[0]);
            }
            if (((_d = responseErr === null || responseErr === void 0 ? void 0 : responseErr.response) === null || _d === void 0 ? void 0 : _d.status) === 404) {
                throw new Error('未找到该玩家的战绩。');
            }
        }
        throw new Error('请求统计数据时出错。');
    }
}
async function renderStatsCard(ctx, stats, options) {
    const { width, height } = options;
    // Validate dimensions to prevent memory issues
    const safeWidth = Math.min(Math.max(width, 200), 1200);
    const safeHeight = Math.min(Math.max(height, 150), 800);
    let canvas;
    let c;
    try {
        canvas = (0, canvas_1.createCanvas)(safeWidth, safeHeight);
        c = canvas.getContext('2d');
    }
    catch (error) {
        options.logger.error('Canvas creation failed:', error);
        throw new Error('无法创建图片，请检查服务器内存');
    }
    try {
        drawCardBackground(c, safeWidth, safeHeight, options.accentColor);
        // Load images with timeout and error handling
        const avatarPromise = loadRemoteImage(ctx, stats.avatar, options.logger);
        const rankImgPromise = loadRemoteImage(ctx, stats.rankImg, options.logger);
        const [avatar, rankImg] = await Promise.allSettled([avatarPromise, rankImgPromise])
            .then(results => results.map(result => result.status === 'fulfilled' ? result.value : null));
        const metricsStartY = drawHeaderSection(c, stats, options, avatar, rankImg);
        const primaryMetrics = buildPrimaryMetrics(stats);
        const primaryBottom = drawPrimaryMetricGrid(c, primaryMetrics, {
            startX: 40,
            startY: metricsStartY,
            width: safeWidth,
            accent: options.accentColor,
            columns: options.primaryMetricColumns,
        });
        const secondaryMetrics = buildSecondaryMetrics(stats);
        const secondaryBottom = drawSecondaryMetricGrid(c, secondaryMetrics, {
            startX: 40,
            startY: primaryBottom + 24,
            width: safeWidth,
            accent: options.accentColor,
            columns: options.secondaryMetricColumns,
        });
        await drawWeaponsSection(ctx, c, stats.weapons, {
            startX: 40,
            startY: secondaryBottom + 32,
            width: safeWidth,
            accent: options.accentColor,
            topCount: options.topWeaponsCount,
            logger: options.logger,
        });
        drawFooter(c, safeWidth, safeHeight);
        return canvas.toBuffer('image/png');
    }
    catch (error) {
        options.logger.error('Canvas rendering failed:', error);
        throw new Error('图片生成失败，请稍后重试');
    }
}
function drawCardBackground(c, width, height, accentColor) {
    const baseGradient = c.createLinearGradient(0, 0, 0, height);
    baseGradient.addColorStop(0, '#050b16');
    baseGradient.addColorStop(1, '#00040a');
    c.fillStyle = baseGradient;
    c.fillRect(0, 0, width, height);
    c.save();
    c.fillStyle = hexToRgba('#0f172a', 0.88);
    roundRect(c, 24, 24, width - 48, height - 48, 28);
    c.fill();
    const accentGradient = c.createLinearGradient(width * 0.4, 0, width, 0);
    accentGradient.addColorStop(0, hexToRgba(accentColor, 0.18));
    accentGradient.addColorStop(1, hexToRgba(accentColor, 0.04));
    c.fillStyle = accentGradient;
    roundRect(c, 24, 24, width - 48, height - 48, 28);
    c.fill();
    c.fillStyle = hexToRgba(accentColor, 0.22);
    c.beginPath();
    c.moveTo(width * 0.65, 24);
    c.lineTo(width - 24, 24);
    c.lineTo(width - 24, height * 0.5);
    c.closePath();
    c.fill();
    c.strokeStyle = hexToRgba('#1f2937', 0.45);
    c.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const x = 48 + i * ((width - 96) / 5);
        c.beginPath();
        c.moveTo(x, 24);
        c.lineTo(x - 40, height - 24);
        c.stroke();
    }
    c.restore();
}
function drawHeaderSection(c, stats, options, avatar, rankImg) {
    const paddingX = 56;
    let baselineY = 96;
    // Title badge
    c.save();
    c.fillStyle = hexToRgba(options.accentColor, 0.92);
    roundRect(c, paddingX, baselineY - 64, 84, 34, 12);
    c.fill();
    c.fillStyle = '#0b1220';
    c.font = 'bold 20px "Segoe UI", sans-serif';
    c.fillText('BF 6', paddingX + 14, baselineY - 40);
    c.restore();
    const avatarSize = 132;
    if (avatar) {
        drawRoundedImage(c, avatar, paddingX, baselineY - avatarSize + 12, avatarSize, avatarSize, 28);
    }
    const textX = avatar ? paddingX + avatarSize + 36 : paddingX;
    const playerName = stats.userName || stats.personaName || options.player;
    c.fillStyle = '#f8fafc';
    c.font = 'bold 54px "Microsoft YaHei", "Segoe UI", sans-serif';
    c.fillText(playerName, textX, baselineY + 4);
    c.fillStyle = '#94a3b8';
    c.font = '24px "Segoe UI", sans-serif';
    const rankTitle = formatRank(stats);
    const hoursPlayed = formatPlaytime(stats.secondsPlayed);
    const subtitle = `${rankTitle} ｜ 战斗时间: ${hoursPlayed}`;
    c.fillText(subtitle, textX, baselineY + 52);
    const platformTag = `平台: ${options.platform.toUpperCase()}`;
    c.fillStyle = '#cbd5f5';
    c.font = '22px "Segoe UI", sans-serif';
    c.fillText(platformTag, textX, baselineY + 88);
    if (rankImg) {
        const rankSize = 118;
        const rankX = options.width - rankSize - 72;
        const rankY = baselineY - rankSize + 24;
        drawRoundedImage(c, rankImg, rankX, rankY, rankSize, rankSize, 20);
    }
    else {
        c.fillStyle = hexToRgba(options.accentColor, 0.45);
        const rankX = options.width - 196;
        const rankY = baselineY - 78;
        roundRect(c, rankX, rankY, 152, 76, 18);
        c.fill();
        c.fillStyle = '#f1f5f9';
        c.font = 'bold 26px "Segoe UI", sans-serif';
        c.fillText(rankTitle, rankX + 28, rankY + 46);
    }
    c.strokeStyle = hexToRgba('#1e293b', 0.6);
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(paddingX, baselineY + 112);
    c.lineTo(options.width - paddingX, baselineY + 112);
    c.stroke();
    return baselineY + 132;
}
function buildPrimaryMetrics(stats) {
    var _a;
    return [
        {
            label: 'SPM',
            value: formatNumber(stats.scorePerMinute, 0),
            caption: '得分 / 分钟',
            highlight: true,
        },
        {
            label: 'K/D',
            value: formatNumber(stats.killDeath, 2),
            caption: `${formatPlainNumber(stats.kills)} 击杀 · ${formatPlainNumber(stats.deaths)} 死亡`,
        },
        {
            label: 'KPM',
            value: formatNumber(stats.killsPerMinute, 2),
            caption: '击杀 / 分钟',
        },
        {
            label: '胜率',
            value: stats.winPercent || calcWinRate(stats.wins, stats.loses),
            caption: `${formatPlainNumber(stats.wins)} 胜 · ${formatPlainNumber(stats.loses)} 负`,
        },
        {
            label: '对局',
            value: formatInteger(stats.matchesPlayed),
            caption: '已完成的比赛',
        },
        {
            label: '伤害',
            value: formatAbbreviated((_a = stats.damage) !== null && _a !== void 0 ? _a : stats.damageDealt),
            caption: '总伤害输出',
        },
    ];
}
function buildSecondaryMetrics(stats) {
    var _a;
    return [
        {
            label: '最佳兵种',
            value: stats.bestClassName || stats.bestClass || '未知',
            caption: '偏好职业',
            highlight: true,
        },
        {
            label: '命中率',
            value: stats.accuracy || calcAccuracy(stats.shotsHit, stats.shotsFired),
            caption: `${formatPlainNumber(stats.shotsHit)} 命中 / ${formatPlainNumber(stats.shotsFired)} 射击`,
        },
        {
            label: '爆头率',
            value: stats.headshotsPercent || calcRate(stats.headshots, stats.kills),
            caption: `${formatPlainNumber(stats.headshots)} 次爆头`,
        },
        {
            label: '近战击杀',
            value: formatInteger(stats.meleeKills),
            caption: `最高连杀 ${formatPlainNumber(stats.highestKillStreak)}`,
        },
        {
            label: '行程',
            value: formatDistance((_a = stats.distanceTraveled) !== null && _a !== void 0 ? _a : stats.distanceTravelled),
            caption: '战场位移',
        },
        {
            label: '总时间',
            value: formatDuration(stats.secondsPlayed),
            caption: '累计在线',
        },
    ];
}
function drawPrimaryMetricGrid(c, metrics, layout) {
    const columns = layout.columns;
    const contentWidth = layout.width - layout.startX * 2;
    const columnWidth = contentWidth / columns;
    const rowHeight = 122;
    let bottom = layout.startY;
    metrics.forEach((metric, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = layout.startX + col * columnWidth;
        const y = layout.startY + row * rowHeight;
        drawMetricPanel(c, x, y, columnWidth - 18, rowHeight - 16, metric, layout.accent, true);
        bottom = Math.max(bottom, y + rowHeight);
    });
    return bottom;
}
function drawSecondaryMetricGrid(c, metrics, layout) {
    const columns = layout.columns;
    const contentWidth = layout.width - layout.startX * 2;
    const columnWidth = contentWidth / columns;
    const rowHeight = 108;
    let bottom = layout.startY;
    metrics.forEach((metric, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = layout.startX + col * columnWidth;
        const y = layout.startY + row * rowHeight;
        drawMetricPanel(c, x, y, columnWidth - 20, rowHeight - 14, metric, layout.accent);
        bottom = Math.max(bottom, y + rowHeight);
    });
    return bottom;
}
function drawMetricPanel(c, x, y, width, height, metric, accentColor, emphasize = false) {
    c.save();
    const radius = emphasize ? 20 : 18;
    c.fillStyle = emphasize ? hexToRgba('#111c2d', 0.92) : hexToRgba('#0f172a', 0.88);
    roundRect(c, x, y, width, height, radius);
    c.fill();
    if (metric.highlight) {
        c.fillStyle = hexToRgba(accentColor, 0.3);
        roundRect(c, x, y, width, 8, radius, radius, 0, 0);
        c.fill();
    }
    c.fillStyle = '#94a3b8';
    c.font = '20px "Segoe UI", sans-serif';
    c.fillText(metric.label, x + 20, y + 38);
    c.fillStyle = '#f8fafc';
    c.font = emphasize ? 'bold 44px "Segoe UI", sans-serif' : 'bold 34px "Segoe UI", sans-serif';
    c.fillText(metric.value, x + 20, y + (emphasize ? 80 : 74));
    if (metric.caption) {
        c.fillStyle = '#cbd5f5';
        c.font = '18px "Segoe UI", sans-serif';
        c.fillText(metric.caption, x + 20, y + height - 18);
    }
    c.restore();
}
async function drawWeaponsSection(ctx, c, weapons, layout) {
    const candidates = (weapons || []).slice().sort((a, b) => Number(b.kills || 0) - Number(a.kills || 0));
    const topWeapons = candidates.slice(0, layout.topCount);
    if (!topWeapons.length || layout.topCount === 0)
        return;
    const rowHeight = 128;
    const contentWidth = layout.width - layout.startX * 2;
    const blockWidth = contentWidth;
    for (let index = 0; index < topWeapons.length; index++) {
        const weapon = topWeapons[index];
        const y = layout.startY + index * (rowHeight + 18);
        c.save();
        c.fillStyle = hexToRgba('#0f172a', 0.9);
        roundRect(c, layout.startX, y, blockWidth, rowHeight, 22);
        c.fill();
        c.fillStyle = hexToRgba(layout.accent, 0.35);
        roundRect(c, layout.startX, y, blockWidth, 8, 22, 22, 0, 0);
        c.fill();
        const padding = 26;
        const previewSize = 108;
        const weaponImg = await loadRemoteImage(ctx, weapon.image || weapon.altImage, layout.logger);
        if (weaponImg) {
            c.drawImage(weaponImg, layout.startX + padding, y + 10, previewSize, rowHeight - 20);
        }
        else {
            c.fillStyle = hexToRgba('#1e293b', 0.6);
            roundRect(c, layout.startX + padding, y + 16, previewSize, rowHeight - 32, 16);
            c.fill();
            c.fillStyle = '#64748b';
            c.font = '16px "Segoe UI", sans-serif';
            c.fillText('无武器预览', layout.startX + padding + 12, y + rowHeight / 2);
        }
        const textX = layout.startX + padding + previewSize + 36;
        const weaponLevel = Number(weapon.level || weapon.type) || index + 1;
        c.fillStyle = '#f1f5f9';
        c.font = 'bold 30px "Segoe UI", sans-serif';
        c.fillText(`${weapon.weaponName} Lv.${weaponLevel}`, textX, y + 48);
        c.fillStyle = '#cbd5f5';
        c.font = '20px "Segoe UI", sans-serif';
        const infos = [
            `击杀 ${formatPlainNumber(weapon.kills)}`,
            `KPM ${formatNumber(weapon.killsPerMinute, 2)}`,
            `命中率 ${weapon.accuracy || 'N/A'}`,
        ];
        c.fillText(infos.join(' · '), textX, y + 84);
        c.restore();
    }
    c.fillStyle = '#64748b';
    c.font = '18px "Segoe UI", sans-serif';
    c.fillText('武器统计 (Top 3)', layout.startX, layout.startY - 18);
}
function drawFooter(c, width, height) {
    c.save();
    c.strokeStyle = hexToRgba('#1f2937', 0.6);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(48, height - 96);
    c.lineTo(width - 48, height - 96);
    c.stroke();
    c.fillStyle = '#475569';
    c.font = '18px "Segoe UI", sans-serif';
    c.fillText('数据来源：api.gametools.network', 56, height - 58);
    c.fillText(`生成时间：${new Date().toLocaleString('zh-CN')}`, 56, height - 26);
    c.restore();
}
function roundRect(ctx, x, y, width, height, radiusTopLeft = 20, radiusTopRight = 20, radiusBottomRight = 20, radiusBottomLeft = 20) {
    ctx.beginPath();
    ctx.moveTo(x + radiusTopLeft, y);
    ctx.arcTo(x + width, y, x + width, y + height, radiusTopRight);
    ctx.arcTo(x + width, y + height, x, y + height, radiusBottomRight);
    ctx.arcTo(x, y + height, x, y, radiusBottomLeft);
    ctx.arcTo(x, y, x + width, y, radiusTopLeft);
    ctx.closePath();
}
function formatRank(stats) {
    if (stats.rankName)
        return stats.rankName;
    if (typeof stats.rank === 'number')
        return `#${stats.rank}`;
    return '未知';
}
function formatInteger(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('zh-CN');
}
function formatNumber(value, fractionDigits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num))
        return '0';
    return num.toFixed(fractionDigits);
}
function formatPlainNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num))
        return '0';
    return `${Math.round(num)}`;
}
function formatAbbreviated(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0)
        return '0';
    if (Math.abs(num) >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
}
function calcRate(part, total) {
    const partNum = Number(part) || 0;
    const totalNum = Number(total) || 0;
    if (!totalNum)
        return '0%';
    return `${((partNum / totalNum) * 100).toFixed(1)}%`;
}
function formatDistance(value) {
    const meters = Number(value);
    if (!Number.isFinite(meters) || meters <= 0)
        return '0m';
    if (meters >= 1000) {
        const km = meters / 1000;
        if (km >= 1000)
            return `${(km / 1000).toFixed(1)}k KM`;
        return `${km.toFixed(1)} KM`;
    }
    return `${Math.round(meters)} m`;
}
function formatPlaytime(seconds) {
    const total = Number(seconds) || 0;
    if (total <= 0)
        return '0小时';
    const hours = total / 3600;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainHours = Math.round(hours % 24);
        return `${days}天${remainHours ? `${remainHours}小时` : ''}`;
    }
    return `${hours.toFixed(0)}小时`;
}
function calcWinRate(wins, losses) {
    const win = Number(wins) || 0;
    const lose = Number(losses) || 0;
    const total = win + lose;
    if (!total)
        return '0%';
    return `${((win / total) * 100).toFixed(1)}%`;
}
function calcAccuracy(hits, shots) {
    const hit = Number(hits) || 0;
    const shot = Number(shots) || 0;
    if (!shot)
        return '0%';
    return `${((hit / shot) * 100).toFixed(1)}%`;
}
function formatDuration(seconds) {
    const total = Number(seconds) || 0;
    if (total <= 0)
        return '0h';
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const parts = [];
    if (days)
        parts.push(`${days}d`);
    if (hours)
        parts.push(`${hours}h`);
    if (!days && minutes)
        parts.push(`${minutes}m`);
    return parts.join(' ') || '0h';
}
function hexToRgba(hex, alpha = 1) {
    const parsed = hex.replace('#', '');
    let r = 0;
    let g = 0;
    let b = 0;
    if (parsed.length === 3) {
        r = parseInt(parsed[0] + parsed[0], 16);
        g = parseInt(parsed[1] + parsed[1], 16);
        b = parseInt(parsed[2] + parsed[2], 16);
    }
    else if (parsed.length >= 6) {
        r = parseInt(parsed.substring(0, 2), 16);
        g = parseInt(parsed.substring(2, 4), 16);
        b = parseInt(parsed.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
async function loadRemoteImage(ctx, url, logger) {
    if (!url)
        return null;
    try {
        // Add timeout and size limit for image loading
        const buffer = await ctx.http.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000 // 10 second timeout
        });
        const data = node_buffer_1.Buffer.from(buffer);
        // Validate image size (max 5MB)
        if (!data.length || data.length > 5 * 1024 * 1024) {
            logger.debug(`Image too large or empty: ${url}`);
            return null;
        }
        return await (0, canvas_1.loadImage)(data);
    }
    catch (error) {
        logger.debug(`加载图片失败: ${url}`, error);
        return null;
    }
}
function drawRoundedImage(ctx, image, x, y, width, height, radius) {
    ctx.save();
    roundRect(ctx, x, y, width, height, radius);
    ctx.clip();
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
}
