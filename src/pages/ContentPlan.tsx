import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Clapperboard, Download, Eye, Film, Music, Plus, Search, Theater, Trash2, X } from 'lucide-react'
import type { Topic } from '@/types'
import { shortId, topicPreview, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { TOPIC_STATUS, statusMeta, statusOptions } from '@/lib/status'
import { copyText, downloadCsv, fmtBytes, fmtDateTime, fmtDuration, timeAgo, useHotkey, usePersistentState } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import {
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
import { TopicCard } from './TopicCard'

interface Filters {
  q: string
  status: string[]
  video: '' | 'yes' | 'no'
}
const NO_FILTERS: Filters = { q: '', status: [], video: '' }
const NO_STATUS = '__none__'

export function ContentPlanPage() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const { topics, loading, error, createTopic, deleteTopics, updateTopics } = useData()
  const byTopic = useScenesByTopic()
  const [filters, setFilters] = usePersistentState<Filters>('topics:filters', NO_FILTERS)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<string[] | null>(null)

  const active = topics.find((t) => t.topic_id === topicId) ?? null
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  const statusOpts = useMemo(
    () => [...statusOptions(TOPIC_STATUS, topics.map((t) => t.status)), { value: NO_STATUS, label: 'Без статуса' }],
    [topics],
  )

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return topics.filter((t) => {
      if (filters.status.length && !filters.status.includes(t.status || NO_STATUS)) return false
      if (filters.video === 'yes' && !t.url_final) return false
      if (filters.video === 'no' && t.url_final) return false
      if (q) {
        const hay = [t.topic_id, t.title, t.extended_description, t.music, t.visual_style, ...(t.chars ?? [])].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [topics, filters])

  const selectedIds = Object.keys(selection)

  const create = async () => {
    const t = await createTopic()
    if (t) navigate(`/topics/${t.topic_id}`)
  }
  useHotkey('n', (e) => {
    e.preventDefault()
    void create()
  })

  const columns = useMemo<ColumnDef<Topic, any>[]>(
    () => [
      {
        accessorKey: 'topic_id',
        header: 'ID',
        size: 92,
        enableSorting: false,
        meta: { label: 'ID' },
        cell: ({ getValue }) => (
          <button
            className="font-mono text-xs text-fg-2 hover:text-accent-hover"
            title={`${getValue()} — скопировать`}
            onClick={(e) => {
              e.stopPropagation()
              void copyText(getValue())
            }}
          >
            {shortId(getValue())}
          </button>
        ),
      },
      {
        id: 'preview',
        header: 'Превью',
        size: 76,
        enableSorting: false,
        meta: { label: 'Превью' },
        cell: ({ row }) => <Thumb src={topicPreview(byTopic.get(row.original.topic_id))} className="h-7 w-12" />,
      },
      {
        accessorKey: 'title',
        header: 'Название',
        size: 280,
        meta: { label: 'Название' },
        cell: ({ row }) => (
          <span className="font-medium" title={row.original.extended_description ?? undefined}>
            {topicTitle(row.original)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        size: 140,
        meta: { label: 'Статус' },
        cell: ({ getValue }) => <StatusBadge meta={statusMeta(TOPIC_STATUS, getValue())} />,
      },
      {
        id: 'scenes',
        accessorFn: (t) => byTopic.get(t.topic_id)?.length ?? 0,
        header: 'Сцен',
        size: 72,
        meta: { label: 'Сцен' },
        cell: ({ getValue }) => <span className={getValue() ? 'font-mono text-xs' : 'text-fg-3'}>{getValue() || '—'}</span>,
      },
      {
        accessorKey: 'duration',
        header: 'Длит.',
        size: 76,
        meta: { label: 'Длительность' },
        cell: ({ getValue }) => <span className="font-mono text-xs text-fg-2">{fmtDuration(getValue())}</span>,
      },
      {
        id: 'video',
        accessorFn: (t) => (t.url_final ? 1 : 0),
        header: 'Видео',
        size: 72,
        meta: { label: 'Финальное видео' },
        cell: ({ row }) => (row.original.url_final ? <Film className="size-4 text-success" aria-label="Есть финальное видео" /> : <span className="text-fg-3">—</span>),
      },
      {
        accessorKey: 'music',
        header: 'Музыка',
        size: 160,
        meta: { label: 'Музыка' },
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="flex items-center gap-1.5 text-fg-2">
              <Music className="size-3.5 shrink-0 text-fg-3" />
              <span className="truncate">{getValue()}</span>
            </span>
          ) : (
            <span className="text-fg-3">—</span>
          ),
      },
      {
        accessorKey: 'chars',
        header: 'Персонажи',
        size: 200,
        enableSorting: false,
        meta: { label: 'Персонажи' },
        cell: ({ getValue }) => (
          <span className="flex gap-1 overflow-hidden">
            {((getValue() as string[] | null) ?? []).map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </span>
        ),
      },
      { accessorKey: 'visual_style', header: 'Стиль', size: 180, meta: { label: 'Визуальный стиль' }, cell: ({ getValue }) => <span className="text-fg-2">{getValue() ?? '—'}</span> },
      { accessorKey: 'backlog', header: 'Backlog', size: 84, meta: { label: 'Backlog' }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() ?? '—'}</span> },
      { accessorKey: 'size', header: 'Размер', size: 90, meta: { label: 'Размер файла' }, cell: ({ getValue }) => <span className="font-mono text-xs text-fg-2">{fmtBytes(getValue())}</span> },
      {
        accessorKey: 'updated_at',
        header: 'Изменено',
        size: 130,
        meta: { label: 'Изменено' },
        cell: ({ getValue }) => (
          <span className="text-fg-2" title={fmtDateTime(getValue())}>
            {timeAgo(getValue())}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 104,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="Открыть карточку" aria-label="Открыть карточку" onClick={() => navigate(`/topics/${row.original.topic_id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Сцены" aria-label="Сцены" onClick={() => navigate(`/scenes/${row.original.topic_id}`)}>
              <Theater />
            </Button>
            <Button variant="ghost" size="icon-sm" className="hover:text-danger" title="Удалить" aria-label="Удалить" onClick={() => setConfirm([row.original.topic_id])}>
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [byTopic, navigate],
  )

  const exportCsv = () =>
    downloadCsv(
      `topics-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((t) => ({
        topic_id: t.topic_id,
        title: t.title,
        status: t.status,
        scenes: byTopic.get(t.topic_id)?.length ?? 0,
        duration: t.duration,
        music: t.music,
        chars: t.chars,
        backlog: t.backlog,
        url_final: t.url_final,
        updated_at: t.updated_at,
      })),
    )

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(t) => t.topic_id}
          storageKey="topics"
          defaultHidden={{ visual_style: false, size: false, backlog: false }}
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={topicId ?? null}
          onRowClick={(t) => navigate(t.topic_id === topicId ? '/topics' : `/topics/${t.topic_id}`)}
          loading={loading}
          toolbar={
            <>
              <Button variant="primary" onClick={create} title="Новая запись (N)">
                <Plus /> Новая запись
              </Button>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
                <Input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Поиск по всем полям" className="w-[clamp(160px,18vw,260px)] pl-8" />
              </div>
              <MultiSelectFilter
                label="Статус"
                options={statusOpts}
                value={filters.status}
                onChange={(v) => set('status', v)}
                renderOption={(o) => (o.value === NO_STATUS ? <span className="text-fg-3">Без статуса</span> : <StatusBadge meta={statusMeta(TOPIC_STATUS, o.value)} />)}
              />
              <Select
                className="w-40"
                value={filters.video}
                onChange={(e) => set('video', e.target.value as Filters['video'])}
                placeholder="Видео: все"
                options={[
                  { value: 'yes', label: 'Есть финальное' },
                  { value: 'no', label: 'Без финального' },
                ]}
              />
              {hasFilters && (
                <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
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
                    {Object.keys(TOPIC_STATUS).map((s) => (
                      <DropdownItem key={s} onSelect={() => updateTopics(selectedIds, { status: s })}>
                        <StatusBadge meta={TOPIC_STATUS[s]} />
                        <span className="ml-auto font-mono text-[11px] text-fg-3">{s}</span>
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </DropdownMenu>
              )}
              <Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirm(selectedIds)}>
                <Trash2 /> Удалить{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
              <Button variant="outline" size="icon" onClick={exportCsv} title="Экспорт в CSV" aria-label="Экспорт в CSV">
                <Download />
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<Clapperboard />}
              title={error ? 'Ошибка загрузки' : hasFilters ? 'Ничего не найдено' : 'Нет доступных роликов'}
              description={
                error
                  ? error
                  : hasFilters
                    ? 'Попробуйте изменить или сбросить фильтры.'
                    : 'Если в БД ролики есть, а здесь пусто — у вашего пользователя нет доступа по RLS (см. supabase/policies.sql).'
              }
              action={hasFilters ? <Button onClick={() => setFilters(NO_FILTERS)}>Сбросить фильтры</Button> : undefined}
            />
          }
        />
      </div>

      <TopicCard topic={active} onClose={() => navigate('/topics')} onDelete={(id) => setConfirm([id])} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? `Удалить ролик «${topicTitle(topics.find((t) => t.topic_id === confirm[0]))}»?` : `Удалить роликов: ${confirm?.length}?`}
        description="Вместе с роликом из БД будут удалены все его сцены. Действие нельзя отменить."
        onConfirm={async () => {
          const ids = confirm ?? []
          await deleteTopics(ids)
          setSelection({})
          if (topicId && ids.includes(topicId)) navigate('/topics')
        }}
      />
    </div>
  )
}
