// Плашка очереди кадров (внизу справа): сколько сделано, какой шот сейчас в n8n, «Остановить».
import { Loader2, Square } from 'lucide-react'
import { useData } from '@/store/data'
import { sceneCode } from '@/lib/media'
import { Button } from './ui'

export function ImageQueueBar() {
  const { imageQueue: q, scenes, stopImageQueue } = useData()
  if (!q) return null
  const cur = q.current ? scenes.find((s) => s.scene_id === q.current) : undefined
  const pct = q.total ? Math.round((q.done / q.total) * 100) : 0
  return (
    <div className="fixed right-4 bottom-4 z-30 w-72 rounded-lg border border-border bg-surface p-3 shadow-2xl">
      <div className="flex items-center gap-2 text-[13px]">
        <Loader2 className="size-4 animate-spin text-accent" />
        <span className="font-medium">
          Кадры: {q.done} из {q.total}
        </span>
        {q.failed > 0 && <span className="text-xs text-danger">ошибок {q.failed}</span>}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={stopImageQueue} disabled={!q.pending.length} title="Остальные не отправлять; текущий кадр n8n доделает">
          <Square /> Стоп
        </Button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded bg-raised">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-fg-3">
        {cur ? `сейчас шот ${sceneCode(cur)}` : 'запускаю следующий…'}
        {q.pending.length > 0 && ` · в очереди ${q.pending.length}`}
      </div>
    </div>
  )
}
