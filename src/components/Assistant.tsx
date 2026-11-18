// Ассистент админки: окно справа (⌘J или кнопка в верхней панели). Модель — OpenAI через сервер админки (/assistant-api/chat).
// Системный промпт и модель — агент «Ассистент админки» в таблице agents (правится как любой агент, с версиями).
// Чтение данных — сразу; любая запись (поля таблиц, промпт агента) — только после «Применить» человеком.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Check, Loader2, MessageSquarePlus, Send, Sparkles, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { api } from '@/api'
import { useData, topicTitle } from '@/store/data'
import { TOOL_DEFS, isWriteTool, runTool, type Pending, type Table, type ToolCall } from '@/lib/assistantTools'
import { cn, useHotkey } from '@/lib/utils'
import { PromptDiff } from './PromptDiff'
import { Button, Kbd, Textarea } from './ui'

export const ASSISTANT_AGENT_NAME = 'Ассистент админки'
const MAX_ROUNDS = 12

/** Элементы Responses API: что шлём (сообщение человека, результат инструмента) и что приходит (текст, вызов инструмента). */
type InputItem = { role: 'user'; content: string } | { type: 'function_call_output'; call_id: string; output: string }
type OutputItem = { type: 'message'; content?: { type: string; text?: string }[] } | { type: 'function_call'; call_id: string; name: string; arguments: string } | { type: string }
/** Инструменты в формате Responses API (плоские). */
const RESP_TOOLS = TOOL_DEFS.map((t) => ({ type: 'function', ...t.function }))

/** Элемент ленты: сообщения + служебные строки (что читал, что применено). */
type Item = { kind: 'user'; text: string } | { kind: 'assistant'; text: string } | { kind: 'tool'; text: string } | { kind: 'done'; text: string; ok: boolean }

const TOOL_LABEL: Record<string, string> = {
  list_seasons: 'сезоны',
  list_episodes: 'серии',
  get_episode: 'серию',
  list_shots: 'шоты',
  get_shot: 'шот',
  list_characters: 'персонажей',
  list_agents: 'агентов',
  get_agent: 'агента',
  check_episode: 'проверку серии',
}

interface Ctx {
  open: (opts?: { agentId?: number; text?: string }) => void
  toggle: () => void
}
const AssistantCtx = createContext<Ctx>({ open: () => {}, toggle: () => {} })
export const useAssistant = () => useContext(AssistantCtx)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [focusAgent, setFocusAgent] = useState<number | null>(null)
  const [prefill, setPrefill] = useState<string | null>(null)
  const ctx = useMemo<Ctx>(
    () => ({
      open: (o) => {
        setOpen(true)
        if (o?.agentId != null) setFocusAgent(o.agentId)
        if (o?.text) setPrefill(o.text)
      },
      toggle: () => setOpen((v) => !v),
    }),
    [],
  )
  useHotkey(
    'mod+j',
    (e) => {
      e.preventDefault()
      setOpen((v) => !v)
    },
    { allowInInput: true },
  )
  return (
    <AssistantCtx.Provider value={ctx}>
      {children}
      {/* Панель смонтирована всегда — разговор не теряется при закрытии */}
      <AssistantPanel open={isOpen} onClose={() => setOpen(false)} focusAgent={focusAgent} prefill={prefill} onPrefillUsed={() => setPrefill(null)} />
    </AssistantCtx.Provider>
  )
}

