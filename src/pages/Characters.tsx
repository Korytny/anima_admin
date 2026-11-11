import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Plus, Search, Trash2, Users, X } from 'lucide-react'
import type { Character } from '@/types'
import { SEASON_KEY, characterImages, characterTitle, sceneCharacters, seasonCharacters, seasonEpisodes, seasonTitle, useData, useScenesByTopic } from '@/store/data'
import { cn, storageGet, useHotkey } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { Badge, Button, ConfirmDialog, EmptyState, Input, Select, Thumb } from '@/components/ui'
import { CharacterCard } from './CharacterCard'

// Персонажи — библиотека СЕЗОНА (characters.season). Серии выбирают своих в topics.chars, сцены — по имени.
export function CharactersPage() {
  const { seasonId } = useParams()
  const { seasons, loading } = useData()
  if (!seasonId) {
    const last = storageGet<string | null>(SEASON_KEY, null)
    const target = seasons.find((s) => s.id === last) ?? seasons[0]
    if (target) return <Navigate to={`/characters/${target.id}`} replace />
    if (loading) return null
    return <EmptyState icon={<Users />} title="Сезонов пока нет" description="Персонажи хранятся в библиотеке сезона. Создайте сезон в разделе «Сезоны»." />
  }
  return <SeasonCharacters key={seasonId} seasonId={seasonId} />
}

function SeasonCharacters({ seasonId }: { seasonId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { seasons, topics, characters, loading, createCharacter, deleteCharacters } = useData()
  const byTopic = useScenesByTopic()
  const season = seasons.find((s) => s.id === seasonId)
  const episodes = useMemo(() => seasonEpisodes(seasonId, topics), [seasonId, topics])
  const scenes = useMemo(() => episodes.flatMap((t) => byTopic.get(t.topic_id) ?? []), [episodes, byTopic])
  const all = useMemo(() => seasonCharacters(seasonId, characters).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || (a.name ?? '').localeCompare(b.name ?? '')), [characters, seasonId])
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    localStorage.setItem(SEASON_KEY, JSON.stringify(seasonId))
  }, [seasonId])

  // В каких сериях персонаж: выбран в topics.chars серии
  const inEpisodes = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const t of episodes) for (const n of t.chars ?? []) {
      const k = n.trim().toLowerCase()
      m.set(k, [...(m.get(k) ?? []), t.backlog ?? 0])
    }
    return m
  }, [episodes])

  // В скольких шотах сезона встречается персонаж
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
    const c = await createCharacter(seasonId)
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
        id: 'episodes',
        header: 'Серии',
        size: 120,
        accessorFn: (c) => (inEpisodes.get((c.name ?? '').trim().toLowerCase()) ?? []).join(', '),
        cell: ({ getValue }) => <span className={cn('font-mono text-xs', getValue() ? 'text-fg-2' : 'text-fg-3')}>{getValue() || '—'}</span>,
      },
      {
        id: 'scenes',
        header: 'Шотов',
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
    [sceneCount, inEpisodes],
  )

  if (!loading && !season) {
    return (
      <EmptyState
        icon={<Users />}
        title="Сезон не найден"
        description={seasonId}
        action={
          <Button
            onClick={() => {
              localStorage.removeItem(SEASON_KEY)
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
              <Select
                className="w-64"
                aria-label="Сезон"
                value={seasonId}
                onChange={(e) => navigate(`/characters/${e.target.value}`)}
                options={seasons.map((x) => ({ value: x.id, label: seasonTitle(x) }))}
              />
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
              title={q ? 'Ничего не найдено' : 'В сезоне пока нет персонажей'}
              description={q ? undefined : 'Персонажи привязаны к сезону через characters.season. Если в БД они есть, а здесь пусто — проверьте поле season и RLS-политику characters.'}
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
