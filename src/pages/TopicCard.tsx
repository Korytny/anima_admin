// Карточка ролика (серии) — одна на «Контент-план» и «Сезоны». Поля настраиваются как у сцены (useCardLayout):
// группы из кода — по умолчанию, остальные колонки topics — в «Остальном», любое поле переносится кнопкой.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, LayoutGrid, ListVideo, Loader2, Rows3, ScrollText, Sparkles, Theater, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Character, Season, Topic } from '@/types'
import { characterImages, scenePreview, seasonCharacters, seasonTitle, topicPreview, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { TOPIC_STATUS, statusMeta, statusOptions } from '@/lib/status'
import { SceneStageBadge } from '@/components/SceneStageBadge'
import { useDraft } from '@/lib/useDraft'
import { useCardLayout } from '@/lib/useCardLayout'
import { cn, copyText, fmtBytes, fmtDateTime, fmtDuration, timeAgo } from '@/lib/utils'
import { mediaUrl } from '@/lib/media'
import { promptsPipelineConfigured, requestEpisodePrompts, requestEpisodeScenes, requestEpisodeScript, requestEpisodeShots, scenesPipelineConfigured, scriptPipelineConfigured, shotsPipelineConfigured } from '@/api/pipeline'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button, ConfirmDialog, Kbd, StatusBadge, Tabs, Thumb } from '@/components/ui'
import { AGENT_STEPS, activeStepAgent, type AgentStep } from '@/lib/agentSteps'

const ep = (n: number | null) => (n == null ? null : String(n).padStart(2, '0'))

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

