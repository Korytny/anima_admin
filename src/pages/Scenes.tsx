import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Clapperboard, Eye, Film, Plus, Search, Theater, Trash2, X } from 'lucide-react'
import type { Scene } from '@/types'
import { shortId, topicPreview, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { SCENE_STATUS, TOPIC_STATUS, statusMeta, statusOptions } from '@/lib/status'
import { fmtDuration, storageGet, timeAgo, useHotkey } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  EmptyState,
  Input,
  MultiSelectFilter,
  Select,
  StatusBadge,
  Thumb,
} from '@/components/ui'
import { SceneCard } from './SceneCard'

const LAST_KEY = 'scenes:lastTopic'

export function ScenesPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_KEY, null)
    return last ? <Navigate to={`/scenes/${last}`} replace /> : <NoTopic />
  }
  return <TopicScenes key={topicId} topicId={topicId} />
}

function TopicSelect({ value, className }: { value: string; className?: string }) {
  const navigate = useNavigate()
  const { topics } = useData()
  const byTopic = useScenesByTopic()
  // ролики со сценами — наверх
  const options = useMemo(
    () =>
      [...topics]
        .sort((a, b) => (byTopic.get(b.topic_id)?.length ?? 0) - (byTopic.get(a.topic_id)?.length ?? 0))
        .map((t) => ({ value: t.topic_id, label: `${topicTitle(t)} · ${byTopic.get(t.topic_id)?.length ?? 0} сц.` })),
    [topics, byTopic],
  )
  return (
    <Select
      className={className}
      aria-label="Выбрать ролик"
      value={value}
      placeholder={value ? undefined : 'Выбрать ролик…'}
      onChange={(e) => e.target.value && navigate(`/scenes/${e.target.value}`)}
      options={options}
    />
  )
}

function NoTopic() {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={<Theater />}
      title="Выберите ролик"
      description="Сцены показываются для одного ролика. Выберите его в контент-плане или в списке ниже."
      action={
        <div className="flex items-center gap-2">
          <TopicSelect value="" className="w-72" />
          <Button variant="primary" onClick={() => navigate('/topics')}>
            <Clapperboard /> В контент-план
          </Button>
        </div>
      }
    />
  )
}

