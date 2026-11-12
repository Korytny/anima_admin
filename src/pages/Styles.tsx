import { useState } from 'react'
import { Check, ImageOff, Palette } from 'lucide-react'
import { SEASON_KEY, seasonTitle, useData } from '@/store/data'
import { STYLES, type VisualStyle } from '@/lib/styles'
import { cn, storageGet } from '@/lib/utils'
import { Button, EmptyState, Select } from '@/components/ui'

/** Стиль: визуальный стиль сезона (LoRA для производства фото). Стили — src/lib/styles.ts, выбор — seasons.style. */
export function StylesPage() {
  const { seasons, updateSeason } = useData()
  const [seasonId, setSeasonId] = useState(() => storageGet<string | null>(SEASON_KEY, null))
  const season = seasons.find((s) => s.id === seasonId) ?? seasons[0]
  const [saving, setSaving] = useState<string | null>(null)

  if (!season) return <EmptyState icon={<Palette />} title="Сначала создайте сезон" description="Стиль выбирается на сезон" />

  const choose = async (id: string) => {
    setSaving(id)
    await updateSeason(season.id, { style: id })
    setSaving(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Стиль</h1>
            <p className="text-[13px] text-fg-3">Визуальный стиль сезона: LoRA и добавка к промпту для всех кадров и персонажей сезона.</p>
          </div>
          <Select
            className="w-56"
            value={season.id}
            onChange={(e) => {
              setSeasonId(e.target.value)
              localStorage.setItem(SEASON_KEY, JSON.stringify(e.target.value))
            }}
            options={seasons.map((s) => ({ value: s.id, label: seasonTitle(s) }))}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {STYLES.map((st) => (
            <StyleCard key={st.id} style={st} active={season.style === st.id} saving={saving === st.id} onChoose={() => void choose(st.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StyleCard({ style, active, saving, onChoose }: { style: VisualStyle; active: boolean; saving: boolean; onChoose: () => void }) {
  const src = style.preview // лежит в приложении (public/style-previews), не на сервере ComfyUI
  const [broken, setBroken] = useState(false)
  return (
    <article
      className={cn('flex flex-col overflow-hidden rounded-xl border bg-surface transition-colors', !active && 'border-border')}
      style={active ? { borderColor: style.color, boxShadow: `0 0 0 1px ${style.color}` } : undefined}
    >
      <div className="relative aspect-video" style={{ background: `linear-gradient(135deg, ${style.color}33, transparent 70%)` }}>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-fg-3">
            <ImageOff className="size-5" />
            <span className="font-mono text-[11px]">public{style.preview}</span>
          </div>
        )}
        {active && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: style.color }}>
            <Check className="size-3.5" strokeWidth={3} /> Стиль сезона
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">{style.title}</h2>
            <span className="text-xs text-fg-3">{style.like}</span>
          </div>
          <p className="mt-1 text-[13px] text-fg-2">{style.description}</p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-fg-3">LoRA</dt>
          <dd className={cn('truncate font-mono', style.lora ? 'text-fg' : 'text-fg-3')}>{style.lora || 'не задана'}</dd>
          <dt className="text-fg-3">Сила</dt>
          <dd className="font-mono">{style.strength ?? '—'}</dd>
          <dt className="text-fg-3">Триггер</dt>
          <dd className="truncate font-mono">{style.trigger || '—'}</dd>
          <dt className="text-fg-3">Промпт</dt>
          <dd className="line-clamp-2 font-mono text-fg-2" title={style.promptSuffix}>
            {style.promptSuffix}
          </dd>
        </dl>

        <div className="mt-auto pt-1">
          {active ? (
            <span className="text-xs text-fg-3">Используется для кадров и персонажей сезона</span>
          ) : (
            <Button variant="outline" onClick={onChoose} disabled={saving}>
              {saving ? 'Сохранение…' : 'Выбрать для сезона'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
