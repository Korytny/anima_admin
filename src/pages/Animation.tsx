import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Film, ImageOff } from 'lucide-react'
import type { Scene } from '@/types'
import { sceneCast, seasonCharacters, useData, useScenesByTopic } from '@/store/data'
import { CastChips } from '@/components/CastChips'
import { SCENE_STATUS, statusMeta } from '@/lib/status'
import { mediaUrl, sceneCode } from '@/lib/media'
import { cn, storageGet } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { ConfirmDialog, EmptyState, SegmentedControl, StatusBadge } from '@/components/ui'
import { SceneCard } from './SceneCard'

type Show = 'all' | 'missing'

/** Анимация серии: как раскадровка, но карточка — видео шота (video_file), под ним видео-промпт из scenes.action. */
export function AnimationPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/animation/${last}`} replace />
    return <EmptyState icon={<Film />} title="Выберите ролик" action={<TopicSelect value="" base="/animation" className="w-72" />} />
  }
  return <Board key={topicId} topicId={topicId} />
}

function Board({ topicId }: { topicId: string }) {
  const [params, setParams] = useSearchParams()
  const { characters, topics, loading, deleteScenes, isRunning } = useData()
  const seasonId = topics.find((t) => t.topic_id === topicId)?.season_id
  const pool = useMemo(() => seasonCharacters(seasonId, characters), [seasonId, characters])
  const all = useScenesByTopic().get(topicId) ?? []
  const [show, setShow] = useState<Show>('all')
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const videos = all.filter((s) => s.video_file).length
  const shown = show === 'missing' ? all.filter((s) => !s.video_file) : all

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
          <TopicSelect value={topicId} base="/animation" className="w-64" />
          <SegmentedControl<Show>
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: `Все ${all.length}` },
              { value: 'missing', label: `Без видео ${all.length - videos}` },
            ]}
          />
          <div className="ml-auto flex items-center gap-4 text-xs text-fg-3">
            <span>
              Видео <b className="text-fg">{videos}</b>/{all.length}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loading && !shown.length ? (
            <EmptyState icon={<Film />} title={all.length ? 'Нет шотов под фильтр' : 'У ролика нет сцен'} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {shown.map((s) => (
                <Clip
                  key={s.scene_id}
                  scene={s}
                  cast={sceneCast(s, pool)}
                  running={isRunning('video', s.scene_id)}
                  active={s.scene_id === activeId}
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

/** Видео шота: играет без звука при наведении; нет видео — кадр с пометкой. */
function Clip({ scene, cast, running, active, onClick }: { scene: Scene; cast: { name: string; known: boolean }[]; running: boolean; active: boolean; onClick: () => void }) {
  const video = mediaUrl(scene.video_file)
  const poster = mediaUrl(scene.base_image_url)
  const [broken, setBroken] = useState<string>()
  return (
    <button
      onClick={onClick}
      className={cn('group flex flex-col overflow-hidden rounded-lg border bg-surface text-left transition-colors hover:border-fg-3', active ? 'border-accent ring-1 ring-accent' : 'border-border')}
    >
      <div className="relative aspect-video bg-raised">
        {video && broken !== video ? (
          <video
            src={video}
            poster={poster}
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setBroken(video)}
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
            className="size-full object-cover"
          />
        ) : poster ? (
          <img src={poster} alt="" loading="lazy" className="size-full object-cover opacity-50" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-fg-3">
            <ImageOff className="size-5" />
            <span className="text-[11px]">нет кадра</span>
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 font-mono text-[11px] text-white">{sceneCode(scene)}</span>
        {running ? (
          <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-gold">видео в работе</span>
        ) : (
          (!video || broken === video) && <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white/80">{video ? 'файл не найден' : 'нет видео'}</span>
        )}
        {scene.time != null && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 font-mono text-[10px] text-white">{scene.time} с</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <div className="flex items-center gap-1.5">
          <StatusBadge meta={statusMeta(SCENE_STATUS, scene.status)} />
          {scene.shot_type && <span className="truncate text-[11px] text-fg-3">{scene.shot_type}</span>}
        </div>
        {scene.action ? <p className="line-clamp-4 text-xs text-fg-2">{scene.action}</p> : <p className="text-xs text-fg-3">нет видео-промпта (action)</p>}
        {cast.length > 0 && <CastChips cast={cast} className="mt-auto" />}
      </div>
    </button>
  )
}
