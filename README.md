# koishi-plugin-bf6-stats

Koishi 插件：查询 **Battlefield 6** 玩家战绩并返回图片战绩卡片。

## 安装

```bash
npm install koishi-plugin-bf6-stats
pnpm install koishi-plugin-bf6-stats
yarn add koishi-plugin-bf6-stats
```

> 依赖：Node.js ≥ 18、Koishi ≥ 4.15。

安装完成后运行一次构建将 TypeScript 编译为 `dist/`：

```bash
npm run build
```

## 配置

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| defaultPlatform | `pc` | 默认查询平台（pc / ps / xbox） |
| language | `zh-CN` | 接口语言代码（传递给 Gametools API 的 `lang` 参数） |
| accentColor | `#2563eb` | 战绩卡片强调色 |
| cardWidth | `940` | 战绩卡片宽度 |
| cardHeight | `520` | 战绩卡片高度 |

## 用法

调用 `bf6` 指令即可获取图片形式的战绩卡片：

```
bf6 dannyonpc
bf6 dannyonpc xbox
```

若用户未指定平台，则使用配置中的默认平台。

## 接口说明

本插件使用 [Gametools Network](https://api.gametools.network/docs) Battlefield 6 相关接口，例如 `GET /bf6/stats/`。请确认玩家战绩已公开，否则 API 将返回空结果。

## 许可

MIT
