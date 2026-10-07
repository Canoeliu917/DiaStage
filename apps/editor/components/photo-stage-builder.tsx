'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { fetchAiWithBudgetConsent } from '@/lib/ai/budget-client'
import { compilePhotoStagePlan } from '@/lib/photo-stage/compile'
import { PHOTO_STAGE_EXAMPLE } from '@/lib/photo-stage/example'
import { type PhotoCrop, preparePhoto } from '@/lib/photo-stage/image'
import { type PhotoStagePlan, PhotoStagePlanSchema } from '@/lib/photo-stage/plan'
import { AVAILABLE_STAGE_SCENERY } from '@/lib/stage/prop-assets'

function PlacementPreview({ plan }: { plan: PhotoStagePlan }) {
  const width = plan.stage.width
  const depth = plan.stage.depth
  return (
    <svg
      viewBox={`${-width / 2 - 0.3} ${-depth / 2 - 0.3} ${width + 0.6} ${depth + 1}`}
      role="img"
      aria-label="复原布景平面预览，台口朝下"
    >
      <title>复原布景平面预览，台口朝下</title>
      <rect
        x={-width / 2}
        y={-depth / 2}
        width={width}
        height={depth}
        fill="#e5dfd3"
        stroke="#a99c87"
        strokeWidth="0.03"
      />
      {[...plan.objects]
        .sort((a, b) => a.position[1] - b.position[1])
        .map((object) => {
          const asset = AVAILABLE_STAGE_SCENERY.find(
            (entry) => entry.asset.id === object.assetId,
          )?.asset
          const centerX =
            asset?.boundsCenter && asset.dimensions
              ? (asset.boundsCenter[0] * object.dimensions.width) / asset.dimensions[0]
              : 0
          const centerZ =
            asset?.boundsCenter && asset.dimensions
              ? (asset.boundsCenter[2] * object.dimensions.depth) / asset.dimensions[2]
              : object.kind === 'stairs'
                ? object.dimensions.depth / 2
                : 0
          return (
            <g
              key={object.id}
              transform={`translate(${object.position[0]} ${object.position[2]}) rotate(${(-object.rotation[1] * 180) / Math.PI})`}
            >
              <title>
                {object.name} · {object.dimensions.width} × {object.dimensions.depth} 米（估算）
              </title>
              <rect
                x={centerX - object.dimensions.width / 2}
                y={centerZ - object.dimensions.depth / 2}
                width={object.dimensions.width}
                height={object.dimensions.depth}
                fill={object.color ?? '#b7b3a9'}
                stroke="#4e4941"
                strokeWidth="0.025"
                rx={object.profile === 'rounded-platform' ? 0.25 : 0.02}
              />
            </g>
          )
        })}
      <text x="0" y={depth / 2 + 0.42} textAnchor="middle" fill="#c9c2b8" fontSize="0.2">
        台口 · 观众方向
      </text>
    </svg>
  )
}

