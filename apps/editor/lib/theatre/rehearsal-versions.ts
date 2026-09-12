import { useScene } from '@pascal-app/core'
import { z } from 'zod'
import { create } from 'zustand'
import { validateCameraProject } from '../../components/camera-studio/model'
import { InteractionEnvelopeSchema } from '../rehearsal-intelligence/interaction-envelope'
import { hashSceneValue } from '../scene-signature'
import { parseSnapshot } from './scene-adapter'
import { StageSnapshotSchema } from './schema'
import { StageSceneDocumentSchema } from './simulation'
import { VersionSourceSchema } from './version-source'

export const REHEARSAL_VERSIONS_KEY = 'diastageRehearsalVersions'
export const VersionDisplaySchema = z.object({
  viewMode: z.enum(['2d', '3d', 'split']),
  theme: z.enum(['studio', 'night']),
  textures: z.boolean(),
  shading: z.enum(['solid', 'rendered']),
  showGrid: z.boolean(),
  showGuides: z.boolean(),
  showRoutes: z.boolean(),
  showCameras: z.boolean(),
})
export const VersionCameraSchema = z.object({
  project: z.unknown().transform((input, ctx) => {
    try {
      return validateCameraProject(input)
    } catch {
      ctx.addIssue({ code: 'custom', message: '版本机位资料无效' })
      return z.NEVER
    }
  }),
  selectedId: z.string().nullable(),
})
export const RehearsalVersionSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1),
    createdAt: z.string(),
    note: z.string().max(240).default(''),
    restoredFrom: z.string().optional(),
    sceneVersion: z.string().optional(),
    venueVersion: z.string().optional(),
    rehearsalVersion: z.string().optional(),
    sourceVersion: z.string().optional(),
    interactionId: z.string().optional(),
    envelope: InteractionEnvelopeSchema.optional(),
    source: VersionSourceSchema.optional(),
    stageGraph: StageSnapshotSchema,
    venue: StageSceneDocumentSchema.shape.venue,
    rehearsalSimulation: StageSceneDocumentSchema.shape.rehearsalSimulation,
    cameraState: VersionCameraSchema,
    displayState: VersionDisplaySchema,
  })
  .superRefine((version, ctx) => {
    if (version.source?.startsWith('dia-') && !version.interactionId)
      ctx.addIssue({ code: 'custom', message: 'Dia 版本缺少正式交互来源' })
    if (
      version.envelope &&
      (version.envelope.interactionId !== version.interactionId ||
        version.source !== `dia-${version.envelope.capability}` ||
        version.envelope.status !== 'applied')
    )
      ctx.addIssue({ code: 'custom', message: '版本与正式交互来源不一致' })
    if (version.source === 'restore' && !version.sourceVersion)
      ctx.addIssue({ code: 'custom', message: '恢复版本缺少原版本引用' })
  })
export type RehearsalVersion = z.infer<typeof RehearsalVersionSchema>

export function rehearsalVersionHashes(
  version: Pick<RehearsalVersion, 'stageGraph' | 'venue' | 'rehearsalSimulation'>,
) {
  return {
    sceneVersion: hashSceneValue('snapshot', version.stageGraph),
    venueVersion: hashSceneValue('venue', version.venue),
    rehearsalVersion: hashSceneValue('rehearsal', version.rehearsalSimulation),
  }
}

export function listRehearsalVersions(): RehearsalVersion[] {
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  return z.array(RehearsalVersionSchema).parse(site?.metadata[REHEARSAL_VERSIONS_KEY] ?? [])
}

export function getRehearsalVersion(id: string): RehearsalVersion {
  const version = listRehearsalVersions().find((entry) => entry.id === id)
  if (!version) throw new Error('排演版本不存在，请重新选择。')
  parseSnapshot(version.stageGraph)
  return version
}

export const useVersionPreview = create<{ selectedId: string | null; rootKey: string }>(() => ({
  selectedId: null,
  rootKey: '',
}))

export function openVersionPreview(id: string): RehearsalVersion {
  const version = getRehearsalVersion(id)
  useVersionPreview.setState({
    selectedId: id,
    rootKey: JSON.stringify(useScene.getState().rootNodeIds),
  })
  return version
}
