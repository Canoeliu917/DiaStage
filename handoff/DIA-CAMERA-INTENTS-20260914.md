# Dia Camera Intent parsing and canonical evals

## Baseline and integration

The inspected working tree was clean on `codex/fold-endpoint-repair-20260914` at
`3825b9f0d5833b7a5d2ec603a4548093046ed95d`, not `3a4a2b0`.
The origin fetch refspec only tracked `codex/mobile-voice-stage-link`, so an explicit
fetch of `codex/stage22-ui-checkpoint-20260913` was necessary.

Remote HEAD was verified as `8989400fe531040e49c45d9b45caaf0d95854e72`.
It was not a descendant of local HEAD. To preserve the existing viewer changes,
the four requested commits were cherry-picked onto a new local branch,
`codex/dia-camera-intents-20260914`:

| Remote source | Local cherry-pick |
| --- | --- |
| 38dd60c | 551ad54 |
| dc26879 | fde2b87 |
| c398dc9 | ddca990 |
| 8989400 | f862bee |

No main changes, merge, deployment, scene writes, or asset changes were performed.

## Actual canonical evaluation

The runner reads the original 36 lines directly from
`.agents/skills/dia-language-trainer/evals/camera-intents.jsonl` and calls
`parseViewCommand` for every utterance. The evaluator normalizes existing command
types into canonical labels; it never derives a prediction from the utterance.
It checks intent/order, required target, required projection, and clarification.
The canonical JSONL and its expectations were not modified.

- Before parser changes: **3/36 pass, 33/36 fail**.
- Baseline passing IDs: `cam-003`, `cam-004`, `cam-021`.
- After parser changes: **36/36 pass**.
- The test runner also checks the inventory; its extra passing test is not counted
  as a camera-language case.

Run from the repository root:

```powershell
bun test ./apps/editor/lib/rehearsal-intelligence/camera-intents.eval.test.ts
```

The existing 40 normal + 15 clarification/rejection cases were run separately as
regression coverage; they are not the canonical 36-case result.

## What changed

Original failure tuple, representative case:

- Utterance: `从上面看一下`.
- Context: no additional disambiguating context.
- Actual prediction: null.
- Expected: elevated perspective, perspective projection, no clarification.
- Execution: no new camera action was emitted by this parser.
- Categories: lexical coverage and missing intent boundary.

The new parser distinguishes explicit top/plan mode, elevated perspective, pitch
down, camera elevation, audience/front viewpoints, orbit, and selection focus.
Targets and projection are separate fields. Ordered clauses retain intent order.
Negated plan modes do not override the requested perspective view. Ambiguous
vertical phrases produce the skill's short clarification question.

Additional tests cover paraphrases, scenery/camera contrasts, grounding, and
execution guards. These are separate from the unchanged 36-case inventory.

## Runtime boundary

This is a parser repair, not a new camera-motion implementation. Supported,
untargeted top/front/orbit intents and selection focus route to the existing view
actions. Existing view-command behavior remains covered by its original tests.

Elevated perspective, pitch down, camera elevation, audience view, ordered camera
sequences, and semantic targets needing scene-object resolution remain runtime
gaps. They are preserved as structured intents and explicitly report unsupported
operation. They do not silently substitute top view, orbit another object, switch
2D to 3D, move scene objects, or report that an action happened.

`上面看看`, `俯视一下`, and `从高处` still require clarification by design.
The conversation controller already stops on clarification before execution;
grounding now routes these cases through that existing boundary.

## Validation

- Canonical camera parsing: 36/36.
- Focused suite (canonical inventory + additional tests + existing view and
  stage-command suites): 101 tests pass, 0 fail.
- `bun run check-types`: 9/9 tasks successful.
- Scoped Biome checks: all six changed TypeScript files pass. No whole-repo formatting.
- Full build and live-browser camera execution were not claimed by this parsing
  evaluation. The running local site has not been rebuilt or restarted here.
