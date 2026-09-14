---
name: dia-language-trainer
description: Turn real Dia language-understanding failures into reusable intent rules, contrast pairs, and eval cases. Use when Dia misunderstands a natural-language command, especially camera/view language, object placement, spatial relations, or when the user asks Codex to help Dia learn new phrasing without fine-tuning the model.
---

# Dia Language Trainer

Use this skill to improve Dia's language understanding from real user corrections. The goal is not to memorize one sentence. The goal is to discover a reusable intent boundary, encode it in the smallest safe place, and prove it with evals.

## Product constraints

- Dia is currently a stage/scenery-building assistant first. Do not reintroduce rehearsal-character complexity unless the product explicitly asks for it.
- Dia may interpret and propose. Do not give Dia new execution permissions as part of language training.
- Preserve the existing human-control boundary. Language understanding changes must not silently turn preview/proposal behavior into automatic scene mutation.
- Prefer simple user language. Internal labels may be technical; the UI should not require users to know them.
- Allow user language to be fuzzy; keep the internal intent/state unambiguous.

## Required sources

Before changing behavior, read:

1. `references/camera-intents.md` in this skill when the failure concerns camera/view language.
2. `evals/camera-intents.jsonl` in this skill for the canonical camera contrast set.
3. The actual Dia parser/prompt/schema/runtime that currently handles the command. Find it from the repo; do not assume a stale path.
4. Relevant architecture rules if the change touches `packages/core`, `packages/viewer`, `packages/editor`, `packages/nodes`, or shared interaction state.

## Learning loop

For every reported misunderstanding, build this tuple first:

```text
utterance
context
Dia prediction
human expected intent
observed execution
error type
```

Classify the failure as one of:

- `lexical`: a word/phrase is unknown or mapped incorrectly.
- `intent-boundary`: two valid intents are being collapsed together.
- `reference-ambiguity`: pronoun/object/view target is unclear.
- `modifier-loss`: Dia found the main intent but lost target, direction, amount, or projection.
- `execution-mismatch`: intent classification is correct, but the camera/stage action is wrong.

Do not fix an `execution-mismatch` by adding language synonyms.

### 1. Generalize the correction

Ask: what concept did the user distinguish?

Bad fix:

```text
"从上面看一下" -> hard-code camera position X/Y/Z
```

Good fix:

```text
"从上面看一下" belongs to elevated perspective/orientation, not to top-orthographic view mode.
```

### 2. Add a contrast pair

Every new positive example must be paired with at least one nearby negative/confusable example.

Example:

```text
从上面看一下       -> elevated_perspective
从俯视图角度看一下 -> top_orthographic
```

The purpose is to teach the boundary, not just the keyword.

### 3. Add evals before or with the implementation

For a new semantic distinction, add at minimum:

- 2 direct positive cases.
- 2 confusable negative/contrast cases.
- 1 paraphrase.
- 1 ambiguous case when ambiguity is realistic.

Do not delete an existing eval merely because the new implementation fails it. If the old expectation is now wrong, document why before changing it.

### 4. Make the smallest behavior change

Prefer this order:

1. deterministic phrase/feature rule when the distinction is crisp;
2. structured intent schema or parser boundary;
3. prompt/few-shot contrast examples;
4. model change only when rules/schema/prompt cannot express the behavior robustly.

Do not begin SFT/LoRA/DPO/GRPO for a vocabulary boundary that can be solved and evaluated deterministically.

### 5. Preserve ambiguity instead of guessing

If confidence is low and two materially different actions remain plausible, ask one short clarification.

For the camera domain, preferred clarification for the common vertical-view ambiguity is:

```text
你是想把镜头升高后往下看，还是切到正上方俯视图？
```

Do not ask when the utterance contains a canonical explicit view-mode term.

### 6. Verify

Run the narrowest relevant tests first, then the existing Dia/editor type checks that cover the changed layer. Report:

```text
before: passed / total
change: rule/schema/prompt changed
added evals: N
failure categories remaining
```

If no runnable evaluator exists yet, preserve the JSONL cases and add/extend the nearest unit test instead of pretending an eval was run.

## Camera/View canonical boundary

The camera domain must distinguish **view mode** from **camera movement/orientation**.

### `top_orthographic`

A view-mode request: the user wants a top/plan representation, normally orthographic or the product's canonical top-view mode.

Strong signals:

- 俯视图
- 顶视图
- 平面图
- 正上方视图
- 从正上方看整个舞台
- top view
- plan view

Example:

```text
从俯视图角度看一下 -> top_orthographic
```

### `elevated_perspective`

A camera viewpoint/orientation request: raise the viewpoint or look downward while preserving a normal 3D perspective view.

Strong signals:

- 从上面看一下
- 从高一点看
- 镜头高一点
- 把镜头抬高一点
- 从观众席上方看

Example:

```text
从上面看一下 -> elevated_perspective
```

Do not convert these to orthographic merely because they contain `上` or `俯`.

### `tilt_down`

The user asks to change camera pitch, not switch view mode.

Examples:

- 往下看一点
- 镜头往下压一点
- 再俯一点

### Ambiguity

Short phrases such as `上面看看` or `俯视一下` can be context-dependent. If the current product context does not disambiguate them, return a clarification intent instead of guessing.

### Target modifiers

Keep intent and target separate.

```text
从上面看看这张桌子
intent = elevated_perspective
target = selected/object:table

从正上方看看整个舞台
intent = top_orthographic
target = stage
```

## Feedback record for future training

When the product records a human correction, preserve provenance. Recommended logical fields:

```text
utterance
context_summary
predicted_intent
human_expected_intent
prediction_version
rule_or_prompt_version
error_type
source = human_correction
created_at
```

Do not mark provider-model output as human-authored data. This distinction matters for later eval, SFT/DPO preparation, licensing, and debugging.

## Extending beyond camera language

Use the same pattern for future Dia skills/domains:

- `stage-placement`: 台左 / 左边 / 观众左 / 靠左一点.
- `object-relation`: 靠近 / 贴着 / 围绕 / 对齐 / 留通道.
- `scene-composition`: 中间留空 / 压迫 / 开放 / 围合 / 遮挡.
- `object-operation`: 移动 / 旋转 / 折叠 / 复制 / 删除.

Each domain should have:

```text
intent taxonomy
positive examples
negative/contrast examples
ambiguity rules
eval cases
```

Do not create a giant global synonym list.

## Report back to the user

After a learning pass, summarize only:

- what Dia misunderstood;
- the generalized distinction learned;
- files/rules/evals changed;
- eval result or why it could not be run;
- any remaining ambiguous phrasing.
