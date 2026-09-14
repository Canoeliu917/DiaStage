# Dia Camera Runtime V0.1

Branch: `codex/dia-camera-runtime-v01-20260914`, based on `706965d167829afc443568095f27887e9d4a4e06`.

## Behavior

The existing parser and canonical 36 camera eval expectations are unchanged. `mapCameraIntent` translates the four supported semantic intents into independent runtime actions. `applyCameraRuntimeActions` computes a new camera pose; `runViewCommand` sends one existing `camera-controls:apply-pose` event. No Formal Scene mutation or scene history operation is involved.

| Intent | Runtime action |
| --- | --- |
| `top_orthographic` | Orthographic camera above the target; tiny polar offset prevents singularity. |
| `elevated_perspective` | Perspective view at 45 degrees around the current/resolved target. |
| `raise_camera` | Translate camera and look target upward by 10% of their distance; preserve direction. |
| `tilt_down` | Pitch gaze down 10 degrees at a fixed camera position; stop at the downward pole. |

Compound raise + tilt computes both operations before publishing one pose. Clarification and unsupported compounds apply no partial motion. Existing supported view commands retain their old execution path.

Explicit stage/table targets use registered world-space render bounds. A selected table wins; otherwise a unique table is required. Missing, ambiguous, or unloaded targets return a notice without moving the camera. Target framing accounts for viewport aspect ratio. Perspective operations omit stale orthographic view width so the existing controls do not inadvertently dolly the requested position.

## Validation

- Before: canonical **36/36** plus one inventory test passed.
- After: canonical **36/36**, unchanged files and expectations.
- Independent runtime math/mapping: **9/9** tests passed, including composition, immutability, pole limits, and portrait/landscape framing.
- Combined camera tests: **52 passed / 0 failed** across four files (188 assertions).
- `bun run check-types`: **9/9 tasks passed**.
- `bun run build`: **8/8 tasks passed**.
- Biome check of the three changed production/test TypeScript files: passed.
- Full repository tests/check were not rerun for this scoped runtime change.

Actual Chrome/Playwright against **http://127.0.0.1:4329**, through the Dia composer, verified **13 commands**: the four intents; raise+tilt; clarification/no-op; unsupported compound/no-op; entire-stage top/perspective; split-view top; 2D-to-3D perspective; table top/perspective. Assertions inspect the actual Three camera position, direction and projection. No page errors occurred. This used an isolated browser context and temporary scene copy, not the user's personal Chrome profile.

Reproduce from the handoff workspace root with `node work/DiaStage-current/handoff/camera-runtime-acceptance.mjs` while 4329 is running. The script creates its own scene copy and deletes only its exact temporary scene ID in `finally`.

Local evidence: `.local/camera-runtime-acceptance.json`, `.local/camera-runtime-browser.log`, `.local/camera-runtime-acceptance.png`, `.local/camera-runtime-tests.log`, `.local/camera-runtime-types.log`, `.local/camera-runtime-build.log`.

## Data protection

Fresh pre-test backup: `.local/backups/2026-09-14T08-41-48-783Z/` (SQLite, full scene rows, revisions, SHA-256 manifest).

After all browser tests, exact deep comparison against that backup passed for all **3 scenes / 300 revisions**. The temporary scenes were removed. SQLite integrity: `ok`.

- All scene rows SHA-256: `64ccc18ca23a41b0adaac3700d06f9a06e851c948f12f9ef7c774685c8999c72`
- All revision rows SHA-256: `0e3083d8c78a42f8d0b91bace91050a1a7c3cb4208b6124b7c95fb6fc08b6380`

The 22 asset resources, positions, fold angles, saved history and main branch were not modified.

## Changed files and boundaries

- `apps/editor/lib/rehearsal-intelligence/camera-runtime-actions.ts`: independent mapping and pure camera math.
- `apps/editor/lib/rehearsal-intelligence/camera-runtime-actions.test.ts`: independent runtime tests.
- `apps/editor/lib/rehearsal-intelligence/view-runtime.ts`: target lookup and connection to the existing camera event.
- `handoff/camera-runtime-acceptance.mjs`: real browser acceptance.
- This report.

Runtime defaults are small fixed steps, not new language semantics. Audience-view and unsupported compound actions remain outside this iteration. Multiple tables require a selection. Elevation selects a 45-degree view; it is distinct from incremental vertical translation. Existing camera-control distance limits and scene/render availability still apply. No deployment or merge was performed; the locally rebuilt 4329 server runs this implementation.
