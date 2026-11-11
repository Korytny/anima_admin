import { NavLink } from 'react-router-dom'
import { Bot, Clapperboard, Film, LayoutDashboard, LayoutGrid, Library, LogOut, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, Theater, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut, useSession } from '../AuthGate'
import { Avatar } from '../ui'

export const NAV = [
  { to: '/dashboard', label: 'Дашборд', icon: LayoutDashboard, demo: false },
  { to: '/seasons', label: 'Сезоны', icon: Library, demo: false },
  { to: '/topics', label: 'Контент-план', icon: Clapperboard, demo: false },
  { to: '/script', label: 'Сценарий', icon: ScrollText, demo: false },
  { to: '/scenes', label: 'Сцены ролика', icon: Theater, demo: false },
  { to: '/storyboard', label: 'Раскадровка', icon: LayoutGrid, demo: false },
  { to: '/characters', label: 'Персонажи', icon: Users, demo: false },
  { to: '/agents', label: 'Агенты', icon: Bot, demo: false },
  { to: '/settings', label: 'Настройки', icon: Settings, demo: true },
] as const

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const email = useSession()?.user.email ?? '—'

  return (
    <aside className={cn('flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-border', collapsed ? 'justify-center' : 'px-4')}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#6d28d9] text-white shadow-lg shadow-accent/30">
          <Film className="size-4" />
        </div>
        {!collapsed && <span className="truncate font-semibold tracking-tight">Pipeline Manager</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Основная навигация">
        {NAV.map(({ to, label, icon: Icon, demo }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex h-9 items-center gap-3 rounded-md text-[13px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg',
                collapsed ? 'justify-center' : 'px-3',
                isActive && 'bg-accent/10 text-fg before:absolute before:top-1.5 before:bottom-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-accent',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-4 shrink-0', isActive && 'text-accent-hover')} />
                {!collapsed && <span className="truncate">{label}</span>}
                {!collapsed && demo && (
                  <span className="ml-auto rounded bg-gold/10 px-1.5 text-[10px] font-medium text-gold" title="Нет таблицы в БД — данные не сохраняются">
                    демо
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={onToggle}
          className={cn('mb-1 flex h-8 w-full items-center gap-3 rounded-md text-xs text-fg-3 hover:bg-hover hover:text-fg', collapsed ? 'justify-center' : 'px-3')}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Свернуть'}
        </button>
        <div className={cn('flex items-center gap-2.5 rounded-md p-1.5', collapsed && 'flex-col')}>
          <Avatar name={email} size={28} />
          {!collapsed && <div className="min-w-0 flex-1 truncate text-[13px]">{email}</div>}
          <button onClick={signOut} className="rounded p-1 text-fg-3 hover:bg-hover hover:text-danger" aria-label="Выйти" title="Выйти">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
