import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AudioLines, Check, Clapperboard, Film, Image, ListOrdered, Music2, Rocket, ScrollText, Scissors } from 'lucide-react'
import type { Scene, Topic } from '@/types'
import { SEASON_KEY, scenePreview, seasonEpisodes, seasonTitle, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { cn, storageGet } from '@/lib/utils'
import { Select, Thumb } from './ui'

/** Шаг конвейера серии: прогресс считается по данным, руками не ведётся. */
interface Step {
  key: string
  label: string
  icon: ReactNode
  /** done из total; total = 0 — шаг пока не к чему применить (нет шотов, нет реплик). */
  measure: (t: Topic, shots: Scene[]) => { done: number; total: number }
  href: (t: Topic) => string
}

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? !!v.trim() : v != null)
const one = (ok: boolean) => ({ done: ok ? 1 : 0, total: 1 })
const count = (shots: Scene[], pick: (s: Scene) => boolean, of: (s: Scene) => boolean = () => true) => {
  const pool = shots.filter(of)
  return { done: pool.filter(pick).length, total: pool.length }
}
/** Локации серии: location_num, без номера — location_desc. Музыка — у локации, если есть хоть у одного её шота. */
function locations(shots: Scene[]) {
  const m = new Map<string, boolean>()
  for (const s of shots) {
    const k = s.location_num != null ? `n${s.location_num}` : `d${s.location_desc ?? ''}`
    m.set(k, (m.get(k) ?? false) || !!s.music_file)
  }
  return { done: [...m.values()].filter(Boolean).length, total: m.size }
}

const STEPS: Step[] = [
  { key: 'beats', label: 'Биты', icon: <ListOrdered />, measure: (t) => one(has(t.beats)), href: (t) => `/seasons/${t.season_id}?ep=${t.topic_id}` },
  { key: 'script', label: 'Сценарий', icon: <ScrollText />, measure: (t) => one(has(t.script_scenas)), href: (t) => `/script/${t.topic_id}` },
  { key: 'shots', label: 'Шоты', icon: <Clapperboard />, measure: (t, s) => one(has(t.script_shots) || s.length > 0), href: (t) => `/scenes/${t.topic_id}` },
  { key: 'frames', label: 'Кадры', icon: <Image />, measure: (_, s) => count(s, (x) => !!x.base_image_url), href: (t) => `/storyboard/${t.topic_id}` },
  {
    key: 'voice',
    label: 'Озвучка',
    icon: <AudioLines />,
    measure: (_, s) =>
      count(
        s,
        (x) => !!x.audio_file,
        (x) => !!x.dialogue_text?.trim(),
      ),
    href: (t) => `/voice/${t.topic_id}`,
  },
  { key: 'video', label: 'Видео', icon: <Film />, measure: (_, s) => count(s, (x) => !!x.video_file), href: (t) => `/animation/${t.topic_id}` },
  { key: 'music', label: 'Музыка', icon: <Music2 />, measure: (_, s) => locations(s), href: (t) => `/music/${t.topic_id}` },
  { key: 'montage', label: 'Монтаж', icon: <Scissors />, measure: (t) => one(!!t.url_final), href: (t) => `/montage/${t.topic_id}` },
  { key: 'publish', label: 'Публикация', icon: <Rocket />, measure: (t) => one(t.status === 'published'), href: (t) => `/topics/${t.topic_id}` },
]

type Cell = { done: number; total: number; ratio: number }

function rowCells(t: Topic, shots: Scene[]): Cell[] {
  return STEPS.map((st) => {
    const m = st.measure(t, shots)
    return { ...m, ratio: m.total ? m.done / m.total : 0 }
  })
}

