import type { CameraPoseKey } from '@/lib/camera-director'
import type { CameraKeyframe } from './model'

export function cameraFrameToDirectorKey(
  frame: CameraKeyframe,
  sensorHeightMm: number,
  focusDistanceM: number,
): CameraPoseKey {
  if (
    ![...frame.position, ...frame.lookAt, frame.fov, sensorHeightMm, focusDistanceM].every(
      Number.isFinite,
    ) ||
    frame.fov < 5 ||
    frame.fov > 150 ||
    sensorHeightMm <= 0 ||
    focusDistanceM < 0
  )
    throw new Error('机位参数无效，请检查位置、视角与镜头参数。')
  const focalLengthMm = sensorHeightMm / (2 * Math.tan((frame.fov * Math.PI) / 360))
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) {
    throw new Error('无法换算镜头焦距，请检查传感器高度。')
  }
  return {
    position: [...frame.position],
    target: [...frame.lookAt],
    focalLengthMm,
    focusDistanceM,
  }
}
