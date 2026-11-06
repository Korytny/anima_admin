import { Copy, CornerDownLeft } from 'lucide-react'
import { absPath, toRelative } from '@/lib/media'
import { copyText } from '@/lib/utils'

/** Подсказка под полем пути: куда положить файл + «вписать». Полный путь предлагает сократить до относительного. */
export function PathHint({ expected, value, onChange }: { expected: string; value: unknown; onChange: (v: unknown) => void }) {
  const v = typeof value === 'string' ? value.trim() : ''
  const rel = v && !/^https?:/.test(v) ? toRelative(v) : v
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-3">
      {v && rel !== v ? (
        <>
          <span>В БД лучше хранить относительный путь:</span>
          <code className="font-mono text-fg-2">{rel}</code>
          <button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => onChange(rel)}>
            <CornerDownLeft className="size-3" /> заменить
          </button>
        </>
      ) : v === expected ? null : (
        <>
          <span>{v ? 'По схеме:' : 'Положить файл в:'}</span>
          <code className="font-mono text-fg-2 select-all">{expected}</code>
          <button className="inline-flex items-center gap-1 hover:text-fg" title="Скопировать полный путь на сервере" onClick={() => copyText(absPath(expected))}>
            <Copy className="size-3" /> путь
          </button>
          <button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => onChange(expected)}>
            <CornerDownLeft className="size-3" /> вписать
          </button>
        </>
      )}
    </div>
  )
}
