import {
  type AnyNodeDefinition,
  BoxVentNode,
  ChimneyNode,
  CupolaNode,
  DormerNode,
  DownspoutNode,
  EyebrowVentNode,
  GutterNode,
  LeanToExtensionNode,
  RidgeVentNode,
  SkylightNode,
  SolarPanelNode,
  TurbineVentNode,
} from '@pascal-app/core'

// Raw instances live in metadata. Register schemas only so legacy documents remain readable.
export const archivedArchitectureDefinitions = (
  [
    [BoxVentNode, 3],
    [RidgeVentNode, 1],
    [TurbineVentNode, 3],
    [CupolaNode, 4],
    [EyebrowVentNode, 3],
    [ChimneyNode, 1],
    [SolarPanelNode, 1],
    [SkylightNode, 1],
    [DormerNode, 4],
    [GutterNode, 4],
    [DownspoutNode, 3],
    [LeanToExtensionNode, 13],
  ] as const
).map(([schema, schemaVersion]) => ({
  kind: schema.shape.type.parse(undefined),
  schemaVersion,
  schema,
  category: 'structure',
  defaults: () => ({}),
  capabilities: {},
  tree: { hidden: () => true },
})) as unknown as AnyNodeDefinition[]
