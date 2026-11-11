// Серверная часть (выполняется в процессе dev/preview-сервера, см. vite.config.ts): свои серверы генерации с ComfyUI.
// Список — COMPUTE_SERVERS в .env.local. Статус и статистика берутся прямо из ComfyUI: /system_stats, /queue, /history.
// История ComfyUI живёт в памяти — после перезапуска ComfyUI статистика начинается заново.

export interface ComputeServer {
  id: string
  name: string
  url: string
  role: string // фото | видео | всё — подпись для человека
  costPerHr: number // свои серверы: электричество/аренда, можно 0
}

/** COMPUTE_SERVERS="Локальный 12 GB|http://192.168.1.99:8188|фото|0; Таиланд 24 GB|http://localhost:8189|всё|0"
 *  Без переменной — один сервер из VITE_COMFY_URL. */
export function parseServers(raw: string | undefined, fallbackUrl: string | undefined): ComputeServer[] {
  const items = (raw ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const [name, url, role, cost] = s.split('|').map((x) => x?.trim() ?? '')
      return { id: `s${i + 1}`, name: name || `Сервер ${i + 1}`, url: (url || '').replace(/\/$/, ''), role: role || 'всё', costPerHr: Number(cost) || 0 }
    })
    .filter((s) => !s.url || /^https?:\/\//.test(s.url)) // без адреса — карточка «адрес не задан»
  if (items.length) return items
  return fallbackUrl ? [{ id: 's1', name: 'Локальный сервер', url: fallbackUrl.replace(/\/$/, ''), role: 'всё', costPerHr: 0 }] : []
}

type Kind = 'photo' | 'video' | 'other'
type Status = 'success' | 'error' | 'interrupted' | 'running'

export interface Generation {
  id: string
  at: number | null // ms, начало выполнения
  sec: number | null
  kind: Kind
  status: Status
  file: string | null // subfolder/filename первого результата (относительно ComfyUI/output)
}

export interface KindStats {
  count: number
  errors: number
  avgSec: number | null
  gpuSec: number
}

export interface ServerStats {
  online: boolean
  error?: string
  system?: { gpu: string; vramTotal: number; vramFree: number; ramTotal: number; ramFree: number; comfy: string }
  queue?: { running: number; pending: number }
  stats?: { total: number; today: number; todayGpuSec: number; gpuSec: number; errors: number; since: number | null; byKind: Record<Kind, KindStats> }
  recent?: Generation[]
}

const VIDEO = /\.(mp4|webm|mov|mkv|gif)$/i
const IMAGE = /\.(png|jpe?g|webp)$/i

async function get(url: string, ms = 5000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

/** Одна запись /history → генерация. */
function toGeneration(id: string, h: any): Generation {
  const files: { filename: string; subfolder?: string; type?: string }[] = []
  for (const out of Object.values<any>(h?.outputs ?? {}))
    for (const list of Object.values<any>(out ?? {})) if (Array.isArray(list)) for (const f of list) if (f?.filename && f.type !== 'temp') files.push(f)
  const kind: Kind = files.some((f) => VIDEO.test(f.filename)) ? 'video' : files.some((f) => IMAGE.test(f.filename)) ? 'photo' : 'other'
  const msgs: [string, { timestamp?: number }][] = h?.status?.messages ?? []
  const ts = (name: string) => msgs.find((m) => m[0] === name)?.[1]?.timestamp ?? null
  const start = ts('execution_start')
  const endOk = ts('execution_success')
  const endErr = ts('execution_error')
  const endInt = ts('execution_interrupted')
  const end = endOk ?? endErr ?? endInt
  const status: Status = endErr ? 'error' : endInt ? 'interrupted' : h?.status?.status_str === 'error' ? 'error' : h?.status?.completed || endOk ? 'success' : 'running'
  const f = files[0]
  return { id, at: start, sec: start && end ? Math.max(0, (end - start) / 1000) : null, kind, status, file: f ? [f.subfolder, f.filename].filter(Boolean).join('/') : null }
}

export async function serverStats(s: ComputeServer): Promise<ServerStats> {
  if (!s.url) return { online: false, error: 'адрес не задан в COMPUTE_SERVERS' }
  let sys: any
  try {
    sys = await get(`${s.url}/system_stats`)
  } catch (e) {
    const err = e as { name?: string; cause?: { code?: string }; message?: string }
    return { online: false, error: err.name === 'TimeoutError' ? 'нет ответа за 5 с' : err.cause?.code || err.message }
  }
  const dev = sys?.devices?.[0] ?? {}
  const res: ServerStats = {
    online: true,
    system: {
      gpu: String(dev.name ?? '—')
        .replace(/^cuda:\d+\s*/, '')
        .replace(/\s*:\s*cudaMallocAsync$/, ''),
      vramTotal: dev.vram_total ?? 0,
      vramFree: dev.vram_free ?? 0,
      ramTotal: sys?.system?.ram_total ?? 0,
      ramFree: sys?.system?.ram_free ?? 0,
      comfy: sys?.system?.comfyui_version ?? '—',
    },
  }
  try {
    const q = await get(`${s.url}/queue`)
    res.queue = { running: q?.queue_running?.length ?? 0, pending: q?.queue_pending?.length ?? 0 }
  } catch {
    /* очередь — необязательно */
  }
  try {
    const hist = await get(`${s.url}/history?max_items=2000`, 10000)
    const gens = Object.entries<any>(hist ?? {})
      .map(([id, h]) => toGeneration(id, h))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    const dayStart = new Date().setHours(0, 0, 0, 0)
    const empty = (): KindStats => ({ count: 0, errors: 0, avgSec: null, gpuSec: 0 })
    const byKind: Record<Kind, KindStats> = { photo: empty(), video: empty(), other: empty() }
    let gpuSec = 0
    let todayGpuSec = 0
    for (const g of gens) {
      const k = byKind[g.kind]
      k.count++
      if (g.status === 'error') k.errors++
      if (g.sec != null) {
        k.gpuSec += g.sec
        gpuSec += g.sec
        if ((g.at ?? 0) >= dayStart) todayGpuSec += g.sec
      }
    }
    for (const kind of Object.keys(byKind) as Kind[]) {
      const ok = gens.filter((g) => g.kind === kind && g.status === 'success' && g.sec != null)
      byKind[kind].avgSec = ok.length ? ok.reduce((a, g) => a + (g.sec ?? 0), 0) / ok.length : null
    }
    res.stats = {
      total: gens.length,
      today: gens.filter((g) => (g.at ?? 0) >= dayStart).length,
      todayGpuSec,
      gpuSec,
      errors: gens.filter((g) => g.status === 'error').length,
      since: gens.length ? (gens[gens.length - 1].at ?? null) : null,
      byKind,
    }
    res.recent = gens.slice(0, 15)
  } catch {
    /* история — необязательно */
  }
  return res
}
