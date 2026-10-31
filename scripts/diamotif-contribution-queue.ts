import {
  contributionDirectory,
  contributionPublicIndexPlan,
  listContributionQueue,
  setContributionQueueStatus,
} from '../apps/editor/lib/diamotif-search/contribution-store'

const rightsLabels = {
  owner: '我是权利人',
  authorized: '已获授权',
  'public-domain': '公有领域',
  unclear: '权利尚不明确',
} as const

const statusLabels = {
  'pending-review': '待审',
  'marked-reviewed': '已标已读',
  rejected: '不收',
} as const

const writePublic = process.argv.includes('--write-public')
const mark = process.argv.find((arg) => arg.startsWith('--mark-reviewed='))?.split('=')[1]
const reject = process.argv.find((arg) => arg.startsWith('--reject='))?.split('=')[1]
const directory = contributionDirectory()

if (mark || reject) {
  const id = mark ?? reject
  if (!id || (mark && reject)) {
    console.error('一次只能标记一条：--mark-reviewed=编号 或 --reject=编号')
    process.exit(2)
  }
  const saved = await setContributionQueueStatus(
    directory,
    id,
    mark ? 'marked-reviewed' : 'rejected',
  )
  console.log(
    `${saved.id} ${statusLabels[saved.status]} publicSearch=${saved.publicSearch} 未进入公开检索`,
  )
}

const rows = await listContributionQueue(directory)
if (rows.length === 0) console.log('投稿队列是空的。')
for (const row of rows) {
  console.log(
    `${row.submittedAt}  ${statusLabels[row.status]}  ${rightsLabels[row.rights]}  ${row.author}  《${row.title}》  ${row.id}`,
  )
}
const plan = contributionPublicIndexPlan(rows, writePublic)
console.log(plan.message)
if (writePublic) process.exit(plan.wrotePublicIndex ? 1 : 0)