export function PhotoStageBuilder({ modelConfigured }: { modelConfigured: boolean }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [crop, setCrop] = useState<PhotoCrop>('full')
  const [photo, setPhoto] = useState<{ sourceImage: string; imageDataUrl: string } | null>(null)
  const [plan, setPlan] = useState<PhotoStagePlan | null>(null)
  const [source, setSource] = useState<'example' | 'vision'>('example')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)

  useEffect(() => () => request.current?.abort(), [])

  const changePhoto = async (nextFile: File, nextCrop: PhotoCrop) => {
    const current = ++generation.current
    request.current?.abort()
    setBusy(false)
    setPreparing(true)
    setError('')
    setStatus('')
    setPhoto(null)
    setPlan(null)
    setFile(nextFile)
    setCrop(nextCrop)
    try {
      const prepared = await preparePhoto(nextFile, nextCrop)
      if (generation.current === current) setPhoto(prepared)
    } catch (reason) {
      if (generation.current === current)
        setError(reason instanceof Error ? reason.message : '照片无法读取。')
    } finally {
      if (generation.current === current) setPreparing(false)
    }
  }

  const analyze = async () => {
    if (!photo || busy || preparing) return
    const current = generation.current
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setStatus('正在识别舞台结构与资产，完成后可先检查方案。')
    try {
      const { response } = await fetchAiWithBudgetConsent('/api/photo-stage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: photo.imageDataUrl,
          name:
            file?.name
              .replace(/\.[^.]+$/, '')
              .trim()
              .slice(0, 120) || undefined,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]),
      })
      const result = await response.json()
      controller.signal.throwIfAborted()
      if (!response.ok) throw new Error(result.error?.message ?? '照片识别失败，请重试。')
      const parsed = PhotoStagePlanSchema.parse(result.plan)
      if (generation.current !== current) return
      setPlan(parsed)
      setSource('vision')
      setStatus('草稿已生成。确认物件后，建立独立剧目继续三维编辑。')
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : '照片识别失败。')
        setStatus('')
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
      }
    }
  }

  const create = async () => {
    if (!plan || busy || preparing) return
    setBusy(true)
    setError('')
    setStatus('正在建立独立复原剧目…')
    try {
      const graph = compilePhotoStagePlan(plan, photo?.sourceImage)
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: plan.name, graph }),
      })
      if (!response.ok) throw new Error(`复原剧目未保存（${response.status}），请重试。`)
      const meta = (await response.json()) as { id: string }
      router.push(`/scene/${encodeURIComponent(meta.id)}?workspace=set`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复原剧目未保存。')
      setStatus('')
      setBusy(false)
    }
  }

  const replaceAsset = (index: number, assetId: string) => {
    const entry = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)
    if (!plan || !entry || entry.kind === 'camera' || entry.kind === 'performer-marker') return
    const kind = entry.kind
    setPlan({
      ...plan,
      objects: plan.objects.map((object, i) =>
        i === index
          ? {
              ...object,
              assetId,
              kind,
              profile: undefined,
              stepCount: undefined,
              hingeAngles: undefined,
            }
          : object,
      ),
    })
  }

  const openExample = async () => {
    if (busy || preparing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/photo-stage/reference-stage.jpg')
      if (!response.ok) throw new Error('示例原图暂时无法读取，请重试。')
      const reference = new File([await response.blob()], '花开庭院-原图.jpg', {
        type: 'image/jpeg',
      })
      const prepared = await preparePhoto(reference, 'reference')
      setFile(reference)
      setCrop('reference')
      setPhoto(prepared)
      setPlan(PhotoStagePlanSchema.parse(PHOTO_STAGE_EXAMPLE))
      setSource('example')
      setStatus('已打开下半张舞台的人工搭建示例；所有尺寸为估算。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '示例未能打开。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photo-stage-builder">
      <section className="photo-stage-section" aria-labelledby="photo-source-title">
        <span className="photo-stage-number">01 / 原图</span>
        <h2 id="photo-source-title">留下你看到的这一幕</h2>
        <label className="photo-stage-upload">
          <span>{file ? '更换照片' : '选择舞台照片'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const selected = event.target.files?.[0]
              if (selected) void changePhoto(selected, 'full')
              event.target.value = ''
            }}
          />
        </label>
        <p className="photo-stage-hint">
          JPG、PNG、WebP · 最大 12 MB。选定区域会作为对照照片随剧目保存。
        </p>
        {file && (
          <label className="photo-stage-field">
            取图范围
            <select
              value={crop}
              disabled={busy || preparing}
              onChange={(event) => void changePhoto(file, event.target.value as PhotoCrop)}
            >
              <option value="full">整张照片</option>
              <option value="upper">上下拼图 · 上半张</option>
              <option value="lower">上下拼图 · 下半张</option>
              {crop === 'reference' && <option value="reference">本图 · 下方完整舞台</option>}
            </select>
          </label>
        )}
        {preparing && <p role="status">正在准备照片…</p>}
        {photo ? (
          <img className="photo-stage-source" src={photo.sourceImage} alt="选定的舞台原图" />
        ) : (
          <div className="photo-stage-empty">一张照片，重新搭起一个空间。</div>
        )}
        <p className="photo-stage-hint">尺寸与被遮挡的结构将标为估算；照片不会被当作实测图纸。</p>
        {!modelConfigured && (
          <p className="photo-stage-notice">
            当前未配置照片识别服务。可先打开下方的本图复原示例，对照原图继续搭建。
          </p>
        )}
        <button
          className="photo-stage-primary"
          type="button"
          disabled={!photo || !modelConfigured || busy || preparing}
          onClick={() => void analyze()}
        >
          识别照片，生成搭建草稿
        </button>
        <p className="photo-stage-hint">
          识别会将选定照片发送给已配置的 AI 服务。生成草稿后由你确认保存。
        </p>
        {busy && request.current && (
          <button
            type="button"
            onClick={() => {
              request.current?.abort()
              request.current = null
              setBusy(false)
              setStatus('已取消识别，尚未创建剧目。')
            }}
          >
            取消识别
          </button>
        )}
        <button type="button" disabled={busy || preparing} onClick={() => void openExample()}>
          打开本图复原示例 · 花开庭院
        </button>
        <p className="photo-stage-hint">
          示例根据本次讨论中的下半张舞台人工搭建，含弧形高台、左侧台阶、背墙、家具与前区花卉。
        </p>
      </section>

      <section className="photo-stage-section" aria-labelledby="photo-plan-title">
        <span className="photo-stage-number">02 / 搭建方案</span>
        <h2 id="photo-plan-title">从照片，回到可编辑的舞台</h2>
        {plan ? (
          <>
            <p className="photo-stage-badge">
              {source === 'example' ? '人工复原示例' : 'AI 识别草稿'} · 估算尺度
            </p>
            <label className="photo-stage-field">
              剧目名称
              <input
                value={plan.name}
                maxLength={120}
                disabled={busy}
                onChange={(event) => setPlan({ ...plan, name: event.target.value })}
              />
            </label>
            <p>{plan.summary}</p>
            <div className="photo-stage-map">
              <PlacementPreview plan={plan} />
            </div>
            <p className="photo-stage-hint">
              平面布局预览 · 估算场地 {plan.stage.width} × {plan.stage.depth} 米 ·{' '}
              {plan.objects.length} 个独立构件
            </p>
            <details className="photo-stage-details">
              <summary>需要核实的部分（{plan.uncertainties.length}）</summary>
              <ul>
                {plan.uncertainties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
            <details className="photo-stage-details">
              <summary>检查物件与 22 款资产匹配</summary>
              <p className="photo-stage-hint">
                可更换匹配资产；进入舞台后继续调整位置、尺寸、旋转与折角。
              </p>
              <ol className="photo-stage-objects">
                {plan.objects.map((object, index) => (
                  <li key={object.id}>
                    <label htmlFor={`photo-asset-${index}`}>{object.name}</label>
                    <select
                      id={`photo-asset-${index}`}
                      disabled={busy}
                      value={object.assetId ?? ''}
                      onChange={(event) => replaceAsset(index, event.target.value)}
                    >
                      {!object.assetId && <option value="">可编辑构件 · {object.kind}</option>}
                      {AVAILABLE_STAGE_SCENERY.map(({ asset }) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      宽 {object.dimensions.width} · 高 {object.dimensions.height} · 深{' '}
                      {object.dimensions.depth} 米（估算）
                    </small>
                  </li>
                ))}
              </ol>
            </details>
            <button
              className="photo-stage-primary"
              type="button"
              disabled={busy || preparing || !plan.name.trim()}
              onClick={() => void create()}
            >
              确认复原，新建剧目
            </button>
            <p className="photo-stage-hint">
              保存为独立剧目，使用现有三维、平面、移动、旋转、缩放、折叠及撤销工具继续搭建。
            </p>
          </>
        ) : (
          <div className="photo-stage-empty">上传照片后生成草稿，或先查看本图复原示例。</div>
        )}
      </section>
      <div className="photo-stage-feedback" aria-live="polite">
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  )
}
