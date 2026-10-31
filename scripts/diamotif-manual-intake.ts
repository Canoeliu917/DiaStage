import { readFileSync } from 'node:fs'
import {
  HundredPlayChecklistSchema,
  intakeCommandRefusal,
  summarizeHundredCards,
} from '../apps/editor/lib/diamotif-search/hundred-cards'

const refusal = intakeCommandRefusal(process.argv.slice(2))
if (refusal) {
  console.error(refusal)
  process.exit(2)
}

const doc = HundredPlayChecklistSchema.parse(
  JSON.parse(
    readFileSync(new URL('../DiaMotif/knowledge/hundred-play-cards.json', import.meta.url), 'utf8'),
  ),
)
const summary = summarizeHundredCards(doc)
if (summary.publicSearchCards !== 0 || summary.reviewedFullTexts !== 0) {
  console.error('清单卡片仍是待核元数据，不能标记为已公开或已有全文。')
  process.exit(1)
}

console.log(
  `话剧百部清单：${summary.listedCards} 张元数据卡，其中 ${summary.withYear} 张有书目年份，${summary.withSourceUrl} 张有来源链接。托管全文 ${summary.reviewedFullTexts}。公开检索未改动。`,
)
for (const card of doc.cards)
  console.log(`- ${card.playwright}《${card.title}》 ${card.reviewStatus} ${card.hosting}`)
