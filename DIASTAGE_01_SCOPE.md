# DiaStage 0.1 visible scope

This release continues from `codex/legacy-cleanup-phase1-20260913` at
`8718a7734239d0225b714ad10173ccf1929958ac`.

The current production UI exposes **置景 | 复台**. Dia is always available;
Version / History and basic View are shared infrastructure, not workspaces.
Remount means **Preview / Mapping**, not a complete automatic venue transfer.

This release override changes visibility, not the long-term Product Backbone.
The historical Venue → Build → Rehearse → Remount architecture, schemas,
renderer registry, and saved records remain compatible.

## Build and View

- Keep the supplied 22 native assets and their existing specifications, including
  the 1.75 m long sofa. No additional asset types or generation systems.
- Keep Select, Move, Rotate, Fold, Snap, Measure, Align, Grid, Undo / Redo and Save.
- Existing Group / Ungroup are selection groups for the current browser session;
  they are not persistent scene hierarchy or a new Dia planning capability.
- Keep Orbit / Pan / Zoom, WASD / QE, Focus Selection, Perspective, Top, Front,
  Side, Reset View, and existing local Save / Recall View commands.

## Dia authority and capability boundary

**AI proposes. The stage previews. Humans decide.**

Build still follows Proposal → Ghost / Preview → Human Decision → Adopt / Edit / Reject.
Sending text, previewing, rejecting, and viewing history never grant automatic
Formal Scene writes. Restoring a version or applying a mapping remains an
explicit human action. Remote Dia cannot adopt a proposal.

The 0.1 host constructs Dia with rehearsal disabled. Existing local Build
addition / movement / rotation, Version selection / viewing, Remount preparation,
and basic View commands remain available. The allowed scope does not imply that
unimplemented natural-language Align / Group / Ungroup / Remove commands have
been added: manual tools retain their existing behavior.

Rehearse / performer / route / facing, Lighting / Cue, and camera production /
Video / Timeline / Sequencer are not default capabilities. Old rehearsal proposals
remain readable but cannot be previewed or adopted in this host, including via
the paired phone. Build plans cannot smuggle performer or production camera items
through the Build preview/adopt boundary.

## Entry points and compatibility

- Navigation, dock, object list, default Dia prompts, mobile entry, home and help
  describe the reduced scope. The old `/demo` entry returns to manual stage setup.
- Old workspace and panel IDs fall back to Build or basic View.
- Saved performer, path, camera and version data are not deleted or migrated away.
  Historical mapping and version restoration keep their associated data intact.
- Keep site / building / level / slab, Floorplan core, legacy renderer reading,
  material reading, GLB / scene export, and the document/media dependencies kept
  in Phase 1. This pass performs no legacy file deletion.

## Verification policy

Run `bun run check-types`, `bun run build`, `bun run test --concurrency=1` and
`bun run check`. Report existing lint/format findings without a repository-wide
rewrite. The six failures reproduced at `cb09d80` remain a separate baseline;
do not change the current asset sizes or expand Script Intelligence to satisfy them.
