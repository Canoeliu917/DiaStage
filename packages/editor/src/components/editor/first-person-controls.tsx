'use client'

import {
  type AnyNode,
  type AnyNodeId,
  emitter,
  getLevelDisplayName,
  getLevelElevations,
  pointInPolygon2D,
  sceneRegistry,
  useInteractive,
  useScene,
} from '@pascal-app/core'
import {
  BVHEcctrl,
  type BVHEcctrlApi,
  CROUCH_CAPSULE,
  CROUCH_EYE_OFFSET,
  CROUCH_FLOAT_HEIGHT,
  CROUCH_RUN_SPEED,
  CROUCH_WALK_SPEED,
  EYE_LERP_SPEED,
  type MovementInput,
  requestWalkthroughPointerLock,
  STAND_CAPSULE,
  STAND_CLEARANCE,
  STAND_FLOAT_HEIGHT,
  shouldHandleWalkthroughLook,
  useViewer,
  WALKTHROUGH_FOV,
} from '@pascal-app/viewer'
import { KeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  Euler,
  Matrix4,
  type PerspectiveCamera,
  Ray,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import '../../three-types'
import {
  closeDoorOpenState,
  DOOR_SWING_OPEN_ANGLE,
  getDisplayedDoorValue,
  isOperationDoorType,
  toggleDoorOpenState,
} from '../../lib/door-interaction'
import {
  closeWindowOpenState,
  getDisplayedWindowValue,
  isOperableWindowType,
  toggleWindowOpenState,
} from '../../lib/window-interaction'
import useEditor from '../../store/use-editor'
import { useFirstPersonHud, type WalkthroughInteract } from '../../store/use-first-person-hud'
import { WalkthroughHud } from '../walkthrough-hud'
import {
  buildFirstPersonColliderWorldFromRegistry,
  deriveFirstPersonSpawn,
  FIRST_PERSON_SPAWN_EYE_HEIGHT,
  type FirstPersonColliderWorld,
  type FirstPersonSpawn,
} from './first-person/build-collider-world'

const CAMERA_EYE_OFFSET = 0.45
const LOOK_SENSITIVITY = 0.002
// Drone mode: metres per second, and how hard Shift boosts it. The smoothing
// constant is an exponential approach rate, not a linear acceleration.
const DRONE_SPEED = 7
const DRONE_RUN_MULTIPLIER = 3
const DRONE_SMOOTHING = 12
const CONTROLLER_CENTER_FROM_EYE = 0.85
const DOOR_INTERACTION_DISTANCE = 2.5
const DOOR_LEAF_INTERACTION_DEPTH = 0.08
const VOID_FALL_RESPAWN_DEPTH = 12
const HUD_LABEL_SAMPLE_FRAMES = 10

type MovementKeyName = Exclude<keyof MovementInput, 'joystick'>

const movementKeyboardBindings: Array<{ name: MovementKeyName; keys: string[] }> = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]
const keyboardMap = movementKeyboardBindings
const movementKeyToName = new Map<string, MovementKeyName>(
  movementKeyboardBindings.flatMap(({ name, keys }) => keys.map((key) => [key, name] as const)),
)

const inactiveMovementInput: MovementInput = {
  backward: false,
  forward: false,
  jump: false,
  leftward: false,
  rightward: false,
  run: false,
}

function getMovementInputForKey(code: string, active: boolean): MovementInput | null {
  const name = movementKeyToName.get(code)
  return name ? ({ [name]: active } as MovementInput) : null
}

function focusFirstPersonCanvas(canvas: HTMLCanvasElement) {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && !canvas.contains(activeElement)) {
    activeElement.blur()
  }

  if (!canvas.hasAttribute('tabindex')) {
    canvas.tabIndex = -1
  }
  canvas.focus({ preventScroll: true })
}

const cameraOffset = new Vector3()
const cameraEuler = new Euler(0, 0, 0, 'YXZ')
const droneEuler = new Euler(0, 0, 0, 'YXZ')
const droneForward = new Vector3()
const droneRight = new Vector3()
const droneDesiredVelocity = new Vector3()
const standClearanceRaycaster = new Raycaster()
const standClearanceUp = new Vector3(0, 1, 0)
const centerScreenPoint = new Vector2(0, 0)
const doorInteractionRaycaster = new Raycaster()
const doorLeafBox = new Box3()
const doorLeafInverseMatrix = new Matrix4()
const doorLeafLocalHit = new Vector3()
const doorLeafLocalRay = new Ray()
const doorLeafMatrix = new Matrix4()
const doorLeafWorldHit = new Vector3()
const doorOpeningBox = new Box3()
const doorOpeningInverseMatrix = new Matrix4()
const doorOpeningLocalHit = new Vector3()
const doorOpeningLocalRay = new Ray()
const doorOpeningMatrix = new Matrix4()
const doorOpeningWorldHit = new Vector3()
const spawnWorldPosition = new Vector3()
const spawnWorldEuler = new Euler(0, 0, 0, 'YXZ')
const windowInteractionRaycaster = new Raycaster()
const hudBuildingLocalEyePosition = new Vector3()
const hudWorldEyePosition = new Vector3()
const hudLevelBounds = new Box3()

