import type { ThreadMessage } from './conversation'

export function recentProposalRounds(messages: ThreadMessage[], limit = 20) {
  const rounds: ThreadMessage[][] = []
  for (const message of messages) {
    if (message.role === 'user') rounds.push([message])
    else if (message.role === 'dia' || message.proposalIds?.length) {
      if (!rounds.length) rounds.push([])
      rounds[rounds.length - 1]!.push(message)
    }
  }
  return rounds.slice(-limit)
}
