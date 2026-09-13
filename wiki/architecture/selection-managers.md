# Selection Managers

Selection managers translate pointer hits into scene selection while preserving tool ownership.

## Responsibilities

- Resolve registered scene nodes from 2D or 3D hits.
- Apply additive and replacement selection consistently.
- Keep helper meshes, ghosts, scans, camera monitors, and overlays out of ordinary object selection unless their owning tool opts in.
- Route selected nodes to registry-owned actions and inspectors.
- Clear transient selection state when a tool, view, or scene changes.

## Stage phases

- **置景:** walls, platforms, blocks, fences, shelves, doors, windows, stage steps, items, zones, and measurements.
- **排演:** characters, actions, paths, marks, and their timing controls.
- **观察与记录:** camera rigs, shot monitors, and recording controls.
- **复台:** venue anchors, ghost placements, conflicts, and confirmation controls.

The active phase limits presentation and editing; it does not delete incompatible legacy data. Archived building nodes remain unselectable and unrendered.

Selection changes are UI state. Object mutations still pass through the scene store as one undoable operation per completed gesture.