type FirstPersonInteractableTarget = {
  id: AnyNodeId
  type: 'door' | 'window'
}

function getLevelChildren(
  level: Extract<AnyNode, { type: 'level' }>,
  nodes: Record<string, AnyNode>,
) {
  const childIds = new Set<string>(level.children)
  return Object.values(nodes).filter((node) => node.parentId === level.id || childIds.has(node.id))
}

function pointIsInLevelFootprint(
  point: [number, number],
  worldPoint: Vector3,
  level: Extract<AnyNode, { type: 'level' }>,
  nodes: Record<string, AnyNode>,
) {
  const children = getLevelChildren(level, nodes)
  const slabs = children.filter(
    (node): node is Extract<AnyNode, { type: 'slab' }> =>
      node.type === 'slab' && node.polygon.length >= 3,
  )
  const zones = children.filter(
    (node): node is Extract<AnyNode, { type: 'zone' }> =>
      node.type === 'zone' && node.polygon.length >= 3,
  )

  if (slabs.length > 0) {
    return slabs.some(
      (slab) =>
        pointInPolygon2D(point, slab.polygon) &&
        !slab.holes.some((hole) => pointInPolygon2D(point, hole)),
    )
  }

  if (zones.length > 0) {
    if (zones.some((zone) => pointInPolygon2D(point, zone.polygon))) return true
  }

  const levelObject = sceneRegistry.nodes.get(level.id)
  if (!levelObject) return false
  hudLevelBounds.setFromObject(levelObject)
  return (
    !hudLevelBounds.isEmpty() &&
    worldPoint.x >= hudLevelBounds.min.x &&
    worldPoint.x <= hudLevelBounds.max.x &&
    worldPoint.z >= hudLevelBounds.min.z &&
    worldPoint.z <= hudLevelBounds.max.z
  )
}

function resolveFirstPersonHudLabels(worldPoint: Vector3) {
  const nodes = useScene.getState().nodes
  const levelElevations = getLevelElevations(nodes as Record<AnyNodeId, AnyNode>)

  for (const building of Object.values(nodes)) {
    if (building.type !== 'building') continue
    const buildingObject = sceneRegistry.nodes.get(building.id)
    if (!buildingObject) continue

    buildingObject.updateWorldMatrix(true, true)
    hudBuildingLocalEyePosition.copy(worldPoint)
    buildingObject.worldToLocal(hudBuildingLocalEyePosition)

    const levels = Object.values(nodes)
      .filter((node) => node.type === 'level')
      .filter((level) => levelElevations.get(level.id)?.buildingId === building.id)
      .sort(
        (left, right) =>
          (levelElevations.get(left.id)?.baseY ?? 0) - (levelElevations.get(right.id)?.baseY ?? 0),
      )

    let activeLevel: (typeof levels)[number] | null = null
    for (const level of levels) {
      const elevation = levelElevations.get(level.id)
      if (!elevation) continue
      if (
        hudBuildingLocalEyePosition.y >= elevation.baseY - 0.5 &&
        hudBuildingLocalEyePosition.y < elevation.baseY + elevation.height + 0.5
      ) {
        activeLevel = level
      }
    }
    if (!activeLevel) continue

    const point: [number, number] = [hudBuildingLocalEyePosition.x, hudBuildingLocalEyePosition.z]
    if (!pointIsInLevelFootprint(point, worldPoint, activeLevel, nodes)) continue

    const zone = getLevelChildren(activeLevel, nodes).find(
      (node) =>
        node.type === 'zone' && node.polygon.length >= 3 && pointInPolygon2D(point, node.polygon),
    )

    return {
      floorLabel: getLevelDisplayName(activeLevel),
      zoneLabel: zone?.type === 'zone' ? zone.name : null,
    }
  }

  return { floorLabel: null, zoneLabel: null }
}

function resolveHudInteract(target: FirstPersonInteractableTarget | null): WalkthroughInteract {
  if (!target) return null

  const node = useScene.getState().nodes[target.id]
  if (target.type === 'window') {
    if (node?.type !== 'window') return null
    const isOpen = getDisplayedWindowValue(target.id, node.operationState) > 0
    return { label: node.name || '窗', verb: isOpen ? '关闭' : '打开' }
  }

  if (node?.type !== 'door') return null
  const isOpen = isOperationDoorType(node.doorType)
    ? getDisplayedDoorValue(target.id, 'operationState', node.operationState) > 0
    : getDisplayedDoorValue(target.id, 'swingAngle', node.swingAngle) > 0
  return { label: node.name || '门', verb: isOpen ? '关闭' : '打开' }
}

