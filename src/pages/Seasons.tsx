import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, LayoutGrid, Library, Plus, Trash2 } from 'lucide-react'
import type { Season, Topic } from '@/types'
import { SEASON_KEY, STAGES, seasonEpisodes, seasonTitle, topicStage, topicTitle, useData, useScenesByTopic, type Stage } from '@/store/data'
import { useDraft } from '@/lib/useDraft'
import { TopicCard } from './TopicCard'
import { STYLES } from '@/lib/styles'
import { toast } from 'sonner'
import { cn, fmtDateTime, storageGet } from '@/lib/utils'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { Badge, Button, ConfirmDialog, EmptyState, Kbd, Select, Tabs } from '@/components/ui'

// Сезон → серии (topics.season_id, номер = backlog) → биты → сценарий → шоты → кадры.
// Стадия серии вычисляется по данным (topicStage), руками не ведётся.

const SEASON_GROUPS: GroupDef<Season>[] = [
  {
    title: 'Сезон',
    fields: [
      { key: 'title', required: true },
      { key: 'logline', label: 'логлайн', type: 'textarea', rows: 3 },
      { key: 'theme', label: 'сквозной вопрос', type: 'textarea', rows: 2 },
      { key: 'setting', label: 'мир и эпоха — в каждый кадр ({{setting}}), по-английски: ancient India, Mahabharata era…', type: 'textarea', rows: 2 },
      { key: 'style', label: 'визуальный стиль кадров — подробнее на странице «Стиль»; пусто — без добавки стиля (фотореализм)', type: 'select', options: [{ value: '', label: '— без стиля' }, ...STYLES.map((st) => ({ value: st.id, label: `${st.title} · ${st.like}` }))] },
      { key: 'status' },
    ],
  },
  { title: 'Библия (для агентов)', fields: [{ key: 'bible', label: 'тон, правила диалогов, антипримеры, визуальный стиль', type: 'textarea', rows: 24, mono: true }] },
  { title: 'Первоисточник', fields: [{ key: 'source', label: 'книги, главы, версия канона', type: 'textarea', rows: 6 }] },
  {
    title: 'Системное',
    defaultOpen: false,
    fields: [
      { key: 'id', type: 'readonly' },
      { key: 'created_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
    ],
  },
]

const ep = (n: number | null) => (n == null ? '—' : String(n).padStart(2, '0'))

export function SeasonsPage() {
  const { seasonId } = useParams()
  const { seasons, loading, createSeason } = useData()
  const navigate = useNavigate()

  if (!seasonId) {
    const last = storageGet<string | null>(SEASON_KEY, null)
    const target = seasons.find((s) => s.id === last) ?? seasons[0]
    if (target) return <Navigate to={`/seasons/${target.id}`} replace />
    if (loading) return null
    return (
      <EmptyState
        icon={<Library />}
        title="Сезонов пока нет"
        description="Сезон — арка из нескольких серий: библия + карта битов. Если таблицы нет — выполните supabase/seasons.sql."
        action={
          <Button variant="primary" onClick={async () => { const s = await createSeason(); if (s) navigate(`/seasons/${s.id}`) }}>
            <Plus /> Сезон
          </Button>
        }
      />
    )
  }
  return <SeasonView key={seasonId} seasonId={seasonId} />
}

type Tab = 'map' | 'bible'

function SeasonView({ seasonId }: { seasonId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { seasons, topics, loading, createSeason, createTopic, deleteSeasons, deleteTopics } = useData()
  const [confirmEpisode, setConfirmEpisode] = useState<string | null>(null)
  const scenesByTopic = useScenesByTopic()
  const season = seasons.find((s) => s.id === seasonId)
  const episodes = useMemo(() => seasonEpisodes(seasonId, topics), [seasonId, topics])
  const [tab, setTab] = useState<Tab>('map')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    localStorage.setItem(SEASON_KEY, JSON.stringify(seasonId))
  }, [seasonId])

  const activeId = params.get('ep')
  const active = episodes.find((t) => t.topic_id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id) p.set('ep', id)
      else p.delete('ep')
      return p
    })

  const stageCounts = useMemo(() => {
    const m = new Map<Stage, number>()
    for (const t of episodes) {
      const st = topicStage(t, scenesByTopic.get(t.topic_id))
      m.set(st, (m.get(st) ?? 0) + 1)
    }
    return m
  }, [episodes, scenesByTopic])

  const addEpisode = async () => {
    const n = Math.max(0, ...episodes.map((t) => t.backlog ?? 0)) + 1
    const t = await createTopic({ season_id: seasonId, backlog: n })
    if (t) open(t.topic_id)
  }

  if (!loading && !season) return <EmptyState icon={<Library />} title="Сезон не найден" description={seasonId} />
  if (!season) return null

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <Select
            className="w-64"
            value={seasonId}
            options={seasons.map((s) => ({ value: s.id, label: seasonTitle(s) }))}
            onChange={(e) => navigate(`/seasons/${e.target.value}`)}
            aria-label="Сезон"
          />
          <Button variant="ghost" onClick={async () => { const s = await createSeason(); if (s) navigate(`/seasons/${s.id}`) }}>
            <Plus /> Сезон
          </Button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span>
              Серий <b className="text-fg">{episodes.length}</b>
            </span>
            {(Object.keys(STAGES) as Stage[]).map((st) =>
              stageCounts.get(st) ? (
                <Badge key={st} color={STAGES[st].color}>
                  {STAGES[st].label} {stageCounts.get(st)}
                </Badge>
              ) : null,
            )}
          </div>
          <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить сезон" aria-label="Удалить сезон" onClick={() => (episodes.length ? toast.error('В сезоне есть серии', { description: 'Сначала перенесите их в другой сезон или удалите.' }) : setConfirmDelete(true))}>
            <Trash2 />
          </Button>
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'map', label: <><LayoutGrid className="size-3.5" /> Карта</> },
            { value: 'bible', label: <><BookOpen className="size-3.5" /> Библия{!season.bible?.trim() && <span className="size-1.5 rounded-full bg-gold" title="Библия не заполнена" />}</> },
          ]}
        />

        {tab === 'map' ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {(season.logline || season.theme) && (
              <div className="mb-4 max-w-3xl space-y-1 text-sm">
                {season.logline && <p className="text-fg-2">{season.logline}</p>}
                {season.theme && <p className="text-fg-3 italic">{season.theme}</p>}
              </div>
            )}
            <div className="flex items-start gap-3">
              {episodes.map((t) => (
                <EpisodeColumn key={t.topic_id} topic={t} stage={topicStage(t, scenesByTopic.get(t.topic_id))} active={t.topic_id === activeId} onOpen={() => open(t.topic_id === activeId ? null : t.topic_id)} />
              ))}
              <button
                onClick={addEpisode}
                className="flex h-24 w-64 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-fg-3 hover:border-accent hover:text-fg"
              >
                <Plus className="size-4" /> Серия
              </button>
            </div>
          </div>
        ) : (
          <SeasonBible season={season} />
        )}
      </div>

      <TopicCard topic={active ?? null} onClose={() => open(null)} onDelete={(id) => setConfirmEpisode(id)} />
      <ConfirmDialog
        open={!!confirmEpisode}
        onOpenChange={(o) => !o && setConfirmEpisode(null)}
        title="Удалить серию?"
        description="Удалится ролик вместе с его шотами. Это нельзя отменить."
        onConfirm={async () => {
          const id = confirmEpisode
          setConfirmEpisode(null)
          if (id && (await deleteTopics([id]))) open(null)
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить сезон?"
        description="Сезон без серий. Папку сезона на диске админка не трогает."
        onConfirm={async () => {
          await deleteSeasons([seasonId])
          localStorage.removeItem(SEASON_KEY)
          navigate('/seasons')
        }}
      />
    </div>
  )
}

