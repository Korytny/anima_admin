// Раскладка полей карточки, которую настраивает пользователь (localStorage).
// Группы из кода — рабочие. Все поля записи, не попавшие ни в одну группу, собираются в «Остальное».
// Любое поле можно перенести из «Остальное» в рабочую группу (кнопка +) и вернуть обратно.
import { useMemo } from 'react'
import { Plus, Undo2 } from 'lucide-react'
import type { FieldDef, GroupDef } from '@/components/FieldGroups'
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownTrigger } from '@/components/ui'
import { usePersistentState } from '@/lib/utils'

export const REST_GROUP = 'Остальное'

/** Поле без описания в коде — тип по значению. */
function autoField<T>(key: string, value: unknown): FieldDef<T> {
  const k = key as keyof T & string
  if (Array.isArray(value)) return { key: k, type: 'list', rows: 3 }
  if (value !== null && typeof value === 'object') return { key: k, type: 'json', rows: 6 }
  if (typeof value === 'number') return { key: k, type: 'number', mono: true }
  if (typeof value === 'boolean') return { key: k, type: 'bool' }
  if (typeof value === 'string' && (value.length > 60 || value.includes('\n'))) return { key: k, type: 'textarea', rows: 3 }
  return { key: k }
}

export function useCardLayout<T extends object>(storageKey: string, groups: GroupDef<T>[], record: T | null) {
  // поле → название группы (только отличия от раскладки по умолчанию)
  const [layout, setLayout] = usePersistentState<Record<string, string>>(`${storageKey}:layout`, {})

  const { result, home, titles } = useMemo(() => {
    const defs = new Map<string, FieldDef<T>>()
    const home = new Map<string, string>()
    for (const g of groups) for (const f of g.fields) if (!defs.has(f.key)) (defs.set(f.key, f), home.set(f.key, g.title))
    for (const [k, v] of Object.entries(record ?? {})) if (!defs.has(k)) (defs.set(k, autoField<T>(k, v)), home.set(k, REST_GROUP))

    const titles = groups.map((g) => g.title)
    const out = new Map<string, FieldDef<T>[]>([...titles, REST_GROUP].map((t) => [t, []]))
    for (const [k, def] of defs) {
      const want = layout[k] ?? home.get(k)!
      out.get(out.has(want) ? want : REST_GROUP)!.push(def)
    }
    const rest = out.get(REST_GROUP)!.sort((a, b) => a.key.localeCompare(b.key))
    const result: GroupDef<T>[] = [
      ...groups.map((g) => ({ ...g, fields: out.get(g.title)! })).filter((g) => g.fields.length),
      ...(rest.length ? [{ title: REST_GROUP, defaultOpen: false, fields: rest }] : []),
    ]
    return { result, home, titles }
  }, [groups, record, layout])

  const move = (key: string, title: string) =>
    setLayout((l) => {
      const n = { ...l }
      if (title === home.get(key)) delete n[key]
      else n[key] = title
      return n
    })

  /** Кнопка у поля: в «Остальном» — «+» со списком групп, в рабочей группе — вернуть в «Остальное». */
  const fieldAction = (key: string, group: string) =>
    group === REST_GROUP ? (
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button className="rounded p-0.5 text-fg-3 hover:bg-hover hover:text-fg" title="Перенести в группу" aria-label={`Перенести ${key} в группу`}>
            <Plus className="size-3.5" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start">
          <DropdownLabel>Перенести в группу</DropdownLabel>
          {titles.map((t) => (
            <DropdownItem key={t} onSelect={() => move(key, t)}>
              {t}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>
    ) : (
      <button
        className="rounded p-0.5 text-fg-3 opacity-0 group-hover/field:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100"
        title={`Убрать в «${REST_GROUP}»`}
        aria-label={`Убрать ${key} в «${REST_GROUP}»`}
        onClick={() => move(key, REST_GROUP)}
      >
        <Undo2 className="size-3.5" />
      </button>
    )

  return { groups: result, fieldAction, reset: () => setLayout({}), customized: Object.keys(layout).length > 0 }
}
