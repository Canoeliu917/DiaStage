# Dia Stage Placement Language V0.1 Report

Base: Camera Runtime V0.1 `83e8951d784fcad3464e5ce0993d92a1c24ef1f9`.
Branch: `codex/stage-placement-language-v01-20260914`.

## Canonical eval before / after

The reference and 66-case JSONL were written before implementation changes. The runner called the existing `groundLanguage` with a fixed scene context, and normalized only information present in its output (never inferred from the utterance).

| Suite | Before | After |
| --- | --- | --- |
| New placement canonical | **4/66** | **66/66** |
| Placement inventory assertion | 1/1 | 1/1 |
| Frozen Camera canonical | 36/36 | **36/36** |
| Frozen Camera runtime tests | 9/9 | **9/9** |

The four old passes were placement-043, placement-044 (stage center), placement-058 and placement-060 (clarification). The score measures the new structured semantic contract, not whether old code can move any object. Original console output is preserved in `.local/stage-placement-before.log` (5 tests passed including inventory, 62 failed). No placement canonical expectation was edited to obtain the final score.

## Semantic distinctions

18 positive intent kinds cover actor-relative stage left/right, audience left/right, incremental left/right, object-relative left/right, upstage/downstage, near, flush, place-on, stack-on, center, alignment, clearance and paths. Each family has two direct examples and a paraphrase, paired with a contrasting family; 12 ambiguity/negation/compound cases complete the set. These are authored fixtures, not alleged user-approved training data.

- Stage-left and audience-left retain different reference frames.
- A small leftward move retains relative motion and an optional stated distance; it is not a stage-left region request.
- Object-side placement retains its reference object; it is not a stage region or inferred object-local axis.
- Near does not imply contact; flush does not mean equal object centers.
- Placement on a named surface and explicit stacking remain distinct intents.
- Unqualified “上面” does not imply stacking or surface contact.
- Keeping space or a passage is a constraint, not permission to delete or move surrounding scenery.

Unqualified left/right preserves `frame: unspecified`. Mapping then asks for a reference frame. Prefix a complete command with “按舞台方向” or “按观众方向” to resolve it. The parser reuses existing numeric/unit parsing and the mapper reuses asset-catalog identity rules; there is no global synonym table or model change.

## StageAction mapping

| Intent | Deterministic action description |
| --- | --- |
| stage/audience left/right, up/down/center | `place_in_region(subjectId, region, frame)` |
| relative left/right | `move_relative(subjectId, direction, frame, amountMeters?)` |
| object left/right | `place_beside(subjectId, targetId, side, frame)` |
| near / flush | `place_near` / `place_flush(subjectId, targetId)` |
| place-on / stack-on | distinct `place_on` / `stack_on(subjectId, targetId)` |
| align | `align(subjectIds, axis)` |
| clearance | `preserve_clearance(region, amountMeters?)` |
| path | `preserve_path(targetId, amountMeters?)` |

Example: “把椅子叠在台块上” resolves to a `stack_on` action containing the two resolved IDs. “往左一点” has no invented distance. Missing, duplicate and self-referential objects yield clarification and zero actions. Alignment currently uses multiple selected objects and an explicit horizontal/vertical axis.

## Parser and authority changes

`stage-placement-intents.ts` parses a bounded whole-clause grammar into `StagePlacementIntent`. `stage-placement-actions.ts` separately resolves references and produces `StagePlacementProposal` with documentVersion, requiresHumanConfirm=true and actions, or a clarification.

`language-grounding.ts` keeps the existing Camera dispatch first, then offers the new placement path. `conversation-controller.ts` exposes the language-only proposal in conversation memory and responds without entering the old XYZ planner. It does not create a renderable StagePlan, call the stacking/snapping engine, emit scene commands, or expose an adoptable geometry preview. Dialogue text is saved by the existing conversation system; the structured placement draft is currently transient.

This iteration completes interpretation and action description, **not geometry preview or placement execution**. Final coordinates remain the responsibility of existing Stage Asset Interaction/stacking/snapping when a future preview adapter is explicitly connected. Proposal → Preview → Human Confirm remains required; a language draft alone cannot be adopted.

Existing creation, rotation/fold, and explicit stage-direction incremental commands retain their established paths and authority checks. One non-Camera legacy eval was intentionally updated: “把圆桌放在台中。” now expects `center_on_stage / placement`, rather than a coordinate-bearing MOVE_SCENERY plan. No Camera expectation, parser file, or runtime file was changed.

## Unsupported / ambiguous

- Negation, alternatives and compound placement prose require one clarified request; no partial action is generated.
- “放在上面”, unspecified alignment axes, ambiguous object names and unknown references require clarification.
- Bare left/right requires a reference frame; multiple objects require selection disambiguation.
- Free-form artistic composition, arbitrary simultaneous constraints, and automatic geometry preview/execution are outside this pass.
- This finite grammar is not a claim of arbitrary natural-language coverage. New distinctions should add contrast cases rather than broad keyword fallbacks.

## Verification and data

- **220 tests passed / 0 failed**, 692 assertions across 11 relevant suites: canonical placement, action mapping, authority, existing Dia backbone/controller/scope and Camera regressions.
- Independent new mapping/authority checks: **16 passed** (15 mapping/boundary checks plus one real controller authority test).
- Types: **9/9 tasks passed**. Build: **8/8 tasks passed**.
- Biome check of the eight changed TypeScript files: passed; no whole-repository formatting.
- Full repository tests/check were not rerun; unrelated prior failures were not modified.
- Actual Chrome against 4329: **9 placement inputs**, no page errors, no scene PUT/PATCH requests, unchanged temporary scene graph/version. The temporary fixture is created and removed by exact ID.
- Camera runtime acceptance was also rerun against 4329: **13 commands passed**, including projection, raise/tilt, compounds, split, 2D-to-3D and target framing.
- Fresh database backup: `.local/backups/2026-09-14T09-04-20-616Z/` with its SHA-256 manifest. All **3 scenes / 300 revisions** remain unchanged; SQLite integrity is `ok`. No 22-asset resources were edited.

Local evidence: `.local/stage-placement-before.log`, `.local/stage-placement-regressions.log`, `.local/stage-placement-types.log`, `.local/stage-placement-build.log`, `.local/stage-placement-browser.json`, `.local/stage-placement-camera-browser.log`.

## Changed files

- `.agents/skills/dia-language-trainer/references/stage-placement-intents.md`
- `.agents/skills/dia-language-trainer/evals/stage-placement-intents.jsonl`
- `apps/editor/lib/rehearsal-intelligence/stage-placement-intents.ts`
- `apps/editor/lib/rehearsal-intelligence/stage-placement-actions.ts`
- `apps/editor/lib/rehearsal-intelligence/stage-placement.eval.test.ts`
- `apps/editor/lib/rehearsal-intelligence/stage-placement-actions.test.ts`
- `apps/editor/lib/rehearsal-intelligence/stage-placement-authority.test.ts`
- `apps/editor/lib/rehearsal-intelligence/language-grounding.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-controller.ts`
- `apps/editor/lib/rehearsal-intelligence/stage-command-eval.ts` (one non-Camera expectation)
- `handoff/stage-placement-language-acceptance.mjs`
- This report.

No main changes, merge, deployment, legacy deletion, or new asset. The local 4329 server runs the rebuilt branch.
