import { Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, Plus, RefreshCw, Search, Settings, Zap } from 'lucide-react'
import { seasonTitle, topicTitle, useData } from '@/store/data'
import { cn } from '@/lib/utils'
import { signOut, useSession } from '../AuthGate'
import { Avatar, Button, DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Kbd } from '../ui'
import { NAV } from './Sidebar'

function useBreadcrumbs() {
  const { pathname } = useLocation()
  const { topics, seasons } = useData()
  const [, section, id] = pathname.split('/')
  const nav = NAV.find((n) => n.to === `/${section}`)
  const crumbs: { label: string; to?: string }[] = [{ label: nav?.label ?? 'Pipeline Manager', to: nav?.to }]
  if (id && ['topics', 'script', 'scenes', 'storyboard'].includes(section)) {
    const t = topics.find((x) => x.topic_id === id)
    crumbs.push({ label: topicTitle(t ?? { title: '', topic_id: id }), to: `/topics/${id}` })
  }
  if ((section === 'seasons' || section === 'characters') && id) crumbs.push({ label: seasonTitle(seasons.find((s) => s.id === id) ?? { title: '', id }) })
  if (section === 'settings' && id) crumbs.push({ label: { access: 'Права доступа', integrations: 'Интеграции', system: 'Системные' }[id] ?? id })
  return crumbs
}

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const crumbs = useBreadcrumbs()
  const navigate = useNavigate()
  const email = useSession()?.user.email ?? ''
  const { createTopic, reload, refreshing } = useData()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <nav aria-label="Хлебные крошки" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-fg-3" />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="truncate text-fg-3 hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-medium">{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={onOpenSearch}
          className="flex h-8 w-[clamp(140px,22vw,280px)] items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg-3 hover:border-[#3a3a48] hover:text-fg-2"
        >
          <Search className="size-3.5" />
          <span className="flex-1 truncate text-left">Поиск…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <Button variant="ghost" size="icon" onClick={reload} aria-label="Обновить данные" title="Обновить данные (автоматически каждые 20 с)">
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>

        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Быстрые действия" title="Быстрые действия">
              <Zap className="text-gold" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Быстрые действия</DropdownLabel>
            <DropdownItem
              onSelect={async () => {
                const t = await createTopic()
                if (t) navigate(`/topics/${t.topic_id}`)
              }}
            >
              <Plus /> Новый ролик
            </DropdownItem>
            <DropdownItem onSelect={() => navigate('/settings/integrations')}>
              <Settings /> Интеграции
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownTrigger asChild>
            <button className="ml-1 rounded-full" aria-label="Профиль">
              <Avatar name={email || '?'} size={30} />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <div className="px-2 py-1.5 text-xs text-fg-2">{email}</div>
            <DropdownSeparator />
            <DropdownItem danger onSelect={signOut}>
              <LogOut /> Выйти
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
