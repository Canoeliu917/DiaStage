# Systems

Systems coordinate scene behavior that cannot be expressed by a single node renderer. Prefer a registry definition (`geometry`, `renderer`, `floorPlan`, `system`) and add a dedicated system only for cross-node or runtime behavior.

## Boundaries

- `packages/core`: deterministic scene data, geometry inputs, validation, transactions, and history. No Three.js or editor UI.
- `packages/viewer`: React Three Fiber presentation, picking, runtime animation, and renderer recovery.
- `packages/editor`: tools, panels, transient gestures, Camera Rehearsal, Remount preview, and app-specific runtime slots.
- `packages/nodes`: registered stage node definitions and their minimum geometry, renderer, and editing contributions.

## Active viewer systems

The viewer mounts registered geometry plus level, wall, door, window, item, zone, guide, scan, interaction, and performance-settle behavior. The editor injects its own systems as children of the Viewer so Edit, first-person, Capture, Camera Rehearsal, and Remount remain independent.

Systems that maintain a cache must clear it on unmount. Expensive work must react to node or camera changes instead of traversing the full scene every frame.

## Transactions

Persisted changes go through the scene store and form transmittable commits. A drag or transform uses live overrides, then writes one commit on release. Derived writes required by an operation must be included in that same commit so local recovery, undo, and remote replay agree.

## Removed systems

DiaStage does not mount roof, ceiling, terrain, MEP, room detection, room quantities, or automatic stair-opening systems. Compatibility parsing archives their old nodes without rendering, editing, or deleting them on first open.

When adding a system, keep its mount in the owning layer and add one focused test that proves its trigger and teardown behavior.
