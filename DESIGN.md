---
name: "咫台"
description: "DiaStage: Theatre Rehearsal & Stage Previs"
colors:
  stage: "#111111"
  brand-bar: "#101010"
  control: "#202020"
  control-raised: "#2b2b2b"
  control-hover: "#3b3b3b"
  control-border: "#494949"
  stage-text: "#ededed"
  muted-text: "#b5b5b5"
  selection: "#e5e5e5"
  selection-ink: "#141414"
  workspace-selection: "#f0f0f0"
  archive: "#f2f2f2"
  archive-ink: "#1a1a1a"
  archive-action: "#191919"
  identity-text: "#f5f5f5"
typography:
  brand:
    fontFamily: 'var(--font-diastage)'
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: ".06em"
  display:
    fontFamily: 'var(--font-diastage)'
    fontSize: "42px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: ".04em"
  title:
    fontFamily: 'var(--font-diastage)'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: ".03em"
  body:
    fontFamily: 'var(--font-diastage)'
    fontSize: "13px"
    lineHeight: 1.6
  label:
    fontFamily: 'var(--font-diastage)'
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  archive-action: "3px"
  control: "4px"
  overlay: "6px"
spacing:
  tight: "6px"
  control-gap: "8px"
  inset: "12px"
  panel-inline: "18px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.archive-action}"
    textColor: "{colors.identity-text}"
    rounded: "{rounded.archive-action}"
    padding: "12px 22px"
  button-secondary:
    backgroundColor: "{colors.control-raised}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  input-camera:
    backgroundColor: "{colors.control}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "7px 8px"
  nav-workspace:
    backgroundColor: "{colors.workspace-selection}"
    textColor: "{colors.stage}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  chip-status:
    rounded: "{rounded.archive-action}"
    padding: "3px 6px"
  card-shot:
    backgroundColor: "{colors.control}"
    textColor: "{colors.stage-text}"
    rounded: "{rounded.control}"
    padding: "12px"
  brand-lockup:
    textColor: "{colors.identity-text}"
---

# Design System: 咫台 DiaStage

当前产品约束以 PRODUCT.md 的产品骨架及四项品牌能力补充为准；本轮证据见 DIASTAGE_PRODUCT_BACKBONE_INTEGRATION_REPORT.md。下列原有设计记录保留，最新增量以文末记录为准。

## 视觉与文字
沿用现有黑白灰、细边框、紧凑工作台，不增加装饰噪声。英文 Courier New，中文本地思源黑体。品牌词分别连续显示，白底黑字。人物颜色与复台警示色属于内容语义，均配文字或形状说明。

## 信息架构
顶部只有置景、排演、复台。左侧上半区为共享舞台总览，列出布景、人物和摄影机；下半区为可调大小的操作面板。
置景下为舞台与场地、布景调整、舞台库、舞台镜头。舞台口令统一进入 Dia，不再并列一套 AI 主入口。舞台库只分基础台面、景片与开口、平台与台阶、大型舞台布景、人物标记、舞台镜头。
排演默认模拟排演，显示独占第二行，观察与记录并排，排演版本固定最后。
复台保留六步：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。

## 操作
Suggest, Preview, Decide. AI proposes. The stage previews. Humans decide.
AI 提议。舞台先演。人来决定。每次修改建议都重新预览；预览失效后清除 Ghost 并停止采用，保留手动排演和保存。
人物设置只展示名称、颜色、位置、朝向、路线与时长。路线主要在舞台中表达。摄影机的复杂路径、跟随、采样与编码参数逐步展开。
二维、三维、分屏属于显示；导演、观众、机位属于观察。用户不编辑渲染器照明。
所有字段有中文含义与单位，错误和保存状态可读；旧数据读取失败时保留原文。
语音和剧本先显示方案，允许取消对象和修改尺寸、台位；只在确认后批量写入。剧本结果按“剧本明确写出 / 系统推测 / 需要确认”排列，窄屏纵向展开。上传同时提供文件选择和拖入，触控目标至少 44 像素。

## 布局验证
检查 1440×900、820×1180、1180×820、390×844。窄屏使用任务选择与可关闭抽屉，不让版本入口遮挡舞台。当前三入口验证记录在 THREE_ENTRY_IMPLEMENTATION.md，上一轮界面记录保留于 SIMPLIFIED_REHEARSAL.md。

## Overview

V0.1 沿用黑白灰、英文 Courier New、中文思源黑体与现有紧凑工作台。排演从默认简单模式进入；专业模式逐步展示精确站位与分析依据，两种模式共享同一份正式排演数据。

## Layout

