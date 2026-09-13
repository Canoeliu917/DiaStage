'use client'

import { stageObjectBounds, stageToWorldPosition } from '@pascal-app/core/stage'
import { useEffect } from 'react'
import { useProposalGhost } from '@/lib/rehearsal-intelligence/authority'
import type { DiaConversation } from '@/lib/rehearsal-intelligence/conversation-controller'
import type { CreatedRemoteVoiceSession } from '@/lib/remote-voice/client'
import { readRemoteVoiceResponse } from '@/lib/remote-voice/client'
import {
  OwnerDiaResponseSchema,
  type RemoteDiaCommand,
  type RemoteDiaSnapshot,
  RemoteDiaSnapshotSchema,
} from '@/lib/remote-voice/dia-protocol'
import { useStagePlanPreview } from '@/lib/stage/plan-preview'
import { useRehearsalPlayback } from './state'

export function diaRemoteSnapshot(controller: DiaConversation): RemoteDiaSnapshot {
  const state = controller.store.getState(),
    context = controller.currentContext(),
    ghost = useProposalGhost.getState()
  const build = controller.buildProposal()
  const interaction = controller.rehearsalEnabled ? state.interaction : null
  const envelope = build ? build.envelope : interaction?.envelope
  const plan = useStagePlanPreview.getState().plan
  const hasBuildGhost =
    !!build &&
    !!plan &&
    build.status === 'previewed' &&
    build.id === state.thread?.selectedProposalId &&
    build.sceneVersion === context.sceneVersion &&
    ['ghost-ready', 'waiting-human'].includes(state.thread?.status ?? '') &&
    JSON.stringify(plan) === JSON.stringify(build.previewedPlan)
  const hasGhost =
    controller.rehearsalEnabled &&
    ghost.visible &&
    ghost.sceneId === controller.sceneId &&
    ghost.proposalId === state.thread?.selectedProposalId &&
    !!ghost.simulation &&
    ['ghost-ready', 'waiting-human'].includes(state.thread?.status ?? '')
  const performers = (list: typeof context.performers) =>
    list.map((p) => ({ id: p.id, name: p.name, position: p.position }))
  const paths = (list: typeof context.paths) =>
    list.map((p) => ({ performerId: p.performerId, points: p.points }))
  return RemoteDiaSnapshotSchema.parse({
    version: 1,
    sceneId: controller.sceneId,
    sceneVersion: context.sceneVersion,
    thread: state.thread
      ? {
          threadId: state.thread.threadId,
          messages: state.thread.messages
            .slice(-12)
            .map(({ messageId, role, content, createdAt }) => ({
              messageId,
              role,
              content: content.slice(0, 2000),
              createdAt,
            })),
        }
      : null,
    interactionId: build?.id ?? interaction?.interactionId ?? null,
    ...(envelope ? { envelope } : {}),
    proposals: build
      ? [
          {
            proposalId: build.id,
            title: build.parentId ? '搭台修订' : '搭台建议',
            intention: build.input.slice(0, 500),
            rationale: '由当前正式舞台与本机规则计算台位，先预演，再在电脑上决定是否采用。',
            changes: build.plan.items
              .slice(0, 23)
              .map((item) => `${item.existingNodeId ? '调整' : '加入'} ${item.displayName}`)
              .concat(
                build.plan.items.length > 23
                  ? [`另有 ${build.plan.items.length - 23} 项，请在电脑上查看。`]
                  : [],
              ),
            alternatives: build.plan.questions.slice(0, 8).map((question) => question.message),
          },
        ]
      : (interaction?.proposals.map((p) => ({
          proposalId: p.proposalId,
          title: p.title,
          intention: p.intention.slice(0, 500),
          rationale: p.rationale,
          changes: p.suggestions.map((s) =>
            `${context.performers.find((actor) => actor.id === s.performerId)?.name ?? '人物'}：${s.intention}`.slice(
              0,
              500,
            ),
          ),
          alternatives: p.alternatives.map((a) => a.slice(0, 500)),
        })) ?? []),
    selectedProposalId: build || interaction ? (state.thread?.selectedProposalId ?? null) : null,
    state: state.thread?.status ?? 'idle',
    statusText: state.notice.slice(0, 500),
    decision:
      state.thread?.status === 'applied'
        ? build
          ? 'adopt'
          : state.editing
            ? 'edit'
            : state.suggestions.length === controller.proposal()?.suggestions.length
              ? 'adopt'
              : 'partial'
        : state.thread?.status === 'rejected'
          ? 'reject'
          : 'none',
    synthetic: state.synthetic,
    stage: {
      width: context.venue.width,
      depth: context.venue.depth,
      origin: context.venue.origin,
      performers: controller.rehearsalEnabled ? performers(context.performers) : [],
      paths: controller.rehearsalEnabled ? paths(context.paths) : [],
      scenery: context.obstacles.map((object) => ({
        id: object.id,
        name: object.name.slice(0, 100),
        min: [object.min[0], object.min[2]],
        max: [object.max[0], object.max[2]],
      })),
    },
    ghost:
      hasBuildGhost && plan && build
        ? {
            proposalId: build.id,
            performers: [],
            paths: [],
            venue: {
              width: plan.venue?.widthMeters ?? context.venue.width,
              depth: plan.venue?.depthMeters ?? context.venue.depth,
              origin: context.venue.origin,
            },
            scenery: plan.items
              .filter((item) => !['camera', 'performer-marker'].includes(item.kind))
              .map((item) => {
                const bounds = stageObjectBounds({
                  ...item,
                  id: item.proposalId,
                  name: item.displayName,
                })
                const frame = {
                  origin: context.venue.origin,
                  depthMeters: plan.venue?.depthMeters ?? context.venue.depth,
                }
                const min = stageToWorldPosition({ x: bounds.maxX, y: 0, z: bounds.maxZ }, frame)
                const max = stageToWorldPosition({ x: bounds.minX, y: 0, z: bounds.minZ }, frame)
                return {
                  id: item.proposalId,
                  name: item.displayName.slice(0, 100),
                  min: [min[0], min[2]],
                  max: [max[0], max[2]],
                }
              }),
          }
        : hasGhost
          ? {
              proposalId: ghost.proposalId,
              performers: performers(ghost.simulation!.performers),
              paths: paths(ghost.simulation!.paths),
            }
          : null,
  })
}

