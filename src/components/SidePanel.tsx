import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useHotkey } from '@/lib/utils'
import { Button } from './ui'

/**
 * Быстрая карточка справа. На широких экранах (xl+) «раздвигает» контент — таблица остаётся видимой,
 * на узких — накрывает его поверх.
 * Содержимое собирается из <PanelScroll> и <PanelFooter>.
 */
export function SidePanel({
  open,
  onClose,
  panelKey,
  header,
  children,
}: {
  open: boolean
  onClose: () => void
  panelKey?: string | number
  header: ReactNode
  children: ReactNode
}) {
  useHotkey('escape', () => onClose(), { enabled: open, allowInInput: true })

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="side-panel"
          role="complementary"
          aria-label="Карточка"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-y-0 right-0 z-40 flex w-[min(460px,100vw)] shrink-0 flex-col border-l border-border bg-surface shadow-[-20px_0_40px_-20px_rgba(0,0,0,.6)] xl:static xl:z-auto xl:w-[clamp(400px,32vw,560px)]"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">{header}</div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Закрыть (Esc)" title="Закрыть (Esc)">
              <X />
            </Button>
          </div>
          <motion.div
            key={panelKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export function PanelScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
}

export function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">{children}</div>
}
