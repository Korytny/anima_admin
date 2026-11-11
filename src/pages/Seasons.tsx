import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, Clapperboard, Wand2, LayoutGrid, Library, Plus, ScrollText, Theater, Trash2 } from 'lucide-react'
import type { Character, Season, Topic } from '@/types'
import { SEASON_KEY, STAGES, characterImages, seasonCharacters, seasonEpisodes, seasonTitle, topicStage, topicTitle, useData, useScenesByTopic, type Stage } from '@/store/data'
import { useDraft } from '@/lib/useDraft'
import { requestEpisodeScript, scriptPipelineConfigured } from '@/api/pipeline'
import { toast } from 'sonner'
import { cn, fmtDateTime, storageGet } from '@/lib/utils'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Badge, Button, ConfirmDialog, EmptyState, Kbd, Select, Tabs, Thumb } from '@/components/ui'

// Сезон → серии (topics.season_id, номер = backlog) → биты → сценарий → шоты → кадры.
// Стадия серии вычисляется по данным (topicStage), руками не ведётся.

const SEASON_GROUPS: GroupDef<Season>[] = [
  {
    title: 'Сезон',
    fields: [
      { key: 'title', required: true },
      { key: 'logline', label: 'логлайн', type: 'textarea', rows: 3 },
      { key: 'theme', label: 'сквозной вопрос', type: 'textarea', rows: 2 },
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

/** Персонажи серии — выбор из библиотеки сезона (клик добавляет/убирает имя в topics.chars). */
function CastPicker({ value, onChange, pool }: { value: unknown; onChange: (v: unknown) => void; pool: Character[] }) {
  const chosen = new Set(((value as string[] | null) ?? []).map((n) => n.trim().toLowerCase()))
  if (!pool.length) return <p className="mt-1 text-[11px] text-fg-3">В библиотеке сезона пока нет персонажей — заведите их в разделе «Персонажи».</p>
  const toggle = (name: string) => {
    const cur = (value as string[] | null) ?? []
    const k = name.trim().toLowerCase()
    const next = chosen.has(k) ? cur.filter((n) => n.trim().toLowerCase() !== k) : [...cur, name]
    onChange(next.length ? next : null)
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {pool.map((c) => {
        const name = c.name ?? ''
        const on = chosen.has(name.trim().toLowerCase())
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(name)}
            className={cn('flex items-center gap-1 rounded-md border py-0.5 pr-2 pl-0.5 text-xs', on ? 'border-accent bg-accent/15 text-fg' : 'border-border text-fg-3 hover:text-fg')}
          >
            <Thumb src={characterImages(c)[0]} className="size-5" />
            {name || '—'}
          </button>
        )
      })}
    </div>
  )
}

const episodeGroups = (pool: Character[], seasons: Season[]): GroupDef<Topic>[] => [
  {
    title: 'Серия',
    fields: [
      { key: 'title', type: 'textarea', rows: 2, required: true },
      { key: 'season_id', label: 'сезон — сменить, чтобы перенести серию', type: 'select', required: true, options: seasons.map((s) => ({ value: s.id, label: seasonTitle(s) })) },
      { key: 'backlog', label: 'номер серии', type: 'number', mono: true },
      { key: 'logline', label: 'логлайн: кто чего хочет, что мешает, чем платит', type: 'textarea', rows: 3 },
      { key: 'chars', label: 'персонажи серии — выберите из библиотеки сезона', type: 'list', rows: 3, mono: true, extra: (v, set) => <CastPicker value={v} onChange={set} pool={pool} /> },
    ],
  },
  { title: 'Биты', fields: [{ key: 'beats', label: 'по одному на строку, связи: «проклятие (→10)»', type: 'list', rows: 10 }] },
  { title: 'Первоисточник', fields: [{ key: 'source_excerpt', label: 'выжимка глав: события, детали, каноничные реплики', type: 'textarea', rows: 14 }] },
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
  const { seasons, topics, loading, createSeason, createTopic, deleteSeasons } = useData()
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

      <SidePanel
        open={!!active}
        onClose={() => open(null)}
        panelKey={activeId ?? undefined}
        header={active && <h2 className="truncate text-base font-semibold">{`${ep(active.backlog)} · ${topicTitle(active)}`}</h2>}
      >
        {active && <EpisodeBody key={active.topic_id} topic={active} onClose={() => open(null)} />}
      </SidePanel>

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

function EpisodeBody({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const { updateTopic, characters, seasons } = useData()
  const groups = useMemo(() => episodeGroups(seasonCharacters(topic.season_id, characters), seasons), [topic.season_id, characters, seasons])
  const [confirmScript, setConfirmScript] = useState(false)
  const [sending, setSending] = useState(false)
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(topic, 'topic_id', (patch) => updateTopic(topic.topic_id, patch))
  if (!draft) return null
  const id = topic.topic_id

  const hasScript = !!topic.script_scenas?.trim()
  const sendScript = async () => {
    setSending(true)
    try {
      await requestEpisodeScript(id)
      toast.success('Отправлено в n8n', { description: 'Сценарий появится в разделе «Сценарий», когда n8n запишет его в БД.' })
    } catch (e) {
      toast.error('Не удалось запустить', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }
  const links = [
    { to: `/topics/${id}`, label: 'Ролик', icon: Clapperboard },
    { to: `/script/${id}`, label: 'Сценарий', icon: ScrollText },
    { to: `/scenes/${id}`, label: 'Сцены', icon: Theater },
    { to: `/storyboard/${id}`, label: 'Раскадровка', icon: LayoutGrid },
  ]

  return (
    <>
      <PanelScroll>
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          <Button
            variant="outline"
            disabled={!scriptPipelineConfigured || dirty || sending}
            onClick={() => (hasScript ? setConfirmScript(true) : void sendScript())}
            title={!scriptPipelineConfigured ? 'Не задан VITE_N8N_SCRIPT_WEBHOOK' : dirty ? 'Сначала сохраните — n8n берёт данные из БД' : 'n8n соберёт данные серии и запустит агента'}
          >
            <Wand2 /> {sending ? 'Отправка…' : hasScript ? 'Перегенерировать сценарий' : 'Сгенерировать сценарий'}
          </Button>
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-fg-2 hover:bg-hover hover:text-fg">
              <Icon className="size-3.5" /> {label}
            </Link>
          ))}
        </div>
        <FieldGroups groups={groups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
      </PanelScroll>
      <PanelFooter>
        {dirty ? (
          <>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'} <Kbd>⌘S</Kbd>
            </Button>
            <Button variant="ghost" onClick={reset}>
              Отмена
            </Button>
          </>
        ) : null}
      </PanelFooter>
      <ConfirmDialog
        open={confirmScript}
        onOpenChange={setConfirmScript}
        title="Перегенерировать сценарий?"
        description="n8n перезапишет текущий сценарий серии (script_scenas)."
        onConfirm={sendScript}
      />
    </>
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
