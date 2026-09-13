# DiaStage Visual & Copy System

2026-09-13 · Design Foundation & UI Hierarchy Pass

## Scope

Product Backbone remains **Venue → Build → Rehearse → Remount**. The three visible workspaces remain **置景 / 排演 / 复台**. Version / History / Journal are shared infrastructure. Dia remains the single theatre intelligence entry. This pass changes presentation and existing control access; it adds no product capabilities or asset types.

Sources: repository AGENTS.md, DIASTAGE_PRODUCT_BACKBONE_FREEZE_REPORT.md, the supplied 置景图例与操作指南, the installed 22-asset README and manifest, DIA_STAGE_LANGUAGE.md, and the current Design Foundation request. The latest request governs visual hierarchy; it does not replace the approved asset dimensions or materials.

## Color foundation

**Color marks uncertainty. Space carries the work.**

| Token | Value | Meaning |
| --- | --- | --- |
| Stage Ink | #171819 | Theatre, tools and structure |
| Rehearsal Ivory | #F2EEE5 | Script and rehearsal reading surfaces |
| Dia Blue | #243A52 | A proposal or preview awaiting human decision |
| Error Red | #B8453F | Invalid, destructive, collision or dangerous states |

The single color source is apps/editor/lib/visual-system.ts. The root layout exposes the same values as --dia-ink / --dia-ivory / --dia-blue / --dia-error. Three.js presentation uses the same constants. apps/editor/app/design-tokens.css defines semantic surfaces, borders, muted text, focus, spacing and typography. Neutral surfaces and translucent feedback derive from these colors; they do not introduce another primary brand color.

- Formal Scene: preserve the approved gray / white / beige matte asset materials. Ordinary selection uses neutral outlines and a very subtle tint. Tool axes can retain their established operational axis colors; they are not brand or proposal colors.
- Dia Proposal / Ghost: use Dia Blue in outlines or restrained highlights; blue on ivory for readable proposal text. Do not use a broad brand wash over the formal stage.
- Human Adopt: clear the temporary proposal presentation and display the committed object's neutral material. A surviving collision remains Error Red because its invalid state still exists.
- Error: red identifies the relevant invalid or destructive action. Do not use it for an ordinary active tab, loading state or selection.
- Focus and active navigation: neutral, with visible borders/text and non-color selection cues. Color alone does not identify a selected asset or button.

## Typography foundation

**Sans carries the system. Typewriter carries the rehearsal.**

| Role | Token and stack |
| --- | --- |
| UI and body | --dia-font-ui: Inter → Arial → bundled Source Han Sans SC → Microsoft YaHei → sans-serif |
| Short rehearsal notation | --dia-font-notation: Courier Prime → Courier New → bundled Source Han Sans SC → monospace |
| Caption / UI / body / title | 12 / 13 / 14 / 18px at the default root size |
| UI / body line height | 1.45 / 1.7 |

Source Han Sans SC is already bundled through next/font/local, with its existing license. Inter and Courier Prime are not bundled in this branch. Their named tokens and compatible fallbacks are intentional; this pass adds no font download or font package dependency. A later font integration should provide approved, licensed local WOFF2 files, retain swap loading, and verify Chinese/Latin weight, metrics and wrapping in production.

The .dia-notation class is opt-in. Use it only for short labels such as **DIA, PROPOSAL 01, SCENE 03, VERSION 04, REHEARSAL, GHOST, DIALOGUE, DIAGONAL, DIAGRAM, DIARY**, and equivalent short stage-note/version/rehearsal labels. It must not style long text, Dia conversation bodies, ordinary menus, property panels, forms or help document prose. Existing generic font-sans/font-mono/legacy UI aliases resolve to the UI stack; an old utility class must not turn a whole panel into typewriter text.

## Copy tone and authority

**AI proposes. The stage previews. Humans decide.**

Dia speaks briefly, clearly and with an action the user can take. It states its current interpretation and asks about ambiguity instead of claiming artistic authority.

