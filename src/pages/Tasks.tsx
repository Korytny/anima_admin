import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, ListTodo, MessageSquare, Plus, Send, Trash2 } from 'lucide-react'
import type { Task } from '@/types'
import { useData } from '@/store/data'
import { useSession } from '@/components/AuthGate'
import { TASK_STATUSES, isOpen, memberName, taskStatus, taskTarget } from '@/lib/tasks'
import { cn, fmtDateTime, timeAgo } from '@/lib/utils'
import { sceneCode } from '@/lib/media'
import { sortScenes } from '@/store/data'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Avatar, Button, ConfirmDialog, EmptyState, Input, Kbd, Select, Textarea, Thumb } from '@/components/ui'

/** Задачи команды: сетка карточек (фото привязанного шота/персонажа, заголовок, кратко, кому, статус), клик — карточка с перепиской. */
export function TasksPage() {
  const [params, setParams] = useSearchParams()
  const me = useSession()?.user.id
  const { tasks, team, loading, createTask } = useData()
  const [who, setWho] = useState<string>(params.get('who') ?? 'me') // me | all | <user_id>
  const [showDone, setShowDone] = useState(false)

  const list = useMemo(
    () =>
      tasks
        .filter((t) => (who === 'all' ? true : t.assignee === (who === 'me' ? me : who)))
        .filter((t) => showDone || isOpen(t))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [tasks, who, me, showDone],
  )
  const activeId = params.get('task')
  const active = tasks.find((t) => t.id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id) p.set('task', id)
      else p.delete('task')
      return p
    })
  const others = team.filter((m) => m.user_id !== me)
  const openCount = (id: string | undefined) => tasks.filter((t) => t.assignee === id && isOpen(t)).length

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mr-2 text-lg font-semibold">Задачи</h1>
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              {[{ id: 'me', label: `Мои · ${openCount(me)}` }, ...others.map((m) => ({ id: m.user_id, label: `${memberName(team, m.user_id)} · ${openCount(m.user_id)}` })), { id: 'all', label: 'Все' }].map((x) => (
                <button key={x.id} onClick={() => setWho(x.id)} className={cn('rounded px-2.5 py-1', who === x.id ? 'bg-raised font-medium text-fg' : 'text-fg-3 hover:text-fg')}>
                  {x.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-fg-3">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> показывать готовые
            </label>
            <Button
              variant="primary"
              className="ml-auto"
              onClick={async () => {
                const t = await createTask({ assignee: who !== 'me' && who !== 'all' ? who : me })
                if (t) open(t.id)
              }}
            >
              <Plus /> Задача
            </Button>
          </div>
          {!team.length && !loading && (
            <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-fg-2">
              Таблицы задач ещё нет — выполните <span className="font-mono">supabase/tasks.sql</span>.
            </div>
          )}
          {list.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {list.map((t) => (
                <TaskTile key={t.id} task={t} active={t.id === activeId} onClick={() => open(t.id === activeId ? null : t.id)} />
              ))}
            </div>
          ) : (
            !loading && <EmptyState icon={<ListTodo />} title={showDone ? 'Задач нет' : 'Открытых задач нет'} description="Задачу по шоту удобно создать прямо из карточки шота — кнопка «Задача»." />
          )}
        </div>
      </div>
      <SidePanel open={!!active} onClose={() => open(null)} panelKey={activeId ?? undefined} header={active && <h2 className="truncate text-base font-semibold">{active.title}</h2>}>
        {active && <TaskBody key={active.id} task={active} onClose={() => open(null)} />}
      </SidePanel>
    </div>
  )
}

function TaskTile({ task, active, onClick }: { task: Task; active: boolean; onClick: () => void }) {
  const d = useData()
  const target = taskTarget(task, d)
  const st = taskStatus(task.status)
  return (
    <button onClick={onClick} className={cn('flex gap-3 rounded-lg border bg-surface p-3 text-left transition-colors hover:border-fg-3', active ? 'border-accent' : 'border-border')}>
      {/* Картинка — второстепенна: маленькая и только если есть */}
      {target?.image && <Thumb src={target.image} className="aspect-[3/4] w-14 shrink-0 rounded bg-bg object-contain" />}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: st.color }}>
            {st.label}
          </span>
          {target && <span className="truncate text-[11px] text-accent-hover">{target.label}</span>}
        </div>
        <div className="line-clamp-2 text-[13px] font-medium">{task.title}</div>
        {task.description && <div className="line-clamp-2 text-xs text-fg-3">{task.description}</div>}
        <div className="flex items-center gap-2 pt-0.5 text-[11px] text-fg-3">
          <Avatar name={memberName(d.team, task.assignee)} size={18} />
          <span className="truncate">{memberName(d.team, task.assignee)}</span>
          {task.comments?.length > 0 && (
            <span className="ml-auto flex items-center gap-0.5">
              <MessageSquare className="size-3" /> {task.comments.length}
            </span>
          )}
          <span className={cn(!task.comments?.length && 'ml-auto')}>{timeAgo(task.updated_at)}</span>
        </div>
      </div>
    </button>
  )
}

function TaskBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const navigate = useNavigate()
  const session = useSession()
  const d = useData()
  const { team, updateTask, deleteTask, addTaskComment } = d
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const target = taskTarget(task, d)
  const dirty = title !== task.title || description !== (task.description ?? '')
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [task.comments?.length])

  const me = session?.user.id ?? ''
  const send = async () => {
    const text = reply.trim()
    if (!text || sending) return
    setSending(true)
    const t = await addTaskComment(task.id, { author: me, name: memberName(team, me), text, at: new Date().toISOString() })
    setSending(false)
    if (t) setReply('')
  }

  return (
    <>
      <PanelScroll>
        <div className="space-y-4 p-4 text-[13px]">
          {target?.image && <Thumb src={target.image} className="max-h-40 w-auto max-w-[45%] rounded-lg object-contain" />}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm font-medium" placeholder="Что сделать" />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-fg-3">Статус</span>
              <Select value={task.status} onChange={(e) => void updateTask(task.id, { status: e.target.value }, true)} options={TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-fg-3">Кому</span>
              <Select value={task.assignee ?? ''} onChange={(e) => void updateTask(task.id, { assignee: e.target.value || null }, true)} options={[{ value: '', label: 'никому' }, ...team.map((m) => ({ value: m.user_id, label: memberName(team, m.user_id) }))]} />
            </label>
          </div>
          <TaskLink task={task} />
          {target && (
            <button className="flex items-center gap-1.5 text-xs text-accent-hover hover:underline" onClick={() => navigate(target.href)}>
              <ExternalLink className="size-3.5" /> Открыть {target.label}
            </button>
          )}
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Подробности: что проверить, на что смотреть, что считать готовым" />
          {dirty && (
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => void updateTask(task.id, { title: title.trim() || 'Без названия', description: description.trim() || null })}>
                Сохранить
              </Button>
              <Button variant="ghost" size="sm" onClick={() => (setTitle(task.title), setDescription(task.description ?? ''))}>
                Отмена
              </Button>
            </div>
          )}
          <div className="text-[11px] text-fg-3">
            Создал(а) {memberName(team, task.created_by)} · {fmtDateTime(task.created_at)}
          </div>

          <section className="border-t border-border pt-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fg-3 uppercase">
              <MessageSquare className="size-3.5" /> Переписка · {task.comments?.length ?? 0}
            </h3>
            <div className="space-y-2">
              {(task.comments ?? []).map((c, i) => {
                const mine = c.author === me
                return (
                  <div key={i} className={cn('rounded-lg px-3 py-2', mine ? 'ml-6 bg-accent/10' : 'mr-6 bg-raised')}>
                    <div className="mb-0.5 flex items-baseline gap-2 text-[11px] text-fg-3">
                      <span className="font-medium text-fg-2">{c.name}</span>
                      <span title={fmtDateTime(c.at)}>{timeAgo(c.at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-fg">{c.text}</div>
                  </div>
                )
              })}
              {!task.comments?.length && <div className="text-xs text-fg-3">Сообщений пока нет.</div>}
              <div ref={bottom} />
            </div>
          </section>
        </div>
      </PanelScroll>
      <PanelFooter>
        <div className="flex w-full flex-col gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder="Написать… (⌘Enter — отправить)"
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void send()} disabled={!reply.trim() || sending}>
              <Send /> Отправить <Kbd>⌘↵</Kbd>
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить задачу" aria-label="Удалить задачу" onClick={() => setConfirm(true)}>
              <Trash2 />
            </Button>
          </div>
        </div>
      </PanelFooter>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Удалить задачу?"
        description="Задача и переписка будут удалены. Действие нельзя отменить."
        onConfirm={async () => {
          await deleteTask(task.id)
          onClose()
        }}
      />
    </>
  )
}

/** Привязка задачи: серия → шот, или персонаж. От привязки — фото карточки и ссылка «Открыть». */
function TaskLink({ task }: { task: Task }) {
  const { topics, scenes, characters, seasons, updateTask } = useData()
  const topicOptions = useMemo(
    () =>
      [...topics]
        .filter((t) => t.season_id)
        .sort((a, b) => (a.season_id ?? '').localeCompare(b.season_id ?? '') || (a.backlog ?? 0) - (b.backlog ?? 0))
        .map((t) => ({ value: t.topic_id, label: `${seasons.find((x) => x.id === t.season_id)?.title ?? ''} · ${t.backlog ?? '?'}. ${t.title}` })),
    [topics, seasons],
  )
  const shotOptions = useMemo(
    () =>
      scenes
        .filter((s) => s.topic === task.topic_id)
        .sort(sortScenes)
        .map((s) => ({ value: s.scene_id, label: `${sceneCode(s)}${s.base_image_url ? '' : ' · без кадра'}${s.dialogue_text ? ` · ${s.dialogue_text.slice(0, 40)}` : ''}` })),
    [scenes, task.topic_id],
  )
  const seasonId = topics.find((t) => t.topic_id === task.topic_id)?.season_id
  const characterOptions = useMemo(
    () =>
      characters
        .filter((c) => c.name && (!seasonId || c.season === seasonId))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map((c) => ({ value: c.id, label: c.name ?? c.id })),
    [characters, seasonId],
  )
  const set = (patch: Partial<Task>) => void updateTask(task.id, patch, true)
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 space-y-1">
        <span className="text-xs text-fg-3">Серия</span>
        <Select value={task.topic_id ?? ''} onChange={(e) => set({ topic_id: e.target.value || null, scene_id: null })} options={[{ value: '', label: 'без серии' }, ...topicOptions]} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-fg-3">Шот</span>
        <Select value={task.scene_id ?? ''} disabled={!task.topic_id} onChange={(e) => set({ scene_id: e.target.value || null })} options={[{ value: '', label: task.topic_id ? 'без шота' : 'сначала серия' }, ...shotOptions]} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-fg-3">Персонаж</span>
        <Select value={task.character_id ?? ''} onChange={(e) => set({ character_id: e.target.value || null })} options={[{ value: '', label: 'без персонажа' }, ...characterOptions]} />
      </label>
    </div>
  )
}
