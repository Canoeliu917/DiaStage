import { readFileSync } from 'node:fs'
import { DailyIntakeRoundSchema, publicIntakePlan } from '../apps/editor/lib/diamotif-search/daily-intake'

const round = DailyIntakeRoundSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../DiaMotif/knowledge/daily-intake-20261031.json', import.meta.url),
      'utf8',
    ),
  ),
)
const writePublic = process.argv.includes('--write-public')
const plan = publicIntakePlan(round, writePublic)
const counts = round.counts

console.log(`日课 ${round.roundId}`)
console.log(
  `发现 ${counts.discovered}，已读 ${counts.openedAndRead}，只见索引 ${counts.indexOnly}，待审 ${counts.pending}，不收 ${counts.rejected}，已在库中 ${counts.alreadyInCorpus}，正式新增 ${counts.formalAdded}，托管全文 ${counts.fullTextsHosted}。`,
)
for (const item of round.items)
  console.log(`- [${item.decision}] ${item.title}${item.url ? ` ${item.url}` : ''}`)
console.log(plan.message)
if (writePublic && plan.formalReady > 0) {
  console.error('拒绝代写正式目录。')
  process.exit(2)
}
