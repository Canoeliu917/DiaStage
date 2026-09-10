import {
  type ClarificationAnswer,
  parseStageText,
  type StagePlan,
  StagePlanSchema,
} from '@pascal-app/core/stage'

/** Resolve only choices a person has explicitly made, retaining all other questions. */
export function resolveScriptQuestions(
  input: StagePlan,
  answers: ClarificationAnswer[],
): StagePlan {
  const plan = StagePlanSchema.parse(input)
  const removed = new Map<string, string>()
  plan.questions = plan.questions.filter((question) => {
    const answer = answers.find((entry) => entry.questionId === question.id)?.answer
    if (question.id.endsWith(':venue-conflict') && answer) {
      const choice = parseStageText(`建立${answer}舞台`, {
        documentVersion: 0,
        venue: null,
        objects: [],
        selectedObjectIds: [],
      })
      if (choice?.venue && !choice.questions.length && !choice.items.length) {
        plan.venue = {
          ...choice.venue,
          heightMeters: choice.venue.heightMeters ?? plan.venue?.heightMeters ?? null,
        }
        return false
      }
    }
    if (
      !question.id.startsWith('script-item-conflict|') ||
      !question.options.includes(answer ?? '')
    )
      return true
    const [, first, second] = question.id.split('|')
    if (!(first && second)) return true
    if (answer === '采用前一处描述') removed.set(second, first)
    if (answer === '采用后一处描述') removed.set(first, second)
    if (answer === '作为两件布景保留') {
      const item = plan.items.find((entry) => entry.proposalId === second)
      if (item) item.displayName = `${item.displayName.slice(0, 112)}（另一件）`
    }
    return false
  })
  plan.items = plan.items.filter((item) => !removed.has(item.proposalId))
  plan.relations = plan.relations
    .filter((relation) => !removed.has(relation.subjectId))
    .map((relation) => ({
      ...relation,
      referenceId:
        relation.referenceId === null
          ? null
          : (removed.get(relation.referenceId) ?? relation.referenceId),
    }))
  plan.warnings = plan.warnings.filter((warning) => !warning.itemIds.some((id) => removed.has(id)))
  return plan
}
