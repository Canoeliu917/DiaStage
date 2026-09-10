import type {
  AnyNode,
  DoorNode,
  ParametricDescriptor,
  ParamField,
  StairNode,
} from '@pascal-app/core'
import { isTheatreEditableType } from './theatre-presentation'

// AnyNode's common keys exclude these kind-specific controls. Keep them typed
// against their concrete schemas instead of widening the core node union.
type ScenicField = Extract<
  ParamField<Pick<StairNode, 'width' | 'position'> & Pick<DoorNode, 'operationState'>>,
  { kind: 'number' | 'vec3' }
>
export type TheatreParamField = ParamField<AnyNode> | ScenicField
export type TheatreParametricDescriptor = Omit<ParametricDescriptor<AnyNode>, 'groups'> & {
  groups: Array<{ label: string; fields: TheatreParamField[] }>
}

const SCENIC_FIELDS: Record<string, string[]> = {
  wall: ['thickness', 'height'],
  door: ['width', 'height', 'frameThickness', 'frameDepth'],
  window: ['width', 'height'],
  fence: [
    'style',
    'height',
    'thickness',
    'length',
    'curve',
    'postSpacing',
    'postSize',
    'groundClearance',
  ],
  shelf: ['style', 'rows', 'columns', 'width', 'depth', 'height', 'thickness', 'position'],
  column: ['width', 'depth', 'height', 'radius', 'position'],
  slab: ['thickness', 'elevation'],
  zone: ['name', 'color'],
  spawn: ['position'],
}

const OPENING_GROUPS = [
  {
    label: '开合',
    fields: [
      { key: 'operationState', label: '开合程度', kind: 'number', min: 0, max: 1, step: 0.05 },
    ],
  },
] satisfies ParametricDescriptor<DoorNode>['groups']

/** Restrict inspector presentation without changing the node schema or reconciliation rules. */
export function theatreParametrics(
  type: string | null,
  source: ParametricDescriptor<AnyNode> | undefined,
): TheatreParametricDescriptor | undefined {
  if (!type || !source || !isTheatreEditableType(type)) return undefined
  if (type === 'block' || type === 'item')
    return { ...source, actions: undefined, trailingSection: undefined }
  if (type === 'stair' || type === 'stair-segment' || type === 'scan')
    return {
      ...source,
      customPanel: source.customPanel,
      trailingSection: undefined,
      actions: undefined,
      groups: [],
    }
  const keys = SCENIC_FIELDS[type] ?? []
  const groups: TheatreParametricDescriptor['groups'] = source.groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => keys.includes(String(field.key))),
    }))
    .filter((group) => group.fields.length > 0)
  if (type === 'door' || type === 'window') groups.push(...OPENING_GROUPS)
  return {
    ...source,
    customPanel: undefined,
    trailingSection: undefined,
    actions: undefined,
    groups,
  }
}
