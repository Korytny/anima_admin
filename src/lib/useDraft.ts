import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useHotkey } from './utils'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Черновик редактируемой сущности: локальные правки, подсветка изменённых полей,
 * сохранение по Cmd+S. Если сущность обновилась извне — поля, которые пользователь
 * не трогал, подтягиваются автоматически.
 */
export function useDraft<T extends object>(entity: T | null | undefined, idKey: keyof T, save: (patch: Partial<T>) => Promise<T | undefined>) {
  const [draft, setDraft] = useState<T | null>(entity ?? null)
  const [saving, setSaving] = useState(false)
  const touched = useRef(new Set<string>())
  const id = entity ? entity[idKey] : null

  useEffect(() => {
    touched.current.clear()
    setDraft(entity ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!entity) return
    setDraft((d) => {
      if (!d) return entity
      const next = { ...entity }
      for (const k of touched.current) (next as Record<string, unknown>)[k] = (d as Record<string, unknown>)[k]
      return next
    })
  }, [entity])

  const dirtyKeys = useMemo(() => {
    const s = new Set<string>()
    if (!entity || !draft) return s
    for (const k of Object.keys(draft) as (keyof T & string)[]) if (!same(draft[k], entity[k])) s.add(k)
    return s
  }, [draft, entity])
  const dirty = dirtyKeys.size > 0

  const set = (key: keyof T & string, value: unknown) => {
    touched.current.add(key)
    setDraft((d) => (d ? ({ ...d, [key]: value } as T) : d))
  }
  const reset = () => {
    touched.current.clear()
    setDraft(entity ?? null)
  }

  const submit = async () => {
    if (!draft || !dirty) return true
    const patch: Partial<T> = {}
    for (const k of dirtyKeys) (patch as Record<string, unknown>)[k] = draft[k as keyof T]
    setSaving(true)
    try {
      const res = await save(patch)
      if (res) {
        touched.current.clear()
        setDraft(res)
      }
      return !!res
    } finally {
      setSaving(false)
    }
  }

  useHotkey(
    'mod+s',
    (e) => {
      e.preventDefault()
      if (dirty) void submit()
      else toast('Нет изменений')
    },
    { enabled: !!entity, allowInInput: true },
  )

  return { draft, set, reset, submit, dirty, dirtyKeys, saving }
}
