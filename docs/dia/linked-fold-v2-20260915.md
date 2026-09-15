# Linked folds and matching-asset snapping — 2026-09-15

Branch: `codex/linked-fold-v2-20260915`  
Base: `262724d53281ea32b0da6b82f9b9d6ccc8085f0d`

## Same-type placement

The existing edge/support snapping toggle now also aligns matching library assets with matching dimensions and Euler orientation. Side placement aligns the visible footprint centers and outer edges; stacking aligns the footprint centers and actual model top/bottom. Capture distance is 0.18 m horizontally and 0.12 m vertically. Floor-level lateral movement does not elect a nearby object's top. Existing targets are never moved, rotated or resized.

The shared placement helper serves live plan and native placement, with the 3D XYZ move controls using the same calculation. Penetrating candidates are rejected through the existing model-contact checks. Disabling guides retains the old unsnapped/grid behavior. Different assets or orientations retain generic edge snapping; this is not an automatic packing or rotation system. Exact matching is tested on cube, timber and all three riser GLBs, both flat and standing; irregular shapes are not certified as a general packing solution.

## Connected folds

- Two panels: left/right controls around their shared hinge. Three panels: left/right controls around both hinges, four controls total.
- Left-side operation compensates the whole-item pose so the right subtree remains fixed. Right-side operation keeps the existing root-fixed behavior. Both remain one connected asset.
- Existing two angle fields now accept 0–360 degrees. Their physical surface-edge axes account for panel thickness, allowing surface contact at closure rather than coincident solids.
- Self-collision and external-model collision are checked along the fold sweep. A clear endpoint does not permit crossing an intermediate obstacle. Invalid starting poses and unavailable obstacle geometry fail closed.
- No GLB files, permanent parent hierarchy, colors, layout, or formal database migration changed. Corrected axes do change the rendered appearance of old saved fold angles; this was explicitly approved by the user.
- This is geometric folding, not structural engineering or physical stability. Collision sweep uses the existing 0.25-degree sampling and limit refinement, not continuous collision detection. Attached objects and unsupported nonuniform scale on left-side operations remain blocked.

## Verification

- Stage library and stage-entry tests plus node fold and item-schema tests: **211 pass, 3 fail; 214 tests / 37 files**.
- The three failures are the existing `spatial-runtime.test.ts` corner, multi-hinge and partial-enclosure conversation-to-Proposal cases. Each fails before a Proposal is produced. All three were independently reproduced in the clean base worktree at the same base commit; no expectations were weakened to hide them.
- TypeScript package build and editor noEmit: passed.
- Production Next build: passed with process-local `NEXT_TELEMETRY_DISABLED=1`. Initial telemetry EXDEV was environmental; no system config was changed.
- Biome on changed supported files and `git diff --check`: passed.

### Real Chrome, isolated localhost QA

Production build served only at `127.0.0.1:9001`, with a new `.local/linked-fold-qa.db`. No OpenAI calls and no formal database access.

- Verified two and four fold handles in the mini-plan, and matching 3D handle counts.
- Operated all six mini-plan controls; each changed the asset, saved once and restored the full node through Undo.
- Pointer-dragged the second matching cube from an offset placement: snapped to `[-1.45, 0, 2]` beside the unchanged cube at `[-1, 0, 2]`.
- Held drag and Escape cancellation: zero persisted scene changes.
- Pointer release: exactly one persisted version increment; Undo and Redo restored exact graphs.
- `pageerror = 0`.
- Every browser run deleted only its freshly created exact QA scene ID in cleanup. Local browser script, fixture and JSON/screenshot evidence remain ignored under `.local`.

Browser stacking via the 3D Y handle and physical iPad/Pencil operation are not certified by this run; stacking geometry and native history semantics are covered by automated tests.

## Handoff

The original `127.0.0.1:9000` listener (PID 7264 at verification) and its build were not replaced. No main merge or deployment. This checkpoint therefore does **not** mean the user's already-open 9000 client has received the changes. Switching the client to the new build is a separate controlled service handoff.
