import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import { CheckCircle2, Clapperboard, Film, Loader2, Theater } from 'lucide-react'
import { topicTitle, useData, useScenesByTopic } from '@/store/data'
import { TOPIC_STATUS, statusMeta } from '@/lib/status'
import { cn, timeAgo } from '@/lib/utils'
import { Skeleton, StatusBadge } from '@/components/ui'

const AXIS = { stroke: '#71717A', fontSize: 11, tickLine: false, axisLine: false } as const
const GRID = <CartesianGrid stroke="#2A2A35" vertical={false} />

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      {label != null && <div className="mb-1 font-medium text-fg">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-fg-2">
          <span className="size-2 rounded-sm" style={{ background: (p.payload?.color as string) ?? p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono text-fg">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </section>
  )
}

function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs text-fg-3">
        {label}
        <span className="text-fg-3 [&_svg]:size-4">{icon}</span>
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-2 text-xs text-fg-3">{sub}</div>}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { topics, scenes, loading } = useData()
  const byTopic = useScenesByTopic()

  const d = useMemo(() => {
    const now = Date.now()
    const count = (s: string) => topics.filter((t) => t.status === s).length

    const statusKeys = [...new Set([...Object.keys(TOPIC_STATUS), ...topics.map((t) => t.status ?? '—')])]
    const funnel = statusKeys
      .map((s) => {
        const m = statusMeta(TOPIC_STATUS, s === '—' ? null : s) ?? { label: 'Без статуса', color: '#52525B' }
        return { key: s, name: m.label, color: m.color, value: topics.filter((t) => (t.status ?? '—') === s).length }
      })
      .filter((x) => x.value > 0)

    const days = Array.from({ length: 30 }, (_, i) => {
      const dt = new Date(now - (29 - i) * 864e5)
      return { key: dt.toISOString().slice(0, 10), label: dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), value: 0 }
    })
    const idx = new Map(days.map((x, i) => [x.key, i]))
    for (const t of topics) {
      const i = t.updated_at ? idx.get(t.updated_at.slice(0, 10)) : undefined
      if (i != null) days[i].value++
    }

    const withScenes = topics.filter((t) => byTopic.get(t.topic_id)?.length).length
    const withFinal = topics.filter((t) => t.url_final).length
    const withTiktok = topics.filter((t) => t.file_tiktok).length
    const readiness = [
      { label: 'Есть сцены', value: withScenes, color: '#8B5CF6' },
      { label: 'Есть финальное видео', value: withFinal, color: '#10B981' },
      { label: 'Есть файл для TikTok', value: withTiktok, color: '#3B82F6' },
    ]

    const recent = [...topics].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 8)

    return {
      pending: count('pending'),
      published: count('published'),
      drafts: count('draft'),
      funnel,
      days,
      readiness,
      recent,
      scenesWithVideo: scenes.filter((s) => s.video_file).length,
    }
  }, [topics, scenes, byTopic])

  if (loading) {
    return (
      <div className="grid gap-4 p-6 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
        <Skeleton className="h-72 rounded-xl md:col-span-2" />
        <Skeleton className="h-72 rounded-xl md:col-span-2" />
      </div>
    )
  }

  const total = topics.length || 1

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid gap-4 p-6 md:grid-cols-2 2xl:grid-cols-4">
        <Stat label="Всего роликов" value={topics.length} icon={<Clapperboard />} sub={`${d.drafts} черновиков`} />
        <Stat label="В работе (pending)" value={d.pending} icon={<Loader2 />} />
        <Stat label="Опубликовано" value={d.published} icon={<CheckCircle2 />} sub={`${Math.round((d.published / total) * 100)}% от всех`} />
        <Stat label="Сцен" value={scenes.length} icon={<Theater />} sub={`${d.scenesWithVideo} с видео`} />

        <Panel title="Ролики по статусам" className="2xl:col-span-2">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d.funnel} barCategoryGap={8} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="name" {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="value" name="Роликов" radius={[4, 4, 0, 0]} maxBarSize={48} onClick={() => navigate('/topics')} className="cursor-pointer">
                  {d.funnel.map((f) => (
                    <Cell key={f.key} fill={f.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Изменения роликов за 30 дней" className="2xl:col-span-2">
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={d.days} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-upd" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {GRID}
                <XAxis dataKey="label" {...AXIS} interval={4} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#A1A1AA', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="value" name="Изменено" stroke="#8B5CF6" strokeWidth={2} fill="url(#g-upd)" activeDot={{ r: 4, stroke: '#13131A', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Готовность материалов">
          <div className="space-y-4">
            {d.readiness.map((r) => (
              <div key={r.label}>
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="text-fg-2">{r.label}</span>
                  <span>
                    <span className="font-mono font-semibold">{r.value}</span>
                    <span className="ml-1 text-xs text-fg-3">/ {topics.length}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full" style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Недавно изменённые"
          className="md:col-span-1 2xl:col-span-3"
          action={
            <button className="text-xs text-fg-3 hover:text-fg" onClick={() => navigate('/topics')}>
              Все →
            </button>
          }
        >
          <div className="-mx-2 divide-y divide-border/60">
            {d.recent.map((t) => (
              <button
                key={t.topic_id}
                onClick={() => navigate(`/topics/${t.topic_id}`)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate">{topicTitle(t)}</span>
                {t.url_final && <Film className="size-4 shrink-0 text-success" aria-label="Есть финальное видео" />}
                <StatusBadge meta={statusMeta(TOPIC_STATUS, t.status)} />
                <span className="w-28 shrink-0 text-right text-xs text-fg-3">{timeAgo(t.updated_at)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