Dia Core 优先于设备界面。Web/Desktop 为完整参考实现；Tablet 只在同一 Web 应用上调整布局；Phone 仅呈现 Dia 与 Remote。跨端适配共享 Interaction、Proposal、SceneVersion 与 Ghost/人工确认状态，不新增设备专属智能逻辑或采用权限。

桌面保留舞台总览与操作面板的上下分区，模拟排演顶部提供“保存 / 查看版本”。Dia 改为舞台右侧独立分栏，输入区固定在分栏底部；不覆盖舞台。平板展开 Dia 时先收起左栏，用户可重新展开。手机默认轻量对话与远控，完整编辑器仍为次级入口。

## Components

- **模式与分析：** 简单模式保留直接可读的排演控制，专业模式增加精确位置与“专业分析与版本信息”折叠区；置信度标为模型自评，不能写成正确率。
- **AI 伙伴：** 选段和补充输入之后展示方案卡及依据，支持“预览”“修改”“采用 / 采用一部分 / 调整后采用”“不成立”。采用需先通过预览，正式修改可撤销；预览本身不改正式排演。
- **Ghost：** 三维建议人物为深灰（#222222）、40% 不透明度，建议路线为深灰虚线（#333333）。数字标签用深灰底、白字、1px 白边，交替上移 42 / 68px；面板“预览编号”列出编号与人物名称。二维使用带虚线边缘的编号圆点和虚线路线。预览提供显隐、播放 / 暂停、复位、清除与进度控制。
- **输入与触控：** AI 伙伴按钮与输入控件最小高度为 44px，勾选项整行提供触控空间；多行输入字号为 16px，可纵向调整且最高为 40dvh。触控设备保留底部安全区间距。
- **私有反馈：** “私有反馈与训练授权”折叠区明确记录保存在当前浏览器；训练授权默认关闭、可撤销，并提供导出与删除。导出提示包含私有原文；删除仅针对本机反馈。

## Do's and Don'ts

- **Do** 保留建议、正式排演、模型分析之间的可见区别，以编号、虚线和文字图例共同识别预览。
- **Don't** 将合成建议演示标为真实 API 结果，或将截图审查结论写成真机验收。

本轮独立 UI 图片审查结论为 ship，原三项修复全部 resolved。最新 Ghost 证据为 `.impeccable/review/v01/desktop.png`、`tablet.png`、`mobile.png`；各尺寸的 `-entry`、`-simple`、`-professional`、`-analysis` 为上一轮入口与模式证据，人物位置不用于与最新 Ghost 逐像素对比。截图中的建议均为合成演示，非真实 API。当前 publicBeta 尚未 ready：Gold Alpha 20、真实模型人工审核、各平台真机与独立用户验收尚未完成；剩余 30 个维度等待产品定义，不阻塞工程开发；完整边界保留于 REHEARSAL_INTELLIGENCE_V01.md。

## Dia Conversation Layer · 2026-09-12

当前首页是浅灰纸面上的 Dia 对话入口，工作台内的 Dia 为深灰分栏。沿用英文 Courier New / 中文思源黑体与黑白灰；输入字号16px保证移动端可读，触控区至少44px。普通模式只显示处理方向、行动和“为什么”；专业模式在同一份数据上增加依据和精确值。角色/舞台事实与模型可能解释分开呈现，合成示例固定标明“演示数据 · 非真实模型输出”。

桌面 Dia 宽370px，平板330px；平板展开Dia时默认收起左栏，用户仍可手动打开。人物与舞台视窗不被聊天覆盖。手机远控采用明确的浅底深字，SVG小舞台使用深底浅字。首页主CTA之后立即排列继续排演、剧本、舞台、扫描轻入口；首屏不加载完整Viewer，录音按需加载。

本轮检测为0 anti-patterns、43条旧调色/字号表的非阻断advisory；这些浅/深纸面灰阶与16px输入为本轮有意的可读性扩展。独立截图复核修复了手机浅底浅字、平板人物裁切和手机轻入口过低三项；一次修正后结论ship。证据改见 `.impeccable/review/conversation/`。这些是浏览器模拟，不是实际设备或模型质量验收。完整状态见 DIA_CONVERSATION_LAYER.md。

## 产品骨架与品牌对齐 · 2026-09-12

Dia 在置景、排演和复台使用同一个对话分栏与 Thread。首页首屏只讲用途；Dialogue / Diagonal / Diagram / Diary 放在折叠产品说明，不增加颜色、页面、导航或四套数据。工程模块保持原名。

Build 先显示完整场地中的布景 Ghost，允许改尺寸与台位后重新预演，再明确采用；手动搭台入口继续保留。专业模式可显示场地、布景、人物、路线和建议预览图层，显示开关不改正式数据。版本只读查看与恢复分离，复台可切原版本、目标方案及叠加对比；历史结构不匹配时明确阻止应用，保护当前场景。
