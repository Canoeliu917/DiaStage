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

当前产品约束以 PRODUCT.md 与本轮简化排演规格为准，旧阶段规划不再有效。

## 视觉与文字
沿用现有黑白灰、细边框、紧凑工作台，不增加装饰噪声。英文 Courier New，中文本地思源黑体。品牌词分别连续显示，白底黑字。人物颜色与复台警示色属于内容语义，均配文字或形状说明。

## 信息架构
顶部只有置景、排演、复台。左侧上半区为共享舞台总览，列出布景、人物和摄影机；下半区为可调大小的操作面板。
置景下为舞台与场地、布景调整、舞台库、舞台镜头、舞台口令。舞台库只分基础台面、景片与开口、平台与台阶、大型舞台布景、人物标记、舞台镜头。
排演默认模拟排演，显示独占第二行，观察与记录并排，排演版本固定最后。
复台保留六步：源场地、目标场地、空间标定、映射预览、实体落位、复台验收。

## 操作
人物设置只展示名称、颜色、位置、朝向、路线与时长。路线主要在舞台中表达。摄影机的复杂路径、跟随、采样与编码参数逐步展开。
二维、三维、分屏属于显示；导演、观众、机位属于观察。用户不编辑渲染器照明。
所有字段有中文含义与单位，错误和保存状态可读；旧数据读取失败时保留原文。
语音和剧本先显示方案，允许取消对象和修改尺寸、台位；只在确认后批量写入。剧本结果按“剧本明确写出 / 系统推测 / 需要确认”排列，窄屏纵向展开。上传同时提供文件选择和拖入，触控目标至少 44 像素。

## 布局验证
检查 1440×900、820×1180、1180×820、390×844。窄屏使用任务选择与可关闭抽屉，不让版本入口遮挡舞台。当前三入口验证记录在 THREE_ENTRY_IMPLEMENTATION.md，上一轮界面记录保留于 SIMPLIFIED_REHEARSAL.md。
