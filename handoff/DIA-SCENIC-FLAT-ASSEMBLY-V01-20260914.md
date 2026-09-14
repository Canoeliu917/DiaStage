# DiaStage Scenic Flat Assembly V0.1

Date: 2026-09-14
Branch: `codex/scenic-flat-assembly-v01-20260914`
Original parent: `01c9c22056724e765d534da658e67cb41e28d137`

Expanded acceptance continues the already-pushed `329c771` on the same branch. Stage Asset Interaction `706965d` is a verified ancestor. No pushed history was rewritten; inherited Camera/Placement commits were not modified. Knowledge System, Camera and Dia parser are outside this change.

## Delivered

- Ordinary scenic-flat/window-flat/door-flat floor placement now grounds the actual transformed GLB bottom. Fallback uses the existing transformed collision bounds. No epsilon is added to saved Y; tiny Float32 offsets compensate actual model vertices.
- Reused the existing visible-geometry edge snap: nearby separate surfaces within 0.12 m make exact contact. Enable toolbar grid menu → 边缘与支撑面贴合. Collinear and rotated corner connections work; overlaps remain movable.
- Bi-flat exposes one independent hinge; tri-flat exposes two. Numbered handles control the corresponding joint, never the whole item's position/rotation/scale.
- Edited joint limits come from the existing manifest (currently 0–180 degrees). Presets cover 0/45/90/135/180. Default gesture step converts core DEFAULT_ANGLE_STEP to degrees; Shift retains fractional angles and does not cycle placement snapping on release.
- Existing articulation renderer, live overrides, geometryRevision invalidation and per-instance bounds are reused. Controls and bounds commit together in one history step; cancellation discards the preview.
- Legacy scene parsing/rendering is unchanged, including previously saved 270-degree controls. Editing one joint clamps that joint to the manifest without migrating the other joint.
- No GLB assets, canonical IDs, scene schema, normal stacking, XYZ gizmos, Camera language/runtime or Dia authority changes.

## Verification

| Check | Result |
| --- | --- |
| Scenic/fold/placement unit tests | 24 PASS |
| Current targeted assembly + stacking regression run | 30 PASS / 0 FAIL |
| Camera canonical eval | 36/36 unchanged |
| Placement canonical eval | 66/66 unchanged |
| check-types | 9/9 tasks PASS |
| build | 8/8 tasks PASS; NEXT_TELEMETRY_DISABLED=1 avoids local Windows Next telemetry config rename failure |
| Full test, serial; continued after failures for complete inventory | 3196 PASS / 7 FAIL |
| check | FAIL: 1334 diagnostics; no whole-repository fixes applied |
| Changed source/test files Biome | PASS |

Coverage A–J: actual single-flat/door/window GLB edges; collinear and 90-degree contact; bi-flat 0/45/90/135/180; independent tri-flat joints; bounds and projected geometry invalidation; post-fold snapping; cancelled live gestures; one undo/redo transaction; legacy 270-degree scene parsing and history restoration. Tilted-model grounding and exclusion from ordinary stacking are also tested.

Full-suite failures were not repaired by changing unrelated behavior:

- Existing six application failures: synthetic chunk budget; old sofa command expectation; conflicting script physical facts; PDF/DOCX equivalence; existing venue offline planning; complex prose planning.
- One Viewer renderer-recovery test also fails independently: its core module mock lacks `useLiveTransforms`. The Viewer test and implementation are unchanged in this branch. Reproduction: `.local/scenic-viewer-repro.log`. This is reported separately from the six application failures.

## Actual 4329 browser acceptance

Chrome/Playwright pointer interactions against the production build at `http://127.0.0.1:4329`, using a temporary scene cloned from the formal scene. No internal scene mutation calls were used to execute the gestures.

Fourteen acceptance groups passed, no page errors:

1. Bi-flat joint pointer drag; whole XYZ unchanged; one undo and redo.
2. Tri-flat first joint pointer drag; second joint unchanged; one undo and redo.
3. Tri-flat second joint pointer drag; first joint unchanged; one undo and redo.
4. Esc discards articulation without saving.
5. Two single flats form a collinear wall by edge snapping.
6. Three single flats form a U with two 90-degree joints.
7. Door flat connects to a single flat.
8. Shift free fold saves a fractional angle and preserves the current placement snap mode.
9. The 3D fold handle responds to a pointer drag.
10. Two single flats explicitly form an L-shaped 90-degree connection.
11. Window flat connects to a single flat.
12. A folded tri-flat connects using its newly computed edge; undo restores its complete pre-move state.
13. Split-view 3D second-hinge dragging changes only that hinge (45 → 90 degrees; first hinge remains 120).
14. An explicit pageerror assertion confirms zero page errors.

Evidence: `.local/scenic-browser.json`, `.local/scenic-expanded-browser.log`, `.local/scenic-split.png`, `.local/scenic-initial.png`, `.local/scenic-fold.png`, `.local/scenic-assembly.png`.
Reproduction: run `bun handoff/scenic-assembly-fixture.ts` in the repo, then `node work/DiaStage-current/handoff/scenic-assembly-acceptance.mjs` from the handoff workspace root. The browser script removes only its exact temporary QA scene ID in finally.

## Data protection

Fresh backup: `.local/backups/2026-09-14T10-03-17-067Z/`.
After QA cleanup: **3 scenes / 300 revisions**, SQLite integrity **ok**.
Every formal scene and revision row equals the pre-existing backup, including current fold angles, transforms, scene metadata and history.

