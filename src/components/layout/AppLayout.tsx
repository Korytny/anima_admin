import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { usePersistentState, useHotkey } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandMenu } from './CommandMenu'
import { AssistantProvider } from '../Assistant'
import { ImageQueueBar } from '../ImageQueueBar'

export function AppLayout() {
  const [collapsed, setCollapsed] = usePersistentState('ui:sidebar-collapsed', false)
  const [search, setSearch] = useState(false)
  useHotkey(
    'mod+k',
    (e) => {
      e.preventDefault()
      setSearch((s) => !s)
    },
    { allowInInput: true },
  )

  return (
    <AssistantProvider>
      <div className="flex h-full overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenSearch={() => setSearch(true)} />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <CommandMenu open={search} onOpenChange={setSearch} />
        <ImageQueueBar />
      </div>
    </AssistantProvider>
  )
}
