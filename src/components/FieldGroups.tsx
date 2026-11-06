import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, Select, Switch, Textarea, type Option } from './ui'

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'json' | 'list' | 'bool' | 'url' | 'readonly'

export interface FieldDef<T> {
  key: keyof T & string
  label?: string
  type?: FieldType
  options?: Option[]
  mono?: boolean
  rows?: number
  /** NOT NULL колонка: пустое значение сохраняется как '' а не null */
  required?: boolean
  render?: (value: unknown) => ReactNode
  /** Доп. блок под полем (подсказки, кнопки). */
  extra?: (value: unknown, onChange: (v: unknown) => void) => ReactNode
}

export interface GroupDef<T> {
  title: string
  fields: FieldDef<T>[]
  defaultOpen?: boolean
}

/** Сгруппированный редактор полей сущности: label | input. */
export function FieldGroups<T extends object>({
  groups,
  draft,
  onChange,
  dirtyKeys,
}: {
  groups: GroupDef<T>[]
  draft: T
  onChange: (key: keyof T & string, value: unknown) => void
  dirtyKeys?: Set<string>
}) {
  return (
    <div className="divide-y divide-border">
      {groups.map((g) => (
        <Group key={g.title} group={g} draft={draft} onChange={onChange} dirtyKeys={dirtyKeys} />
      ))}
    </div>
  )
}

function Group<T extends object>({
  group,
  draft,
  onChange,
  dirtyKeys,
}: {
  group: GroupDef<T>
  draft: T
  onChange: (key: keyof T & string, value: unknown) => void
  dirtyKeys?: Set<string>
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? true)
  const dirtyCount = dirtyKeys ? group.fields.filter((f) => dirtyKeys.has(f.key)).length : 0
  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-1.5 px-4 text-xs font-semibold tracking-wide text-fg-3 uppercase hover:text-fg"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {group.title}
        {dirtyCount > 0 && <span className="ml-1 size-1.5 rounded-full bg-gold" title="Есть несохранённые изменения" />}
      </button>
      {open && (
        <div className="grid grid-cols-[minmax(96px,34%)_1fr] gap-x-3 gap-y-2 px-4 pb-4">
          {group.fields.map((f) => (
            <FieldRow key={f.key} field={f} value={draft[f.key]} onChange={(v) => onChange(f.key, v)} dirty={dirtyKeys?.has(f.key)} />
          ))}
        </div>
      )}
    </section>
  )
}

function FieldRow<T>({ field, value, onChange, dirty }: { field: FieldDef<T>; value: unknown; onChange: (v: unknown) => void; dirty?: boolean }) {
  const id = `f-${field.key}`
  const type = field.type ?? 'text'
  const wide = type === 'textarea' || type === 'json' || type === 'list'
  const label = (
    <label
      htmlFor={id}
      className={cn('truncate pt-2 font-mono text-xs text-fg-3', dirty && 'text-gold', wide && 'col-span-2 pt-1 pb-0')}
      title={field.key}
    >
      {field.label ?? field.key}
    </label>
  )
  return (
    <>
      {label}
      <div className={cn('min-w-0', wide && 'col-span-2')}>
        <FieldInput id={id} field={field} value={value} onChange={onChange} />
        {field.extra?.(value, onChange)}
      </div>
    </>
  )
}

function FieldInput<T>({ id, field, value, onChange: emit }: { id: string; field: FieldDef<T>; value: unknown; onChange: (v: unknown) => void }) {
  const type = field.type ?? 'text'
  const mono = field.mono ? 'font-mono text-xs' : ''
  // Пустая строка → null для nullable-колонок
  const onChange = (v: unknown) => emit(v === '' && !field.required ? null : v)
  switch (type) {
    case 'readonly':
      return <div className="flex min-h-8 items-center font-mono text-xs text-fg-2">{field.render ? field.render(value) : String(value ?? '—')}</div>
    case 'bool':
      return (
        <div className="flex h-8 items-center">
          <Switch checked={!!value} onChange={onChange} aria-label={field.label ?? field.key} />
        </div>
      )
    case 'select':
      return <Select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} options={field.options ?? []} />
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          className={mono}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'textarea':
      return <Textarea id={id} rows={field.rows ?? 4} className={mono} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'list':
      return (
        <Textarea
          id={id}
          rows={field.rows ?? 3}
          className="font-mono text-xs"
          placeholder="По одному значению на строку"
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => emit(e.target.value.split('\n'))}
          onBlur={(e) => {
            const arr = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
            emit(arr.length ? arr : null)
          }}
        />
      )
    case 'json':
      return <JsonInput id={id} value={value} onChange={emit} rows={field.rows} />
    default:
      return <Input id={id} type={type === 'url' ? 'url' : 'text'} className={mono} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
  }
}

const toText = (v: unknown) => (v == null ? '' : JSON.stringify(v, null, 2))

/** Редактор jsonb: держит текст локально, наружу отдаёт распарсенное значение, только когда JSON валиден. */
function JsonInput({ id, value, onChange, rows = 8 }: { id: string; value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const [text, setText] = useState(() => toText(value))
  const [error, setError] = useState<string | null>(null)

  // Внешнее изменение (сброс, перезагрузка) — синхронизируем текст, если он не расходится по смыслу
  useEffect(() => {
    setText((cur) => {
      try {
        if (JSON.stringify(cur.trim() ? JSON.parse(cur) : null) === JSON.stringify(value ?? null)) return cur
      } catch {
        /* текст невалиден — перезапишем */
      }
      setError(null)
      return toText(value)
    })
  }, [value])

  const change = (t: string) => {
    setText(t)
    if (!t.trim()) {
      setError(null)
      onChange(null)
      return
    }
    try {
      onChange(JSON.parse(t))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Некорректный JSON')
    }
  }

  return (
    <div>
      <Textarea
        id={id}
        rows={rows}
        spellCheck={false}
        className={cn('font-mono text-xs', error && 'border-danger focus:border-danger')}
        value={text}
        onChange={(e) => change(e.target.value)}
      />
      {error && <div className="mt-1 text-[11px] text-danger">{error} — изменение не применено</div>}
    </div>
  )
}