function getInteractableTargetKey(target: FirstPersonInteractableTarget | null) {
  if (!target) return null
  return `${target.type}:${target.id}`
}

const resolvePlacedSpawnNode = (
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  _levelId: string | null,
) => {
  const candidates = Object.values(nodes).filter((node) => node.type === 'spawn')
  if (candidates.length === 0) return null

  return [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
}

export const FirstPersonControls = () => {
  const { camera, gl } = useThree()
  const selectedLevelId = useViewer((state) => state.selection.levelId)
  const placedSpawnNode = useScene((state) => resolvePlacedSpawnNode(state.nodes, selectedLevelId))
  const isDroneMode = useEditor((state) => state.firstPersonMovementMode === 'drone')
  const controllerRef = useRef<BVHEcctrlApi | null>(null)
  const movementInputRef = useRef<MovementInput>({ ...inactiveMovementInput })
  const hadPointerLockRef = useRef(false)
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const interactableTargetRef = useRef<FirstPersonInteractableTarget | null>(null)
  const hudLabelFrameRef = useRef(HUD_LABEL_SAMPLE_FRAMES - 1)
  const crouchKeyRef = useRef(false)
  const droneAscendKeyRef = useRef(false)
  const droneDescendKeyRef = useRef(false)
  const droneVelocityRef = useRef(new Vector3())
  const suspendRef = useRef(true)
  const eyeOffsetRef = useRef(CAMERA_EYE_OFFSET)
  const [crouched, setCrouched] = useState(false)
  const captureShutterHold = useEditor((state) => state.captureShutterHold)
  const worldRef = useRef<FirstPersonColliderWorld | null>(null)
  const [world, setWorld] = useState<FirstPersonColliderWorld | null>(null)
  const [controllerStart, setControllerStart] = useState<{
    position: [number, number, number]
    yaw: number
  } | null>(null)

  useEffect(() => {
    const previousCameraMode = useViewer.getState().cameraMode
    if (previousCameraMode === 'orthographic') {
      useViewer.getState().setCameraMode('perspective')
    }
    return () => {
      if (previousCameraMode === 'orthographic') {
        useViewer.getState().setCameraMode('orthographic')
      }
    }
  }, [])

  // While a snapshot is being framed the capture rig owns the fov (the user is
  // driving it from the overlay's slider), so walkthrough neither applies its
  // own nor restores one underneath it. Read imperatively: this must not re-run
  // — and therefore restore — when capture mode toggles mid-walkthrough.
  useEffect(() => {
    const perspectiveCamera = camera as PerspectiveCamera
    if (!perspectiveCamera.isPerspectiveCamera) return
    if (useEditor.getState().isCaptureMode) return
    const previousFov = perspectiveCamera.fov
    perspectiveCamera.fov = WALKTHROUGH_FOV
    perspectiveCamera.updateProjectionMatrix()
    return () => {
      if (useEditor.getState().isCaptureMode) return
      perspectiveCamera.fov = previousFov
      perspectiveCamera.updateProjectionMatrix()
    }
  }, [camera])

  useEffect(() => {
    useFirstPersonHud.getState().reset()
    return () => useFirstPersonHud.getState().reset()
  }, [])

  const replaceColliderWorld = useCallback((nextWorld: FirstPersonColliderWorld | null) => {
    worldRef.current?.dispose()
    worldRef.current = nextWorld
    setWorld(nextWorld)
  }, [])

  const rebuildColliderWorld = useCallback(() => {
    replaceColliderWorld(buildFirstPersonColliderWorldFromRegistry())
  }, [replaceColliderWorld])

  const setControllerApi = useCallback((api: BVHEcctrlApi | null) => {
    controllerRef.current = api
    if (api) {
      api.setMovement(movementInputRef.current)
    }
  }, [])

  const resolveInteractableDoorId = useCallback((): AnyNodeId | null => {
    const nodes = useScene.getState().nodes
    camera.updateMatrixWorld(true)
    doorInteractionRaycaster.setFromCamera(centerScreenPoint, camera)

    let closestDoorId: AnyNodeId | null = null
    let closestDistance = DOOR_INTERACTION_DISTANCE

    for (const doorId of sceneRegistry.byType.door!) {
      const node = nodes[doorId as AnyNodeId]
      if (node?.type !== 'door') continue
      if (node.openingKind === 'opening') continue
      if (node.segments.every((segment) => segment.type === 'empty')) continue

      const object = sceneRegistry.nodes.get(doorId)
      if (!object) continue

      object.updateWorldMatrix(true, true)

      const placementHit = doorInteractionRaycaster
        .intersectObject(object, true)
        .find((intersection) => intersection.distance <= DOOR_INTERACTION_DISTANCE)
      if (placementHit && placementHit.distance < closestDistance) {
        closestDoorId = doorId as AnyNodeId
        closestDistance = placementHit.distance
      }

      const leafW = node.width - 2 * node.frameThickness
      const leafH = node.height - node.frameThickness
      if (leafW <= 0 || leafH <= 0) continue

      const leafCenterY = -node.frameThickness / 2

      if (isOperationDoorType(node.doorType)) {
        doorOpeningMatrix
          .copy(object.matrixWorld)
          .multiply(new Matrix4().makeTranslation(0, leafCenterY, 0))
        doorOpeningInverseMatrix.copy(doorOpeningMatrix).invert()
        doorOpeningBox.min.set(-leafW / 2, -leafH / 2, -DOOR_LEAF_INTERACTION_DEPTH / 2)
        doorOpeningBox.max.set(leafW / 2, leafH / 2, DOOR_LEAF_INTERACTION_DEPTH / 2)
        doorOpeningLocalRay
          .copy(doorInteractionRaycaster.ray)
          .applyMatrix4(doorOpeningInverseMatrix)

        const localOpeningHit = doorOpeningLocalRay.intersectBox(
          doorOpeningBox,
          doorOpeningLocalHit,
        )
        if (!localOpeningHit) continue

        doorOpeningWorldHit.copy(localOpeningHit).applyMatrix4(doorOpeningMatrix)
        const openingHitDistance = doorOpeningWorldHit.distanceTo(
          doorInteractionRaycaster.ray.origin,
        )

        if (
          openingHitDistance <= DOOR_INTERACTION_DISTANCE &&
          openingHitDistance < closestDistance
        ) {
          closestDoorId = doorId as AnyNodeId
          closestDistance = openingHitDistance
        }
        continue
      }

      const hingeX = node.hingesSide === 'right' ? leafW / 2 : -leafW / 2
      const swingDirectionSign = node.swingDirection === 'inward' ? 1 : -1
      const hingeDirectionSign = node.hingesSide === 'right' ? 1 : -1
      const currentSwingAngle =
        useInteractive.getState().doors[doorId as AnyNodeId]?.swingAngle ?? node.swingAngle ?? 0
      const clampedSwingAngle = Math.max(0, Math.min(DOOR_SWING_OPEN_ANGLE, currentSwingAngle))
      const leafSwingRotation = clampedSwingAngle * swingDirectionSign * hingeDirectionSign

      doorLeafMatrix
        .copy(object.matrixWorld)
        .multiply(new Matrix4().makeTranslation(hingeX, 0, 0))
        .multiply(new Matrix4().makeRotationY(leafSwingRotation))
        .multiply(new Matrix4().makeTranslation(-hingeX, leafCenterY, 0))
      doorLeafInverseMatrix.copy(doorLeafMatrix).invert()
      doorLeafBox.min.set(-leafW / 2, -leafH / 2, -DOOR_LEAF_INTERACTION_DEPTH / 2)
      doorLeafBox.max.set(leafW / 2, leafH / 2, DOOR_LEAF_INTERACTION_DEPTH / 2)
      doorLeafLocalRay.copy(doorInteractionRaycaster.ray).applyMatrix4(doorLeafInverseMatrix)

      const localHit = doorLeafLocalRay.intersectBox(doorLeafBox, doorLeafLocalHit)
      if (!localHit) continue

      doorLeafWorldHit.copy(localHit).applyMatrix4(doorLeafMatrix)
      const hitDistance = doorLeafWorldHit.distanceTo(doorInteractionRaycaster.ray.origin)

      if (hitDistance <= DOOR_INTERACTION_DISTANCE && hitDistance < closestDistance) {
        closestDoorId = doorId as AnyNodeId
        closestDistance = hitDistance
      }
    }

    return closestDoorId
  }, [camera])

  const resolveInteractableWindowId = useCallback((): AnyNodeId | null => {
    const nodes = useScene.getState().nodes
    camera.updateMatrixWorld(true)
    windowInteractionRaycaster.setFromCamera(centerScreenPoint, camera)

    let closestWindowId: AnyNodeId | null = null
    let closestDistance = DOOR_INTERACTION_DISTANCE

    for (const windowId of sceneRegistry.byType.window!) {
      const node = nodes[windowId as AnyNodeId]
      if (node?.type !== 'window') continue
      if (node.openingKind === 'opening') continue
      if (!isOperableWindowType(node.windowType)) continue

      const object = sceneRegistry.nodes.get(windowId)
      if (!object) continue

      const hit = windowInteractionRaycaster
        .intersectObject(object, true)
        .find((intersection) => intersection.distance <= DOOR_INTERACTION_DISTANCE)
      if (!(hit && hit.distance < closestDistance)) continue

      closestWindowId = windowId as AnyNodeId
      closestDistance = hit.distance
    }

    return closestWindowId
  }, [camera])

  const resolveInteractableTarget = useCallback((): FirstPersonInteractableTarget | null => {
    const doorId = resolveInteractableDoorId()
    if (doorId) return { id: doorId, type: 'door' }

    const windowId = resolveInteractableWindowId()
    if (windowId) return { id: windowId, type: 'window' }

    return null
  }, [resolveInteractableDoorId, resolveInteractableWindowId])

  const toggleInteractableTarget = useCallback(() => {
    // Drone is a camera, not an avatar: the click that re-acquires pointer lock
    // must not swing a door open under the shot being framed. (In capture
    // mode's walk camera the CLICK path is gated at handleMouseDown — there a
    // locked-pointer click is the shutter — but E/R still open doors, so the
    // photographer can stage the shot.)
    if (isDroneMode) return

    const target = interactableTargetRef.current ?? resolveInteractableTarget()
    if (!target) return

    if (target.type === 'window') {
      const node = useScene.getState().nodes[target.id]
      if (
        node?.type !== 'window' ||
        node.openingKind === 'opening' ||
        !isOperableWindowType(node.windowType)
      ) {
        return
      }

      toggleWindowOpenState(target.id, { persist: false })
      return
    }

    const doorId = target.id

    const node = useScene.getState().nodes[doorId]
    if (node?.type !== 'door' || node.openingKind === 'opening') return

    toggleDoorOpenState(doorId, { persist: false })
  }, [isDroneMode, resolveInteractableTarget])

  const closeInteractableTarget = useCallback(() => {
    if (isDroneMode) return

    const target = interactableTargetRef.current ?? resolveInteractableTarget()
    if (!target) return

    if (target.type === 'window') {
      const node = useScene.getState().nodes[target.id]
      if (
        node?.type !== 'window' ||
        node.openingKind === 'opening' ||
        !isOperableWindowType(node.windowType)
      ) {
        return
      }

      closeWindowOpenState(target.id, { persist: false })
      return
    }

    const node = useScene.getState().nodes[target.id]
    if (node?.type !== 'door' || node.openingKind === 'opening') return

    closeDoorOpenState(target.id, { persist: false })
  }, [isDroneMode, resolveInteractableTarget])

  const placedSpawn = useMemo<FirstPersonSpawn | null>(() => {
    if (!(placedSpawnNode && placedSpawnNode.type === 'spawn')) return null

    const spawnObject = sceneRegistry.nodes.get(placedSpawnNode.id)
    if (spawnObject) {
      spawnObject.updateWorldMatrix(true, false)
      spawnObject.getWorldPosition(spawnWorldPosition)
      spawnWorldEuler.setFromRotationMatrix(spawnObject.matrixWorld, 'YXZ')

      return {
        position: [
          spawnWorldPosition.x,
          spawnWorldPosition.y + FIRST_PERSON_SPAWN_EYE_HEIGHT,
          spawnWorldPosition.z,
        ],
        yaw: spawnWorldEuler.y,
      }
    }

    return {
      position: [
        placedSpawnNode.position[0],
        placedSpawnNode.position[1] + FIRST_PERSON_SPAWN_EYE_HEIGHT,
        placedSpawnNode.position[2],
      ],
      yaw: placedSpawnNode.rotation,
    }
  }, [placedSpawnNode])

  useEffect(() => {
    // Drone has no gravity, no floor and no collision, so the BVH collider world
    // (a full-scene traversal, rebuilt on every door/window animation) is pure
    // cost there. Switching modes disposes it and rebuilds on the way back.
    if (!isDroneMode) rebuildColliderWorld()

    return () => {
      worldRef.current?.dispose()
      worldRef.current = null
      setWorld(null)
    }
  }, [isDroneMode, rebuildColliderWorld])

  useEffect(() => {
    if (isDroneMode) return
    emitter.on('door:animation-completed', rebuildColliderWorld)
    emitter.on('window:animation-completed', rebuildColliderWorld)
    return () => {
      emitter.off('door:animation-completed', rebuildColliderWorld)
      emitter.off('window:animation-completed', rebuildColliderWorld)
    }
  }, [isDroneMode, rebuildColliderWorld])

  // A walk session started before a drone detour would otherwise resume at its
  // original spawn; drop it so the next walk re-derives one.
  useEffect(() => {
    if (isDroneMode) setControllerStart(null)
  }, [isDroneMode])

  // Drone picks up wherever the camera currently is — orbit pose or walk eye.
  useEffect(() => {
    if (!isDroneMode) return
    droneEuler.setFromQuaternion(camera.quaternion)
    yawRef.current = droneEuler.y
    pitchRef.current = droneEuler.x
    droneVelocityRef.current.set(0, 0, 0)

    // Interaction prompts belong to walk; drop whatever its frame left behind.
    if (useViewer.getState().hoveredId === interactableTargetRef.current?.id) {
      useViewer.getState().setHoveredId(null)
    }
    interactableTargetRef.current = null
    useFirstPersonHud.getState().reset()
  }, [camera, isDroneMode])

  useEffect(() => {
    if (!world) return
    if (controllerStart) return

    const spawn = placedSpawn ?? deriveFirstPersonSpawn(camera, world)
    const [x, y, z] = spawn.position
    yawRef.current = spawn.yaw
    pitchRef.current = 0
    setControllerStart({
      position: [x, y - CONTROLLER_CENTER_FROM_EYE, z],
      yaw: spawn.yaw,
    })
  }, [camera, controllerStart, placedSpawn, world])

  useEffect(() => {
    const canvas = gl.domElement
    focusFirstPersonCanvas(canvas)

    const frame = window.requestAnimationFrame(() => focusFirstPersonCanvas(canvas))
    return () => window.cancelAnimationFrame(frame)
  }, [gl])

  // The pointer-lock effect below must be mount-stable. Its cleanup exits
  // pointer lock, and `toggleInteractableTarget` is recreated whenever the
  // camera object changes — which happens right after entry when the
  // persisted orthographic mode swaps to perspective. If the async lock
  // grant lands before that re-run, the cleanup's exitPointerLock fires an
  // unlock the handler reads as "user left walkthrough", instantly
  // cancelling a fresh entry (and arming the browser's ~1.25s re-lock
  // cooldown, so the next presses fail too). Route the callback through a
  // ref so the effect deps stay `[gl]`.
  const toggleInteractableTargetRef = useRef(toggleInteractableTarget)
  useEffect(() => {
    toggleInteractableTargetRef.current = toggleInteractableTarget
  }, [toggleInteractableTarget])

  useEffect(() => {
    const canvas = gl.domElement
    const handleMouseMove = (e: MouseEvent) => {
      if (!shouldHandleWalkthroughLook(e, canvas)) return
      // Shutter hold: the shot is rendering — a mouse twitch must not pan it.
      if (useEditor.getState().captureShutterHold) return

      yawRef.current -= e.movementX * LOOK_SENSITIVITY
      pitchRef.current = Math.max(
        -(Math.PI / 2 - 0.05),
        Math.min(Math.PI / 2 - 0.05, pitchRef.current - e.movementY * LOOK_SENSITIVITY),
      )
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!canvas.contains(target)) return
      if (document.pointerLockElement !== canvas) {
        requestWalkthroughPointerLock({ canvas })
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      if (event.button !== 0) return

      // Capture mode: the locked-pointer click is the SHUTTER (the snapshot
      // overlay's window-capture listener already fired); doors stay on E/R.
      if (useEditor.getState().isCaptureMode) return

      event.preventDefault()
      event.stopPropagation()
      toggleInteractableTargetRef.current()
    }

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvas
      if (isLocked) {
        hadPointerLockRef.current = true
        suspendRef.current = false
        useViewer.getState().setWalkthroughSuspended(false)
        return
      }

      // Deliberately released (screenshot pause) — stay in first person;
      // clicking the canvas re-locks.
      if (suspendRef.current) return

      // Capture mode: Esc (the browser's own unlock — no keydown reaches us)
      // acts like P. Dropping back to orbit would throw away the framed pose,
      // which reads as a crash to anyone who never noticed P.
      if (
        hadPointerLockRef.current &&
        useEditor.getState().isCaptureMode &&
        useEditor.getState().isFirstPersonMode
      ) {
        suspendRef.current = true
        useViewer.getState().setWalkthroughSuspended(true)
        return
      }

      if (hadPointerLockRef.current && useEditor.getState().isFirstPersonMode) {
        useEditor.getState().setFirstPersonMode(false)
      }
    }

    // A rejected lock must leave the HUD in its click/P-to-resume state.
    useViewer.getState().setWalkthroughSuspended(true)
    handlePointerLockChange()
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleClick)
    document.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('pointerlockchange', handlePointerLockChange)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      useViewer.getState().setWalkthroughSuspended(false)
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
    }
  }, [gl])

  useEffect(() => {
    const canvas = gl.domElement

    const applyMovementKey = (event: KeyboardEvent, active: boolean) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return false
      }

      const movement = getMovementInputForKey(event.code, active)
      if (!movement) return false

      event.preventDefault()
      Object.assign(movementInputRef.current, movement)
      controllerRef.current?.setMovement(movement)
      return true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const handledMovement = applyMovementKey(event, true)
      if (handledMovement) return

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        // While paused (P), crouch is frozen as-is — ⌃⇧⌘4 (clipboard
        // screenshot) must not toggle it under the user.
        if (!suspendRef.current) crouchKeyRef.current = true
      } else if (event.code === 'KeyQ') {
        // Drone descend. Space (already bound to jump) and E are the matching ascend.
        event.preventDefault()
        event.stopPropagation()
        if (!suspendRef.current) droneDescendKeyRef.current = true
      } else if (event.code === 'KeyE' && isDroneMode) {
        event.preventDefault()
        event.stopPropagation()
        if (!suspendRef.current) droneAscendKeyRef.current = true
      } else if (event.code === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        // Capture mode, first Esc frees the cursor (see handlePointerLockChange
        // — while locked the browser usually unlocks without delivering the
        // keydown); with the cursor already free, Esc cancels the snapshot
        // (setCaptureMode(false) also lands the camera back on orbit).
        if (useEditor.getState().isCaptureMode) {
          if (document.pointerLockElement === canvas) {
            suspendRef.current = true
            useViewer.getState().setWalkthroughSuspended(true)
            document.exitPointerLock()
          } else {
            useEditor.getState().setCaptureMode(false)
          }
          return
        }
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock()
        }
        useEditor.getState().setFirstPersonMode(false)
      } else if (event.code === 'KeyE' || event.code === 'KeyR') {
        event.preventDefault()
        event.stopPropagation()
        toggleInteractableTarget()
      } else if (event.code === 'KeyT') {
        event.preventDefault()
        event.stopPropagation()
        closeInteractableTarget()
      } else if (event.code === 'KeyP') {
        // P toggles a cursor pause (advertised in the HUD): frees the pointer
        // without leaving first person — e.g. for an OS screenshot, which
        // needs a movable cursor — and click or P resumes.
        event.preventDefault()
        event.stopPropagation()
        if (document.pointerLockElement === canvas) {
          suspendRef.current = true
          useViewer.getState().setWalkthroughSuspended(true)
          document.exitPointerLock()
        } else if (suspendRef.current) {
          requestWalkthroughPointerLock({ canvas })
        }
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && !suspendRef.current) {
        crouchKeyRef.current = false
      }
      if (event.code === 'KeyQ' && !suspendRef.current) {
        droneDescendKeyRef.current = false
      }
      if (event.code === 'KeyE' && !suspendRef.current) {
        droneAscendKeyRef.current = false
      }
      applyMovementKey(event, false)
    }

    const handleBlur = () => {
      if (!suspendRef.current) {
        crouchKeyRef.current = false
        droneAscendKeyRef.current = false
        droneDescendKeyRef.current = false
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [closeInteractableTarget, gl, isDroneMode, toggleInteractableTarget])

  const hasStandingClearance = useCallback((position: Vector3) => {
    standClearanceRaycaster.set(position, standClearanceUp)
    standClearanceRaycaster.far = STAND_CLEARANCE
    const meshes = worldRef.current ? [worldRef.current.mesh] : []
    return standClearanceRaycaster.intersectObjects(meshes, false).length === 0
  }, [])

  // Drone: a free camera driven straight from the look angles — no controller,
  // no gravity or collision clamping. WASD move along the view axes, Space or E
  // rises, Q (or Ctrl) sinks, and Shift boosts.
  useFrame((_, delta) => {
    if (!isDroneMode) return
    // Shutter hold: freeze the drone mid-air while the shot renders.
    if (useEditor.getState().captureShutterHold) return

    const step = Math.min(delta, 0.1)
    const movement = movementInputRef.current

    droneEuler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(droneEuler)
    droneForward.set(0, 0, -1).applyEuler(droneEuler)
    droneRight.set(1, 0, 0).applyEuler(droneEuler)

    droneDesiredVelocity.set(0, 0, 0)
    if (movement.forward) droneDesiredVelocity.add(droneForward)
    if (movement.backward) droneDesiredVelocity.sub(droneForward)
    if (movement.rightward) droneDesiredVelocity.add(droneRight)
    if (movement.leftward) droneDesiredVelocity.sub(droneRight)
    if (movement.jump || droneAscendKeyRef.current) droneDesiredVelocity.y += 1
    if (droneDescendKeyRef.current || crouchKeyRef.current) droneDesiredVelocity.y -= 1
    if (droneDesiredVelocity.lengthSq() > 0) {
      droneDesiredVelocity
        .normalize()
        .multiplyScalar(DRONE_SPEED * (movement.run ? DRONE_RUN_MULTIPLIER : 1))
    }

    droneVelocityRef.current.lerp(droneDesiredVelocity, 1 - Math.exp(-step * DRONE_SMOOTHING))
    camera.position.addScaledVector(droneVelocityRef.current, step)
    camera.updateMatrixWorld(true)
  }, 2.5)

  useFrame((_, delta) => {
    if (isDroneMode) return
    if (!controllerRef.current?.group) return

    const group = controllerRef.current.group

    // Crouch follows the held key; standing back up waits for headroom.
    // Frozen while the cursor pause is active.
    if (!suspendRef.current && crouchKeyRef.current !== crouched) {
      if (crouchKeyRef.current) setCrouched(true)
      else if (hasStandingClearance(group.position)) setCrouched(false)
    }
    const targetEyeOffset = crouched ? CROUCH_EYE_OFFSET : CAMERA_EYE_OFFSET
    eyeOffsetRef.current +=
      (targetEyeOffset - eyeOffsetRef.current) * Math.min(1, delta * EYE_LERP_SPEED)
    cameraOffset.set(0, eyeOffsetRef.current, 0)

    // The site ground collider is effectively unbounded, but scenes without a
    // site node only have finite fallback floors — if the controller still ends
    // up below every collider it can never land, so put it back at the spawn.
    // Prefer the live spawn node over the mount-time start position so a spawn
    // moved mid-walkthrough doesn't respawn the player at stale coordinates.
    const worldBounds = worldRef.current?.bounds
    if (worldBounds && group.position.y < worldBounds.min.y - VOID_FALL_RESPAWN_DEPTH) {
      const respawnPosition = placedSpawn
        ? [
            placedSpawn.position[0],
            placedSpawn.position[1] - CONTROLLER_CENTER_FROM_EYE,
            placedSpawn.position[2],
          ]
        : controllerStart?.position
      if (respawnPosition) {
        group.position.set(respawnPosition[0]!, respawnPosition[1]!, respawnPosition[2]!)
        controllerRef.current.resetLinVel()
      }
    }

    group.rotation.y = 0
    camera.position.copy(group.position).add(cameraOffset)
    cameraEuler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(cameraEuler)
    camera.updateMatrixWorld(true)
    camera.position.copy(group.position).add(cameraOffset)
    camera.updateMatrixWorld(true)

    const nextInteractableTarget = resolveInteractableTarget()
    const previousInteractableTarget = interactableTargetRef.current
    if (
      getInteractableTargetKey(previousInteractableTarget) !==
      getInteractableTargetKey(nextInteractableTarget)
    ) {
      interactableTargetRef.current = nextInteractableTarget
      useViewer.getState().setHoveredId(nextInteractableTarget?.id ?? null)
    }

    useFirstPersonHud.getState().setHud({
      interact: resolveHudInteract(nextInteractableTarget),
    })

    hudLabelFrameRef.current += 1
    if (hudLabelFrameRef.current >= HUD_LABEL_SAMPLE_FRAMES) {
      hudLabelFrameRef.current = 0
      camera.getWorldPosition(hudWorldEyePosition)
      useFirstPersonHud.getState().setHud(resolveFirstPersonHudLabels(hudWorldEyePosition))
    }
  }, 2.5)

  useEffect(() => {
    return () => {
      if (useViewer.getState().hoveredId === interactableTargetRef.current?.id) {
        useViewer.getState().setHoveredId(null)
      }
    }
  }, [])

  const firstPersonColliderMeshes = useMemo(() => (world ? [world.mesh] : []), [world])

  if (isDroneMode || !world) {
    return null
  }

  return (
    <>
      {controllerStart && (
        <KeyboardControls map={keyboardMap}>
          <BVHEcctrl
            acceleration={26}
            airDragFactor={0.3}
            colliderCapsuleArgs={crouched ? CROUCH_CAPSULE : STAND_CAPSULE}
            colliderMeshes={firstPersonColliderMeshes}
            collisionCheckIteration={3}
            collisionPushBackDamping={0.1}
            collisionPushBackThreshold={0.001}
            debug={false}
            deceleration={30}
            delay={0}
            fallGravityFactor={4}
            floatCheckType="BOTH"
            floatDampingC={36}
            floatHeight={crouched ? CROUCH_FLOAT_HEIGHT : STAND_FLOAT_HEIGHT}
            floatPullBackHeight={0.35}
            floatSensorRadius={0.15}
            floatSpringK={1200}
            gravity={9.81}
            jumpVel={5}
            key="first-person-controller"
            maxRunSpeed={crouched ? CROUCH_RUN_SPEED : 5}
            maxSlope={1.2}
            maxWalkSpeed={crouched ? CROUCH_WALK_SPEED : 2}
            paused={captureShutterHold}
            position={controllerStart.position}
            ref={setControllerApi}
          />
        </KeyboardControls>
      )}
    </>
  )
}

export const FirstPersonOverlay = ({ onExit }: { onExit: () => void }) => {
  const hasPlacedSpawn = useScene((state) =>
    Object.values(state.nodes).some((node) => node.type === 'spawn'),
  )
  const floorLabel = useFirstPersonHud((state) => state.floorLabel)
  const zoneLabel = useFirstPersonHud((state) => state.zoneLabel)
  const interact = useFirstPersonHud((state) => state.interact)
  const suspended = useViewer((state) => state.walkthroughSuspended)

  const handleExit = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    onExit()
  }, [onExit])

  return (
    <WalkthroughHud
      floorLabel={floorLabel}
      interact={interact}
      onExit={handleExit}
      suspended={suspended}
      zoneLabel={zoneLabel}
    >
      {!hasPlacedSpawn && (
        <div className="corner-smooth rounded-full border border-border/40 bg-background/80 px-3 py-1 text-center text-muted-foreground text-xs shadow-elevation-3 backdrop-blur-xl">
          在“建模”面板放置出生点，以设置漫游起点。
        </div>
      )}
    </WalkthroughHud>
  )
}