/** Где сейчас человек: страница, серия, шот, агент — подставляется в каждое сообщение. */
function usePageContext(focusAgent: number | null) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { topics, scenes, agents, seasons, characters } = useData()
  const [, section, id] = pathname.split('/')
  const parts: string[] = [`страница /${section ?? ''}`]
  const topic = id ? topics.find((t) => t.topic_id === id) : undefined
  if (topic) parts.push(`серия «${topicTitle(topic)}» (topic_id=${topic.topic_id}, season_id=${topic.season_id ?? '—'})`)
  const season = id && !topic ? seasons.find((s) => s.id === id) : undefined
  if (season) parts.push(`сезон «${season.title}» (season_id=${season.id})`)
  const scene = params.get('scene') ? scenes.find((s) => s.scene_id === params.get('scene')) : undefined
  if (scene) parts.push(`открыт шот ${scene.scena}-${scene.shot_num} (scene_id=${scene.scene_id})`)
  const ch = params.get('character') ? characters.find((c) => c.id === params.get('character')) : undefined
  if (ch) parts.push(`открыт персонаж ${ch.name} (id=${ch.id})`)
  const agentId = params.get('agent') ? Number(params.get('agent')) : focusAgent
  const agent = agentId != null ? agents.find((a) => a.id === agentId) : undefined
  if (agent) parts.push(`агент «${agent.name}» (agent_id=${agent.id})`)
  if (params.get('view') === 'shots') parts.push('вкладка «Шоты»')
  return parts.join('; ')
}

