import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, Theater, Trash2 } from 'lucide-react'
import type { Season, Topic } from '@/types'
import { scenePreview, seasonTitle, topicPreview, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { SCENE_STATUS, TOPIC_STATUS, statusMeta, statusOptions } from '@/lib/status'
import { useDraft } from '@/lib/useDraft'
import { copyText, fmtBytes, fmtDateTime, fmtDuration, timeAgo } from '@/lib/utils'
import { mediaUrl } from '@/lib/media'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button, Kbd, StatusBadge, Tabs, Thumb } from '@/components/ui'

/** Основные поля — сразу под медиа, без группы. */
function mainGroup(status: string | null): GroupDef<Topic> {
  return {
    title: 'Основные',
    flat: true,
    fields: [
      { key: 'title', type: 'textarea', rows: 2, required: true },
      { key: 'status', type: 'select', options: statusOptions(TOPIC_STATUS, [status]).map((o) => ({ ...o, label: `${o.label} (${o.value})` })) },
      { key: 'backlog', type: 'number', mono: true },
      { key: 'duration', label: 'duration, сек', type: 'number', mono: true },
      { key: 'visual_style' },
    ],
  }
}

function groups(seasons: Season[]): GroupDef<Topic>[] {
  return [
    {
      title: 'Контент',
      defaultOpen: false,
      fields: [
        { key: 'season_id', label: 'сезон', type: 'select', options: [{ value: '', label: '— без сезона —' }, ...seasons.map((s) => ({ value: s.id, label: seasonTitle(s) }))] },
        { key: 'logline', label: 'логлайн', type: 'textarea', rows: 3 },
        { key: 'beats', label: 'биты', type: 'list', rows: 8 },
        { key: 'script_scenas', label: 'script_scenas — сценарий', type: 'textarea', rows: 8 },
        { key: 'script_shots', label: 'script_shots — шоты', type: 'textarea', rows: 8, mono: true },
      ],
    },
    {
      title: 'Персонажи',
      fields: [{ key: 'chars', type: 'list', rows: 3 }],
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
            <h2 className="mt-1 line-clamp-2 text-base font-semibold">{topicTitle(topic)}</h2>
          </div>
        )
      }
    >
      {topic && <Body key={topic.topic_id} topic={topic} onDelete={onDelete} />}
    </SidePanel>
  )
}

function Body({ topic, onDelete }: { topic: Topic; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const { updateTopic, seasons } = useData()
  const scenes = useScenesByTopic().get(topic.topic_id) ?? []
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(topic, 'topic_id', (patch) => updateTopic(topic.topic_id, patch))
  const [tab, setTab] = useState<Tab>('details')
  const fieldGroups = useMemo(() => groups(seasons), [seasons])
  const main = useMemo(() => [mainGroup(topic.status)], [topic.status])
  const video = topic.url_final || topic.file_tiktok
  const preview = topicPreview(scenes)

  if (!draft) return null

  return (
    <>
      <PanelScroll>
        {(video || preview) && (
          <div className="px-4 pt-4">{video ? <VideoPlayer src={video} poster={preview} /> : <Thumb src={preview} className="aspect-video w-full rounded-lg" />}</div>
        )}
        <FieldGroups groups={main} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
        <div className="space-y-2 px-4 pb-4">
          <dl className="grid grid-cols-3 gap-2 pt-1">
            {[
              ['Длительность', fmtDuration(topic.duration)],
              ['Сцен', String(scenes.length)],
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
            { value: 'scenes', label: `Сцены · ${scenes.length}` },
          ]}
        />

        {tab === 'details' && <FieldGroups groups={fieldGroups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />}

        {tab === 'scenes' && (
          <div className="p-2">
            {scenes.length === 0 && <div className="p-6 text-center text-fg-3">Сцен пока нет</div>}
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{s.speaking_character || '—'}</span>
                  <span className="block truncate text-xs text-fg-3">{s.dialogue_text || s.action}</span>
                </span>
                <StatusBadge meta={statusMeta(SCENE_STATUS, s.status)} />
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
            <Button onClick={() => navigate(`/scenes/${topic.topic_id}`)}>
              <Theater /> Открыть сцены
            </Button>
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
