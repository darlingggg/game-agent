# Phaser 2D 游戏模板

Vue 3 + Vite + Phaser.js 的简易 2D 游戏起点模板。

## 启动

```bash
pnpm install
pnpm dev
```

构建：

```bash
pnpm build
```

## 操作

1. 点击「开始游戏」
2. 使用 **WASD** 或 **方向键** 移动蓝色方块
3. 碰到金色圆点得分；分数显示在顶部 HUD

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/App.vue` | Vue 壳：Vant HUD + Phaser 容器与生命周期 |
| `src/game/createGame.js` | 创建 `Phaser.Game` |
| `src/game/scenes/MainScene.js` | 示例场景（移动 / 吃金币） |
| `style/index.css` | Tailwind 与 Vant 圆角变量 |

## 分层约定

- **Phaser / Canvas**：只负责游戏画面与玩法逻辑
- **Vue + Vant**：菜单、HUD、按钮等 DOM UI