function AssistantPanel({ open, onClose, focusAgent, prefill, onPrefillUsed }: { open: boolean; onClose: () => void; focusAgent: number | null; prefill: string | null; onPrefillUsed: () => void }) {
  const data = useData()
  const { agents, updateTopic, updateScene, updateCharacter, updateSeason, updateAgent } = data
  const agent = agents.find((a) => a.name?.trim() === ASSISTANT_AGENT_NAME)
  const pageCtx = usePageContext(focusAgent)
  const [items, setItems] = useState<Item[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<{ call: ToolCall; pending: Pending }[]>([])
  const [applying, setApplying] = useState(false)
  // Разговор хранит OpenAI: id последнего ответа + результаты инструментов, ждущие отправки
  const prevId = useRef<string | null>(null)
  const outputs = useRef<InputItem[]>([])
  const dataRef = useRef(data)
  dataRef.current = data
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      onPrefillUsed()
    }
  }, [prefill, onPrefillUsed])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [items, queue, busy])

  const call = async (input: InputItem[]) => {
    const { data: s } = await supabase.auth.getSession()
    const r = await fetch('/assistant-api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify({ model: agent?.model, instructions: agent?.prompt, input, tools: RESP_TOOLS, previous_response_id: prevId.current ?? undefined }),
    })
    const j = (await r.json().catch(() => null)) as { id?: string; output?: OutputItem[]; error?: string } | null
    if (!r.ok || !j?.id) throw new Error(j?.error || `Сервер ответил ${r.status}`)
    prevId.current = j.id
    return j.output ?? []
  }

  /** Крутит модель, пока она зовёт инструменты чтения; на записи — останавливается и ждёт человека. */
  const loop = useCallback(
    async (start: InputItem[]) => {
      let input = start
      setBusy(true)
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const out = await call(input)
          input = []
          for (const o of out) {
            if (o.type !== 'message') continue
            const text = ((o as Extract<OutputItem, { type: 'message' }>).content ?? []).map((c) => c.text ?? '').join('').trim()
            if (text) setItems((it) => [...it, { kind: 'assistant', text }])
          }
          const calls = out.filter((o): o is Extract<OutputItem, { type: 'function_call' }> => o.type === 'function_call' && 'call_id' in o)
          if (!calls.length) break
          const waiting: { call: ToolCall; pending: Pending }[] = []
          for (const fc of calls) {
            const tc: ToolCall = { id: fc.call_id, type: 'function', function: { name: fc.name, arguments: fc.arguments } }
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(fc.arguments || '{}')
            } catch {
              input.push({ type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify({ error: 'Аргументы не JSON' }) })
              continue
            }
            const d = dataRef.current
            const res = runTool(fc.name, args, { topics: d.topics, scenes: d.scenes, characters: d.characters, agents: d.agents, seasons: d.seasons })
            if ('pending' in res && isWriteTool(fc.name)) waiting.push({ call: tc, pending: res.pending })
            else {
              if (TOOL_LABEL[fc.name]) setItems((it) => [...it, { kind: 'tool', text: `смотрит ${TOOL_LABEL[fc.name]}` }])
              input.push({ type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify('result' in res ? res.result : res) })
            }
          }
          if (waiting.length) {
            outputs.current = input // результаты чтения уйдут вместе с решениями человека
            setQueue(waiting)
            return
          }
        }
      } catch (e) {
        setItems((it) => [...it, { kind: 'done', ok: false, text: e instanceof Error ? e.message : String(e) }])
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent?.model, agent?.prompt],
  )

  const send = () => {
    const text = input.trim()
    if (!text || busy || queue.length) return
    if (!agent?.prompt) return toast.error(`Нет агента «${ASSISTANT_AGENT_NAME}» с промптом в таблице агентов`)
    setInput('')
    setItems((it) => [...it, { kind: 'user', text }])
    void loop([{ role: 'user', content: `[Контекст: ${pageCtx}]\n\n${text}` }])
  }

  /** Решение человека по первому ожидающему действию; когда очередь пуста — модель продолжает. */
  const decide = async (accept: boolean) => {
    const [head, ...rest] = queue
    if (!head) return
    let result: unknown
    if (!accept) {
      result = { applied: false, note: 'Человек отклонил' }
      setItems((it) => [...it, { kind: 'done', ok: false, text: 'Отклонено' }])
    } else {
      setApplying(true)
      result = await apply(head.pending)
      setApplying(false)
    }
    outputs.current = [...outputs.current, { type: 'function_call_output', call_id: head.call.id, output: JSON.stringify(result) }]
    setQueue(rest)
    if (!rest.length) {
      const pending = outputs.current
      outputs.current = []
      void loop(pending)
    }
  }

  const apply = async (p: Pending): Promise<unknown> => {
    if (p.kind === 'prompt') {
      try {
        await api.addPromptVersion({ agent_id: p.agentId, prompt: p.to, model: agents.find((a) => a.id === p.agentId)?.model ?? null, source: 'assistant', note: p.note || null })
      } catch (e) {
        const msg = `Версия не записана, промпт не изменён: ${e instanceof Error ? e.message : e}`
        setItems((it) => [...it, { kind: 'done', ok: false, text: msg }])
        return { applied: false, error: msg }
      }
      const a = await updateAgent(p.agentId, { prompt: p.to }, true)
      setItems((it) => [...it, { kind: 'done', ok: !!a, text: a ? `Промпт «${p.agentName}» обновлён, версия записана` : 'Промпт не сохранён' }])
      return { applied: !!a }
    }
    const fn: Record<Table, (id: string, patch: any) => Promise<unknown>> = { topics: updateTopic, scenes: updateScene, characters: updateCharacter, seasons: updateSeason }
    let ok = 0
    for (const r of p.rows) {
      const patch = Object.fromEntries(r.changes.map((c) => [c.field, c.to]))
      if (await fn[p.table](r.id, patch)) ok++
    }
    setItems((it) => [...it, { kind: 'done', ok: ok === p.rows.length, text: `Применено: ${ok} из ${p.rows.length}` }])
    return { applied: ok === p.rows.length, applied_rows: ok, total: p.rows.length }
  }

  const reset = () => {
    prevId.current = null
    outputs.current = []
    setItems([])
    setQueue([])
  }

  return (
    <aside
      className={cn(
        'fixed top-0 right-0 bottom-0 z-40 flex w-[min(480px,100vw)] flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
      )}
      aria-hidden={!open}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">Ассистент</h2>
        <span className="truncate font-mono text-[11px] text-fg-3">{agent?.model ?? 'модель не задана'}</span>
        <Button variant="ghost" size="icon" className="ml-auto" title="Новый разговор" aria-label="Новый разговор" onClick={reset} disabled={busy}>
          <MessageSquarePlus />
        </Button>
        <Button variant="ghost" size="icon" title="Закрыть (⌘J)" aria-label="Закрыть" onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-[13px]">
        {!agent && (
          <div className="rounded-md border border-gold/40 bg-gold/10 p-3 text-xs text-fg-2">
            Нет агента «{ASSISTANT_AGENT_NAME}» в таблице агентов — его промпт и модель задают поведение ассистента.
          </div>
        )}
        {!items.length && agent && (
          <div className="space-y-2 text-xs text-fg-3">
            <p>Спросите про данные, попросите поправить поле или улучшить промпт агента. Любое изменение я сначала покажу — применяете вы.</p>
            <p className="text-fg-3">Сейчас: {pageCtx}</p>
          </div>
        )}
        {items.map((it, i) =>
          it.kind === 'user' ? (
            <div key={i} className="ml-8 rounded-lg bg-accent/10 px-3 py-2 whitespace-pre-wrap text-fg">
              {it.text}
            </div>
          ) : it.kind === 'assistant' ? (
            <div key={i} className="leading-relaxed whitespace-pre-wrap text-fg-2">
              {it.text}
            </div>
          ) : it.kind === 'tool' ? (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-fg-3">
              <Wrench className="size-3" /> {it.text}
            </div>
          ) : (
            <div key={i} className={cn('flex items-center gap-1.5 text-xs', it.ok ? 'text-success' : 'text-gold')}>
              {it.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />} {it.text}
            </div>
          ),
        )}
        {queue[0] && <PendingCard pending={queue[0].pending} more={queue.length - 1} applying={applying} onDecide={decide} />}
        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-fg-3">
            <Loader2 className="size-3.5 animate-spin" /> думает…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-border p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={3}
          placeholder={queue.length ? 'Сначала примите или отклоните изменение' : 'Что сделать? (Enter — отправить, Shift+Enter — новая строка)'}
          disabled={!!queue.length}
          className="text-[13px]"
        />
        <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-3">
          <Kbd>⌘J</Kbd> открыть / закрыть
          <Button variant="primary" size="sm" className="ml-auto" onClick={send} disabled={busy || !input.trim() || !!queue.length}>
            <Send /> Отправить
          </Button>
        </div>
      </div>
    </aside>
  )
}