- Scene rows SHA-256: `64ccc18ca23a41b0adaac3700d06f9a06e851c948f12f9ef7c774685c8999c72`
- Revision rows SHA-256: `0e3083d8c78a42f8d0b91bace91050a1a7c3cb4208b6124b7c95fb6fc08b6380`

## Files

- `apps/editor/lib/stage/folding.ts`: manifest limits, articulation-only live/commit transaction.
- `apps/editor/lib/stage/fold-drag.ts`: shared angle step and Shift-free pointer angles.
- `apps/editor/lib/stage/model-contact.ts`: expose actual transformed model bottom.
- `apps/editor/lib/stage/placement-snap.ts`: floor contact while retaining existing edge and stack branches.
- `apps/editor/components/stage-entry/folding-panel.tsx`: manifest range and presets.
- `apps/editor/components/stage-entry/folding-system.tsx`: independent 3D handles and Shift behavior.
- `apps/editor/components/stage-entry/stage-plan-fold-handles.tsx`: matching plan handles and keyboard limits.
- `packages/nodes/src/item-fold.ts`: dedicated articulation apply export.
- Four tests: `folding.test.ts`, `fold-drag.test.ts`, `placement-snap.test.ts`, `scenic-assembly.test.ts`.
- `handoff/scenic-assembly-fixture.ts`, `handoff/scenic-assembly-acceptance.mjs`, this report.

## Boundaries

- Assembly is surface snapping, not a permanent linked constraint: moving or folding a connected piece may require snapping it again.
- Existing contact/overlap advisory coloring remains; an exactly touching joint can still display red. This does not prevent placement.
- Manifest 0 degrees is ideal closure; finite-thickness panel intersections can occur. No stability or new self-collision simulation was introduced.
- Edge snapping is enabled through the existing magnetic placement mode and catches nearby separate surfaces; it does not resolve pre-existing intersections automatically.
- No main modification, merge, deployment, schema deletion or asset modification.


## Expanded A–P acceptance and actual GLB inspection

Inspection uses ItemGLTFLoader on the actual five GLBs, not their display names. Detailed local output: .local/scenic-asset-audit.json.

| Asset | Authored hierarchy/pivot | Meshes | Default actual bounds W × H × D (m, rounded) |
| --- | --- | --- | --- |
| SCN-FLAT-090 | Panel_01 at local (-0.45,0,0) | 2 | 0.900 × 2.400 × 0.040 |
| SCN-FOLD-02 | Hinge_01 → Hinge_02 at local (0.9,0,0) | 5 | 0.920 × 2.400 × 0.920 |
| SCN-FOLD-03 | Hinge_01 → Hinge_02 → Hinge_03; each moving joint offset (0.9,0,0) | 8 | 0.920 × 2.400 × 0.940 |
| SCN-DOOR-130 | Door_Hinge_1 at (-0.371,0,0); not exposed as a scenic fold joint | 5 | 1.300 × 2.400 × 0.487 |
| SCN-WIN-130 | Static authored root | 3 | 1.300 × 2.400 × 0.082 |

Fold metadata specifies local [0,1,0] axis, included angle [0,180], default 90, absolute local rotation 180 minus included angle. Runtime reuses packages/nodes/src/item/fold-controls.ts and the existing renderer. Collision uses actual mesh components/BVH, with geometryRevision invalidation; no new articulation implementation.

| Requested coverage | Evidence |
| --- | --- |
| A/B/C/D | Actual GLB straight, rotated corner, door and window edge tests; all four browser connections |
| E/F/G | Bi angles 0/45/90/135/180; tri joints independently preserve the other angle |
| H | New world-box test with translated/rotated root; fold changes actual world bounds |
| I | Same probe at x=1.6: no collision in original pose, collision after opening both joints; uses stageModelContact |
| J/K | Cached projected edges change after pose reconciliation, then edge snap succeeds; browser folded-tri reconnection |
| L/M/N | Held gesture is transient, Esc does not save, one Undo restores complete state, Redo re-applies |
| O | No-controls scene round-trip preserves authored default geometry and does not migrate stored data |
| P | Core stacking tests exclude all three flat kinds as mover/support |
| Priority | Off-grid target test fails before fix, passes after; repeated snap preserves exact contact |

The only production-code change in this follow-up is placement-snap.ts: test the raw pointer geometry before ordinary grid quantization and do not quantize an existing contact away. This applies to scenic placement; the ordinary stacking branch is unchanged. A contact/overlap is not automatically resolved into another internal frame member.

Follow-up modified files (5): placement-snap.ts, scenic-assembly.test.ts, scenic-assembly-fixture.ts, scenic-assembly-acceptance.mjs and this report. The earlier delivered folding implementation remains in the same branch.

Fresh backup file SHA-256:

- pascal.sqlite: dd8a35d5c4ae01b70642638e942d9add6bf1e07c94175712a0457da9468892ae
- scenes.json: b37f297d0602465dc231d04e5f8fc9886e08b3d900bebcbaaa339e6b610c08ba
- revisions.jsonl: d82961d743302b0cf47e6a2e5344786b05f9779ff50d3eacabd439cd3f74ebb4

Post-browser all-row equality and integrity checks pass; formal data remains 3 scenes / 300 revisions. Temporary QA scene cleanup uses only its generated exact ID.