| Moment | Preferred copy |
| --- | --- |
| Uncertain interpretation | 当前理解为…… / 你指的是…… |
| Before preview | 试一下 / 放到舞台上看看 / 在舞台上试试 |
| Ghost available | 采用 / 部分采用 / 修改 / 放弃 |
| Preview explanation | 先这样预演 |

Avoid “AI智能生成”, “一键完成”, “最优方案”, “AI决策”, “自动导演”. Show “部分采用” only where the existing flow supports selecting a subset. A preview action never silently adopts. A stale or invalid proposal must use the existing validation and confirmation rules. Technical facts remain available in secondary details without becoming the default conversation.

## UI hierarchy

- Top level: retain 置景 / 排演 / 复台. Keep Stage Viewer as the largest working region. Reduce navigation height and persistent floating helpers without a global visual redesign.
- Left Dock: use one content area for **资产 / 场景 / 属性**. Existing rehearsal and remount controls remain within this Dock. Scene objects and property controls are not permanently stacked as competing panels. Preserve the existing width, hide and lock behavior.
- Venue: an established venue can show a compact type-and-dimensions summary, such as 镜框式 · 10 × 8m. Expand the original editor when needed. The example does not redefine the current venue or overwrite its stored dimensions.
- Viewer: expose existing selection/move/rotation/scale access and snapping; keep mouse navigation help secondary. Follow the supplied UE5 main layout plus middle-button orbit. Unimplemented gizmo, pivot or shortcut behavior must be explicitly marked pending rather than represented by a working-looking button.
- Dia: default hierarchy is **DIA → conversation → current proposal → preview/primary action → input**. Retain the pinned Dia preview and deletable, scrolling records. Put evidence, model/debug status, internal identifiers, lineage, privacy/debug details and advanced version metadata behind closed details.
- Human Authority: showing or hiding details must not remove payloads, provenance, version data, receipts, persistence or the existing adopt/undo path.

## 22-asset scope

The installed library contains exactly 22 approved standard assets, using existing canonical IDs, thumbnails and manifest data. The display categories are **景片 / 门窗 / 台块 / 桌 / 椅凳 / 沙发**. These are menu labels; the underlying source categories and asset IDs retain their original meaning.

No new door/window type, runtime boolean, host/insert system, parametric wall, asset generator or new specification is introduced. Image browsing stays lightweight; confirmed placement loads the existing model. The approved dimensions, geometry, materials and dedicated folding controls are preserved.

## Verification and follow-up

Verified against the local production build at 127.0.0.1:4329 on 2026-09-13.

| Deliverable | Status | Practical limit |
| --- | --- | --- |
| DESIGN TOKENS | PASS | Foundation and the targeted workspace surfaces; not a whole-site migration |
| TYPOGRAPHY TOKENS | PASS | Bundled Source Han Sans SC confirmed in Chrome; Inter / Courier Prime use fallbacks |
| COPY NORMALIZATION | PARTIAL | Main Dia actions normalized; older help and stored conversation text are not exhaustively rewritten |
| LEFT DOCK HIERARCHY | PASS | One Assets / Scene / Properties Dock in all three workspaces |
| VENUE COMPACTION | PASS | Compact summary expands into the existing venue form |
| 22-ASSET LIBRARY UI | PASS | Existing 22 thumbnails and canonical assets, six display categories |
| VIEWER CONTROL CLEANUP | PARTIAL | Q / W use existing selection / movement; E / R focus existing property controls. Full rotation / scaling gizmos and Pivot remain pending |
| SELECTION VISUAL | PASS | Neutral outline and restrained tint; no approved asset material replacement |
| DIA PANEL HIERARCHY | PASS | Closed secondary details retain data; preview and human adoption stay separate |
| PRODUCT BACKBONE CHANGED | NO | Venue → Build → Rehearse → Remount |
| NEW PRODUCT CAPABILITIES | 0 | Existing controls and flows only |