const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

/** Карточка изменения: «было → станет» для полей или разница промпта. Применяет только человек. */
function PendingCard({ pending, more, applying, onDecide }: { pending: Pending; more: number; applying: boolean; onDecide: (accept: boolean) => void }) {
  return (
    <div className="rounded-lg border border-accent/40 bg-bg p-3">
      {pending.kind === 'prompt' ? (
        <>
          <div className="mb-1 text-xs font-medium text-fg">Новая версия промпта «{pending.agentName}»</div>
          {pending.diagnosis && <p className="mb-1 text-xs text-fg-2">{pending.diagnosis}</p>}
          <p className="mb-2 text-xs text-fg-3">
            {pending.note} · {pending.from.split(/\s+/).length} → {pending.to.split(/\s+/).length} слов
          </p>
          <div className="max-h-80 overflow-y-auto">
            <PromptDiff from={pending.from} to={pending.to} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 text-xs font-medium text-fg">
            Изменить {pending.table}: {pending.rows.length} {pending.rows.length === 1 ? 'запись' : 'записей'}
          </div>
          {pending.reason && <p className="mb-2 text-xs text-fg-2">{pending.reason}</p>}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {pending.rows.map((r) => (
              <div key={r.id} className="text-xs">
                <div className="mb-0.5 font-medium text-fg-2">{r.label}</div>
                {r.changes.map((c) => (
                  <div key={c.field} className="ml-2 font-mono text-[11px]">
                    <span className="text-fg-3">{c.field}: </span>
                    <span className="text-danger/80 line-through">{show(c.from)}</span> <span className="text-success">{show(c.to)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => onDecide(true)} disabled={applying}>
          {applying ? <Loader2 className="animate-spin" /> : <Check />} Применить
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDecide(false)} disabled={applying}>
          Отклонить
        </Button>
        {more > 0 && <span className="ml-auto text-[11px] text-fg-3">ещё изменений: {more}</span>}
      </div>
    </div>
  )
}