function TopicScenes({ topicId }: { topicId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { topics, loading, createScene, deleteScenes, updateScenes } = useData()
  const all = useScenesByTopic().get(topicId) ?? []
  const topic = topics.find((t) => t.topic_id === topicId)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const [character, setCharacter] = useState('')

  useEffect(() => {
    localStorage.setItem(LAST_KEY, JSON.stringify(topicId))
  }, [topicId])

  const characters = useMemo(() => [...new Set(all.map((s) => s.speaking_character).filter((c): c is string => !!c))], [all])
  const filtersActive = !!(q || statuses.length || character)
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return all.filter(
      (s) =>
        (!statuses.length || statuses.includes(s.status ?? '')) &&
        (!character || s.speaking_character === character) &&
        (!ql || [s.dialogue_text, s.action, s.location_desc, s.visual_prompt, s.speaking_character].join(' ').toLowerCase().includes(ql)),
    )
  }, [all, q, statuses, character])

  const activeId = params.get('scene')
  const active = all.find((s) => s.scene_id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id == null) p.delete('scene')
      else p.set('scene', id)
      return p
    })
  const selectedIds = Object.keys(selection)

  const add = async () => {
    const s = await createScene(topicId)
    if (s) open(s.scene_id)
  }
  useHotkey('n', (e) => {
    e.preventDefault()
    void add()
  })

  const columns = useMemo<ColumnDef<Scene, any>[]>(
    () => [
      {
        id: 'num',
        accessorFn: (s) => (s.scena ?? 0) * 1000 + (s.shot_num ?? 0),
        header: 'Сц.шот',
        size: 76,
        meta: { label: 'Сцена.шот' },
        cell: ({ row }) => (
          <span className="inline-flex h-5 items-center rounded bg-raised px-1.5 font-mono text-xs text-fg-2">
            {row.original.scena ?? '—'}.{row.original.shot_num ?? '—'}
          </span>
        ),
      },
      {
        id: 'preview',
        header: 'Превью',
        size: 76,
        enableSorting: false,
        meta: { label: 'Превью' },
        cell: ({ row }) => <Thumb src={row.original.char_img_url?.[0] || row.original.base_image_url || undefined} className="h-7 w-12" />,
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        size: 120,
        meta: { label: 'Статус' },
        cell: ({ getValue }) => <StatusBadge meta={statusMeta(SCENE_STATUS, getValue())} />,
      },
      {
        accessorKey: 'speaking_character',
        header: 'Персонаж',
        size: 160,
        meta: { label: 'Персонаж' },
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="flex items-center gap-2">
              <Avatar name={getValue()} size={20} />
              <span className="truncate">{getValue()}</span>
            </span>
          ) : (
            <span className="text-fg-3">—</span>
          ),
      },
      {
        accessorKey: 'dialogue_text',
        header: 'Диалог',
        size: 300,
        meta: { label: 'Диалог' },
        cell: ({ getValue }) => <span className="text-fg-2" title={getValue() ?? ''}>{getValue() || <span className="text-fg-3">—</span>}</span>,
      },
      { accessorKey: 'action', header: 'Действие', size: 220, meta: { label: 'Действие' }, cell: ({ getValue }) => <span className="text-fg-2" title={getValue() ?? ''}>{getValue() || '—'}</span> },
      { accessorKey: 'shot_type', header: 'Шот', size: 110, meta: { label: 'Тип шота' }, cell: ({ getValue }) => (getValue() ? <Badge>{getValue()}</Badge> : '—') },
      { accessorKey: 'location_desc', header: 'Локация', size: 170, meta: { label: 'Локация' }, cell: ({ getValue }) => <span className="text-fg-2">{getValue() || '—'}</span> },
      {
        id: 'time',
        accessorFn: (s) => s.time ?? -1,
        header: 'Время',
        size: 110,
        meta: { label: 'Время' },
        cell: ({ row }) => (
          <span className="text-fg-2">
            {row.original.time != null && <span className="font-mono text-xs">{row.original.time}</span>} {row.original.daytime}
          </span>
        ),
      },
      {
        accessorKey: 'audio_duration',
        header: 'Аудио',
        size: 72,
        meta: { label: 'Длительность аудио' },
        cell: ({ getValue }) => <span className="font-mono text-xs text-fg-2">{fmtDuration(getValue())}</span>,
      },
      { accessorKey: 'music', header: 'Музыка', size: 140, meta: { label: 'Музыка' }, cell: ({ getValue }) => (getValue() ? <Badge color="#A78BFA">{getValue()}</Badge> : '—') },
      {
        id: 'video',
        accessorFn: (s) => (s.video_file ? 1 : 0),
        header: 'Видео',
        size: 64,
        meta: { label: 'Видео' },
        cell: ({ row }) => (row.original.video_file ? <Film className="size-4 text-success" aria-label="Есть видео" /> : <span className="text-fg-3">—</span>),
      },
      { accessorKey: 'order', header: 'order', size: 90, meta: { label: 'order' }, cell: ({ getValue }) => <span className="font-mono text-xs text-fg-3">{getValue() ?? '—'}</span> },
      { accessorKey: 'updated_at', header: 'Изменено', size: 120, meta: { label: 'Изменено' }, cell: ({ getValue }) => <span className="text-fg-2">{timeAgo(getValue())}</span> },
      {
        id: 'actions',
        header: '',
        size: 76,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" aria-label="Открыть" title="Открыть" onClick={() => open(row.original.scene_id)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label="Удалить" title="Удалить" onClick={() => setConfirm([row.original.scene_id])}>
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    // open/setConfirm стабильны по смыслу
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  if (!loading && !topic) {
    return (
      <EmptyState
        icon={<Theater />}
        title="Ролик не найден"
        description={topicId}
        action={
          <Button
            onClick={() => {
              localStorage.removeItem(LAST_KEY)
              navigate('/scenes')
            }}
          >
            Выбрать другой
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Контекстная панель ролика */}
        {topic && (
          <div className="flex flex-wrap items-center gap-4 border-b border-border bg-raised px-4 py-3">
            <Thumb src={topicPreview(all)} className="h-14 w-24 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-fg-3">{shortId(topic.topic_id)}</span>
                <StatusBadge meta={statusMeta(TOPIC_STATUS, topic.status)} />
              </div>
              <div className="mt-0.5 truncate text-base font-semibold">{topicTitle(topic)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-[11px] text-fg-3">Сцен</div>
                <div className="font-semibold">{all.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-fg-3">С видео</div>
                <div className="font-semibold">{all.filter((s) => s.video_file).length}</div>
              </div>
              <TopicSelect value={topicId} className="w-64" />
              <Button onClick={() => navigate(`/topics/${topicId}`)}>
                <Clapperboard /> Карточка ролика
              </Button>
            </div>
          </div>
        )}

        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(s) => s.scene_id}
          storageKey="scenes"
          defaultHidden={{ music: false, order: false, action: false, updated_at: false }}
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={activeId}
          onRowClick={(s) => open(s.scene_id === activeId ? null : s.scene_id)}
          loading={loading}
          toolbar={
            <>
              <Button variant="primary" onClick={add} title="Добавить сцену (N)">
                <Plus /> Добавить сцену
              </Button>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Диалог, действие, промпт…" className="w-[clamp(160px,18vw,260px)] pl-8" />
              </div>
              <MultiSelectFilter
                label="Статус"
                options={statusOptions(SCENE_STATUS, all.map((s) => s.status))}
                value={statuses}
                onChange={setStatuses}
                renderOption={(o) => <StatusBadge meta={statusMeta(SCENE_STATUS, o.value)} />}
              />
              <Select className="w-40" value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Все персонажи" options={characters.map((c) => ({ value: c, label: c }))} />
              {filtersActive && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQ('')
                    setStatuses([])
                    setCharacter('')
                  }}
                >
                  <X /> Сбросить
                </Button>
              )}
            </>
          }
          toolbarRight={
            <>
              {selectedIds.length > 0 && (
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button variant="outline">Статус ({selectedIds.length})</Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    {Object.keys(SCENE_STATUS).map((s) => (
                      <DropdownItem key={s} onSelect={() => updateScenes(selectedIds, { status: s })}>
                        <StatusBadge meta={SCENE_STATUS[s]} />
                        <span className="ml-auto font-mono text-[11px] text-fg-3">{s}</span>
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </DropdownMenu>
              )}
              <Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirm(selectedIds)}>
                <Trash2 /> Удалить{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<Theater />}
              title={filtersActive ? 'Ничего не найдено' : 'У ролика пока нет сцен'}
              action={
                !filtersActive && (
                  <Button variant="primary" onClick={add}>
                    <Plus /> Добавить сцену
                  </Button>
                )
              }
            />
          }
        />
      </div>

      <SceneCard scene={active} siblings={all} onClose={() => open(null)} onDelete={(id) => setConfirm([id])} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? 'Удалить сцену?' : `Удалить сцен: ${confirm?.length}?`}
        description="Сцена будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          const ids = confirm ?? []
          await deleteScenes(ids)
          setSelection({})
          if (activeId && ids.includes(activeId)) open(null)
        }}
      />
    </div>
  )
}
