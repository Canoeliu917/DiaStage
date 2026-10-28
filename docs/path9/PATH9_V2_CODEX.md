# DiaStage PATH9-V2 · Codex 系统冲 ≥9.0

基线：[PR #4](https://github.com/Canoeliu917/DiaStage/pull/4) @ `c2691e6` · 现评 ≈7.6 → 目标每维 ≥9、电脑六维加权 ≥9.0。

机读：`PATH9_V2_CODEX.json` · 开场指令：`PATH9_V2_CODEX_PROMPT.txt`

## 字体硬锁（必须）

```
--dia-font-ui: var(--font-dia-latin), var(--font-huiwen-mincho), var(--font-source-han-sans), "Microsoft YaHei", serif;
```

- 英文：Courier New / `--font-dia-latin`
- 中文：汇文明朝 + 思源黑体（`apps/editor/app/fonts/...`）
- **禁止** Inter / Roboto / 以 Geist 或 system-ui 替换主栈 / 删除汇文或思源

## 三轴（热门 AI 站 → 戏剧站）

| 轴 | 模仿 | 落到咫台 |
| --- | --- | --- |
| 智能化 | Perplexity 脚注、Claude 先预览后写入、豆包任务卡预填 | AI1–AI2：预填卡、三级证据脚注、Ghost 确认 |
| 便捷化 | ChatGPT Composer、发送↔停止、失败留稿 | AI3：+ / 输入 / 发送≤3；Stop；重试 |
| 简洁化 | Kimi 低密度、弱化 chrome | L1–L2、F1、S1：收侧栏、顶栏溢出、藏 VGRS、降对比 |

## 任务一览

| id | 做什么 | 主要抬分 |
| --- | --- | --- |
| FONT1 | 锁定个性字体栈 | 防回归 |
| N1 | 夜场舞台真正压暗 | color |
| T1 | 正文 14px / 线高≥1.5，控件仍 32px | color |
| L1 | 首访默认收 DIA，舞台≥60% 体感 | layout |
| L2 | 顶栏常驻≤3，其余进 ··· | layout/tools |
| F1 | 藏 V/G/R/S 字母 | tools |
| C1 | 道具卡高 72–80px，仍 21 件 | nav/layout |
| AI1 | 任务卡预填 Composer | empty/input |
| AI2 | 审阅脚注三级 + 可取消 | input |
| AI3 | Composer 三件套 + Stop | input |
| S1 | chrome 默认降对比 | layout/tools |
| S2 | 三步条可关 | empty |
| H1 | reduced-motion 实测 | color |
| G1 | 32px 误点人工记 | tools |
| GATE | 分数表 + 生手 5 分钟 | 总闸 |

## 报 9 分规则

电脑六维（layout/color/nav/empty/input/tools）**每一项 ≥9.0**，加权（原权重重归一化，排除 mobile）**≥9.0**；FONT1 未破；GATE 过。移动端暂缓不否决本轮。

## 2026-10-28 执行检查点

当前 12 项 done；N1、AI3 的最后修正待浏览器确认，GATE 待保存及五分钟复测。源码为 `74cf3f7`，已构建实测版本为 `e7264823`。未报告 ≥9；逐项证据和跨电脑下一步见 [验收与交接](PATH9_V2_ACCEPTANCE.md)。原始目标与要求保留，未降低总闸。
