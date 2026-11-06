import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Plus, Search, Trash2, Users, X } from 'lucide-react'
import type { Character } from '@/types'
import { characterImages, characterTitle, sceneCharacters, useData, useScenesByTopic } from '@/store/data'
import { storageGet, useHotkey } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { Badge, Button, ConfirmDialog, EmptyState, Input, Thumb } from '@/components/ui'
import { CharacterCard } from './CharacterCard'

export function CharactersPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/characters/${last}`} replace />
    return (
      <EmptyState
        icon={<Users />}
        title="Выберите ролик"
        description="Персонажи показываются для одного ролика."
        action={<TopicSelect value="" base="/characters" className="w-72" />}
      />
    )
  }
  return <TopicCharacters key={topicId} topicId={topicId} />
}

function TopicCharacters({ topicId }: { topicId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { topics, characters, loading, createCharacter, deleteCharacters } = useData()
  const scenes = useScenesByTopic().get(topicId) ?? []
  const topic = topics.find((t) => t.topic_id === topicId)
  const all = useMemo(() => characters.filter((c) => c.topic === topicId).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9)), [characters, topicId])
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  // В скольких сценах ролика встречается персонаж
  const sceneCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of scenes) for (const c of sceneCharacters(s, all)) m.set(c.id, (m.get(c.id) ?? 0) + 1)
    return m
  }, [scenes, all])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ql ? all.filter((c) => [c.name, c.role_key, c.text_prompt, c.story].join(' ').toLowerCase().includes(ql)) : all
  }, [all, q])

  const activeId = params.get('character')
  const active = all.find((c) => c.id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id == null) p.delete('character')
      else p.set('character', id)
      return p
    })
  const selectedIds = Object.keys(selection)

  const add = async () => {
    const c = await createCharacter(topicId)
    if (c) open(c.id)
  }
  useHotkey('n', (e) => {
    e.preventDefault()
    void add()
  })

  const columns = useMemo<ColumnDef<Character, any>[]>(
    () => [
      {
        id: 'preview',
        header: 'Фото',
        enableSorting: false,
        size: 64,
        cell: ({ row }) => <Thumb src={characterImages(row.original)[0]} className="h-8 w-8" />,
      },
      { accessorKey: 'name', header: 'Имя', size: 180, cell: ({ row }) => <span className="font-medium">{characterTitle(row.original)}</span> },
      { accessorKey: 'number', header: '№', size: 50, cell: ({ getValue }) => <span className="font-mono text-fg-2">{getValue() ?? '—'}</span> },
      { accessorKey: 'role_key', header: 'Роль', size: 120, cell: ({ getValue }) => getValue() || <span className="text-fg-3">—</span> },
      {
        id: 'scenes',
        header: 'Сцен',
        size: 60,
        accessorFn: (c) => sceneCount.get(c.id) ?? 0,
        cell: ({ getValue }) => <span className={getValue() ? '' : 'text-fg-3'}>{getValue()}</span>,
      },
      {
        id: 'files',
        header: 'Файлы',
        size: 150,
        accessorFn: (c) => characterImages(c).length,
        cell: ({ row }) => (
          <div className="flex gap-1">
            {(['base_img', 'pers_file', 'filename'] as const).map((k) =>
              row.original[k] ? (
                <Badge key={k} className="font-mono text-[10px]">
                  {k}
                </Badge>
              ) : null,
            )}
          </div>
        ),
      },
      { accessorKey: 'voice_name', header: 'Голос', size: 120, cell: ({ getValue }) => getValue() || <span className="text-fg-3">—</span> },
      {
        accessorKey: 'text_prompt',
        header: 'Промпт',
        size: 360,
        cell: ({ getValue }) => <span className="line-clamp-1 text-fg-2">{getValue() || '—'}</span>,
      },
      { accessorKey: 'status', header: 'Статус', size: 90, cell: ({ getValue }) => getValue() || <span className="text-fg-3">—</span> },
    ],
    [sceneCount],
  )

  if (!loading && !topic) {
    return (
      <EmptyState
        icon={<Users />}
        title="Ролик не найден"
        description={topicId}
        action={
          <Button
            onClick={() => {
              localStorage.removeItem(LAST_TOPIC_KEY)
              navigate('/characters')
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
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(c) => c.id}
          storageKey="characters"
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={activeId}
          onRowClick={(c) => open(c.id === activeId ? null : c.id)}
          loading={loading}
          toolbar={
            <>
              <TopicSelect value={topicId} base="/characters" className="w-64" />
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, роль, промпт…" className="w-56 pl-8" />
              </div>
              {q && (
                <Button variant="ghost" onClick={() => setQ('')}>
                  <X /> Сбросить
                </Button>
              )}
            </>
          }
          toolbarRight={
            <>
              <Button variant="primary" onClick={add}>
                <Plus /> Персонаж
              </Button>
              <Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirm(selectedIds)}>
                <Trash2 /> Удалить{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<Users />}
              title={q ? 'Ничего не найдено' : 'У ролика пока нет персонажей'}
              description={q ? undefined : 'Если в БД они есть, а здесь пусто — проверьте RLS-политику characters (supabase/policies.sql).'}
            />
          }
        />
      </div>

      <CharacterCard character={active} onClose={() => open(null)} onDelete={(id) => setConfirm([id])} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? 'Удалить персонажа?' : `Удалить персонажей: ${confirm?.length}?`}
        description="Запись будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          const ids = confirm ?? []
          await deleteCharacters(ids)
          setSelection({})
          if (activeId && ids.includes(activeId)) open(null)
        }}
      />
    </div>
  )
}