/** Группы по умолчанию. Всё, что сюда не вошло, useCardLayout кладёт в «Остальное». */
function groups(seasons: Season[], status: string | null, pool: Character[]): GroupDef<Topic>[] {
  return [
    {
      title: 'Серия',
      fields: [
        { key: 'title', type: 'textarea', rows: 2, required: true },
        { key: 'season_id', label: 'сезон — сменить, чтобы перенести серию', type: 'select', required: true, options: seasons.map((s) => ({ value: s.id, label: seasonTitle(s) })) },
        { key: 'backlog', label: 'номер серии', type: 'number', mono: true },
        { key: 'duration', label: 'длительность, сек', type: 'number', mono: true },
        { key: 'status', type: 'select', options: statusOptions(TOPIC_STATUS, [status]).map((o) => ({ ...o, label: `${o.label} (${o.value})` })) },
        { key: 'logline', label: 'логлайн: кто чего хочет, что мешает, чем платит', type: 'textarea', rows: 3 },
        { key: 'chars', label: 'персонажи серии — выберите из библиотеки сезона', type: 'list', rows: 3, mono: true, extra: (v, set) => <CastPicker value={v} onChange={set} pool={pool} /> },
      ],
    },
    { title: 'Биты', fields: [{ key: 'beats', label: 'по одному на строку, связи: «проклятие (→10)»', type: 'list', rows: 10 }] },
    {
      title: 'Первоисточник',
      defaultOpen: false,
      fields: [{ key: 'source_excerpt', label: 'выжимка глав: события, детали, каноничные реплики', type: 'textarea', rows: 14 }],
    },
    {
      title: 'Сценарий',
      defaultOpen: false,
      fields: [
        { key: 'script_scenas', label: 'script_scenas — сценарий', type: 'textarea', rows: 10 },
        { key: 'script_shots', label: 'script_shots — шоты', type: 'textarea', rows: 10, mono: true },
      ],
    },
    {
      title: 'Медиа',
      defaultOpen: false,
      fields: [
        { key: 'url', type: 'url', mono: true },
        { key: 'url_final', type: 'url', mono: true },
        { key: 'size', type: 'readonly', render: (v) => fmtBytes(v as number | null) },
        { key: 'file_tiktok', type: 'url', mono: true },
        { key: 'file_tiktok_size', type: 'readonly', render: (v) => fmtBytes(v as number | null) },
      ],
    },
    {
      title: 'Системное',
      defaultOpen: false,
      fields: [
        { key: 'topic_id', type: 'readonly' },
        { key: 'folder', label: 'folder — папка на диске', mono: true },
        { key: 'updated_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
      ],
    },
  ]
}

type Tab = 'details' | 'scenes'

export function TopicCard({ topic, onClose, onDelete }: { topic: Topic | null; onClose: () => void; onDelete: (id: string) => void }) {
  return (
    <SidePanel
      open={!!topic}
      onClose={onClose}
      panelKey={topic?.topic_id}
      header={
        topic && (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button className="font-mono text-xs text-fg-3 hover:text-accent-hover" onClick={() => copyText(topic.topic_id)} title="Скопировать ID">
                {topic.topic_id.slice(0, 8)}
              </button>
              <StatusBadge meta={statusMeta(TOPIC_STATUS, topic.status)} />
            </div>
            <h2 className="mt-1 line-clamp-2 text-base font-semibold">
              {ep(topic.backlog) && <span className="mr-1.5 font-mono text-fg-3">{ep(topic.backlog)}</span>}
              {topicTitle(topic)}
            </h2>
          </div>
        )
      }
    >
      {topic && <Body key={topic.topic_id} topic={topic} onDelete={onDelete} />}
    </SidePanel>
  )
}

/** Кнопка запуска шага в n8n. У шага с агентом (step) — активный агент шага («Настройки → Агенты»), в вебхук уходит его id.
 *  При готовом результате — подтверждение перезаписи (confirmText — свой текст). */
function StepButton({ id, step, label, field, configured, envName, blocked, done, confirmText, icon: Icon = Wand2, request }: {
  id: string
  step?: AgentStep
  label: string
  field: string
  configured: boolean
  envName: string
  blocked: string | null
  done: boolean
  confirmText?: string
  icon?: typeof Wand2
  request: (id: string, agentId: number | null) => Promise<void>
}) {
  const { agents } = useData()
  const agent = step ? activeStepAgent(agents, step) : null
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const send = async () => {
    setSending(true)
    try {
      await request(id, agent?.id ?? null)
      toast.success('Отправлено в n8n', { description: `${label}${agent ? ` (${agent.name ?? `#${agent.id}`})` : ''}: результат появится, когда n8n запишет его в ${field}.` })
    } catch (e) {
      toast.error('Не удалось запустить', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }
  const stepLabel = step ? (AGENT_STEPS.find((x) => x.value === step)?.label ?? step) : ''
  const why = !configured ? `Не задан ${envName}` : step && !agent ? `Нет активного агента шага «${stepLabel}» — включите его в «Настройки → Агенты»` : blocked
  const title = why ?? `${done ? 'Перезапустить' : 'Запустить'}: ${label}${agent ? ` — ${agent.name ?? `агент #${agent.id}`}` : ''}`
  return (
    <>
      <Button variant="outline" disabled={!!why || sending} title={title} onClick={() => (done ? setConfirm(true) : void send())}>
        {sending ? <Loader2 className="animate-spin" /> : <Icon />} {label}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Перезапустить: ${label.toLowerCase()}?`}
        description={confirmText ?? `n8n перезапишет текущий результат (${field}). Агент: ${agent?.name ?? '—'}.`}
        confirmLabel="Перезапустить"
        onConfirm={send}
      />
    </>
  )
}

function Body({ topic, onDelete }: { topic: Topic; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const { updateTopic, seasons, characters } = useData()
  const scenes = useScenesByTopic().get(topic.topic_id) ?? []
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(topic, 'topic_id', (patch) => updateTopic(topic.topic_id, patch))
  const [tab, setTab] = useState<Tab>('details')
  const pool = useMemo(() => seasonCharacters(topic.season_id, characters), [topic.season_id, characters])
  const codeGroups = useMemo(() => groups(seasons, topic.status, pool), [seasons, topic.status, pool])
  const layout = useCardLayout('card:topic', codeGroups, draft)
  const video = topic.url_final || topic.file_tiktok
  const preview = topicPreview(scenes)

  if (!draft) return null
  const id = topic.topic_id
  const hasScript = !!topic.script_scenas?.trim()
  const links = [
    { to: `/script/${id}`, label: 'Сценарий', icon: ScrollText },
    { to: `/script/${id}?view=shots`, label: 'Шоты', icon: ListVideo },
    { to: `/scenes/${id}`, label: 'Сцены', icon: Theater },
    { to: `/storyboard/${id}`, label: 'Раскадровка', icon: LayoutGrid },
  ]

  return (
    <>
      <PanelScroll>
        {(video || preview) && (
          <div className="px-4 pt-4">{video ? <VideoPlayer src={video} poster={preview} /> : <Thumb src={preview} className="aspect-video w-full rounded-lg" />}</div>
        )}
        <div className="space-y-2 px-4 pt-3 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {links.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-fg-2 hover:bg-hover hover:text-fg">
                <Icon className="size-3.5" /> {label}
              </Link>
            ))}
          </div>
          <dl className="grid grid-cols-3 gap-2 pt-1">
            {[
              ['Длительность', fmtDuration(topic.duration)],
              ['Шотов', String(scenes.length)],
              ['Обновлён', timeAgo(topic.updated_at)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-bg px-2.5 py-1.5">
                <dt className="text-[11px] text-fg-3">{k}</dt>
                <dd className="truncate text-[13px] font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {(topic.url || topic.url_final) && (
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              {topic.url && (
                <a href={topic.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-3 hover:text-accent-hover">
                  <ExternalLink className="size-3" /> url
                </a>
              )}
              {topic.url_final && (
                <a href={mediaUrl(topic.url_final)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-3 hover:text-accent-hover">
                  <ExternalLink className="size-3" /> url_final
                </a>
              )}
            </div>
          )}
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          className="sticky top-0 z-10 bg-surface"
          tabs={[
            { value: 'details', label: <>Детали{dirty && <span className="size-1.5 rounded-full bg-gold" />}</> },
            { value: 'scenes', label: `Шоты · ${scenes.length}` },
          ]}
        />

        {tab === 'details' && (
          <>
            <FieldGroups groups={layout.groups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} fieldAction={layout.fieldAction} />
            {layout.customized && (
              <div className="border-t border-border px-4 py-2 text-right">
                <button className="text-xs text-fg-3 hover:text-accent-hover" onClick={layout.reset}>
                  Вернуть раскладку полей по умолчанию
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'scenes' && (
          <div className="p-2">
            {scenes.length === 0 && <div className="p-6 text-center text-fg-3">Шотов пока нет</div>}
            {scenes.map((s) => (
              <button
                key={s.scene_id}
                onClick={() => navigate(`/scenes/${topic.topic_id}?scene=${s.scene_id}`)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="w-10 shrink-0 text-center font-mono text-xs text-fg-3">
                  {s.scena ?? '—'}.{s.shot_num ?? '—'}
                </span>
                <Thumb src={scenePreview(s)} className="h-8 w-14 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{s.dialogue_text || s.action || '—'}</span>
                <SceneStageBadge scene={s} topic={topic} />
              </button>
            ))}
          </div>
        )}
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
            <span className="ml-auto text-xs text-gold">Изменено полей: {dirtyKeys.size}</span>
          </>
        ) : (
          <>
            <StepButton
              id={id}
              step="script"
              label="Сценарий"
              field="script_scenas"
              configured={scriptPipelineConfigured}
              envName="VITE_N8N_SCRIPT_WEBHOOK"
              blocked={null}
              done={hasScript}
              request={requestEpisodeScript}
            />
            <StepButton
              id={id}
              step="shots"
              label="Шоты"
              field="script_shots"
              configured={shotsPipelineConfigured}
              envName="VITE_N8N_SHOTS_WEBHOOK"
              blocked={hasScript ? null : 'Сначала нужен сценарий'}
              done={!!topic.script_shots?.trim()}
              request={requestEpisodeShots}
            />
            <StepButton
              id={id}
              label="В сцены"
              field="scenes"
              icon={Rows3}
              configured={scenesPipelineConfigured}
              envName="VITE_N8N_SCENES_WEBHOOK"
              blocked={topic.script_shots?.trim() ? null : 'Сначала нужны шоты'}
              done={scenes.length > 0}
              confirmText={`У серии уже ${scenes.length} шот(ов) в таблице сцен, из них с кадром — ${scenes.filter((x) => x.base_image_url).length}, с видео — ${scenes.filter((x) => x.video_file).length}. n8n разложит шоты заново: существующие строки могут быть перезаписаны.`}
              request={(tid) => requestEpisodeScenes(tid)}
            />
            <StepButton
              id={id}
              step="frames"
              label="Промпты"
              field="scenes.visual_prompt"
              icon={Sparkles}
              configured={promptsPipelineConfigured}
              envName="VITE_N8N_PROMPTS_WEBHOOK"
              blocked={scenes.length ? null : 'Сначала разложите шоты в сцены'}
              done={scenes.some((x) => x.visual_prompt?.trim())}
              confirmText={`Промпты уже есть у ${scenes.filter((x) => x.visual_prompt?.trim()).length} из ${scenes.length} шотов — Постановщик перепишет авто-промпты (visual_prompt). Ручные правки в manual_prompt не трогаются.`}
              request={requestEpisodePrompts}
            />
            <Button variant="ghost" size="icon" title="Скопировать ссылку" aria-label="Скопировать ссылку" onClick={() => copyText(location.href)}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить" aria-label="Удалить" onClick={() => onDelete(topic.topic_id)}>
              <Trash2 />
            </Button>
          </>
        )}
      </PanelFooter>
    </>
  )
}
