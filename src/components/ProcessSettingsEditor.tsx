// Настройки процесса ComfyUI поверх шаблона: постоянные значения размеченных узлов (размер, LoRA, шаги…) и шаблон промпта.
// Хранятся в public.process_settings, применяет n8n/fill_workflow.js. Поля, которые n8n заполняет при каждом запуске
// (#prompt, #refN, #save, #seed.seed, #image, #size.length у видео), здесь не правятся.
import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { ProcessSettings } from '@/types'
import { cn } from '@/lib/utils'
import { Button, Input } from './ui'

type ApiNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: { title?: string } }
type Field = { key: string; label: string; field: string; classType: string; template: string | number | boolean }

const labelOf = (n: ApiNode) => (n._meta?.title ?? '').trim().split(/\s/)[0].toLowerCase()
/** Поля, которые n8n заполняет сам при каждом запуске. */
const RUNTIME = (label: string, field: string) =>
  (label === '#prompt' && ['text', 'prompt', 'value', 'string'].includes(field)) ||
  /^#[a-z_]+\d+$/.test(label) ||
  (label === '#save' && field === 'filename_prefix') ||
  (label === '#image' && field === 'image') ||
  (label === '#size' && field === 'length') ||
  (label === '#seed' && ['seed', 'noise_seed'].includes(field))

const SIZE_PRESETS = [
  { label: '9:16', w: 768, h: 1344 },
  { label: '3:4', w: 768, h: 1024 },
  { label: '1:1', w: 1024, h: 1024 },
  { label: '16:9', w: 1344, h: 768 },
]

export const PROMPT_VARS = ['prompt', 'style']

export function ProcessSettingsEditor({ file, workflow }: { file: string; workflow: unknown }) {
  const fields = useMemo<Field[]>(() => {
    const out: Field[] = []
    for (const n of Object.values((workflow ?? {}) as Record<string, ApiNode>)) {
      const label = labelOf(n)
      if (!label.startsWith('#')) continue
      for (const [field, v] of Object.entries(n.inputs ?? {})) {
        if (Array.isArray(v) || v === null || typeof v === 'object' || RUNTIME(label, field)) continue
        out.push({ key: `${label}.${field}`, label, field, classType: n.class_type ?? '?', template: v as string | number | boolean })
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key))
  }, [workflow])

  const [saved, setSaved] = useState<ProcessSettings | null>(null)
  const [draft, setDraft] = useState<ProcessSettings>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api
      .listProcessSettings()
      .then((all) => {
        const s = all[file] ?? {}
        setSaved(s)
        setDraft(s)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [file])

  if (error) return <div className="text-xs text-gold">Настройки недоступны: {error}. Нужно выполнить <span className="font-mono">supabase/process_settings.sql</span>.</div>
  if (!saved) return <div className="text-xs text-fg-3">Загрузка настроек…</div>

  const values = draft.values ?? {}
  const value = (f: Field) => (f.key in values ? values[f.key] : f.template)
  const setValue = (f: Field, raw: string | boolean) => {
    const v = typeof f.template === 'number' ? (raw === '' ? f.template : Number(raw)) : raw
    const next = { ...values }
    if (v === f.template) delete next[f.key]
    else next[f.key] = v as string | number | boolean
    setDraft({ ...draft, values: next })
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const unknownVars = [...(draft.prompt ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !PROMPT_VARS.includes(v))
  const stale = Object.keys(values).filter((k) => !fields.some((f) => f.key === k))
  const groups = [...new Set(fields.map((f) => f.label))]
  const size = groups.includes('#size')

  const save = async () => {
    setSaving(true)
    try {
      await api.saveProcessSettings(file, draft)
      setSaved(draft)
      toast.success('Настройки процесса сохранены — n8n возьмёт их при следующей генерации')
    } catch (e) {
      toast.error('Не сохранилось', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 font-medium text-fg-2">Шаблон промпта</div>
        <Input
          value={draft.prompt ?? ''}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          placeholder="{{prompt}}"
          className="font-mono text-xs"
        />
        <div className="mt-1 text-fg-3">
          Переменные: <span className="font-mono">{'{{prompt}}'}</span> — промпт шота, <span className="font-mono">{'{{style}}'}</span> — добавка стиля сезона. Триггер LoRA пишите
          здесь же, например <span className="font-mono">mhbh style, {'{{prompt}}'}, {'{{style}}'}</span>.
          {unknownVars.length > 0 && <span className="ml-1 text-gold">Неизвестные: {unknownVars.join(', ')} — подставятся пустыми.</span>}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g} className="rounded-md border border-border/70 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-accent">{g}</span>
            <span className="text-fg-3">{fields.find((f) => f.label === g)?.classType}</span>
            {g === '#size' && size && (
              <div className="ml-auto flex gap-1">
                {SIZE_PRESETS.map((p) => {
                  const w = fields.find((f) => f.key === '#size.width')
                  const h = fields.find((f) => f.key === '#size.height')
                  const on = w && h && value(w) === p.w && value(h) === p.h
                  return (
                    <button
                      key={p.label}
                      className={cn('rounded px-1.5 py-0.5 font-mono', on ? 'bg-accent/20 text-accent-hover' : 'bg-raised text-fg-3 hover:text-fg')}
                      onClick={() => {
                        const next = { ...values }
                        if (w) (p.w === w.template ? delete next[w.key] : (next[w.key] = p.w))
                        if (h) (p.h === h.template ? delete next[h.key] : (next[h.key] = p.h))
                        setDraft({ ...draft, values: next })
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {fields
              .filter((f) => f.label === g)
              .map((f) => {
                const v = value(f)
                const changed = f.key in values
                return (
                  <label key={f.key} className="flex items-center gap-2">
                    <span className={cn('w-28 shrink-0 truncate font-mono', changed ? 'text-accent-hover' : 'text-fg-3')} title={changed ? `в шаблоне: ${String(f.template)}` : 'как в шаблоне'}>
                      {f.field}
                    </span>
                    {typeof f.template === 'boolean' ? (
                      <input type="checkbox" checked={!!v} onChange={(e) => setValue(f, e.target.checked)} />
                    ) : (
                      <Input
                        type={typeof f.template === 'number' ? 'number' : 'text'}
                        step="any"
                        value={String(v)}
                        onChange={(e) => setValue(f, e.target.value)}
                        className="h-7 min-w-0 flex-1 font-mono text-xs"
                      />
                    )}
                    {changed && (
                      <button title={`Вернуть как в шаблоне: ${String(f.template)}`} className="text-fg-3 hover:text-fg" onClick={() => setValue(f, typeof f.template === 'number' ? String(f.template) : (f.template as string | boolean))}>
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </label>
                )
              })}
          </div>
        </div>
      ))}
      {!groups.length && <div className="text-fg-3">В процессе нет размеченных узлов с постоянными полями.</div>}
      {stale.length > 0 && <div className="text-gold">В настройках есть поля, которых нет в процессе: {stale.join(', ')} — n8n их пропустит.</div>}
      <div className="flex items-center gap-2 text-fg-3">
        <span>
          Каждый запуск n8n сам заполняет: <span className="font-mono">#prompt</span> (по шаблону), <span className="font-mono">#ref1..N</span>, <span className="font-mono">#save</span>,{' '}
          <span className="font-mono">#seed.seed</span>.
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
          Отменить
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={save}>
          <Save /> Сохранить
        </Button>
      </div>
    </div>
  )
}