/** Конвейер сезона: серии × шаги от битов до публикации. Главный экран показа — где что стоит и куда кликнуть. */
export function SeasonPipeline() {
  const navigate = useNavigate()
  const { seasons, topics } = useData()
  const byTopic = useScenesByTopic()
  const [seasonId, setSeasonId] = useState(() => storageGet<string | null>(SEASON_KEY, null))
  const season = seasons.find((s) => s.id === seasonId) ?? seasons[0]

  const rows = useMemo(() => {
    if (!season) return []
    return seasonEpisodes(season.id, topics).map((t) => {
      const shots = byTopic.get(t.topic_id) ?? []
      const cells = rowCells(t, shots)
      const next = cells.findIndex((c) => c.ratio < 1)
      return { t, shots, cells, next, progress: cells.reduce((a, c) => a + c.ratio, 0) / cells.length }
    })
  }, [season, topics, byTopic])

  if (!season) return null

  const total = rows.length ? rows.reduce((a, r) => a + r.progress, 0) / rows.length : 0
  const finished = rows.filter((r) => r.t.url_final).length
  const shotsTotal = rows.reduce((a, r) => a + r.shots.length, 0)
  // Сводка по шагам: сколько серий прошли шаг полностью
  const stepDone = STEPS.map((_, i) => rows.filter((r) => r.cells[i].ratio === 1).length)

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-start gap-4 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Конвейер сезона</div>
          <h2 className="mt-1 text-xl font-semibold">{seasonTitle(season)}</h2>
          {season.logline && <p className="mt-1 line-clamp-2 max-w-3xl text-[13px] text-fg-2">{season.logline}</p>}
        </div>
        <div className="flex items-center gap-6">
          <Big value={`${Math.round(total * 100)}%`} label="готовность сезона" />
          <Big value={`${finished}/${rows.length}`} label="серий смонтировано" />
          <Big value={String(shotsTotal)} label="шотов" />
          {seasons.length > 1 && (
            <Select
              className="w-48"
              value={season.id}
              onChange={(e) => {
                setSeasonId(e.target.value)
                localStorage.setItem(SEASON_KEY, JSON.stringify(e.target.value))
              }}
              options={seasons.map((s) => ({ value: s.id, label: seasonTitle(s) }))}
            />
          )}
        </div>
      </header>

      {!rows.length ? (
        <div className="p-8 text-center text-fg-3">В сезоне пока нет серий</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[280px] px-5 py-3 text-left text-xs font-medium text-fg-3">Серия</th>
                {STEPS.map((st, i) => (
                  <th key={st.key} className="px-1 py-3 text-center text-xs font-medium text-fg-3">
                    <div className="flex flex-col items-center gap-1 [&_svg]:size-4">
                      {st.icon}
                      {st.label}
                      <span className="font-mono text-[10px] text-fg-3/70">
                        {stepDone[i]}/{rows.length}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="w-24 px-4 py-3 text-right text-xs font-medium text-fg-3">Готово</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, shots, cells, next, progress }) => (
                <tr key={t.topic_id} className="group border-b border-border/60 last:border-0 hover:bg-hover/40">
                  <td className="px-5 py-2.5">
                    <button className="flex w-full min-w-0 items-center gap-3 text-left" onClick={() => navigate(`/topics/${t.topic_id}`)}>
                      <span className="w-6 shrink-0 text-right font-mono text-xs text-fg-3">{t.backlog ?? '—'}</span>
                      <Thumb src={shots.map(scenePreview).find(Boolean)} className="h-9 w-16 shrink-0 rounded" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium group-hover:text-accent-hover">{topicTitle(t)}</span>
                        <span className="block truncate text-[11px] text-fg-3">{next >= 0 ? `дальше: ${STEPS[next].label.toLowerCase()}` : 'готово'}</span>
                      </span>
                    </button>
                  </td>
                  {cells.map((c, i) => (
                    <td key={STEPS[i].key} className="px-1 py-2.5 text-center">
                      <StepCell cell={c} isNext={i === next} onClick={() => navigate(STEPS[i].href(t))} label={STEPS[i].label} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-border">
                        <div className={cn('h-full rounded-full', progress === 1 ? 'bg-success' : 'bg-accent')} style={{ width: `${progress * 100}%` }} />
                      </div>
                      <span className="w-9 text-right font-mono text-xs text-fg-2">{Math.round(progress * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <div className="font-mono text-2xl leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-fg-3">{label}</div>
    </div>
  )
}

/** Ячейка шага: ✓ — готово; кольцо с «12/24» — частично; пусто — не начато; «—» — не к чему применить. Следующий шаг серии подсвечен. */
function StepCell({ cell, isNext, onClick, label }: { cell: Cell; isNext: boolean; onClick: () => void; label: string }) {
  const { done, total, ratio } = cell
  const title = total ? `${label}: ${done} из ${total}` : `${label}: пока не к чему применить`
  const R = 15
  const C = 2 * Math.PI * R
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn('relative mx-auto flex size-11 items-center justify-center rounded-full transition-transform hover:scale-110', isNext && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-surface')}
    >
      {!total ? (
        <span className="text-fg-3/50">—</span>
      ) : ratio === 1 ? (
        <span className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success [&_svg]:size-4">
          <Check strokeWidth={3} />
        </span>
      ) : (
        <>
          <svg viewBox="0 0 36 36" className="absolute size-9 -rotate-90">
            <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
            {done > 0 && <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${ratio * C} ${C}`} className="text-accent" />}
          </svg>
          <span className={cn('relative font-mono text-[10px] leading-none', done ? 'text-fg' : 'text-fg-3')}>{total > 1 ? `${done}/${total}` : ''}</span>
        </>
      )}
    </button>
  )
}
