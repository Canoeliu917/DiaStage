import { DIA_KNOWLEDGE, lookupCanonical } from './retrieval'
import type { DiaKnowledgeConcept } from './schema'

export const THEATRE_KNOWLEDGE_LIMITS = { concepts: 6, bytes: 8000 } as const

const normalize = (text: string) =>
  text.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ')
const latinWord = /[\p{Script=Latin}\p{N}_]/u
const terms = DIA_KNOWLEDGE.concepts.flatMap((concept) =>
  [...new Set([concept.label, concept.canonicalLabel, ...concept.aliases].map(normalize))]
    .filter((term) => term.length >= 2)
    .map((term) => ({ term, concept })),
)
const sourceTitles = new Map(DIA_KNOWLEDGE.sources.map((source) => [source.sourceId, source.title]))

function reference(concept: DiaKnowledgeConcept) {
  return {
    id: concept.id,
    label: concept.label,
    canonicalLabel: concept.canonicalLabel,
    definition: concept.definition,
    conceptKind: concept.conceptKind,
    status: concept.status,
    executionEligibility: concept.executionEligibility,
    authorityTier: concept.authorityTier,
    definitionStatus: concept.definitionStatus,
    tradition: concept.tradition,
    disputedNotes: concept.disputedNotes,
    authorityRefs: concept.authorityRefs,
    sourceRefs: concept.sourceRefs.map((ref) => ({
      ...ref,
      title: sourceTitles.get(ref.sourceId)!,
    })),
    positiveExamples: concept.positiveExamples,
    contrastExamples: concept.contrastExamples,
    relations: concept.relations,
  }
}

/** Catalog evidence for conversation; it never extends the executable intent mapping. */
export function theatreKnowledgeForInput(input: string) {
  const text = normalize(input.slice(0, 2000))
  const matches: { concept: DiaKnowledgeConcept; start: number; end: number }[] = []
  for (const { term, concept } of terms) {
    let start = text.indexOf(term)
    while (start !== -1) {
      const end = start + term.length
      if (
        !(latinWord.test(term[0]!) && latinWord.test(text[start - 1] ?? '')) &&
        !(latinWord.test(term.at(-1)!) && latinWord.test(text[end] ?? ''))
      )
        matches.push({ concept, start, end })
      start = text.indexOf(term, start + 1)
    }
  }
  matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const spans: { start: number; end: number }[] = []
  const ids = new Set<string>()
  for (const match of matches) {
    if (
      spans.some(
        (span) =>
          match.start < span.end &&
          match.end > span.start &&
          !(match.start === span.start && match.end === span.end),
      )
    )
      continue
    spans.push(match)
    ids.add(match.concept.id)
  }
  // Include one-hop distinctions after direct matches, so related theories are not conflated.
  for (const id of [...ids])
    for (const relation of lookupCanonical(id)!.relations)
      if (relation.type === 'distinct_from') ids.add(relation.targetId)

  const context = {
    version: DIA_KNOWLEDGE.version,
    truncated: false,
    concepts: [] as ReturnType<typeof reference>[],
  }
  for (const id of ids) {
    if (context.concepts.length === THEATRE_KNOWLEDGE_LIMITS.concepts) {
      context.truncated = true
      break
    }
    context.concepts.push(reference(lookupCanonical(id)!))
    // UTF-8 bytes are a conservative input budget, not an actual provider token count.
    if (
      new TextEncoder().encode(JSON.stringify(context)).byteLength > THEATRE_KNOWLEDGE_LIMITS.bytes
    ) {
      context.concepts.pop()
      context.truncated = true
    }
  }
  return context
}
