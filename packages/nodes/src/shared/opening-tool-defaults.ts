import { DoorNode, WindowNode } from '@pascal-app/core'

const placementFields = {
  id: true,
  type: true,
  object: true,
  parentId: true,
  camera: true,
  metadata: true,
  visible: true,
  position: true,
  rotation: true,
  side: true,
  wallId: true,
  roofSegmentId: true,
  roofFace: true,
} as const

const doorParameters = DoorNode.omit(placementFields)
const windowParameters = WindowNode.omit({
  ...placementFields,
  dormerId: true,
  dormerFace: true,
})

// A preset supplies geometry and finishes; the native tool owns IDs and hosts.
export function doorToolParameters(value: unknown) {
  const parsed = doorParameters.safeParse(value ?? {})
  return parsed.success ? parsed.data : doorParameters.parse({})
}

export function windowToolParameters(value: unknown) {
  const parsed = windowParameters.safeParse(value ?? {})
  return parsed.success ? parsed.data : windowParameters.parse({})
}