export function acceptDiaRemoteCommand(controller: DiaConversation, command: RemoteDiaCommand) {
  if (command.type === 'cancel') {
    controller.cancel()
    return
  }
  if (!controller.store.getState().ready || !controller.store.getState().thread)
    throw new Error('电脑正在载入对话，请稍后重试。')
  const snapshot = diaRemoteSnapshot(controller)
  if (command.sceneVersion !== snapshot.sceneVersion) throw new Error('舞台已经变化，请重新生成。')
  if (controller.store.getState().busy) throw new Error('Dia 正在处理，请稍后发送或先停止。')
  if (command.type === 'message') {
    void controller.send(command.content)
    return
  }
  if (
    command.interactionId !== snapshot.interactionId ||
    !snapshot.proposals.some((p) => p.proposalId === command.proposalId)
  )
    throw new Error('这条方案已经变化，请读取电脑最新方案。')
  if (snapshot.selectedProposalId !== command.proposalId) controller.choose(command.proposalId)
  if (command.type === 'preview') {
    useRehearsalPlayback.getState().stop()
    void controller.preview()
  } else if (command.type === 'reject') void controller.reject()
}

export function DiaRemoteBridge({
  session,
  controller,
}: {
  session: CreatedRemoteVoiceSession | null
  controller: DiaConversation
}) {
  useEffect(() => {
    if (!session || session.sceneId !== controller.sceneId) return
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      lastSnapshot = '',
      lastPublished = 0
    const handled = new Set<string>()
    const receiptKey = `diastage:dia-receipt:${session.id}`
    const abort = new AbortController()
    const endpoint = `/api/remote-voice/sessions/${session.id}/dia`
    const headers = {
      'content-type': 'application/json',
      'x-diastage-owner-token': session.ownerToken,
    }
    const poll = async () => {
      try {
        const response = await fetch(endpoint, {
          cache: 'no-store',
          headers,
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
        })
        if (stopped) return
        if (response.status === 410) {
          stopped = true
          return
        }
        const result = await readRemoteVoiceResponse(
          response,
          OwnerDiaResponseSchema,
          '手机对话连接暂时中断',
        )
        if (stopped) return
        const command = result.status.pendingCommand
        let acknowledgement:
          | { sequence: number; disposition: 'received' | 'failed'; summary: string }
          | undefined
        if (command) {
          try {
            if (!handled.has(command.requestId)) {
              if (!controller.store.getState().ready)
                throw new Error('电脑正在载入对话，请稍后重试。')
              // Claim before executing. A refresh in the acknowledgement gap must not replay work.
              const claimed = Number(sessionStorage.getItem(receiptKey) ?? 0)
              if (claimed >= command.sequence)
                throw new Error(
                  '电脑已接收过这条请求，刷新后不会重复执行。请查看当前对话，需要时重新预演。',
                )
              sessionStorage.setItem(receiptKey, String(command.sequence))
              acceptDiaRemoteCommand(controller, command)
              handled.add(command.requestId)
            }
            acknowledgement = {
              sequence: command.sequence,
              disposition: 'received',
              summary: '电脑已接收；请查看舞台处理状态。',
            }
          } catch (error) {
            acknowledgement = {
              sequence: command.sequence,
              disposition: 'failed',
              summary: error instanceof Error ? error.message.slice(0, 300) : '未执行，请重试。',
            }
          }
        }
        const snapshot = diaRemoteSnapshot(controller),
          serialized = JSON.stringify(snapshot)
        if (acknowledgement || serialized !== lastSnapshot || Date.now() - lastPublished > 8000) {
          const publish = await fetch(endpoint, {
            method: 'PATCH',
            headers,
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
            body: JSON.stringify({ snapshot, ...(acknowledgement ? { acknowledgement } : {}) }),
          })
          if (!publish.ok) throw new Error('手机状态暂未同步')
          lastSnapshot = serialized
          lastPublished = Date.now()
        }
      } catch {
        /* The phone reports expired owner heartbeats; scene editing and local saves stay independent. */
      } finally {
        if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 2000)
      }
    }
    void poll()
    return () => {
      stopped = true
      abort.abort()
      clearTimeout(timer)
    }
  }, [session, controller])
  return null
}
