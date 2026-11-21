import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ImageOff, LayoutGrid, Sparkles } from 'lucide-react'
import { pipelineConfigured } from '@/api/pipeline'
import type { Scene } from '@/types'
import { sceneCast, seasonCharacters, useData, useScenesByTopic } from '@/store/data'
import { CastChips } from '@/components/CastChips'
import { SceneStageBadge } from '@/components/SceneStageBadge'
import { mediaUrl, sceneCode } from '@/lib/media'
import { cn, storageGet } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { Button, ConfirmDialog, EmptyState, SegmentedControl } from '@/components/ui'
import { SceneCard } from './SceneCard'

type Show = 'all' | 'missing' | 'manual'

export function StoryboardPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/storyboard/${last}`} replace />
    return <EmptyState icon={<LayoutGrid />} title="Выберите ролик" action={<TopicSelect value="" base="/storyboard" className="w-72" />} />
  }
  return <Board key={topicId} topicId={topicId} />
}

function Board({ topicId }: { topicId: string }) {
  const [params, setParams] = useSearchParams()
  const { characters, topics, loading, deleteScenes, generateSceneImages } = useData()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])))
  const seasonId = topics.find((t) => t.topic_id === topicId)?.season_id
  const pool = useMemo(() => seasonCharacters(seasonId, characters), [seasonId, characters])
  const all = useScenesByTopic().get(topicId) ?? []
  const [show, setShow] = useState<Show>('all')
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const stats = useMemo(
    () => ({
      frames: all.filter((s) => s.base_image_url).length,
      manual: all.filter((s) => s.manual_prompt?.trim()).length,
    }),
    [all],
  )
  const shown = all.filter((s) => (show === 'missing' ? !s.base_image_url : show === 'manual' ? !!s.manual_prompt?.trim() : true))

  const activeId = params.get('scene')
  const active = all.find((s) => s.scene_id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id == null) p.delete('scene')
      else p.set('scene', id)
      return p
    })

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TopicSelect value={topicId} base="/storyboard" className="w-64" />
          <SegmentedControl<Show>
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: `Все ${all.length}` },
              { value: 'missing', label: `Без кадра ${all.length - stats.frames}` },
              { value: 'manual', label: `С ручным промптом ${stats.manual}` },
            ]}
          />
          {picked.size > 0 && (
            <>
              <Button
                variant="primary"
                disabled={!pipelineConfigured}
                title="Поставить выбранные шоты в очередь кадров: по одному, по порядку"
                onClick={() => {
                  generateSceneImages(all.filter((x) => picked.has(x.scene_id)))
                  setPicked(new Set())
                }}
              >
                <Sparkles /> Сгенерировать выбранные ({picked.size})
              </Button>
              <Button variant="ghost" onClick={() => setPicked(new Set())}>
                Снять выбор
              </Button>
            </>
          )}
          {all.length - stats.frames > 0 && (
            <Button
              variant="outline"
              disabled={!pipelineConfigured}
              title="Все шоты серии без кадра — в очередь, по порядку"
              onClick={() => generateSceneImages(all.filter((x) => !x.base_image_url))}
            >
              <Sparkles /> Сгенерировать недостающие ({all.length - stats.frames})
            </Button>
          )}
          <div className="ml-auto flex items-center gap-4 text-xs text-fg-3">
            <span>
              Кадров <b className="text-fg">{stats.frames}</b>/{all.length}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loading && !shown.length ? (
            <EmptyState icon={<LayoutGrid />} title={all.length ? 'Нет кадров под фильтр' : 'У ролика нет сцен'} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {shown.map((s) => (
                <Frame
                  key={s.scene_id}
                  scene={s}
                  topic={topics.find((t) => t.topic_id === topicId)}
                  cast={sceneCast(s, pool)}
                  active={s.scene_id === activeId}
                  picked={picked.has(s.scene_id)}
                  onPick={() => toggle(s.scene_id)}
                  onClick={() => open(s.scene_id === activeId ? null : s.scene_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SceneCard scene={active} siblings={all} onClose={() => open(null)} onDelete={setConfirm} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Удалить сцену?"
        description="Сцена будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          if (!confirm) return
          await deleteScenes([confirm])
          if (activeId === confirm) open(null)
        }}
      />
    </div>
  )
}

function Frame({
  scene,
  topic,
  cast,
  active,
  picked,
  onPick,
  onClick,
}: {
  scene: Scene
  topic?: { url_final: string | null }
  cast: { name: string; known: boolean }[]
  active: boolean
  picked: boolean
  onPick: () => void
  onClick: () => void
}) {
  const src = mediaUrl(scene.base_image_url)
  const [broken, setBroken] = useState<string>()
  const text = scene.dialogue_text || scene.action || scene.location_desc
  return (
    <div className="relative">
    <button
      onClick={onClick}
      className={cn('group flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left transition-colors hover:border-fg-3', active ? 'border-accent ring-1 ring-accent' : picked ? 'border-accent' : 'border-border')}
    >
      <div className="relative aspect-video bg-raised">
        {src && broken !== src ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(src)} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-fg-3">
            <ImageOff className="size-5" />
            <span className="text-[11px]">{src ? 'файл не найден' : 'нет кадра'}</span>
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 font-mono text-[11px] text-white">{sceneCode(scene)}</span>
        {scene.manual_prompt?.trim() && <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-gold">ручной промпт</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <div className="flex items-center gap-1.5">
          <SceneStageBadge scene={scene} topic={topic} />
          {scene.shot_type && <span className="truncate text-[11px] text-fg-3">{scene.shot_type}</span>}
        </div>
        {text && <p className="line-clamp-2 text-xs text-fg-2">{text}</p>}
        {cast.length > 0 && <CastChips cast={cast} className="mt-auto" />}
      </div>
    </button>
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        aria-label="Выбрать шот"
        title="Выбрать для генерации"
        className="absolute top-1.5 right-1.5 size-4 cursor-pointer accent-[var(--color-accent)]"
      />
    </div>
  )
}
