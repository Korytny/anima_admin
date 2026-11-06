import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Bot, CopyPlus, KeyRound, Plus, Search, Trash2 } from 'lucide-react'
import type { Agent, LlmProvider } from '@/types'
import { useData } from '@/store/data'
import { useDraft } from '@/lib/useDraft'
import { timeAgo } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Input, Kbd, Select, Slider, Switch, Textarea } from '@/components/ui'

export const PROVIDERS: Record<LlmProvider, { label: string; models: string[] }> = {
  anthropic: { label: 'Anthropic', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  openai: { label: 'OpenAI', models: ['gpt-4.1', 'gpt-4.1-mini', 'o3'] },
  google: { label: 'Google', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  openrouter: { label: 'OpenRouter', models: [] },
}

export function AgentsPage() {
  const [params, setParams] = useSearchParams()
  const { agents, loading, createAgent, updateAgent, deleteAgents } = useData()
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [q, setQ] = useState('')
  const [provider, setProvider] = useState('')
  const [confirm, setConfirm] = useState<string[] | null>(null)

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return agents.filter(
      (a) => (!provider || a.provider === provider) && (!ql || [a.name, a.role, a.description, a.system_prompt, a.model].join(' ').toLowerCase().includes(ql)),
    )
  }, [agents, q, provider])

  const activeId = params.get('agent')
  const active = agents.find((a) => a.id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id) p.set('agent', id)
      else p.delete('agent')
      return p
    })
  const selectedIds = Object.keys(selection)

  const columns = useMemo<ColumnDef<Agent, any>[]>(
    () => [
      { id: 'icon', header: '', size: 52, enableSorting: false, enableHiding: false, cell: ({ row }) => <Avatar name={row.original.name} size={26} /> },
      { accessorKey: 'name', header: 'Имя', size: 180, meta: { label: 'Имя' }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { accessorKey: 'description', header: 'Описание', size: 280, meta: { label: 'Описание' }, cell: ({ getValue }) => <span className="text-fg-2">{getValue()}</span> },
      {
        id: 'model',
        accessorFn: (a) => `${a.provider}/${a.model}`,
        header: 'Модель',
        size: 200,
        meta: { label: 'Модель' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Badge>{PROVIDERS[row.original.provider]?.label}</Badge>
            <span className="truncate font-mono text-xs text-fg-2">{row.original.model}</span>
          </span>
        ),
      },
      { accessorKey: 'temperature', header: 'Темп.', size: 72, meta: { label: 'Температура' }, cell: ({ getValue }) => <span className="font-mono text-xs">{Number(getValue()).toFixed(1)}</span> },
      {
        accessorKey: 'related_fields',
        header: 'Поля БД',
        size: 220,
        enableSorting: false,
        meta: { label: 'Связанные поля' },
        cell: ({ getValue }) => (
          <span className="flex gap-1 overflow-hidden">
            {(getValue() as string[]).map((f) => (
              <Badge key={f} className="font-mono">
                {f}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: 'Активен',
        size: 84,
        meta: { label: 'Активен' },
        cell: ({ row }) => (
          <Switch aria-label="Активен" checked={row.original.enabled} onChange={(v) => updateAgent(row.original.id, { enabled: v }, true)} />
        ),
      },
      { accessorKey: 'updated_at', header: 'Изменён', size: 120, meta: { label: 'Изменён' }, cell: ({ getValue }) => <span className="text-fg-2">{timeAgo(getValue())}</span> },
    ],
    [updateAgent],
  )

  const create = async () => {
    const a = await createAgent()
    if (a) open(a.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(a) => a.id}
          storageKey="agents"
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={activeId}
          onRowClick={(a) => open(a.id === activeId ? null : a.id)}
          loading={loading}
          toolbar={
            <>
              <Button variant="primary" onClick={create}>
                <Plus /> Новый агент
              </Button>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, роль, промпт…" className="w-[clamp(160px,18vw,260px)] pl-8" />
              </div>
              <Select
                className="w-40"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Все провайдеры"
                options={Object.entries(PROVIDERS).map(([value, p]) => ({ value, label: p.label }))}
              />
            </>
          }
          toolbarRight={
            <Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirm(selectedIds)}>
              <Trash2 /> Удалить{selectedIds.length ? ` (${selectedIds.length})` : ''}
            </Button>
          }
          empty={<EmptyState icon={<Bot />} title="Агентов нет" action={<Button variant="primary" onClick={create}><Plus /> Новый агент</Button>} />}
        />
      </div>

      <SidePanel
        open={!!active}
        onClose={() => open(null)}
        panelKey={active?.id}
        header={
          active && (
            <div className="flex items-center gap-3">
              <Avatar name={active.name} size={40} />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{active.name}</h2>
                <div className="text-xs text-fg-3">{active.enabled ? 'Активен' : 'Выключен'} · {active.model}</div>
              </div>
            </div>
          )
        }
      >
        {active && (
          <AgentForm
            key={active.id}
            agent={active}
            onDelete={() => setConfirm([active.id])}
            onDuplicate={async () => {
              const { id: _id, updated_at: _u, ...rest } = active
              const a = await createAgent({ ...rest, name: `${active.name} (копия)`, enabled: false })
              if (a) open(a.id)
            }}
          />
        )}
      </SidePanel>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.length === 1 ? 'Удалить агента?' : `Удалить агентов: ${confirm?.length}?`}
        description="Действие нельзя отменить."
        onConfirm={async () => {
          const ids = confirm ?? []
          await deleteAgents(ids)
          setSelection({})
          if (activeId && ids.includes(activeId)) open(null)
        }}
      />
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-fg-2">{label}</span>
        {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function AgentForm({ agent, onDelete, onDuplicate }: { agent: Agent; onDelete: () => void; onDuplicate: () => void }) {
  const { updateAgent } = useData()
  const { draft, set, reset, submit, dirty, saving } = useDraft(agent, 'id', (patch) => updateAgent(agent.id, patch))
  if (!draft) return null
  const vars = [...new Set([...draft.system_prompt.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))]
  const models = PROVIDERS[draft.provider]?.models ?? []

  return (
    <>
      <PanelScroll>
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-bg px-3 py-2">
            <div>
              <div className="text-[13px] font-medium">Агент активен</div>
              <div className="text-[11px] text-fg-3">Выключенный агент не участвует в пайплайне</div>
            </div>
            <Switch checked={draft.enabled} onChange={(v) => set('enabled', v)} aria-label="Агент активен" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Имя">
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Роль">
              <Input value={draft.role} onChange={(e) => set('role', e.target.value)} />
            </Field>
          </div>
          <Field label="Описание">
            <Input value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Провайдер"
              hint={
                <Link to="/settings/integrations" className="inline-flex items-center gap-1 hover:text-accent-hover">
                  <KeyRound className="size-3" /> ключи
                </Link>
              }
            >
              <Select
                value={draft.provider}
                onChange={(e) => {
                  const p = e.target.value as LlmProvider
                  set('provider', p)
                  if (PROVIDERS[p].models[0]) set('model', PROVIDERS[p].models[0])
                }}
                options={Object.entries(PROVIDERS).map(([value, p]) => ({ value, label: p.label }))}
              />
            </Field>
            <Field label="Модель">
              <Input list={`models-${agent.id}`} className="font-mono text-xs" value={draft.model} onChange={(e) => set('model', e.target.value)} />
              <datalist id={`models-${agent.id}`}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Температура" hint={<span className="font-mono text-fg">{draft.temperature.toFixed(1)}</span>}>
              <Slider value={draft.temperature} onChange={(v) => set('temperature', Math.round(v * 10) / 10)} />
            </Field>
            <Field label="Max tokens">
              <Input type="number" className="font-mono text-xs" value={draft.max_tokens} onChange={(e) => set('max_tokens', Number(e.target.value))} />
            </Field>
          </div>

          <Field label="Системный промпт" hint={`${draft.system_prompt.length} симв.`}>
            <Textarea
              rows={12}
              spellCheck={false}
              className="font-mono text-xs"
              value={draft.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="Ты — … Используй {{field}} для подстановки полей ролика"
            />
            {vars.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[11px] text-fg-3">Переменные:</span>
                {vars.map((v) => (
                  <Badge key={v} color="#A78BFA" className="font-mono">
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            )}
          </Field>

          <Field label="Связанные поля БД" hint="через запятую">
            <Input
              className="font-mono text-xs"
              value={draft.related_fields.join(', ')}
              onChange={(e) => set('related_fields', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
        </div>
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
            <Button onClick={onDuplicate}>
              <CopyPlus /> Дублировать
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" aria-label="Удалить" title="Удалить" onClick={onDelete}>
              <Trash2 />
            </Button>
          </>
        )}
      </PanelFooter>
    </>
  )
}
