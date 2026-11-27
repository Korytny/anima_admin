import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Bot, ChevronRight, Sparkles, Copy, CopyPlus, History, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Agent, AgentPromptVersion, LlmProviderRow } from '@/types'
import { api } from '@/api'
import { PromptDiff } from '@/components/PromptDiff'
import { useAssistant } from '@/components/Assistant'
import { useData } from '@/store/data'
import { AGENT_STEPS } from '@/lib/agentSteps'
import { useDraft } from '@/lib/useDraft'
import { cn, copyText, fmtDateTime, timeAgo } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Input, Kbd, Switch } from '@/components/ui'

// public.agents: id (bigint), name, description, prompt (markdown), model, is_active, created_at

const agentName = (a: Agent) => a.name || `Агент #${a.id}`

/** updateAgent с правилом шага: активным на шаге (agents.step) может быть только один агент — его и запускает
 *  кнопка шага в карточке ролика. Включили агента — остальные агенты того же шага выключаются. */
function useAgentUpdate() {
  const { agents, updateAgent } = useData()
  return useCallback(
    async (id: number, patch: Partial<Agent>, silent = false) => {
      const a = await updateAgent(id, patch, silent)
      if (a?.is_active && a.step)
        for (const o of agents) if (o.id !== a.id && o.step === a.step && o.is_active) await updateAgent(o.id, { is_active: false }, true)
      return a
    },
    [agents, updateAgent],
  )
}
/** Переменные вида {{var}} в промпте. */
const promptVars = (p: string | null) => [...new Set([...(p ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))]

/** Поля карточки. Провайдер — из llm_providers («Настройки → Интеграции»); модель — из его списка,
 *  нет списка — свободный ввод. Модель не из списка остаётся выбранной с пометкой. */
const agentGroups = (providers: LlmProviderRow[], provider: string | null, model: string | null): GroupDef<Agent>[] => {
  const models = providers.find((p) => p.id === provider)?.models ?? []
  const providerOptions = [{ value: '', label: '—' }, ...providers.map((p) => ({ value: p.id, label: p.title || p.id }))]
  if (provider && !providers.some((p) => p.id === provider)) providerOptions.push({ value: provider, label: `${provider} (нет в интеграциях)` })
  const modelOptions = [{ value: '', label: '—' }, ...models.map((m) => ({ value: m, label: m }))]
  if (model && !models.includes(model)) modelOptions.push({ value: model, label: `${model} (нет в списке)` })
  return [
    {
      title: 'Агент',
      fields: [
        { key: 'name' },
        { key: 'description', type: 'textarea', rows: 2 },
        { key: 'step', label: 'шаг конвейера — активного агента шага запускает кнопка шага в карточке ролика', type: 'select', options: [{ value: '', label: '—' }, ...AGENT_STEPS.map((x) => ({ value: x.value, label: x.label }))] },
        { key: 'provider', type: 'select', options: providerOptions },
        models.length ? { key: 'model', type: 'select', options: modelOptions } : { key: 'model', mono: true },
        { key: 'is_active', label: 'активен — на шаге работает только активный агент, остальные агенты шага выключатся', type: 'bool' },
      ],
    },
    ...GROUPS_REST,
  ]
}

const GROUPS_REST: GroupDef<Agent>[] = [
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
  const { agents, loading, createAgent, deleteAgents } = useData()
  const updateAgent = useAgentUpdate()
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
            onDuplicate={() => add({ name: `${agentName(active)} (копия)`, description: active.description, prompt: active.prompt, model: active.model, provider: active.provider, step: active.step })}
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
  const updateAgent = useAgentUpdate()
  const assistant = useAssistant()
  const [note, setNote] = useState('')
  const [versionsTick, setVersionsTick] = useState(0)
  // Правка промпта сначала пишется версией (source=admin), потом в agents.prompt
  const save = async (patch: Partial<Agent>) => {
    if (patch.prompt !== undefined && patch.prompt !== agent.prompt) {
      try {
        await api.addPromptVersion({ agent_id: agent.id, prompt: patch.prompt ?? '', model: patch.model ?? agent.model, source: 'admin', note: note.trim() || null })
        setVersionsTick((t) => t + 1)
      } catch (e) {
        toast.warning('Версия промпта не записана — история не ведётся', { description: e instanceof Error ? e.message : String(e) })
      }
    }
    const a = await updateAgent(agent.id, patch)
    if (a) setNote('')
    return a
  }
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(agent, 'id', save)
  const [providers, setProviders] = useState<LlmProviderRow[]>([])
  useEffect(() => {
    api.listLlmProviders().then(setProviders).catch(() => setProviders([]))
  }, [])
  const groups = useMemo(() => agentGroups(providers, draft?.provider ?? null, draft?.model ?? null), [providers, draft?.provider, draft?.model])
  if (!draft) return null
  const vars = promptVars(draft.prompt)
  const promptDirty = dirtyKeys.has('prompt')

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
        <FieldGroups groups={groups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
        <PromptVersions agent={agent} tick={versionsTick} locked={dirty} onRestored={() => setVersionsTick((t) => t + 1)} />
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
            {promptDirty && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что изменили — для истории версий" className="min-w-0 flex-1" />}
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" title="Открыть ассистента с этим агентом" onClick={() => assistant.open({ agentId: agent.id, text: `Агент «${agent.name}»: ` })}>
              <Sparkles /> Улучшить промпт
            </Button>
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

const SOURCE_LABEL = (s: string) =>
  s === 'initial' ? 'исходная' : s === 'admin' ? 'админка' : s === 'assistant' ? 'ассистент' : s.startsWith('file:') ? s.slice(5) : s.startsWith('rollback:') ? `откат к v${s.slice(9)}` : s

/** История промпта: agent_prompt_versions. Разница со текущим, откат = новая версия rollback:<id>. */
function PromptVersions({ agent, tick, locked, onRestored }: { agent: Agent; tick: number; locked: boolean; onRestored: () => void }) {
  const { updateAgent } = useData()
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AgentPromptVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diffId, setDiffId] = useState<number | null>(null)
  const [restore, setRestore] = useState<AgentPromptVersion | null>(null)

  const load = useCallback(async () => {
    try {
      setVersions(await api.listPromptVersions(agent.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [agent.id])
  useEffect(() => {
    if (open) void load()
  }, [open, load, tick, agent.prompt])

  const current = versions?.find((v) => v.prompt === (agent.prompt ?? ''))?.id

  return (
    <div className="border-t border-border">
      <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium" onClick={() => setOpen((o) => !o)}>
        <ChevronRight className={cn('size-4 text-fg-3 transition-transform', open && 'rotate-90')} />
        <History className="size-4 text-fg-3" /> Версии промпта{versions && <span className="text-fg-3">· {versions.length}</span>}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {error ? (
            <div className="text-xs text-gold">
              История недоступна: {error}. Нужно выполнить <span className="font-mono">supabase/agent_prompt_versions.sql</span>.
            </div>
          ) : !versions ? (
            <div className="text-xs text-fg-3">Загрузка…</div>
          ) : !versions.length ? (
            <div className="text-xs text-fg-3">Версий пока нет — первая появится при следующем сохранении промпта.</div>
          ) : (
            <ul className="space-y-1">
              {versions.map((v) => (
                <li key={v.id} className="rounded-md border border-border/70">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="font-mono text-fg-2">v{v.id}</span>
                    <span className="text-fg-3" title={fmtDateTime(v.created_at)}>
                      {timeAgo(v.created_at)}
                    </span>
                    <span className="truncate rounded bg-raised px-1.5 font-mono text-[11px] text-fg-2">{SOURCE_LABEL(v.source)}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-2" title={v.note ?? undefined}>
                      {v.note}
                    </span>
                    <span className="shrink-0 text-fg-3">{(v.prompt.length / 1000).toFixed(1)}k</span>
                    {v.id === current ? (
                      <Badge className="shrink-0">текущая</Badge>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setDiffId((d) => (d === v.id ? null : v.id))}>
                          Разница
                        </Button>
                        <Button variant="ghost" size="sm" disabled={locked} title={locked ? 'Сначала сохраните или отмените правку' : 'Сделать эту версию текущей'} onClick={() => setRestore(v)}>
                          <RotateCcw /> Откатить
                        </Button>
                      </>
                    )}
                  </div>
                  {diffId === v.id && (
                    <div className="border-t border-border/70 p-2">
                      <div className="mb-1 text-[11px] text-fg-3">От v{v.id} к текущему: зелёное — добавлено потом, зачёркнутое — убрано</div>
                      <div className="max-h-96 overflow-y-auto">
                        <PromptDiff from={v.prompt} to={agent.prompt ?? ''} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!restore}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Откатить промпт к v${restore?.id}?`}
        description="Текст этой версии станет текущим промптом агента. История сохранится: откат запишется новой версией."
        onConfirm={async () => {
          const v = restore
          if (!v) return
          try {
            await api.addPromptVersion({ agent_id: agent.id, prompt: v.prompt, model: agent.model, source: `rollback:${v.id}`, note: `откат к v${v.id}` })
          } catch (e) {
            toast.error('Версия не записана — откат отменён', { description: e instanceof Error ? e.message : String(e) })
            return
          }
          await updateAgent(agent.id, { prompt: v.prompt })
          onRestored()
        }}
      />
    </div>
  )
}
