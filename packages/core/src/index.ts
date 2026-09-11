export type {
  BlockEvent,
  BuildingEvent,
  CameraControlEvent,
  CameraControlFitSceneEvent,
  CameraPose,
  ConstructionDimensionEvent,
  DoorEvent,
  EventSuffix,
  FenceEvent,
  GridEvent,
  GuideEvent,
  ItemEvent,
  LevelEvent,
  MeasurementEvent,
  NodeEvent,
  ScanEvent,
  ShelfEvent,
  SiteEvent,
  SlabEvent,
  SnapshotCaptureFailedEvent,
  SnapshotCapturePose,
  SnapshotSavedEvent,
  SpawnEvent,
  StairEvent,
  StairSegmentEvent,
  ThumbnailGenerateEvent,
  WallEvent,
  WindowEvent,
  ZoneEvent,
} from './events/bus'
export { emitter, eventSuffixes } from './events/bus'
export {
  hiddenWallPointerEventsHeld,
  holdHiddenWallPointerEvents,
} from './events/hidden-wall-pointer-hold'
export { type ItemClipEntry, itemClipRegistry } from './hooks/scene-registry/item-clip-registry'
export {
  sceneRegistry,
  useRegistry,
} from './hooks/scene-registry/scene-registry'
export {
  type FloorPlacedElevationArgs,
  GROUND_SUPPORT_ID,
  getFloorPlacedElevation,
  getFloorPlacedFootprints,
  getFloorStackedPosition,
} from './hooks/spatial-grid/floor-placed-elevation'
export {
  getWallBaseElevationForNodes,
  getWallEffectiveHeightForNodes,
  type PointedSupportSurface,
  pointInPolygon,
  SUPPORT_ELEVATION_EPSILON,
  spatialGridManager,
  type WallSlabSupportSegment,
} from './hooks/spatial-grid/spatial-grid-manager'
export {
  findLevelAncestorId,
  initSpatialGridSync,
  markSlabChangeDependents,
  resolveBuildingForLevel,
  resolveLevelId,
} from './hooks/spatial-grid/spatial-grid-sync'
export {
  type FenceConstructionOptions,
  type FenceSupportInput,
  type FrozenFloorPlacementOptions,
  resolveFenceConstructionSupport,
  resolveFenceSupportSlabPatch,
  resolveFrozenFloorPlacementPatch,
  resolveMovedWallSupportSlabPatch,
  resolveSupportSlabPatch,
  resolveWallConstruction,
  resolveWallSupportSlabPatch,
  type SupportSlabPatch,
  type SupportSlabPatchOptions,
  type WallConstructionOptions,
  type WallConstructionResolution,
} from './hooks/spatial-grid/support-host-patch'
export { useSpatialQuery } from './hooks/spatial-grid/use-spatial-query'
export { deleteAsset, loadAssetUrl, releaseAssetUrl, saveAsset } from './lib/asset-storage'
export {
  clampDoorOperationState,
  getDoorRenderOpenAmount,
  getGarageVisibleOpeningRatio,
  isOperationDoorType,
  SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
} from './lib/door-operation'
export { getDefaultLevelName, getLevelDisplayName } from './lib/level-name'
export {
  areMeasurementPointsCoplanar,
  closestMeasurementFeatureBinding,
  MEASUREMENT_PLANAR_TOLERANCE,
  measurementAnchorFallback,
  measurementAnchorReferenceNodeIds,
  measurementAngle,
  measurementArea,
  measurementAreaVector,
  measurementCentroid,
  measurementDistance,
  measurementFeatureLength,
  measurementNormal,
  measurementPerimeter,
  measurementPrismVolume,
  measurementReferenceNodeIds,
  remapMeasurementAnchors,
  remapMeasurementReferences,
} from './lib/measurement-geometry'
export {
  type Point2D as PolygonPoint2D,
  pointInPolygon as pointInPolygon2D,
  pointOnSegment,
  polygonContainsPolygon,
  polygonsIntersect,
  polygonsOverlap,
  segmentsIntersect,
} from './lib/polygon-relations'
export {
  type Point2D as PolygonBooleanPoint2D,
  subtractPolygonsFromPolygon,
  unionPolygons,
} from './lib/polygon-union'
export { resolveSelectionProxyId, selectionProxyIdFromMetadata } from './lib/selection-proxy'
export {
  getRenderableSlabPolygon,
  type SlabEdgeWallBandSnap,
  type SlabPolygonContext,
  slabPolygonContextFromGeometry,
  snapSlabEdgeToWallBand,
} from './lib/slab-polygon'
export {
  deriveSlotId,
  isSlotMaterialName,
  SLOT_MATERIAL_PREFIX,
  slotLabelFromId,
} from './lib/slots'
export {
  closestOnSegment,
  collectLevelWallSegments,
  nearestWallSegment,
  WALL_SNAP_DISTANCE_M,
  type WallSegment,
  type WallSegmentClosest,
} from './lib/wall-distance'
export {
  getCatalogMaterialById,
  getDynamicLibraryMaterials,
  getLibraryMaterialIdFromRef,
  getLibraryMaterialsVersion,
  getMaterialPresetByRef,
  getMaterialsForCategory,
  getSceneMaterialIdFromRef,
  LIBRARY_MATERIAL_REF_PREFIX,
  MATERIAL_CATALOG,
  MATERIAL_CATEGORIES,
  MATERIAL_SURFACES,
  type MaterialCatalogItem,
  type MaterialCategory,
  type MaterialRef,
  type MaterialSource,
  type MaterialSurface,
  type ParsedMaterialRef,
  parseMaterialRef,
  registerLibraryMaterials,
  SCENE_MATERIAL_REF_PREFIX,
  subscribeLibraryMaterials,
  toLibraryMaterialRef,
  toSceneMaterialRef,
  unregisterLibraryMaterials,
} from './material-library'
export type {
  FloorPlacedFootprint,
  FloorPlacedFootprintContext,
  FloorPlacedFootprintResolver,
  FloorPlacedFootprintsResolver,
} from './registry'
export * from './registry'
// Exported here rather than from the registry barrel: that barrel is
// reachable from server-safe graphs (schema → spatial grid → registry)
// and must stay free of React imports.
export { useRegistryVersion } from './registry/use-registry-version'
export * from './schema'
export * from './services'
export { isMovable, movePlanToward, moveToward, resolveMovable } from './services/movement'
export {
  acquireSceneHistoryPause,
  activeSceneCommitNodeIds,
  getSceneHistoryPauseDepth,
  pauseSceneHistory,
  resetSceneHistoryPauseDepth,
  resumeSceneHistory,
  runAsSingleSceneHistoryStep,
  type SceneCommit,
  type SceneCommitListener,
  type SceneCommitOrigin,
  type SceneSnapshot,
  subscribeSceneCommits,
} from './store/history-control'
export {
  installSceneMutationHandler,
  type NodeChanges,
  SceneMutationError,
  type SceneMutationHandler,
} from './store/scene-mutation'
export {
  type ControlValue,
  type DoorAnimationState,
  type DoorInteractiveState,
  type ItemInteractiveState,
  useInteractive,
  type WindowAnimationState,
  type WindowInteractiveState,
} from './store/use-interactive'
export {
  default as useLiveNodeOverrides,
  getEffectiveNode,
  type LiveNodeOverrides,
} from './store/use-live-node-overrides'
export { default as useLiveTransforms, type LiveTransform } from './store/use-live-transforms'
export {
  type ApplySceneSnapshotOptions,
  acquireSceneReadOnlyLease,
  applySceneOperationPatch,
  applyScenePatch,
  applySceneSnapshot,
  clearSceneHistory,
  default as useScene,
  type SceneMaterialPatch,
  type SceneNodePatch,
  type SceneNodeStructuralPatch,
  type SceneOperationPatch,
  type ScenePatch,
} from './store/use-scene'
export {
  getFenceCenterlineFrameAt,
  getFenceCenterlineLength,
  sampleFenceCenterline,
} from './systems/fence/fence-centerline'
export {
  getFenceControlHandle,
  getFenceSplineFrameAt,
  getFenceSplineLength,
  getTwoPointFenceCurveTangents,
  isSplineFence,
  sampleFenceSpline,
} from './systems/fence/fence-spline'
export { resolveSlabPlacementElevation } from './systems/slab/slab-placement'
export {
  clampSlabElevationForWalls,
  getSlabElevationUpperBound,
  type SlabElevationClamp,
} from './systems/slab/slab-support'
export { type StairFootprintAABB, stairFootprintAABB } from './systems/stair/stair-footprint'
export { resolveStairTotalRise } from './systems/stair/stair-rise'
export {
  constrainWallCurveOffsetToAvoidIntersections,
  getClampedWallCurveOffset,
  getMaxWallCurveOffset,
  getWallArcData,
  getWallChordFrame,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallMidpointHandlePoint,
  getWallStraightSnapOffset,
  getWallSurfacePolygon,
  isCurvedWall,
  normalizeWallCurveOffset,
  sampleWallCenterline,
} from './systems/wall/wall-curve'
export {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  getWallPlanFootprint,
  getWallThickness,
} from './systems/wall/wall-footprint'
export {
  calculateLevelMiters,
  getAdjacentWallIds,
  getWallMiterBoundaryPoints,
  type Point2D,
  pointToKey,
  type WallMiterBoundaryPoints,
  type WallMiterData,
} from './systems/wall/wall-mitering'
export {
  constrainWallMoveDeltaToAxis,
  getLinkedWallUpdates,
  getPerpendicularWallMoveAxis,
  getPlannedLinkedWallUpdates,
  planWallMoveJunctions,
  type WallMoveAxis,
  type WallMoveBridgePlan,
  type WallMoveJunctionPlan,
  type WallMoveLinkedWallTargetPlan,
  type WallPlanPoint,
} from './systems/wall/wall-move'
export {
  MIN_WALL_HEIGHT,
  resolveWallEffectiveHeight,
  resolveWallTop,
} from './systems/wall/wall-top'
export {
  planWallInsertion,
  planWallSplitAtPoint,
} from './systems/wall/wall-topology'
export type { SceneGraph } from './utils/clone-scene-graph'
export { cloneLevelSubtree, cloneSceneGraph, forkSceneGraph } from './utils/clone-scene-graph'
export { isObject } from './utils/types'
export {
  type BuildStats,
  type ParsedBuildJson,
  type SchemaIssue,
  type ValidateBuildJsonResult,
  type ValidationIssue,
  type ValidationSeverity,
  validateBuildJson,
} from './validation/validate-build-json'