Validation: 417 focused regression tests passed, 30 UI tests passed, all nine type-check tasks and all eight build tasks passed. Production browser checks cover the three workspaces, 22-asset browsing, Dock hide/lock/resize, Venue expansion, typography including actual Chinese glyph rendering, Dia preview/adoption/subset/discard, and Viewer input priority and camera navigation. The general layout check reported zero page or console errors at desktop size; desktop and 1100px layouts had no horizontal document overflow. Screenshots were inspected. Tests used disposable scenes and removed them afterward. The original scene remained at version 97 with its original graph hash.

Follow-up Visual Integration Pass: supply licensed local Inter and Courier Prime WOFF2 files and check their weights and wrapping; finish token/copy coverage in secondary legacy panels and help; refine narrow Dock property labels and compact Viewer tool wrapping; review remaining non-selection stage markers separately. Full gizmos, Pivot, independent rotation/scale snapping, and complete UE5 fly/Space behavior require a separate interaction adaptation pass and are not claimed as implemented here.

The companion Chinese acceptance report lists the files changed in this pass and production screenshots. Work remains on codex/mobile-voice-stage-link. Main was not edited; no merge or deployment was performed.

## 2026-09-13 后续交互调整

本节记录用户随后明确授权的交互修正，覆盖上面初次 Design Foundation 验收中的键位和列表布局描述。

- 普通舞台观察使用 WASD 在舞台水平面移动相机，Q 下降、E 上升；输入期间不抢键。旋转和缩放以带图标与字幕的工具入口呈现。未引入新一套建模 gizmo 或新工作区。
- 移除“整件移动”中央标记，点击真实物件表面选择整件并显示轻轮廓，可直接拖动表面移动。固定物件仍可见，但三维及平面不响应选择、框选或拖动；从舞台总览进入属性解锁。
- 资产卡片改为横行图、名称、尺寸；底部独立全宽加粗“选用”。总览双击进入属性。
- Dia 预演舞台按原比例铺满可用宽度；对话、当前提案与详情置于紧凑区域，舞台记录默认收起，打开后滚动浏览。
- 半透明、剖切、低位是现有景片/门窗的临时观察展示，不修改22资产原始材质、网格或存储尺寸。网格、测量、单位使用现有场景。
- 三维、原生平面和Dia拖动共用实时位置；移动中物件退出静态合批，取消恢复，松手采用已有事务保存。景片近边贴合不设置额外间距，重叠仍可放置并显示接触提示。
- 二联/三联折叠按用户最新要求扩至270°，平面与三维外端操作按15°步进；形状初始化保留位置。正式资产范围仍为22件，场地尺寸保持原数据。

本次交互验证结果单列于《DiaStage-交互优化验收》，不以此前version 97的快照代替当前场景校验。

## 2026-09-13 网格与操作布局补充

按用户后续明确要求：主工具栏移到左上；默认统一10厘米网格，Ctrl轻按并松开切换5/10/25/50厘米，工具栏末尾为特殊自由放置。网格/地面只改变显示；贴边默认关闭，开启后优先贴合真实景片边缘。二帘/三帘选中后有3/4个节点；整件移动与折叠保持板片尺寸，折叠15度步进。

旋转按钮启用右键左右拖动：围绕舞台竖直方向整件旋转，松手保存、Esc取消；鼠标不动不自动旋转。平面/分屏中WASD可与右键导航同时使用，指南针将视角居中归正。场地设置放在资产之前；总览置于独立下半区并可调整大小，覆盖此前单Dock的布局决定。

Dia三行推荐、最近20轮记录、星标收藏按当前用户要求实现；最近记录窗口不删除底层历史，收藏独立保留消息、构思和关联提案，重新讨论仍需人工采用。三个手动搭景预设复用22件标准资产，不扩展资产种类、工作区或AI能力。自定义场地沿用现有0.01–1000米校验，不把观察缩放当作场地改尺寸。
