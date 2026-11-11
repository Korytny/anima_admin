import { cn } from '@/lib/utils'

/** Имена «кто в кадре». Неизвестные (нет в characters ролика) — пунктиром. */
export function CastChips({ cast, className }: { cast: { name: string; known: boolean }[]; className?: string }) {
  if (!cast.length) return <span className="text-fg-3">—</span>
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {cast.map((c) => (
        <span
          key={c.name}
          title={c.known ? undefined : 'Нет в библиотеке персонажей сезона'}
          className={cn('rounded px-1.5 py-px text-[11px] leading-4', c.known ? 'bg-raised text-fg' : 'border border-dashed border-border text-fg-3')}
        >
          {c.name}
        </span>
      ))}
    </span>
  )
}
