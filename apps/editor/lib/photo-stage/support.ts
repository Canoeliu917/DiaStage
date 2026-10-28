import {
  prepareStageCollision,
  type SceneContextObject,
  stageCollisionGeometry,
  stageContactHeight,
  stageFoldGeometry,
} from '@pascal-app/core/stage'
import { AiError } from '../ai/api'
import { AVAILABLE_STAGE_SCENERY, stagePropCollisionGeometry } from '../stage/prop-assets'
import { type PhotoStageObject, type PhotoStagePlan, PhotoStagePlanSchema } from './plan'

export type PhotoSupport = {
  type: 'floor' | 'object' | 'elevated' | 'uncertain'
  objectId: string | null
  bottomHeightMeters: number | null
}

function invalid(message: string): never {
  throw new AiError('PLAN_INVALID', message, 422, true)
}

function collisionObject(object: PhotoStageObject): SceneContextObject {
  const asset = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === object.assetId)?.asset
  const fold = asset
    ? stageFoldGeometry(
        asset.id,
        {
          fold_angle_1_deg: object.hingeAngles?.[0],
          fold_angle_2_deg: object.hingeAngles?.[1],
        },
        [
          object.dimensions.width / asset.dimensions![0],
          object.dimensions.height / asset.dimensions![1],
          object.dimensions.depth / asset.dimensions![2],
        ],
      )
    : undefined
  return {
    id: object.id,
    name: object.name,
    kind: object.kind,
    dimensionsMeters: fold
      ? { width: fold.dimensions[0], height: fold.dimensions[1], depth: fold.dimensions[2] }
      : object.dimensions,
    transform: {
      position: { x: object.position[0], y: object.position[1], z: object.position[2] },
      rotationDegrees: {
        x: (object.rotation[0] * 180) / Math.PI,
        y: (object.rotation[1] * 180) / Math.PI,
        z: (object.rotation[2] * 180) / Math.PI,
      },
    },
    collisionGeometry:
      fold?.collisionGeometry ??
      stagePropCollisionGeometry(object.assetId, object.dimensions) ??
      stageCollisionGeometry({
        kind: object.profile ? 'neutral-block' : object.kind,
        dimensionsMeters: object.dimensions,
        stepCount: object.stepCount,
      }),
    stepCount: object.stepCount,
  }
}

function requireContactGeometry(object: PhotoStageObject) {
  if (
    object.assetId === null &&
    (object.kind === 'stairs' || (object.profile && object.profile !== 'box'))
  )
    invalid(`「${object.name}」的特殊轮廓暂不能可靠计算支撑接触，请改用标准库道具或明确离地高度。`)
}

export function groundPhotoSupports(
  input: PhotoStagePlan,
  supports: Record<string, PhotoSupport>,
): PhotoStagePlan {
  const plan = PhotoStagePlanSchema.parse(input)
  const objects = new Map(plan.objects.map((object) => [object.id, object]))
  const active = new Set<string>()
  const done = new Set<string>()
  let derived = false
  let elevated = false
  const resolve = (object: PhotoStageObject) => {
    if (done.has(object.id)) return
    if (active.has(object.id)) invalid('照片物件的支撑关系形成循环，请明确各自放在哪个支撑物上。')
    const support = Object.hasOwn(supports, object.id) ? supports[object.id] : undefined
    if (!support)
      invalid(`「${object.name}」缺少支撑说明，请明确放在地面、指定道具上或估计离地高度。`)
    active.add(object.id)
    let y: number
    if (support.type === 'floor') {
      if (support.objectId !== null || support.bottomHeightMeters !== null)
        invalid(`「${object.name}」的地面支撑说明互相矛盾。`)
      const item = collisionObject(object)
      y = item.transform.position.y - prepareStageCollision(item).bounds[1]![0]
      derived = true
    } else if (support.type === 'object') {
      if (!support.objectId?.trim() || support.bottomHeightMeters !== null)
        invalid(`「${object.name}」须指定唯一支撑道具，不能同时填写离地高度。`)
      if (support.objectId === object.id) invalid(`「${object.name}」不能支撑自己。`)
      const target = objects.get(support.objectId)
      if (!target) invalid(`「${object.name}」指定的支撑道具不存在。`)
      resolve(target)
      requireContactGeometry(object)
      requireContactGeometry(target)
      const height = stageContactHeight(collisionObject(object), collisionObject(target))
      if (height === null)
        invalid(`「${object.name}」与指定支撑道具没有可用的水平接触，请确认位置或支撑关系。`)
      y = height
      derived = true
    } else if (support.type === 'elevated') {
      if (
        support.objectId !== null ||
        support.bottomHeightMeters === null ||
        !Number.isFinite(support.bottomHeightMeters) ||
        support.bottomHeightMeters < 0 ||
        support.bottomHeightMeters > 100
      )
        invalid(`「${object.name}」须明确有效的估计底部高度，不能同时指定支撑道具。`)
      const item = collisionObject(object)
      y =
        item.transform.position.y -
        prepareStageCollision(item).bounds[1]![0] +
        support.bottomHeightMeters
      elevated = true
    } else {
      invalid(`「${object.name}」的支撑关系不确定，请补充落地、支撑道具或离地高度。`)
    }
    object.position[1] = support.type === 'elevated' ? y : Math.abs(y) < 1e-8 ? 0 : y
    active.delete(object.id)
    done.add(object.id)
  }
  plan.objects.forEach(resolve)
  plan.uncertainties = [
    ...(derived ? ['请核对落地与叠放高度。'] : []),
    ...(elevated ? ['离地高度为估算，请核实挂装支撑。'] : []),
    ...plan.uncertainties,
  ].slice(0, 30)
  const checked = PhotoStagePlanSchema.safeParse(plan)
  if (!checked.success)
    invalid('按支撑关系推导后的照片方案高度或位置无效，请确认支撑关系与估计高度。')
  return checked.data
}