function EpisodeColumn({ topic, stage, active, onOpen }: { topic: Topic; stage: Stage; active: boolean; onOpen: () => void }) {
  const beats = (topic.beats ?? []).filter((b) => b.trim())
  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-fg-3',
        active && 'border-accent ring-1 ring-accent',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="font-mono text-lg leading-6 font-semibold text-fg-3">{ep(topic.backlog)}</span>
        <span className="min-w-0 flex-1 text-sm leading-6 font-medium">{topicTitle(topic)}</span>
      </div>
      <Badge color={STAGES[stage].color} className="self-start">
        {STAGES[stage].label}
      </Badge>
      {topic.logline ? <p className="text-xs text-fg-2">{topic.logline}</p> : <p className="text-xs text-fg-3 italic">нет логлайна</p>}
      {beats.length > 0 && (
        <ol className="list-decimal space-y-1 pl-4 text-xs text-fg-2 marker:text-fg-3">
          {beats.map((b, i) => (
            <li key={i}>
              {/* связи «(→10)» подсвечиваем */}
              {b.split(/(\(→[^)]*\))/).map((part, j) => (part.startsWith('(→') ? <span key={j} className="text-accent-hover">{part}</span> : part))}
            </li>
          ))}
        </ol>
      )}
    </button>
  )
}

function SeasonBible({ season }: { season: Season }) {
  const { updateSeason } = useData()
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(season, 'id', (patch) => updateSeason(season.id, patch))
  if (!draft) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-4xl">
          <FieldGroups groups={SEASON_GROUPS} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
        </div>
      </div>
      {dirty && (
        <div className="flex gap-2 border-t border-border px-4 py-2.5">
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'} <Kbd>⌘S</Kbd>
          </Button>
          <Button variant="ghost" onClick={reset}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  )
}
