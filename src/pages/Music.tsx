import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, Music2, Sparkles } from 'lucide-react'
import type { Scene } from '@/types'
import { useData, useScenesByTopic } from '@/store/data'
import { musicConfigured } from '@/api/pipeline'
import { mediaUrl, sceneCode } from '@/lib/media'
import { fmtDuration, storageGet } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { Button, ConfirmDialog, EmptyState, Textarea } from '@/components/ui'
import { SceneCard } from './SceneCard'

/** Длительность шота — как на монтаже: по озвучке, без неё — scenes.time. */
const clipSec = (s: Scene) => s.audio_duration || s.time || 3

interface Location {
  key: string
  num: number | null
  title: string
  shots: Scene[]
}

/** Шоты серии по локациям: location_num, без номера — по location_desc. Порядок — по первому появлению. */
function byLocation(shots: Scene[]): Location[] {
  const map = new Map<string, Location>()
  for (const s of shots) {
    const key = s.location_num != null ? `n:${s.location_num}` : `d:${s.location_desc?.trim() ?? ''}`
    let loc = map.get(key)
    if (!loc) {
      loc = { key, num: s.location_num, title: s.location_desc?.trim() || 'Без описания локации', shots: [] }
      map.set(key, loc)
    }
    loc.shots.push(s)
  }
  return [...map.values()]
}

const distinct = (xs: (string | null)[]) => [...new Set(xs.map((x) => x?.trim() || ''))]

/** Музыка серии: на каждую локацию — описание для Suno (scenes.music) и трек (scenes.music_file), генерация через n8n. */
export function MusicPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/music/${last}`} replace />
    return <EmptyState icon={<Music2 />} title="Выберите ролик" action={<TopicSelect value="" base="/music" className="w-72" />} />
  }
  return <MusicBoard key={topicId} topicId={topicId} />
}

function MusicBoard({ topicId }: { topicId: string }) {
  const [params, setParams] = useSearchParams()
  const { loading, deleteScenes } = useData()
  const shots = useScenesByTopic().get(topicId) ?? []
  const locations = useMemo(() => byLocation(shots), [shots])
  const withMusic = locations.filter((l) => l.shots.some((s) => s.music_file)).length
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const activeId = params.get('scene')
  const active = shots.find((s) => s.scene_id === activeId) ?? null
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
          <TopicSelect value={topicId} base="/music" className="w-64" />
          <div className="ml-auto flex items-center gap-4 text-xs text-fg-3">
            <span>
              Локаций <b className="text-fg">{locations.length}</b>
            </span>
            <span>
              С музыкой <b className="text-fg">{withMusic}</b>/{locations.length}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loading && !locations.length ? (
            <EmptyState icon={<Music2 />} title="У ролика нет сцен" />
          ) : (
            <div className="mx-auto max-w-4xl space-y-3">
              {locations.map((l) => (
                <LocationMusic key={l.key} topicId={topicId} loc={l} activeId={activeId} onOpen={open} />
              ))}
            </div>
          )}
        </div>
      </div>

      <SceneCard scene={active} siblings={shots} onClose={() => open(null)} onDelete={setConfirm} />
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

function LocationMusic({ topicId, loc, activeId, onOpen }: { topicId: string; loc: Location; activeId: string | null; onOpen: (id: string) => void }) {
  const { updateScenes, runMusic, isRunning } = useData()
  const ids = loc.shots.map((s) => s.scene_id)
  const texts = distinct(loc.shots.map((s) => s.music))
  const files = distinct(loc.shots.map((s) => s.music_file)).filter(Boolean)
  const saved = texts.find(Boolean) ?? ''
  const [text, setText] = useState(saved)
  useEffect(() => setText(saved), [saved])
  const dirty = text.trim() !== saved || texts.length > 1
  const running = isRunning('music', ids[0])
  const total = loc.shots.reduce((a, s) => a + clipSec(s), 0)
  const save = () => updateScenes(ids, { music: text.trim() || null })

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{loc.num != null ? `Локация ${loc.num}` : 'Локация'}</h3>
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2" title={loc.title}>
          {loc.title}
        </span>
        <span className="font-mono text-xs text-fg-3" title="Сумма длительностей шотов — длина трека">
          {fmtDuration(total)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {loc.shots.map((s) => (
          <button
            key={s.scene_id}
            onClick={() => onOpen(s.scene_id)}
            className={`rounded px-1.5 font-mono text-[11px] ${s.scene_id === activeId ? 'bg-accent text-white' : 'bg-raised text-fg-2 hover:bg-hover'}`}
            title={s.dialogue_text || s.action || ''}
          >
            {sceneCode(s)}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs text-fg-3" htmlFor={`music-${loc.key}`}>
        Описание для Suno (scenes.music)
      </label>
      <Textarea id={`music-${loc.key}`} rows={2} className="mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: тихий ситар и табла, утро у реки, тревожно" />
      {texts.length > 1 && <div className="mt-1 text-[11px] text-gold">У шотов локации разные описания — сохранение запишет одно во все {ids.length}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dirty && (
          <Button size="sm" variant="outline" onClick={() => void save()}>
            Сохранить описание
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={running || !musicConfigured}
          title={musicConfigured ? 'Сгенерировать трек в Suno через n8n — music_file запишется во все шоты локации' : 'Не задан VITE_N8N_MUSIC_WEBHOOK'}
          onClick={async () => {
            if (dirty) await save() // n8n берёт описание из БД
            void runMusic(topicId, loc.num, ids)
          }}
        >
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? 'Генерация…' : files.length ? 'Перегенерировать музыку' : 'Сгенерировать музыку'}
        </Button>
        {files[0] && <audio src={mediaUrl(files[0])} controls preload="none" className="h-8 min-w-60 flex-1" />}
      </div>
      {files.length > 1 && <div className="mt-1 text-[11px] text-gold">У шотов локации разные треки: {files.length}. Играет первый.</div>}
    </section>
  )
}
