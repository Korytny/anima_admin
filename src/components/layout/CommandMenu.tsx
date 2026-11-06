import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Bot, Clapperboard, Plus } from 'lucide-react'
import { shortId, topicPreview, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { TOPIC_STATUS, statusMeta } from '@/lib/status'
import { StatusBadge, Thumb } from '../ui'
import { NAV } from './Sidebar'

const itemCls =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-2 data-[selected=true]:bg-hover data-[selected=true]:text-fg [&_svg]:size-4'
const groupCls =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-fg-3'

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const { topics, agents, createTopic } = useData()
  const byTopic = useScenesByTopic()
  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Глобальный поиск"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed top-[15vh] left-1/2 z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      <Command.Input
        placeholder="Найти ролик, агента или страницу…"
        className="h-12 w-full border-b border-border bg-transparent px-4 text-[15px] outline-none placeholder:text-fg-3"
      />
      <Command.List className="max-h-[50vh] overflow-auto p-1.5">
        <Command.Empty className="py-8 text-center text-fg-3">Ничего не найдено</Command.Empty>
        <Command.Group heading="Действия" className={groupCls}>
          <Command.Item
            className={itemCls}
            onSelect={async () => {
              onOpenChange(false)
              const t = await createTopic()
              if (t) navigate(`/topics/${t.topic_id}`)
            }}
          >
            <Plus /> Новый ролик
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Страницы" className={groupCls}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <Command.Item key={to} className={itemCls} onSelect={() => go(to)}>
              <Icon /> {label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Ролики" className={groupCls}>
          {topics.map((t) => {
            const img = topicPreview(byTopic.get(t.topic_id))
            return (
              <Command.Item key={t.topic_id} value={`${t.topic_id} ${t.title}`} className={itemCls} onSelect={() => go(`/topics/${t.topic_id}`)}>
                {img ? <Thumb src={img} className="h-6 w-10" /> : <Clapperboard />}
                <span className="font-mono text-xs text-fg-3">{shortId(t.topic_id)}</span>
                <span className="flex-1 truncate">{topicTitle(t)}</span>
                <StatusBadge meta={statusMeta(TOPIC_STATUS, t.status)} />
              </Command.Item>
            )
          })}
        </Command.Group>
        <Command.Group heading="Агенты" className={groupCls}>
          {agents.map((a) => (
            <Command.Item key={a.id} value={`agent ${a.name} ${a.role}`} className={itemCls} onSelect={() => go(`/agents?agent=${a.id}`)}>
              <Bot /> {a.name}
              <span className="ml-auto text-xs text-fg-3">{a.model}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
