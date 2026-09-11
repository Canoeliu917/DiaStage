# Spatial Queries

`useSpatialQuery()` is the shared placement validation hook for stage objects. It exposes `canPlaceOnFloor` and `canPlaceOnWall` from `packages/core/src/hooks/spatial-grid/use-spatial-query.ts`.

## Floor placement

`canPlaceOnFloor(levelId, position, dimensions, rotation, ignoreIds)` checks the complete rotated footprint and returns `{ valid, conflictIds }`. Pass the moving node ID in `ignoreIds` so it cannot collide with itself. Use `spatialGridManager.getSlabElevationForItem(...)` when an object stands on an elevated platform.

## Wall placement

`canPlaceOnWall(levelId, wallId, localX, localY, dimensions, attachType, side, ignoreIds)` validates an object attached to or beside a wall. Its `adjustedY` is the accepted vertical position and must be used for the commit.

## Interaction contract

- Validate live pointer positions for preview feedback.
- Keep the preview transient.
- Create or update the node once on pointer release.
- Use scaled dimensions rather than the catalog dimensions.
- Reuse the same collision math for editing, undo, local recovery, and Remount.

There is no ceiling placement query. Legacy ceiling-attached catalog data is accepted only by the compatibility archive and is not exposed as an editing workflow.
