import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Bot, Copy, CopyPlus, Plus, Search, Trash2 } from 'lucide-react'
import type { Agent } from '@/types'
import { useData } from '@/store/data'
import { useDraft } from '@/lib/useDraft'
import { copyText, fmtDateTime, timeAgo } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Input, Kbd, Switch } from '@/components/ui'

// public.agents: id (bigint), name, description, prompt (markdown), model, is_active, created_at

const agentName = (a: Agent) => a.name || `Агент #${a.id}`
/** Переменные вида {{var}} в промпте. */
const promptVars = (p: string | null) => [...new Set([...(p ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))]

const GROUPS: GroupDef<Agent>[] = [
  {
    title: 'Агент',
    fields: [
      { key: 'name' },
      { key: 'description', type: 'textarea', rows: 2 },
      { key: 'model', mono: true },
      { key: 'is_active', type: 'bool' },
    ],
  },
  { title: 'Промпт', fields: [{ key: 'prompt', type: 'textarea', rows: 28, mono: true }] },
  {
    title: 'Системное',
    defaultOpen: false,
    fields: [
      { key: 'id', type: 'readonly' },
      { key: 'created_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
    ],
  },
]

export function AgentsPage() {
  const [params, setParams] = useSearchParams()
  const { agents, loading, createAgent, updateAgent, deleteAgents } = useData()
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<number[] | null>(null)

  const sorted = useMemo(() => [...agents].sort((a, b) => a.id - b.id), [agents])
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ql ? sorted.filter((a) => [a.name, a.description, a.prompt, a.model].join(' ').toLowerCase().includes(ql)) : sorted
  }, [sorted, q])

  const activeId = params.get('agent')
  const active = agents.find((a) => String(a.id) === activeId) ?? null
  const open = (id: number | null) =>
    setParams((p) => {
      if (id != null) p.set('agent', String(id))
      else p.delete('agent')
      return p
    })
  const selectedIds = Object.keys(selection).map(Number)

  const add = async (data?: Partial<Agent>) => {
    const a = await createAgent(data)
    if (a) open(a.id)
  }

  const columns = useMemo<ColumnDef<Agent, any>[]>(
    () => [
      { id: 'icon', header: '', size: 52, enableSorting: false, enableHiding: false, cell: ({ row }) => <Avatar name={agentName(row.original)} size={26} /> },
      { accessorKey: 'id', header: 'ID', size: 56, cell: ({ getValue }) => <span className="font-mono text-xs text-fg-3">{getValue()}</span> },
      { accessorKey: 'name', header: 'Имя', size: 180, cell: ({ row }) => <span className="font-medium">{agentName(row.original)}</span> },
      { accessorKey: 'description', header: 'Описание', size: 340, cell: ({ getValue }) => <span className="line-clamp-1 text-fg-2">{getValue() || '—'}</span> },
      { accessorKey: 'model', header: 'Модель', size: 180, cell: ({ getValue }) => (getValue() ? <span className="font-mono text-xs text-fg-2">{getValue()}</span> : <span className="text-fg-3">—</span>) },
      {
        id: 'prompt',
        header: 'Промпт',
        size: 110,
        accessorFn: (a) => a.prompt?.length ?? 0,
        cell: ({ getValue, row }) => {
          const vars = promptVars(row.original.prompt)
          return getValue() ? (
            <span className="text-xs text-fg-2" title={vars.length ? `Переменные: ${vars.join(', ')}` : undefined}>
              {(getValue() / 1000).toFixed(1)}k симв.{vars.length > 0 && <span className="text-fg-3"> · {vars.length} var</span>}
            </span>
          ) : (
            <span className="text-danger">пусто</span>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Активен',
        size: 84,
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Switch aria-label="Активен" checked={!!row.original.is_active} onChange={(v) => updateAgent(row.original.id, { is_active: v }, true)} />
          </span>
        ),
      },
      { accessorKey: 'created_at', header: 'Создан', size: 110, cell: ({ getValue }) => <span className="text-fg-2">{timeAgo(getValue())}</span> },
    ],
    [updateAgent],
  )

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(a) => String(a.id)}
          storageKey="agents"
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={activeId}
          onRowClick={(a) => open(String(a.id) === activeId ? null : a.id)}
          loading={loading}
          toolbar={
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, описание, промпт, модель…" className="w-72 pl-8" />
            </div>
          }
          toolbarRight={
            <>
              <Button variant="primary" onClick={() => add()}>
                <Plus /> Агент
              </Button>
              <Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirm(selectedIds)}>
                <Trash2 /> Удалить{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<Bot />}
              title={q ? 'Ничего не найдено' : 'Агентов пока нет'}
              description={q ? undefined : 'Если в БД они есть, а здесь пусто — проверьте RLS-политику agents (supabase/policies.sql).'}
            />
          }
        />
      </div>

      <SidePanel
        open={!!active}
        onClose={() => open(null)}
        panelKey={activeId ?? undefined}
        header={active && <h2 className="truncate text-base font-semibold">{agentName(active)}</h2>}
      >
        {active && (
          <AgentBody
            key={active.id}
            agent={active}
            onDelete={() => setConfirm([active.id])}
            onDuplicate={() => add({ name: `${agentName(active)} (копия)`, description: active.description, prompt: active.prompt, model: active.model })}
          />
        )}
      </SidePanel>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? 'Удалить агента?' : `Удалить агентов: ${confirm?.length}?`}
        description="Запись будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          const ids = confirm ?? []
          await deleteAgents(ids)
          setSelection({})
          if (active && ids.includes(active.id)) open(null)
        }}
      />
    </div>
  )
}

function AgentBody({ agent, onDelete, onDuplicate }: { agent: Agent; onDelete: () => void; onDuplicate: () => void }) {
  const { updateAgent } = useData()
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(agent, 'id', (patch) => updateAgent(agent.id, patch))
  if (!draft) return null
  const vars = promptVars(draft.prompt)

  return (
    <>
      <PanelScroll>
        {vars.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-fg-3">
            Переменные в промпте:
            {vars.map((v) => (
              <Badge key={v} className="font-mono">{`{{${v}}}`}</Badge>
            ))}
          </div>
        )}
        <FieldGroups groups={GROUPS} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
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
        ) : (
          <>
            <Button variant="ghost" size="icon" title="Скопировать промпт" aria-label="Скопировать промпт" onClick={() => copyText(agent.prompt ?? '')}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" title="Дублировать" aria-label="Дублировать" onClick={onDuplicate}>
              <CopyPlus />
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить" aria-label="Удалить" onClick={onDelete}>
              <Trash2 />
            </Button>
          </>
        )}
      </PanelFooter>
    </>
  )
}
