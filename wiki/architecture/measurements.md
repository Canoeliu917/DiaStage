# Measurements

DiaStage keeps measurement as a generic stage capability. It does not calculate room quantities, room finishes, clear-room dimensions, BIM schedules, or construction take-offs.

Applies to `packages/core/src/lib/measurement-geometry.ts`, `packages/core/src/schema/nodes/measurement.ts`, `packages/nodes/src/measurement/**`, and the 2D/3D measurement layers in `packages/editor`.

## Supported measurements

- Distance between two 3D points, including vertical height.
- Angle from three anchors.
- Planar area and perimeter.
- Prism volume from a planar base and extrusion vector.
- Smart inspection for registered stage surfaces such as walls, platforms, and zones.

All stored values use metres and radians. Measurement geometry is pure TypeScript in Core. Renderers format and display values but do not reimplement the math.

## Persistent data

`MeasurementNode.measurement` is a discriminated payload. Anchors are either free points or semantic feature references with a fallback point. When a referenced object moves, the measurement resolves its new geometry without rewriting the measurement node. A missing feature uses the fallback and is shown as unlinked; deleting a host never silently deletes the annotation.

Measurements are ordinary level children. Completing or editing one creates one undoable scene transaction. Pointer previews remain transient and never write scene history.

## Draft and editing rules

- The first point captures the active level and the owning 2D or 3D view.
- Polygon drafts remain on their original plane.
- `Alt` bypasses magnetic attraction but does not release the captured plane.
- Moving a committed handle previews through live overrides and commits only on release.
- Invalid or cancelled edits clear the preview without changing scene data.
- Distance, collision, stage-left/right orientation, and remount coordinates are independent of rendering quality.

## Extension boundary

`NodeDefinition.measurement` may expose pure semantic features for associativity. `NodeDefinition.quickMeasure` may expose a compact, derived report. Neither extension may import Three.js, React state, or editor UI.

Zone quick measurement is limited to its authored footprint and perimeter. Legacy room/BIM fields may be read by the compatibility archive, but no active measurement path interprets them.
