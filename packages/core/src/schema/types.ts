import z from 'zod'
import { BlockNode } from './nodes/block'
import { BuildingNode } from './nodes/building'
import { ConstructionDimensionNode } from './nodes/construction-dimension'
import { DoorNode } from './nodes/door'
import { FenceNode } from './nodes/fence'
import { GuideNode } from './nodes/guide'
import { ItemNode } from './nodes/item'
import { LevelNode } from './nodes/level'
import { MeasurementNode } from './nodes/measurement'
import { ScanNode } from './nodes/scan'
import { ShelfNode } from './nodes/shelf'
import { SiteNode } from './nodes/site'
import { SlabNode } from './nodes/slab'
import { SpawnNode } from './nodes/spawn'
import { StairNode } from './nodes/stair'
import { StairSegmentNode } from './nodes/stair-segment'
import { WallNode } from './nodes/wall'
import { WindowNode } from './nodes/window'
import { ZoneNode } from './nodes/zone'

/** A node schema as authored: `type` is a literal wrapped by `nodeType()`'s `.default()`. */
type NodeMember = z.ZodObject<{ type: z.ZodDefault<z.ZodLiteral<string>> } & z.core.$ZodLooseShape>

/** The same schema with the discriminator narrowed back to its bare literal. */
type BareDiscriminator<T extends NodeMember> = z.ZodObject<
  Omit<T['shape'], 'type'> & { type: ReturnType<T['shape']['type']['unwrap']> }
>

/**
 * Assembles the node union on discriminators that claim exactly one value.
 *
 * `nodeType()` defaults the literal so a per-kind schema can fill `type` in
 * (`WallNode.parse({ start, end })`), but a `.default()`-wrapped discriminator
 * also claims `undefined` from zod 4.5 on (upstream #6432). With 48 members
 * doing it, the union's lazily-built discriminator map collides on
 * `undefined` and throws `Duplicate discriminator value` — as a plain Error,
 * so it escapes `safeParse` and surfaces as a crash at the first parse.
 *
 * Each member is therefore projected to a clone whose `type` is the bare
 * literal. Per-kind schemas keep their default; only the union's view of the
 * discriminator narrows. Metadata lives in zod's global registry keyed by
 * instance, so `.describe()` text has to be carried over to the clone by hand.
 */
export const nodeUnion = <const T extends readonly [NodeMember, ...NodeMember[]]>(members: T) =>
  z.discriminatedUnion(
    'type',
    members.map((member) => {
      const projected = member.extend({ type: member.shape.type.unwrap() })
      const meta = z.globalRegistry.get(member)
      return meta ? projected.meta(meta) : projected
    }) as { [K in keyof T]: BareDiscriminator<T[K]> },
  )

export const AnyNode = nodeUnion([
  SiteNode,
  BuildingNode,
  LevelNode,
  ConstructionDimensionNode,
  BlockNode,
  WallNode,
  FenceNode,
  ItemNode,
  ZoneNode,
  SlabNode,
  ShelfNode,
  StairNode,
  StairSegmentNode,
  ScanNode,
  GuideNode,
  MeasurementNode,
  SpawnNode,
  WindowNode,
  DoorNode,
])

export type AnyNode = z.infer<typeof AnyNode>
export type AnyNodeType = AnyNode['type']
export type AnyNodeId = AnyNode['id']

/** One member schema of `AnyNode`, discriminator already projected to a bare literal. */
export type AnyNodeOption = (typeof AnyNode)['options'][number]

/** The node kind a union member accepts, read off its bare-literal discriminator. */
export const nodeKindOf = (option: AnyNodeOption): AnyNodeType => option.shape.type.value
