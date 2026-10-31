import {
  type SceneContextObject,
  type SceneContextSummary,
  SceneContextSummarySchema,
} from '@pascal-app/core/stage'
import {
  type OpenLanguageContext,
  OpenLanguageContextSchema,
} from '../apps/editor/lib/rehearsal-intelligence/open-language'
import { openLanguageContext } from '../apps/editor/lib/rehearsal-intelligence/open-language-proposal'
import { planRoomEdge } from '../apps/editor/lib/stage/edge-run'
import {
  AVAILABLE_STAGE_SCENERY,
  stagePropCollisionGeometry,
} from '../apps/editor/lib/stage/prop-assets'

type LiveFixtureCase = {
  id: string
  context: {
    fixture: string
    stage: { width: number; depth: number } | null
    selectedIds: string[]
    lastReferencedIds?: string[]
    previousTurns: { role: string; text: string }[]
  }
}

function object(
  id: string,
  assetId: string,
  name: string,
  x: number,
  z: number,
): SceneContextObject {
  const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)
  if (!source?.asset.dimensions) throw new Error(`Fixture asset unavailable: ${assetId}`)
  const [width, height, depth] = source.asset.dimensions
  const dimensionsMeters = { width, height, depth }
  return {
    id,
    name,
    kind: source.kind,
    dimensionsMeters,
    collisionGeometry: stagePropCollisionGeometry(assetId, dimensionsMeters),
    transform: { position: { x, y: 0, z }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}

const app: OpenLanguageContext['app'] = {
  page: 'stage-editor',
  route: '/scene/diamotif-synthetic-eval?workspace=set',
  capabilities: [
    { id: 'dia-dialogue', label: '依据结构化舞台与界面状态进行对话和解释', authority: 'read' },
    { id: 'dia-proposal', label: '生成受支持的舞台 Proposal 与 Ghost', authority: 'proposal_only' },
  ],
  settings: {
    viewMode: '3d',
    activePanel: 'items',
    workspaceMode: 'edit',
    transformMode: 'select',
    rotationAxis: 'y',
    cameraLocked: false,
    placementMode: 'grid',
    gridStepCentimeters: 10,
    gridVisible: true,
    guidesVisible: true,
    displayMode: 'white_model',
    stableMode: true,
    immersiveMode: 'none',
    readOnly: false,
  },
}

export function buildLiveFixture(row: LiveFixtureCase) {
  const { fixture, stage, selectedIds, previousTurns } = row.context
  const scene: SceneContextSummary = {
    documentVersion: 1,
    venue: stage
      ? { type: 'black-box', widthMeters: stage.width, depthMeters: stage.depth, heightMeters: 4 }
      : null,
    objects: [],
    selectedObjectIds: [...selectedIds],
  }
  if (['back-wall', 'sofa-back-wall'].includes(fixture)) {
    if (!scene.venue) throw new Error('Wall fixture requires known dimensions')
    scene.objects = planRoomEdge('back', scene.venue).pieces.map((piece, index) => ({
      id: `wall-${index + 1}`,
      name: piece.name,
      kind: 'scenic-flat',
      dimensionsMeters: piece.dimensionsMeters,
      collisionGeometry: piece.collisionGeometry,
      transform: { position: piece.position, rotationDegrees: { x: 0, y: piece.yaw, z: 0 } },
    }))
    if (fixture === 'sofa-back-wall')
      scene.objects.push(object('sofa-a', 'SCN-SOFA-175', '沙发', 0, 3))
  } else if (['two-flats', 'three-flats', 'enclosure-proposal'].includes(fixture)) {
    const spacing = fixture === 'enclosure-proposal' ? 1.25 : 2
    scene.objects = [
      object('flat-a', 'SCN-WIN-130', '景片甲', -spacing, 4),
      object('flat-b', 'SCN-WIN-130', '景片乙', spacing, 4),
    ]
    if (fixture === 'three-flats')
      scene.objects.push(object('flat-c', 'SCN-WIN-130', '景片丙', 0, 6))
  } else if (fixture === 'front-door') {
    scene.objects = [object('door-a', 'SCN-DOOR-130', '单门', 2.5, 1)]
  } else if (['table-chair-group', 'sofa-two-chairs'].includes(fixture)) {
    scene.objects = [
      fixture === 'table-chair-group'
        ? object('table-a', 'SCN-TABLE-090', '圆桌', 0, 2)
        : object('sofa-a', 'SCN-SOFA-175', '沙发', 0, 4),
      object('chair-a', 'SCN-CHAIR-045', '椅子甲', -1, 2),
      object('chair-b', 'SCN-CHAIR-045', '椅子乙', 1, 2),
    ]
  } else if (
    ![
      'empty-12x8',
      'empty-8x6',
      'unknown-stage',
      'photo-reference-collage',
      'photo-synthetic-table-chairs',
    ].includes(fixture)
  ) {
    throw new Error(`Unknown live evaluation fixture: ${fixture}`)
  }
  const lastReferencedIds = row.context.lastReferencedIds ?? []
  const open = openLanguageContext(
    scene,
    `fixture:${row.id}:v1`,
    lastReferencedIds,
    null,
    false,
    app,
  )
  if (fixture === 'enclosure-proposal') {
    open.proposal = {
      id: 'seeded-opening-proposal',
      subjectIds: ['flat-a', 'flat-b'],
      candidateIds: ['seeded-candidate-a', 'seeded-candidate-b'],
      selectedCandidateId: 'seeded-candidate-a',
      ghostCandidateId: 'seeded-candidate-a',
      hasEnclosure: false,
      minimumWidthMeters: 1.2,
    }
  } else if (row.id === 'DM-LIVE-R02') {
    open.proposal = {
      id: 'seeded-sofa-proposal',
      subjectIds: ['sofa-a'],
      candidateIds: [],
      selectedCandidateId: null,
      ghostCandidateId: null,
      hasEnclosure: false,
      minimumWidthMeters: null,
    }
  }
  return {
    scene: SceneContextSummarySchema.parse(scene),
    open: OpenLanguageContextSchema.parse(open),
    omittedContext: [
      'Production semantic context omits venue dimensions, object transforms and collision geometry.',
      ...(previousTurns.length
        ? ['Seeded previous turns are not sent: production context has no dialogue history field.']
        : []),
      ...(open.proposal
        ? ['Proposal identity is seeded; no prior provider response or UI adoption is claimed.']
        : []),
    ],
  }
}
