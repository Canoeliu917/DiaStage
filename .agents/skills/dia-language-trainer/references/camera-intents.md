# Dia Camera/View Intent Reference

This file is the canonical semantic reference for the first Dia language-learning domain.

## Core distinction

Dia must not collapse these two user intents:

| User intent | Canonical label | Meaning |
|---|---|---|
| “从上面看一下” | `elevated_perspective` | Raise/reorient the camera and look downward while staying in the normal 3D perspective experience. |
| “从俯视图角度看一下” | `top_orthographic` | Switch to the product's canonical top/plan view, normally orthographic. |

The semantic distinction is **camera movement/orientation vs view mode**.

## Intent taxonomy

### `top_orthographic`

Use when the user explicitly asks for a top/plan representation.

High-confidence phrases:

- 俯视图
- 顶视图
- 平面图
- 正上方视图
- 从正上方看
- 从正上方看整个舞台
- 切到俯视图
- 切到顶视图
- 看一下平面图
- top view
- plan view

Do not require clarification for these unless the target itself is ambiguous.

### `elevated_perspective`

Use when the user wants a higher camera or a downward-looking 3D view without explicitly requesting a plan/top view mode.

High-confidence phrases:

- 从上面看一下
- 从高一点看
- 镜头高一点
- 镜头抬高一点
- 把视角抬高
- 从观众席上方看看
- 高一点往下看

Default projection remains perspective.

### `tilt_down`

Use when the user changes pitch/orientation without materially moving to a top viewpoint.

Examples:

- 往下看一点
- 镜头往下压一点
- 再俯一点
- 视角往下转一点

### `raise_camera`

Use when the request is primarily camera elevation and does not itself imply a downward orientation.

Examples:

- 镜头升高一点
- 相机抬高
- 高度加一点

If the runtime implementation combines raising and downward targeting, the language intent should still remain distinguishable from `top_orthographic`.

### `audience_view`

Examples:

- 从观众席看
- 看看观众看到的效果
- 切到观众视角

### `front_view`

Examples:

- 从正面看
- 从台口正面看看

Do not interpret `front_view` as `audience_view` unless the current product defines them as exactly the same camera state.

### `orbit_left` / `orbit_right`

Examples:

- 绕到左边看看
- 往右绕一点
- 从桌子右侧看看

Keep the orbit target separate from the orbit direction.

### `focus_selection`

Examples:

- 看一下这张桌子
- 聚焦这个物件
- 对准我选中的景片

This is normally a target modifier or focus action, not a projection mode.

## Ambiguous phrases

These are not globally safe to hard-map without context:

- 上面看看
- 俯视一下
- 往上看看
- 看上面
- 从高处

Preferred resolution when the ambiguity is specifically perspective-vs-top-view:

> 你是想把镜头升高后往下看，还是切到正上方俯视图？

## Composition rules

Interpret a command as a structured combination rather than a single keyword.

Example:

```text
“从上面看看这张桌子”
intent: elevated_perspective
target: selected/table
projection: perspective
```

```text
“从正上方看看整个舞台”
intent: top_orthographic
target: stage
projection: orthographic
```

```text
“镜头高一点，再往下看一点”
intents: [raise_camera, tilt_down]
projection: perspective
```

## Precedence

1. Explicit named view mode (`俯视图`, `顶视图`, `平面图`, `top view`, `plan view`) wins over generic vertical-direction vocabulary.
2. `正上方` strongly selects `top_orthographic` when it describes the observation viewpoint.
3. Generic `上面`, `高一点`, `抬高` does not switch projection by itself.
4. `往下看`, `再俯一点` changes orientation by default, not view mode.
5. Target words (`整个舞台`, `这张桌子`, `选中的物件`) must not overwrite the camera intent.
6. If two materially different intents remain plausible after context, clarify instead of guessing.

## Non-goals

This reference does not define exact camera coordinates, FOV, damping, or animation duration. Those belong to the deterministic camera/runtime layer.

It also does not authorize Dia to mutate stage objects. Camera-language training changes interpretation only.
