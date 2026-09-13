// Base

// Asset URL allowlist
export { ALLOWED_ORIGINS_ENV, ALLOWED_SCHEMES, AssetUrl } from './asset-url'
export { BaseNode, generateId, Material, nodeType, objectId } from './base'
// Camera
export { CameraSchema } from './camera'
// Collections
export { type Collection, type CollectionId, generateCollectionId } from './collections'
// Compiled per-kind parsers (opt-in)
export {
  compiledNodeParsersEnabled,
  enableCompiledNodeParsers,
  parseNode,
} from './compiled-node-parsers'
export type {
  MaterialMapProperties,
  MaterialMaps,
  MaterialPresetPayload,
  MaterialTarget as MaterialTargetValue,
  TextureWrapMode as TextureWrapModeValue,
} from './material'
// Material
export {
  DEFAULT_MATERIALS,
  MaterialMapPropertiesSchema,
  MaterialMapsSchema,
  MaterialPreset,
  MaterialPresetPayloadSchema,
  MaterialProperties,
  MaterialSchema,
  MaterialTarget,
  resolveMaterial,
  TextureWrapMode,
} from './material'
export {
  BlockEdge,
  BlockFace,
  type BlockFaceFrame,
  BlockNode,
  BlockTopology,
  type BlockTopologyIssue,
  BlockVertex,
  blockUndirectedEdgeKey,
  createBoxBlockTopology,
  getBlockFaceCentroid,
  getBlockFaceFrame,
  getBlockFaceNormal,
  inspectBlockTopology,
} from './nodes/block'
export { BuildingNode } from './nodes/building'
export {
  CONSTRUCTION_DRAWING_TYPES,
  ConstructionDimensionBaseline,
  ConstructionDimensionChainMode,
  ConstructionDimensionDatumPolicy,
  ConstructionDimensionDrawingOverride,
  ConstructionDimensionDrawingPresentation,
  ConstructionDimensionImperialPrecision,
  ConstructionDimensionMetricNotation,
  ConstructionDimensionMode,
  ConstructionDimensionNode,
  ConstructionDimensionTerminator,
  ConstructionDimensionTextPosition,
  ConstructionDrawingType,
  constructionDimensionRequiredAnchorCount,
  resolveConstructionDimensionDrawingOverride,
  resolveConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingPresentation,
  setConstructionDimensionDrawingSuppressedSegments,
} from './nodes/construction-dimension'
export {
  DoorNode,
  DoorSegment,
  OpeningConstructionType,
  OpeningDimensionReference,
} from './nodes/door'
export { FenceBaseStyle, FenceNode, FenceStyle } from './nodes/fence'
export { GuideNode, GuideScaleReference } from './nodes/guide'
export type {
  AnimationEffect,
  Asset,
  AssetInput,
  Control,
  Effect,
  Interactive,
  SliderControl,
  TemperatureControl,
  ToggleControl,
} from './nodes/item'
export {
  getScaledDimensions,
  ItemNode,
  isLowProfileItemSurface,
  LOW_PROFILE_ITEM_SURFACE_MAX_HEIGHT,
} from './nodes/item'
export { LevelNode } from './nodes/level'
export {
  AngleMeasurement,
  AreaMeasurement,
  DistanceMeasurement,
  MeasurementAnchor,
  MeasurementFeatureAnchor,
  MeasurementFeatureParameter,
  MeasurementFeatureReference,
  MeasurementNode,
  MeasurementPayload,
  MeasurementPoint,
  PerimeterMeasurement,
  VolumeMeasurement,
} from './nodes/measurement'
// Nodes
export {
  CaptureSessionReference,
  type CaptureSessionReferenceInput,
  ScanNode,
} from './nodes/scan'
export { ShelfNode } from './nodes/shelf'
export { SiteNode } from './nodes/site'
export { MIN_SLAB_THICKNESS, SlabNode } from './nodes/slab'
export { SpawnNode } from './nodes/spawn'
export type { StairSurfaceMaterialRole, StairSurfaceMaterialSpec } from './nodes/stair'
export {
  getEffectiveStairSurfaceMaterial,
  StairNode,
} from './nodes/stair'
export { StairSegmentNode } from './nodes/stair-segment'
export { SurfaceHoleMetadata } from './nodes/surface-hole-metadata'
export type {
  WallBandSurfaceSlotId,
  WallFaceBand,
  WallFaceBandConfig,
  WallSurfaceMaterialSpec,
  WallSurfaceSide,
  WallSurfaceSlotId,
  WallTrimConfig,
} from './nodes/wall'
export {
  buildEnabledWallFaceBandPatch,
  buildWallFaceBandCountPatch,
  getEffectiveWallSurfaceMaterial,
  getWallBandSlotId,
  getWallFaceBandConfig,
  getWallFaceBandForHeight,
  getWallSurfaceMaterialSignature,
  getWallSurfaceSideFromBandSlot,
  WALL_CHAIR_RAIL_DEFAULT,
  WALL_CHAIR_RAIL_SLOT_DEFAULT,
  WALL_CROWN_DEFAULT,
  WALL_CROWN_SLOT_DEFAULT,
  WALL_FACE_BAND_DEFAULT,
  WALL_SKIRTING_DEFAULT,
  WALL_SKIRTING_SLOT_DEFAULT,
  WALL_SLOT_DEFAULT,
  WALL_SURFACE_SLOT_DEFAULTS,
  WALL_TRIM_DEFAULTS,
  WallNode,
  WallTreatmentSide,
  WallTrimProfile,
} from './nodes/wall'
export {
  WindowConstructionType,
  WindowDimensionReference,
  WindowNode,
  WindowType,
} from './nodes/window'
export { ZoneNode } from './nodes/zone'
export { generateSceneMaterialId, SceneMaterial, type SceneMaterialId } from './scene-material'
export type { AnyNodeId, AnyNodeOption, AnyNodeType } from './types'
// Union types
export { AnyNode, nodeKindOf } from './types'
