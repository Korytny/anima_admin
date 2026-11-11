import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Activity, Cloud, Cpu, ExternalLink, Film, Image as ImageIcon, Loader2, MapPin, Play, RefreshCw, Server, Square, Timer } from 'lucide-react'
import { getPods, getServerStats, getServers, podAction, podComfyUrl, type ComputeServer, type Generation, type Pod, type PodsInfo, type ServerStats } from '@/api/compute'
import type { StatusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Button, EmptyState, StatusBadge } from '@/components/ui'

const POLL_MS = 10_000
const POLL_FAST_MS = 3_000
const PENDING_TIMEOUT_MS = 5 * 60_000

type Pending = { action: 'start' | 'stop'; since: number }

const usd = (n: number, digits = 2) => `$${n.toFixed(digits)}`
function hms(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const isUp = (p: Pod) => p.status === 'RUNNING' && p.uptimeSeconds > 0

function podState(p: Pod, pending?: Pending): StatusMeta {
  if (pending?.action === 'start' || (p.status === 'RUNNING' && !p.uptimeSeconds)) return { label: 'Запускается', color: '#8B5CF6', pulse: true }
  if (pending?.action === 'stop') return { label: 'Останавливается', color: '#F59E0B', pulse: true }
  if (p.status === 'RUNNING') return { label: 'Работает', color: '#10B981', pulse: true }
  if (p.status === 'EXITED') return { label: 'Остановлен', color: '#71717A' }
  if (p.status === 'TERMINATED') return { label: 'Удалён', color: '#EF4444' }
  return { label: p.status, color: '#52525B' }
}

/** Свои серверы с ComfyUI: список из COMPUTE_SERVERS, статус и статистика генераций каждого (опрос раз в POLL_MS). */
function useServers() {
  const [servers, setServers] = useState<ComputeServer[] | null>(null)
  const [stats, setStats] = useState<Record<string, ServerStats>>({})
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const list = servers ?? (await getServers())
      if (!servers) setServers(list)
      const res = await Promise.all(list.map((x) => getServerStats(x.id).catch((e): ServerStats => ({ online: false, error: e instanceof Error ? e.message : String(e) }))))
      setStats(Object.fromEntries(list.map((x, i) => [x.id, res[i]])))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [servers])
  useEffect(() => {
    void load()
    const t = setInterval(() => !document.hidden && load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])
  return { servers, stats, error, reload: load }
}

/** Вычисления: свои серверы с ComfyUI (статус, статистика генераций) и GPU-поды RunPod (сколько стоит, запуск и остановка).
 *  Данные — мини-API в dev-сервере админки (плагин runpodApi в vite.config.ts, ключ RUNPOD_API_KEY в .env.local). */
export function ComputePage() {
  const own = useServers()
  const all = Object.values(own.stats)
  const today = all.reduce((a, x) => a + (x.stats?.today ?? 0), 0)
  const todayGpu = all.reduce((a, x) => a + (x.stats?.todayGpuSec ?? 0), 0)
  const total = all.reduce((a, x) => a + (x.stats?.total ?? 0), 0)
  const online = all.filter((x) => x.online).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">Вычисления</h1>
            <p className="text-[13px] text-fg-3">Где считаются генерации и сколько GPU-времени они занимают.</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Обновить" title="Обновить" onClick={() => void own.reload()}>
            <RefreshCw />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={<Server />}
            label="Серверов онлайн"
            value={own.servers ? `${online} из ${own.servers.length}` : '—'}
            hint="свои серверы с ComfyUI"
            accent={!!own.servers && online < own.servers.length}
          />
          <Tile icon={<Activity />} label="Генераций сегодня" value={String(today)} hint="фото и видео" />
          <Tile icon={<Timer />} label="Время GPU сегодня" value={hms(todayGpu)} hint="сумма времени генераций" />
          <Tile icon={<Cpu />} label="Всего генераций" value={String(total)} hint="с последнего запуска ComfyUI" />
        </div>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Серверы генерации</h2>
          {own.error ? (
            <ErrorLine text={own.error} />
          ) : !own.servers ? (
            <Loading />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {own.servers.map((x) => (
                <ServerCard key={x.id} server={x} stats={own.stats[x.id]} />
              ))}
              <RunPodCard />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** RunPod — такая же карточка, как у своих серверов: баланс, цена, сессия; у работающего пода — статистика его ComfyUI.
 *  Запуск/остановка пока не выведены (под с сетевым томом можно только удалить; создание — после своего Docker-образа). */
function RunPodCard() {
  const [info, setInfo] = useState<PodsInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const load = useCallback(async () => {
    try {
      setInfo(await getPods())
      setFetchedAt(Date.now())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => !document.hidden && load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const pods = info?.pods ?? []
  const pod = pods.find(isUp) ?? pods.find((p) => p.status === 'RUNNING') ?? pods[0]
  const up = pod && isUp(pod)
  const uptime = up ? pod.uptimeSeconds + (now - fetchedAt) / 1000 : 0
  const server: ComputeServer = { id: 'runpod', name: 'RunPod', url: up ? podComfyUrl(pod.id) : '', role: 'видео', costPerHr: pod?.costPerHr ?? 0 }
  const status: StatusMeta = error
    ? { label: 'Нет связи', color: '#EF4444' }
    : !info
      ? { label: 'Проверка…', color: '#71717A', pulse: true }
      : !pod
        ? { label: 'Нет подов', color: '#71717A' }
        : podState(pod)
  const subtitle = error ? error : !info ? '—' : pod ? `${pod.gpuCount > 1 ? `${pod.gpuCount} × ` : ''}${pod.gpuType} · ${pod.country}` : 'облачные GPU по требованию'
  return (
    <ServerCard
      server={server}
      stats={info?.comfy ?? (info || error ? { online: false } : undefined)}
      status={info?.comfy?.online ? undefined : status}
      subtitle={subtitle}
      icon={<Cloud />}
      extra={
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <Fact label="Баланс" value={info?.balance == null ? '—' : usd(info.balance)} />
          <Fact label="Цена" value={pod ? `${usd(pod.costPerHr)}/ч` : '—'} />
          <Fact label={up ? 'Сессия' : 'Подов'} value={up ? `${hms(uptime)} · ${usd((pod.costPerHr * uptime) / 3600, 3)}` : String(pods.length)} mono={up} accent={up} />
        </dl>
      }
    />
  )
}

/** RunPod пока отключён на странице (поды, баланс, запуск/остановка). Вернуть — рендерить <RunPodSection /> в ComputePage. */
export function RunPodSection() {
  const [pods, setPods] = useState<Pod[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState<Record<string, Pending>>({})

  const load = useCallback(async () => {
    try {
      const list = (await getPods()).pods
      setPods(list)
      setFetchedAt(Date.now())
      setError(null)
      setPending((prev) => {
        const next: Record<string, Pending> = {}
        for (const [id, p] of Object.entries(prev)) {
          const pod = list.find((x) => x.id === id)
          const done = !pod || (p.action === 'start' ? isUp(pod) : pod.status !== 'RUNNING')
          if (!done && Date.now() - p.since < PENDING_TIMEOUT_MS) next[id] = p
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const busy = Object.keys(pending).length > 0 || !!pods?.some((p) => p.status === 'RUNNING' && !p.uptimeSeconds)
  useEffect(() => {
    void load()
    const t = setInterval(() => !document.hidden && load(), busy ? POLL_FAST_MS : POLL_MS)
    return () => clearInterval(t)
  }, [load, busy])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const uptime = (p: Pod) => (isUp(p) ? p.uptimeSeconds + (now - fetchedAt) / 1000 : 0)
  const sorted = useMemo(() => [...(pods ?? [])].sort((a, b) => Number(b.status === 'RUNNING') - Number(a.status === 'RUNNING') || a.name.localeCompare(b.name)), [pods])
  const running = sorted.filter((p) => p.status === 'RUNNING')

  const act = async (pod: Pod, action: 'start' | 'stop') => {
    setPending((x) => ({ ...x, [pod.id]: { action, since: Date.now() } }))
    try {
      await podAction(pod.id, action)
      toast.success(action === 'start' ? `Запускаю «${pod.name}»` : `Останавливаю «${pod.name}»`)
      void load()
    } catch (e) {
      setPending((x) => {
        const next = { ...x }
        delete next[pod.id]
        return next
      })
      toast.error(action === 'start' ? 'Не удалось запустить под' : 'Не удалось остановить под', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">RunPod{pods && ` · работает ${running.length} из ${sorted.length}`}</h2>
      {error && <ErrorLine text={error} />}
      {!pods ? (
        !error && <Loading />
      ) : !sorted.length ? (
        <EmptyState icon={<Server />} title="Подов нет" description="Создайте под в консоли RunPod" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((p) => (
            <PodCard key={p.id} pod={p} pending={pending[p.id]} uptime={uptime(p)} onAction={(a) => void act(p, a)} />
          ))}
        </div>
      )}
    </section>
  )
}

function Tile({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-fg-3 [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 font-mono text-2xl font-semibold tabular-nums', accent && 'text-gold')}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-3">{hint}</div>}
    </div>
  )
}

function PodCard({ pod, pending, uptime, onAction }: { pod: Pod; pending?: Pending; uptime: number; onAction: (a: 'start' | 'stop') => void }) {
  const meta = podState(pod, pending)
  const on = pod.status === 'RUNNING'
  const up = isUp(pod) && !pending
  const cost = (pod.costPerHr * uptime) / 3600
  return (
    <article className={cn('flex flex-col rounded-lg border bg-surface p-4', on ? 'border-success/40' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5', on ? 'bg-success/15 text-success' : 'bg-raised text-fg-3')}>
          <Cpu />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" title={pod.name}>
            {pod.name}
          </div>
          <div className="truncate text-xs text-fg-3">
            {pod.gpuCount > 1 ? `${pod.gpuCount} × ` : ''}
            {pod.gpuType}
          </div>
        </div>
        <StatusBadge meta={meta} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Fact label="Цена" value={`${usd(pod.costPerHr)}/ч`} />
        <Fact label="Работает" value={up ? hms(uptime) : '—'} mono />
        <Fact label="Сессия" value={up ? usd(cost, 3) : '—'} mono accent={up} />
      </dl>

      <div className="mt-3 flex items-center gap-1 text-[11px] text-fg-3">
        <MapPin className="size-3" /> {pod.country}
        <span className="ml-auto font-mono">{pod.id}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        {on ? (
          <Button variant="outline" disabled={!!pending} onClick={() => onAction('stop')}>
            {pending?.action === 'stop' ? <Loader2 className="animate-spin" /> : <Square />}
            Остановить
          </Button>
        ) : (
          <Button variant="primary" disabled={!!pending || pod.status === 'TERMINATED'} onClick={() => onAction('start')}>
            {pending?.action === 'start' ? <Loader2 className="animate-spin" /> : <Play />}
            Запустить · {usd(pod.costPerHr)}/ч
          </Button>
        )}
        {up && (
          <a href={podComfyUrl(pod.id)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-fg-3 hover:text-accent-hover">
            ComfyUI <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </article>
  )
}

function Fact({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-bg px-2.5 py-1.5">
      <dt className="text-[11px] text-fg-3">{label}</dt>
      <dd className={cn('truncate text-[13px] font-medium tabular-nums', mono && 'font-mono', accent && 'text-gold')}>{value}</dd>
    </div>
  )
}

const Loading = () => (
  <div className="flex items-center gap-2 text-fg-3">
    <Loader2 className="size-4 animate-spin" /> Загрузка…
  </div>
)
const ErrorLine = ({ text }: { text: string }) => <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{text}</div>

const GB = 1024 ** 3
const fmtSec = (sec: number | null | undefined) => (sec == null ? '—' : sec < 60 ? `${sec.toFixed(1)} с` : `${Math.floor(sec / 60)} мин ${Math.round(sec % 60)} с`)
const timeOf = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—')
const dateOf = (ms: number | null) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-[11px] text-fg-3">
        <span>{label}</span>
        <span className="font-mono">
          {(used / GB).toFixed(1)} / {(total / GB).toFixed(1)} GB
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-gold' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const GEN_STATUS: Record<Generation['status'], string> = { success: 'bg-success', error: 'bg-danger', interrupted: 'bg-gold', running: 'bg-accent animate-pulse' }
const GEN_STATUS_LABEL: Record<Generation['status'], string> = { success: 'готово', error: 'ошибка', interrupted: 'прервано', running: 'идёт' }

/** Свой сервер: GPU и память, что сейчас считается, статистика генераций из истории ComfyUI, последние генерации. */
function ServerCard({
  server,
  stats,
  status,
  subtitle,
  extra,
  icon,
}: {
  server: ComputeServer
  stats?: ServerStats
  /** Свой статус вместо вычисленного (RunPod: «нет подов»). Без красной рамки «нет связи». */
  status?: StatusMeta
  subtitle?: string
  extra?: React.ReactNode
  icon?: React.ReactNode
}) {
  const online = stats?.online
  const sys = stats?.system
  const q = stats?.queue
  const st = stats?.stats
  const notSet = !server.url && !status
  const meta: StatusMeta = !stats
    ? { label: 'Проверка…', color: '#71717A', pulse: true }
    : notSet
      ? { label: 'Не настроен', color: '#71717A' }
      : !online
        ? (status ?? { label: 'Нет связи', color: '#EF4444' })
        : q?.running
          ? { label: q.pending ? `Генерирует · в очереди ${q.pending}` : 'Генерирует', color: '#8B5CF6', pulse: true }
          : { label: 'Свободен', color: '#10B981' }
  return (
    <article className={cn('flex flex-col rounded-lg border bg-surface p-4', online || status || notSet ? 'border-border' : 'border-danger/30')}>
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5', online ? 'bg-accent/15 text-accent' : 'bg-raised text-fg-3')}>{icon ?? <Server />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{server.name}</span>
            <span className="shrink-0 rounded bg-raised px-1.5 text-[11px] text-fg-3">{server.role}</span>
          </div>
          <div className="truncate text-xs text-fg-3">{subtitle ?? sys?.gpu ?? (stats && !online ? stats.error : '—')}</div>
        </div>
        <StatusBadge meta={meta} />
      </div>

      {extra}

      {sys && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Meter label="Видеопамять" used={sys.vramTotal - sys.vramFree} total={sys.vramTotal} />
          <Meter label="ОЗУ" used={sys.ramTotal - sys.ramFree} total={sys.ramTotal} />
        </div>
      )}

      {st && (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Fact label="Сегодня" value={`${st.today} · ${hms(st.todayGpuSec)}`} />
            <Fact label="Фото" value={`${st.byKind.photo.count} · ⌀ ${fmtSec(st.byKind.photo.avgSec)}`} />
            <Fact label="Видео" value={`${st.byKind.video.count} · ⌀ ${fmtSec(st.byKind.video.avgSec)}`} />
            <Fact label="Всего" value={String(st.total)} />
            <Fact label="Время GPU" value={hms(st.gpuSec)} mono />
            <Fact label="Ошибки" value={st.total ? `${st.errors} · ${Math.round((st.errors / st.total) * 100)}%` : '0'} accent={st.errors > 0} />
          </dl>
          <div className="mt-1 text-[11px] text-fg-3">
            {server.costPerHr > 0 && `Себестоимость GPU: ${usd((st.gpuSec / 3600) * server.costPerHr)} · `}
            Статистика с {dateOf(st.since)} — ComfyUI хранит историю до перезапуска
          </div>
        </>
      )}

      {!!stats?.recent?.length && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Последние генерации</div>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {stats.recent.map((g) => (
              <li key={g.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                <span className={cn('size-1.5 shrink-0 rounded-full', GEN_STATUS[g.status])} title={GEN_STATUS_LABEL[g.status]} />
                <span className="w-11 shrink-0 font-mono text-fg-3">{timeOf(g.at)}</span>
                <span className="shrink-0 text-fg-3 [&_svg]:size-3.5" title={g.kind === 'video' ? 'видео' : g.kind === 'photo' ? 'фото' : 'другое'}>
                  {g.kind === 'video' ? <Film /> : g.kind === 'photo' ? <ImageIcon /> : <Activity />}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-fg-2" title={g.file ?? ''}>
                  {g.file ?? '—'}
                </span>
                <span className="shrink-0 font-mono text-fg-3">{fmtSec(g.sec)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs [&:not(:first-child)]:mt-4">
        <span className="truncate font-mono text-fg-3">{server.url || (notSet ? 'впишите адрес ComfyUI в COMPUTE_SERVERS (.env.local)' : '—')}</span>
        {sys && <span className="shrink-0 text-fg-3">· ComfyUI {sys.comfy}</span>}
        {server.url && online && (
          <a href={server.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 text-fg-3 hover:text-accent-hover">
            Открыть ComfyUI <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </article>
  )
}
