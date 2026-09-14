# DiaStage Scenic Flat Assembly V0.1

Date: 2026-09-14
Branch: `codex/scenic-flat-assembly-v01-20260914`
Parent: `01c9c22056724e765d534da658e67cb41e28d137`

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
| Scenic/fold/placement unit tests | 19 PASS |
| Targeted assembly + stacking + frozen Camera/Placement regressions | 154 PASS / 0 FAIL |
| Camera canonical eval | 36/36 unchanged |
| Placement canonical eval | 66/66 unchanged |
| check-types | 9/9 tasks PASS |
| build | 8/8 tasks PASS; NEXT_TELEMETRY_DISABLED=1 avoids local Windows Next telemetry config rename failure |
| Full test, serial; continued after failures for complete inventory | 3191 PASS / 7 FAIL |
| check | FAIL: 1334 diagnostics; no whole-repository fixes applied |
| Changed source/test files Biome | PASS |

Coverage A–J: actual single-flat/door/window GLB edges; collinear and 90-degree contact; bi-flat 0/45/90/135/180; independent tri-flat joints; bounds and projected geometry invalidation; post-fold snapping; cancelled live gestures; one undo/redo transaction; legacy 270-degree scene parsing and history restoration. Tilted-model grounding and exclusion from ordinary stacking are also tested.

Full-suite failures were not repaired by changing unrelated behavior:

- Existing six application failures: synthetic chunk budget; old sofa command expectation; conflicting script physical facts; PDF/DOCX equivalence; existing venue offline planning; complex prose planning.
- One Viewer renderer-recovery test also fails independently: its core module mock lacks `useLiveTransforms`. The Viewer test and implementation are unchanged in this branch. Reproduction: `.local/scenic-viewer-repro.log`. This is reported separately from the six application failures.

## Actual 4329 browser acceptance

Chrome/Playwright pointer interactions against the production build at `http://127.0.0.1:4329`, using a temporary scene cloned from the formal scene. No internal scene mutation calls were used to execute the gestures.

Nine acceptance groups passed, no page errors:

1. Bi-flat joint pointer drag; whole XYZ unchanged; one undo and redo.
2. Tri-flat first joint pointer drag; second joint unchanged; one undo and redo.
3. Tri-flat second joint pointer drag; first joint unchanged; one undo and redo.
4. Esc discards articulation without saving.
5. Two single flats form a collinear wall by edge snapping.
6. Three single flats form a U with two 90-degree joints.
7. Door flat connects to a single flat.
8. Shift free fold saves a fractional angle and preserves the current placement snap mode.
9. The 3D fold handle responds to a pointer drag.

Evidence: `.local/scenic-browser.json`, `.local/scenic-browser.log`, `.local/scenic-initial.png`, `.local/scenic-fold.png`, `.local/scenic-assembly.png`.
Reproduction: run `bun handoff/scenic-assembly-fixture.ts` in the repo, then `node work/DiaStage-current/handoff/scenic-assembly-acceptance.mjs` from the handoff workspace root. The browser script removes only its exact temporary QA scene ID in finally.

## Data protection

Fresh backup: `.local/backups/2026-09-14T09-22-31-246Z/`.
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
