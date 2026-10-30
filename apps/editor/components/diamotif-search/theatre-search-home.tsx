'use client'

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Globe,
  LoaderCircle,
  MessageCircle,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountMenu, type AccountUser } from '@/components/account-panel'
import { StageThemeControl } from '@/components/stage-theme'
import { DIASTAGE_BRAND } from '@/lib/brand'
import {
  AI_INVOLVEMENT_LABELS,
  SEARCH_CATEGORIES,
  SEARCH_CATEGORY_GROUPS,
  type SearchCategory,
} from '@/lib/diamotif-search/catalog'
import type { SearchResponse } from '@/lib/diamotif-search/search'
import { SEARCH_TOPICS, type SearchTopic } from '@/lib/diamotif-search/search-topics'

const accessLabels: Record<string, string> = {
  public: '公开访问',
  subscription: '订阅访问',
  institution: '机构访问',
  onsite: '到馆查阅',
  mixed: '部分公开',
}
const sourceTierLabels = {
  official: '官方来源',
  'professional-media': '专业媒体',
  creator: '创作者',
  platform: '平台发布',
} as const
const viewpointLabels: Record<string, string> = {
  'creator-experience': '创作者经验',
  'audience-review': '观众观点',
  promotion: '商业推广',
}

export function TheatreSearchHome({
  user,
  initialQuery,
  initialCategory,
  initialTopic,
  openStage,
  openScript,
}: {
  user: AccountUser | null
  initialQuery?: string
  initialCategory?: string
  initialTopic?: string
  openStage: () => void
  openScript: () => void
}) {
  const [query, setQuery] = useState(initialQuery?.slice(0, 500) ?? '')
  const [category, setCategory] = useState<SearchCategory>(
    SEARCH_CATEGORIES.some((item) => item.id === initialCategory)
      ? (initialCategory as SearchCategory)
      : 'all',
  )
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [topic, setTopic] = useState<SearchTopic>(
    SEARCH_TOPICS.some(
      ({ id, category: topicCategory }) => id === initialTopic && topicCategory === initialCategory,
    )
      ? (initialTopic as SearchTopic)
      : 'all',
  )
  const [busy, setBusy] = useState<'search' | 'ai' | 'web' | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [showSearchHint, setShowSearchHint] = useState(false)
  const [expandedCategoryGroup, setExpandedCategoryGroup] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const categoryNav = useRef<HTMLElement>(null)
  const request = useRef<AbortController | null>(null)
  const submittedSearch = useRef<{
    query: string
    category: SearchCategory
    topic: SearchTopic
  } | null>(null)
  const retrySearch = useRef<() => void>(() => {})

  const search = useCallback(
    async (
      text: string,
      nextCategory: SearchCategory,
      useAi = false,
      offset = 0,
      useWeb = false,
      nextTopic: SearchTopic = 'all',
      smart = false,
    ) => {
      retrySearch.current = () =>
        void search(text, nextCategory, useAi, offset, useWeb, nextTopic, smart)
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      submittedSearch.current = {
        query: text.trim(),
        category: nextCategory,
        topic: nextTopic,
      }
      setQuery(text)
      setCategory(nextCategory)
      setTopic(nextTopic)
      setBusy(useWeb ? 'web' : useAi ? 'ai' : 'search')
      setError('')
      setShowSearchHint(false)
      setExpandedCategoryGroup(null)
      setExpanded(true)
      setResponse((previous) =>
        !useWeb &&
        previous?.query === text.trim() &&
        previous.category === nextCategory &&
        previous.topic === nextTopic
          ? { ...previous, answer: null, notice: null }
          : null,
      )
      const params = new URLSearchParams()
      if (text.trim()) params.set('q', text.trim())
      if (nextCategory !== 'all') params.set('category', nextCategory)
      if (nextTopic !== 'all') params.set('topic', nextTopic)
      window.history.replaceState(null, '', params.size ? `/?${params}` : '/')
      try {
        const result = await fetch('/api/diamotif/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: text.trim(),
            category: nextCategory,
            topic: nextTopic,
            useAi,
            offset,
            useWeb,
            smart,
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(useAi ? 65_000 : 10_000),
          ]),
        })
        if (!result.ok) throw new Error('检索暂时未能完成，请重试。')
        const data = (await result.json()) as SearchResponse
        if (!controller.signal.aborted) setResponse(data)
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error && caught.name === 'TimeoutError'
              ? '检索响应超时，请重试。'
              : '检索连接未完成，请重试。',
          )
      } finally {
        if (!controller.signal.aborted) setBusy(null)
      }
    },
    [],
  )

  useEffect(() => {
    if (initialQuery || initialCategory)
      void search(
        initialQuery ?? '',
        SEARCH_CATEGORIES.some((item) => item.id === initialCategory)
          ? (initialCategory as SearchCategory)
          : 'all',
        false,
        0,
        false,
        SEARCH_TOPICS.some(
          ({ id, category: topicCategory }) =>
            id === initialTopic && topicCategory === initialCategory,
        )
          ? (initialTopic as SearchTopic)
          : 'all',
      )
    return () => request.current?.abort()
  }, [initialQuery, initialCategory, initialTopic, search])

  useEffect(() => {
    if (!expandedCategoryGroup) return
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !categoryNav.current?.contains(event.target))
        setExpandedCategoryGroup(null)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [expandedCategoryGroup])

  function clear() {
    request.current?.abort()
    submittedSearch.current = null
    setQuery('')
    setCategory('all')
    setTopic('all')
    setResponse(null)
    setBusy(null)
    setError('')
    setExpanded(false)
    setShowSearchHint(false)
    setExpandedCategoryGroup(null)
    window.history.replaceState(null, '', '/')
    input.current?.focus()
  }

  function searchWithAi(useWeb = false) {
    if (!query.trim()) {
      setShowSearchHint(true)
      input.current?.focus()
      return
    }
    void search(query, category, true, 0, useWeb, topic)
  }

  const hasSearch = response !== null || busy !== null || error !== ''
  const categoryGroup = SEARCH_CATEGORY_GROUPS.find((group) => group.id === expandedCategoryGroup)

  function chooseCategory(nextCategory: SearchCategory, nextTopic: SearchTopic = 'all') {
    if (expandedCategoryGroup)
      document.getElementById(`motif-category-${expandedCategoryGroup}`)?.focus()
    setExpandedCategoryGroup(null)
    if (
      nextCategory === category &&
      submittedSearch.current?.category === category &&
      submittedSearch.current.query === query.trim() &&
      submittedSearch.current.topic === nextTopic &&
      hasSearch
    )
      setExpanded((value) => !value)
    else void search(query, nextCategory, false, 0, false, nextTopic)
  }

  return (
    <>
      <a className="motif-skip" href="#motif-query">
        跳到检索
      </a>
      <header className="motif-header">
        <Link href="/" className="motif-small-brand" aria-label="咫台 DiaStage 首页">
          DiaStage<span>咫台</span>
        </Link>
        <nav aria-label="账号与舞台">
          <StageThemeControl />
          <button type="button" onClick={openScript}>
            导入剧本
          </button>
          <Link href="/photo-stage">照片置景</Link>
          <Link href="/scenes">我的舞台</Link>
          {user ? (
            <AccountMenu user={user} showScenesLink={false} />
          ) : (
            <Link href="/login?next=%2F">登录 / 注册</Link>
          )}
          <button className="motif-stage-link" onClick={openStage} type="button">
            进入舞台
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </nav>
      </header>

      <section className="motif-search-area" data-expanded={expanded} aria-label="戏剧艺术检索">
        <div className="motif-search-heading">
          <h1>
            <span lang="zh-CN">咫台</span>
            <span>DiaStage</span>
          </h1>
          <p>用 AI 汇聚戏剧资讯，让创作有迹可循。</p>
        </div>
        <form
          className="motif-search-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            void search(query, category, !!query.trim(), 0, !!query.trim(), topic, !!query.trim())
          }}
        >
          <label className="motif-search-field">
            <Search aria-hidden="true" size={23} />
            <span className="sr-only">检索戏剧资料</span>
            <input
              ref={input}
              id="motif-query"
              name="q"
              value={query}
              maxLength={500}
              placeholder="搜剧本、表导演知识、戏剧视频、院校与演出…"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="清空检索" onClick={clear}>
                <X size={19} aria-hidden="true" />
              </button>
            )}
            <button
              className="motif-submit"
              type="submit"
              disabled={busy !== null}
              aria-label="智能搜索戏剧资料"
            >
              {busy !== null ? (
                <LoaderCircle className="motif-loading" size={19} aria-hidden="true" />
              ) : (
                <ArrowRight size={21} aria-hidden="true" />
              )}
              <span>搜索</span>
            </button>
          </label>
        </form>
        <div className="motif-search-actions" role="group" aria-label="联网与知识问答">
          <button
            type="button"
            aria-label="联网检索"
            title="仅查联网来源"
            disabled={busy !== null}
            onClick={() => searchWithAi(true)}
          >
            {busy === 'web' ? (
              <LoaderCircle className="motif-loading" size={16} aria-hidden="true" />
            ) : (
              <Globe size={16} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="问 DIA"
            title="仅解读已收录资料"
            disabled={busy !== null}
            onClick={() => searchWithAi()}
          >
            {busy === 'ai' ? (
              <LoaderCircle className="motif-loading" size={16} aria-hidden="true" />
            ) : (
              <MessageCircle size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {showSearchHint && !query.trim() && (
          <p className="motif-search-hint" role="status">
            先输入关键词，再选择联网检索或问 DIA。
          </p>
        )}
        <nav
          ref={categoryNav}
          className="motif-categories"
          aria-label="检索分类"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && expandedCategoryGroup) {
              document.getElementById(`motif-category-${expandedCategoryGroup}`)?.focus()
              setExpandedCategoryGroup(null)
            }
          }}
        >
          {SEARCH_CATEGORY_GROUPS.map((group) => {
            const selected = group.categories.some((id) => id === category)
            const items = group.categories.flatMap((categoryId) => [
              {
                ...SEARCH_CATEGORIES.find((item) => item.id === categoryId)!,
                label:
                  categoryId === 'knowledge'
                    ? '全部知识'
                    : categoryId === 'ai-screen'
                      ? '全部AI影视'
                      : categoryId === 'opportunities'
                        ? '全部机会'
                        : SEARCH_CATEGORIES.find((item) => item.id === categoryId)!.label,
                category: categoryId,
                topic: 'all' as SearchTopic,
              },
              ...SEARCH_TOPICS.filter((item) => item.category === categoryId).map((item) => ({
                ...item,
                topic: item.id as SearchTopic,
              })),
            ])
            const grouped = items.length > 1
            return (
              <div className="motif-category-group" key={group.id}>
                <button
                  id={`motif-category-${group.id}`}
                  type="button"
                  aria-pressed={selected}
                  aria-expanded={grouped ? expandedCategoryGroup === group.id : undefined}
                  aria-controls={
                    expandedCategoryGroup === group.id
                      ? `motif-subcategories-${group.id}`
                      : undefined
                  }
                  title={items.map(({ label }) => label).join('、')}
                  onClick={() => {
                    if (grouped)
                      setExpandedCategoryGroup((current) =>
                        current === group.id ? null : group.id,
                      )
                    else chooseCategory(group.categories[0])
                  }}
                >
                  {group.label}
                  {grouped && <ChevronDown size={12} aria-hidden="true" />}
                </button>
                {categoryGroup?.id === group.id && (
                  <div
                    id={`motif-subcategories-${group.id}`}
                    className="motif-subcategories"
                    role="group"
                    aria-label={`${group.label}细分`}
                  >
                    {items.map((item) => {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={category === item.category && topic === item.topic}
                          title={item.description}
                          onClick={() => chooseCategory(item.category, item.topic)}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        {hasSearch && (
          <button
            className="motif-results-toggle"
            type="button"
            aria-controls="motif-results"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
            {expanded ? '收起结果' : '展开结果'}
          </button>
        )}
      </section>

      {hasSearch && (
        <section
          id="motif-results"
          className="motif-results"
          aria-label="检索结果"
          aria-busy={busy !== null}
          hidden={!expanded}
        >
          <div className="motif-result-toolbar">
            <p role="status">
              {busy === 'web'
                ? '正在联网查找戏剧来源…'
                : busy === 'ai'
                  ? 'DIA 正在查阅资料…'
                  : busy === 'search'
                    ? '正在查找资料…'
                    : response
                      ? response.webStatus === 'searched'
                        ? `本次资料 ${response.results.length} 条 · 联网来源 ${response.results.filter(({ status }) => status === 'web-candidate').length} 条`
                        : `${response.topic !== 'all' ? `${SEARCH_TOPICS.find(({ id }) => id === response.topic)!.label} · ` : ''}共 ${response.total} 条已收录记录，显示 ${response.results.length} 条`
                      : '检索结果'}
            </p>
          </div>
          {error && (
            <p className="motif-notice" role="alert">
              {error}
              <button type="button" onClick={() => retrySearch.current()}>
                重试检索
              </button>
            </p>
          )}
          {response?.notice && (
            <p className="motif-notice" role="status">
              {response.notice}
            </p>
          )}
          {response?.answer && (
            <article className="motif-answer" aria-label="DIA 回答">
              <h2>DIA 回答</h2>
              <p>{response.answer.text}</p>
              <div className="motif-citations">
                {response.answer.citationIds.map((id, index) => {
                  const source = response.results.find((item) => item.id === id)
                  return source ? (
                    <a key={id} href={`#resource-${id}`}>
                      [{index + 1}] {source.title}
                    </a>
                  ) : null
                })}
              </div>
              <small>{response.answer.model} · 根据本次检索资料回答</small>
            </article>
          )}
          {response && !response.results.length && !busy && (
            <div className="motif-empty">
              <h2>
                {response.webStatus === 'searched'
                  ? '本次没有找到可用来源'
                  : '还没有匹配的已收录资料'}
              </h2>
              <p>试试作品名、专业术语，或切换分类。未核实的履历、场次和资料不会补写成结果。</p>
              <button
                type="button"
                onClick={() => void search('', category, false, 0, false, topic)}
              >
                浏览这个分类
              </button>
            </div>
          )}
          <div className="motif-result-list">
            {response?.results.map((resource) => (
              <article id={`resource-${resource.id}`} key={resource.id} className="motif-resource">
                <div className="motif-resource-source">
                  <span>{resource.organization}</span>
                  {resource.sourceTier && <span>{sourceTierLabels[resource.sourceTier]}</span>}
                  <span>
                    {!resource.url
                      ? '来源登记'
                      : String(resource.status) === 'web-candidate'
                        ? '查看原站'
                        : (accessLabels[resource.access] ?? '查看来源')}
                  </span>
                </div>
                <h2>
                  {resource.url ? (
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                      {resource.title}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  ) : (
                    resource.title
                  )}
                </h2>
                <p>{resource.summary}</p>
                <div className="motif-resource-meta">
                  <span>
                    {resource.status === 'web-candidate'
                      ? '分类待核验'
                      : SEARCH_CATEGORIES.find((item) => item.id === resource.category)?.label}
                  </span>
                  <span>
                    {String(resource.status) === 'web-candidate'
                      ? '联网发现，内容待核验'
                      : resource.verifiedAt
                        ? `核验 ${resource.verifiedAt}`
                        : '已登记，待复核'}
                  </span>
                  {resource.status === 'source-directory' && <span>资料入口</span>}
                  {resource.recordType === 'bibliography' && <span>书目，未收录全书</span>}
                  {resource.sourceKind && viewpointLabels[resource.sourceKind] && (
                    <span>{viewpointLabels[resource.sourceKind]}</span>
                  )}
                  {resource.aiInvolvement && (
                    <span>{AI_INVOLVEMENT_LABELS[resource.aiInvolvement]}</span>
                  )}
                </div>
                {resource.sourceRefs?.length ? (
                  <details className="motif-source-detail">
                    <summary>来源与适用说明</summary>
                    <p>{resource.theatreEvidence ?? resource.aiEvidence}</p>
                    <ul>
                      {resource.sourceRefs.map((source, index) => (
                        <li key={`${source.title}-${index}`}>
                          {source.url ? (
                            <a href={source.url} target="_blank" rel="noopener noreferrer">
                              {source.title}
                            </a>
                          ) : (
                            source.title
                          )}
                          {source.locator && ` · ${source.locator}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
          {response && response.webStatus !== 'searched' && response.total > 24 && (
            <nav className="motif-pagination" aria-label="结果分页">
              <button
                type="button"
                disabled={busy !== null || !response.offset}
                onClick={() =>
                  void search(
                    response.query,
                    response.category,
                    false,
                    Math.max(0, response.offset - 24),
                    false,
                    response.topic,
                  )
                }
              >
                上一页
              </button>
              <span>
                第 {Math.floor(response.offset / 24) + 1} / {Math.ceil(response.total / 24)} 页
              </span>
              <button
                type="button"
                disabled={
                  busy !== null || response.offset + response.results.length >= response.total
                }
                onClick={() =>
                  void search(
                    response.query,
                    response.category,
                    false,
                    response.offset + 24,
                    false,
                    response.topic,
                  )
                }
              >
                下一页
              </button>
            </nav>
          )}
          {response && (
            <div className="motif-stage-follow">
              <p>让资料走进排练。</p>
              <button type="button" onClick={openStage}>
                进入舞台搭建
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      )}

      <section className="motif-brand" aria-labelledby="motif-brand-title">
        <div className="motif-brand-heading">
          <h2 id="motif-brand-title">
            认识 Dia 与 DiaStage
            <ArrowDown size={14} aria-hidden="true" />
          </h2>
        </div>
        <div className="motif-brand-details">
          <p className="motif-brand-companion">{DIASTAGE_BRAND.companion}</p>
          <p className="motif-brand-product">{DIASTAGE_BRAND.product}</p>
          <dl>
            {DIASTAGE_BRAND.capabilities.map(([name, description]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <details className="motif-intake-policy">
            <summary>Dia 收录准则</summary>
            <p>
              仅收录中国大陆及港澳的戏剧艺术与AI影视专业资料，国外暂缓；排除娱乐八卦，人物须关联可核实作品，AI影视注明AI参与依据，正文与视频按许可访问。
            </p>
          </details>
        </div>
      </section>

      <footer className="motif-footer">
        <p className="motif-brand-motto">AI 虽能拓展想象，但还请你坚信直觉。</p>
        <div className="motif-contact-links">
          <a href="mailto:21@diastage.art">联系咫台</a>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
            粤ICP备2026162365号
          </a>
        </div>
      </footer>
    </>
  )
}
