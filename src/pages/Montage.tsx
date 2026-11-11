import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, Pause, Play, Scissors, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-react'
import type { Scene } from '@/types'
import { topicPreview, useData, useScenesByTopic } from '@/store/data'
import { montageConfigured } from '@/api/pipeline'
import { mediaUrl, sceneCode } from '@/lib/media'
import { cn, fmtDuration, storageGet } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button, ConfirmDialog, EmptyState, SegmentedControl } from '@/components/ui'
import { SceneCard } from './SceneCard'

/** Длительность шота на таймлайне: по озвучке, без неё — scenes.time (так же считает n8n). */
const DEFAULT_SEC = 3
const clipSec = (s: Scene) => s.audio_duration || s.time || DEFAULT_SEC
const SCALES = [16, 32, 64, 128] // px на секунду
type Mode = 'draft' | 'final'

/** Монтаж серии: экран сверху, таймлайн (видео · голос · музыка) снизу. Склейка встык, порядок — scena/shot_num.
 *  «Черновик» проигрывает видео шотов подряд в браузере; «Готовый ролик» — topics.url_final после монтажа в n8n. */
export function MontagePage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/montage/${last}`} replace />
    return <EmptyState icon={<Scissors />} title="Выберите ролик" action={<TopicSelect value="" base="/montage" className="w-72" />} />
  }
  return <Montage key={topicId} topicId={topicId} />
}

function Montage({ topicId }: { topicId: string }) {
  const [params, setParams] = useSearchParams()
  const { topics, deleteScenes, runJobs, isRunning } = useData()
  const topic = topics.find((t) => t.topic_id === topicId)
  const shots = useScenesByTopic().get(topicId) ?? []
  const [mode, setMode] = useState<Mode>('draft')
  const [scale, setScale] = useState(() => storageGet('montage:scale', 32))
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmMontage, setConfirmMontage] = useState(false)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])
  useEffect(() => {
    localStorage.setItem('montage:scale', JSON.stringify(scale))
  }, [scale])

  // Начало каждого шота на общей шкале
  const { starts, total } = useMemo(() => {
    const starts: number[] = []
    let acc = 0
    for (const s of shots) {
      starts.push(acc)
      acc += clipSec(s)
    }
    return { starts, total: acc }
  }, [shots])

  const player = useDraftPlayer(shots, starts)
  const montaging = isRunning('montage', topicId)
  const withVideo = shots.filter((s) => s.video_file).length

  const cardId = params.get('scene')
  const card = shots.find((s) => s.scene_id === cardId) ?? null
  const openCard = (id: string | null) =>
    setParams((p) => {
      if (id == null) p.delete('scene')
      else p.set('scene', id)
      return p
    })

  const montage = () => (withVideo < shots.length ? setConfirmMontage(true) : void runJobs('montage', [topicId]))

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TopicSelect value={topicId} base="/montage" className="w-64" />
          <div className="flex items-center gap-4 text-xs text-fg-3">
            <span>
              Шотов <b className="text-fg">{shots.length}</b>
            </span>
            <span>
              Длительность <b className="text-fg">{fmtDuration(total)}</b>
            </span>
            <span>
              Видео <b className="text-fg">{withVideo}</b>/{shots.length}
            </span>
          </div>
          <Button
            variant="primary"
            className="ml-auto"
            disabled={!shots.length || montaging || !montageConfigured}
            title={montageConfigured ? 'Смонтировать ролик в n8n: видео шотов встык + музыка → url_final' : 'Не задан VITE_N8N_MONTAGE_WEBHOOK'}
            onClick={montage}
          >
            {montaging ? <Loader2 className="animate-spin" /> : <Scissors />}
            {montaging ? 'Монтаж…' : topic?.url_final ? 'Перемонтировать' : 'Смонтировать'}
          </Button>
        </div>

        {!shots.length ? (
          <EmptyState icon={<Scissors />} title="У ролика нет сцен" />
        ) : (
          <>
            {/* Экран */}
            <div className="flex min-h-0 flex-1 gap-4 p-4">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
                <SegmentedControl<Mode>
                  value={mode}
                  onChange={(m) => {
                    player.pause()
                    setMode(m)
                  }}
                  options={[
                    { value: 'draft', label: 'Черновик' },
                    { value: 'final', label: 'Готовый ролик' },
                  ]}
                />
                {mode === 'draft' ? (
                  <>
                    <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">{player.screen}</div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" aria-label="Предыдущий шот" title="Предыдущий шот" onClick={() => player.jump(-1)}>
                        <SkipBack />
                      </Button>
                      <Button variant="primary" size="icon" aria-label={player.playing ? 'Пауза' : 'Играть'} onClick={player.toggle}>
                        {player.playing ? <Pause /> : <Play />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Следующий шот" title="Следующий шот" onClick={() => player.jump(1)}>
                        <SkipForward />
                      </Button>
                      <span className="ml-2 font-mono text-xs text-fg-2">
                        {fmtDuration(player.time)} / {fmtDuration(total)}
                      </span>
                    </div>
                  </>
                ) : topic?.url_final ? (
                  <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                    <VideoPlayer src={topic.url_final} poster={topicPreview(shots)} className="max-h-full" />
                  </div>
                ) : (
                  <EmptyState icon={<Scissors />} title="Ролик ещё не смонтирован" description="Нажмите «Смонтировать» — n8n соберёт видео шотов встык и наложит музыку" />
                )}
              </div>
              {mode === 'draft' && <NowPlaying scene={shots[player.idx]} />}
            </div>

            <Timeline
              shots={shots}
              starts={starts}
              total={total}
              scale={scale}
              setScale={setScale}
              time={player.time}
              playing={player.playing}
              current={player.idx}
              onSeek={(t) => {
                setMode('draft')
                player.seek(t)
              }}
              onOpen={openCard}
            />
          </>
        )}
      </div>

      <SceneCard scene={card} siblings={shots} onClose={() => openCard(null)} onDelete={setConfirmDelete} />
      <ConfirmDialog
        open={confirmMontage}
        onOpenChange={setConfirmMontage}
        title="Не у всех шотов есть видео"
        description={`Без видео: ${shots.length - withVideo} из ${shots.length}. Всё равно запустить монтаж?`}
        confirmLabel="Смонтировать"
        onConfirm={() => void runJobs('montage', [topicId])}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Удалить сцену?"
        description="Сцена будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          if (!confirmDelete) return
          await deleteScenes([confirmDelete])
          if (cardId === confirmDelete) openCard(null)
        }}
      />
    </div>
  )
}

/** Черновой просмотр: видео шотов подряд; шот без видео показывается кадром на его длительность. */
function useDraftPlayer(shots: Scene[], starts: number[]) {
  const [idx, setIdx] = useState(0)
  const [local, setLocal] = useState(0) // секунды внутри текущего шота
  const [playing, setPlaying] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const pendingSeek = useRef(0)

  const i = Math.min(idx, Math.max(0, shots.length - 1))
  const shot = shots[i] as Scene | undefined
  const src = mediaUrl(shot?.video_file)
  const dur = shot ? clipSec(shot) : 0

  const go = (n: number, at = 0) => {
    if (n >= shots.length) {
      setPlaying(false)
      return
    }
    pendingSeek.current = at
    setIdx(Math.max(0, n))
    setLocal(at)
    if (n === i && video.current) video.current.currentTime = at
  }

  // Видео: play/pause по состоянию
  useEffect(() => {
    const v = video.current
    if (!v) return
    if (playing) void v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [playing, src])

  // Шот без видео — тикаем таймером
  useEffect(() => {
    if (!playing || src || !shot) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setLocal((t) => {
        const nt = t + dt
        if (nt >= dur) {
          queueMicrotask(() => go(i + 1))
          return dur
        }
        return nt
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, src, i, dur])

  const screen = shot ? (
    src ? (
      <video
        key={src}
        ref={video}
        src={src}
        poster={mediaUrl(shot.base_image_url)}
        playsInline
        className="size-full object-contain"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = pendingSeek.current
          pendingSeek.current = 0
          if (playing) void e.currentTarget.play().catch(() => setPlaying(false))
        }}
        onTimeUpdate={(e) => setLocal(Math.min(e.currentTarget.currentTime, dur))}
        onEnded={() => go(i + 1)}
      />
    ) : (
      <>
        {mediaUrl(shot.base_image_url) ? <img src={mediaUrl(shot.base_image_url)} alt="" className="size-full object-contain opacity-70" /> : null}
        <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white/80">нет видео — кадр {fmtDuration(dur)}</span>
      </>
    )
  ) : null

  return {
    idx: i,
    playing,
    time: (starts[i] ?? 0) + local,
    screen,
    toggle: () => {
      if (!playing && i === shots.length - 1 && local >= dur - 0.05) go(0)
      setPlaying((p) => !p)
    },
    pause: () => setPlaying(false),
    jump: (d: number) => go(Math.min(shots.length - 1, i + d)),
    seek: (t: number) => {
      let n = starts.findIndex((st, k) => t >= st && (k === starts.length - 1 || t < starts[k + 1]))
      if (n < 0) n = 0
      go(n, Math.max(0, t - starts[n]))
    },
  }
}

/** Что сейчас на экране: код шота, кто говорит, реплика, видео-промпт. */
function NowPlaying({ scene }: { scene?: Scene }) {
  if (!scene) return null
  return (
    <aside className="hidden w-64 shrink-0 space-y-3 overflow-y-auto text-[13px] lg:block">
      <div className="font-mono text-xs text-fg-3">{sceneCode(scene)}</div>
      {scene.speaking_character && <div className="font-medium">{scene.speaking_character}</div>}
      {scene.dialogue_text && (
        <blockquote className="rounded-md border-l-2 border-accent bg-bg px-3 py-2 text-fg-2">
          «{scene.dialogue_text}»{scene.dialogue_direction && <span className="ml-1 text-fg-3">— {scene.dialogue_direction}</span>}
        </blockquote>
      )}
      {scene.action && <p className="text-xs text-fg-3">{scene.action}</p>}
    </aside>
  )
}

/** Таймлайн: линейка, видео, голос, музыка. Метка проигрывания держится по центру, лента едет под ней. */
function Timeline({
  shots,
  starts,
  total,
  scale,
  setScale,
  time,
  playing,
  current,
  onSeek,
  onOpen,
}: {
  shots: Scene[]
  starts: number[]
  total: number
  scale: number
  setScale: (n: number) => void
  time: number
  playing: boolean
  current: number
  onSeek: (t: number) => void
  onOpen: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const LABEL = 64 // ширина колонки с названиями дорожек
  const width = total * scale

  useEffect(() => {
    const el = scroller.current
    if (!el || !playing) return
    el.scrollLeft = time * scale - (el.clientWidth - LABEL) / 2
  }, [time, scale, playing])

  // Музыка: подряд идущие шоты с одной музыкой (или локацией) — один блок
  const music = useMemo(() => {
    const blocks: {
      key: string
      start: number
      len: number
      label: string
      set: boolean
    }[] = []
    shots.forEach((s, k) => {
      const set = !!(s.music?.trim() || s.music_file)
      const key = s.music?.trim() || s.music_file || `loc:${s.location_num ?? s.location_desc ?? ''}`
      const last = blocks[blocks.length - 1]
      if (last?.key === key) last.len += clipSec(s)
      else
        blocks.push({
          key,
          start: starts[k],
          len: clipSec(s),
          set,
          label: s.music?.trim() || s.location_desc || (s.location_num != null ? `локация ${s.location_num}` : '—'),
        })
    })
    return blocks
  }, [shots, starts])

  const ticks = useMemo(() => {
    const step = scale >= 64 ? 1 : scale >= 32 ? 5 : 10
    return Array.from({ length: Math.floor(total / step) + 1 }, (_, k) => k * step)
  }, [total, scale])

  const seekAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(total, (e.clientX - r.left) / scale)))
  }
  const zoom = (d: number) => setScale(SCALES[Math.max(0, Math.min(SCALES.length - 1, SCALES.indexOf(scale) + d))] ?? 32)

  // Обычная функция, не компонент: иначе дорожки перемонтируются на каждом кадре проигрывания
  const row = (label: string, children: React.ReactNode) => (
    <div className="flex">
      <div className="sticky left-0 z-10 flex shrink-0 items-center bg-surface px-2 text-[10px] font-semibold tracking-wide text-fg-3 uppercase" style={{ width: LABEL }}>
        {label}
      </div>
      <div className="relative" style={{ width }}>
        {children}
      </div>
    </div>
  )

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-xs text-fg-3">Склейка встык · клик — перемотка, двойной клик — карточка сцены</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Уменьшить" onClick={() => zoom(-1)} disabled={scale === SCALES[0]}>
          <ZoomOut />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Увеличить" onClick={() => zoom(1)} disabled={scale === SCALES[SCALES.length - 1]}>
          <ZoomIn />
        </Button>
      </div>
      <div ref={scroller} className="relative overflow-x-auto pb-2">
        <div className="relative" style={{ width: width + LABEL + 32 }}>
          {row(
            '',
            <div className="relative h-5 cursor-pointer border-b border-border" onClick={seekAt}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] text-fg-3" style={{ left: t * scale }}>
                  {fmtDuration(t)}
                </span>
              ))}
            </div>,
          )}

          {row(
            'Видео',
            <div className="relative h-16">
              {shots.map((s, k) => {
                const img = mediaUrl(s.base_image_url)
                return (
                  <button
                    key={s.scene_id}
                    onClick={() => onSeek(starts[k])}
                    onDoubleClick={() => onOpen(s.scene_id)}
                    title={`${sceneCode(s)} · ${fmtDuration(clipSec(s))}${s.video_file ? '' : ' · нет видео'}`}
                    className={cn(
                      'absolute top-1 bottom-1 overflow-hidden rounded border bg-raised bg-cover bg-center text-left',
                      k === current ? 'border-accent ring-1 ring-accent' : 'border-border',
                      !s.video_file && 'opacity-40',
                    )}
                    style={{
                      left: starts[k] * scale + 1,
                      width: Math.max(4, clipSec(s) * scale - 2),
                      backgroundImage: img ? `url("${img}")` : undefined,
                    }}
                  >
                    <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{sceneCode(s)}</span>
                  </button>
                )
              })}
            </div>,
          )}

          {row(
            'Голос',
            <div className="relative h-6">
              {shots.map((s, k) =>
                s.dialogue_text?.trim() ? (
                  <div
                    key={s.scene_id}
                    title={`${s.speaking_character ?? ''}: ${s.dialogue_text}`}
                    className={cn('absolute top-1 bottom-1 truncate rounded px-1 text-[10px] leading-4', s.audio_file ? 'bg-accent/30 text-fg' : 'border border-dashed border-gold/60 text-gold')}
                    style={{
                      left: starts[k] * scale + 1,
                      width: Math.max(4, (s.audio_duration || clipSec(s)) * scale - 2),
                    }}
                  >
                    {s.audio_file ? s.speaking_character : 'не озвучено'}
                  </div>
                ) : null,
              )}
            </div>,
          )}

          {row(
            'Музыка',
            <div className="relative h-6">
              {music.map((b, k) => (
                <div
                  key={k}
                  title={b.set ? b.label : `${b.label}: музыка не задана`}
                  className={cn('absolute top-1 bottom-1 truncate rounded px-1 text-[10px] leading-4', b.set ? 'bg-success/25 text-fg' : 'border border-dashed border-border text-fg-3')}
                  style={{
                    left: b.start * scale + 1,
                    width: Math.max(4, b.len * scale - 2),
                  }}
                >
                  {b.label}
                </div>
              ))}
            </div>,
          )}

          {/* Метка проигрывания */}
          <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-danger" style={{ left: LABEL + time * scale }}>
            <span className="absolute -top-0 -left-1 size-2 rotate-45 bg-danger" />
          </div>
        </div>
      </div>
    </div>
  )
}
