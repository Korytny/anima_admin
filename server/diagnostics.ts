// Диагностика сервера, на котором запущена админка (обычно рядом с n8n и ComfyUI): DNS, IPv4/IPv6 до Supabase,
// n8n, вебхуки, ComfyUI, OpenAI. Только чтение: к вебхукам — безопасный GET (n8n отвечает, слушает ли вебхук, но не запускает процесс).
import { promises as dns, getDefaultResultOrder } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { networkInterfaces, platform, release, hostname } from 'node:os'

export type Status = 'ok' | 'warn' | 'fail' | 'info'
export interface Check {
  group: string
  name: string
  status: Status
  detail: string
  advice?: string
}

type Probe = { ok: boolean; ms: number; code?: number; error?: string }

/** Один запрос с принудительным семейством адресов (4 или 6). Любой HTTP-ответ = связь есть. */
function probe(url: string, family: 4 | 6 | 0, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<Probe> {
  const u = new URL(url)
  const req = u.protocol === 'https:' ? httpsRequest : httpRequest
  const t0 = Date.now()
  return new Promise((resolve) => {
    const r = req(u, { method: 'GET', headers, timeout: timeoutMs, ...(family ? { family } : {}) }, (res) => {
      res.resume()
      res.on('end', () => resolve({ ok: true, ms: Date.now() - t0, code: res.statusCode }))
    })
    r.on('timeout', () => r.destroy(new Error(`таймаут ${timeoutMs / 1000} с`)))
    r.on('error', (e: NodeJS.ErrnoException) => resolve({ ok: false, ms: Date.now() - t0, error: e.code ?? e.message }))
    r.end()
  })
}

async function series(url: string, family: 4 | 6 | 0, n: number, headers?: Record<string, string>) {
  const out: Probe[] = []
  for (let i = 0; i < n; i++) out.push(await probe(url, family, headers))
  const ok = out.filter((p) => p.ok)
  return { ok: ok.length, n, avg: ok.length ? Math.round(ok.reduce((a, p) => a + p.ms, 0) / ok.length) : null, errors: [...new Set(out.filter((p) => !p.ok).map((p) => p.error))] }
}

const fmt = (s: Awaited<ReturnType<typeof series>>) => `${s.ok}/${s.n} успешно${s.avg != null ? `, ~${s.avg} мс` : ''}${s.errors.length ? `; ошибки: ${s.errors.join(', ')}` : ''}`

export async function runDiagnostics(env: Record<string, string | undefined>): Promise<{ host: string; checks: Check[] }> {
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)

  // ── Машина ──
  const v6 = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv6' && !i.internal && !i.address.startsWith('fe80'))
  add({ group: 'Машина', name: 'Система', status: 'info', detail: `${platform()} ${release()}, Node ${process.version}, хост ${hostname()}` })
  add({
    group: 'Машина',
    name: 'Порядок DNS в Node',
    status: getDefaultResultOrder() === 'ipv4first' ? 'ok' : 'info',
    detail: `${getDefaultResultOrder()}${process.env.NODE_OPTIONS ? `; NODE_OPTIONS=${process.env.NODE_OPTIONS}` : ''}`,
  })
  add({
    group: 'Машина',
    name: 'Глобальный IPv6 на адаптерах',
    status: 'info',
    detail: v6.length ? v6.map((i) => i!.address).join(', ') : 'нет — только IPv4',
  })

  // ── Supabase ──
  const sb = env.VITE_SUPABASE_URL
  if (!sb) add({ group: 'Supabase', name: 'Адрес', status: 'fail', detail: 'VITE_SUPABASE_URL не задан в .env.local' })
  else {
    const host = new URL(sb).hostname
    const a4 = await dns.resolve4(host).catch((e) => e.code as string)
    const a6 = await dns.resolve6(host).catch((e) => e.code as string)
    add({
      group: 'Supabase',
      name: 'DNS',
      status: Array.isArray(a4) ? 'ok' : 'fail',
      detail: `IPv4: ${Array.isArray(a4) ? a4.join(', ') : a4}; IPv6: ${Array.isArray(a6) ? a6.join(', ') : a6}`,
      advice: Array.isArray(a4) ? undefined : 'Сервер не может узнать адрес Supabase — проверьте DNS-серверы в настройках сети Windows (например, 8.8.8.8 / 1.1.1.1).',
    })
    const headers = env.VITE_SUPABASE_ANON_KEY ? { apikey: env.VITE_SUPABASE_ANON_KEY } : {}
    const url = `${sb}/rest/v1/`
    const s4 = await series(url, 4, 5, headers)
    const s6 = Array.isArray(a6) && a6.length ? await series(url, 6, 3, headers) : null
    add({
      group: 'Supabase',
      name: 'Связь по IPv4',
      status: s4.ok === s4.n ? 'ok' : s4.ok ? 'warn' : 'fail',
      detail: fmt(s4),
      advice: s4.ok < s4.n ? 'Даже по IPv4 часть запросов не проходит — проблема в сети, фаерволе или антивирусе сервера, не в n8n.' : undefined,
    })
    if (s6)
      add({
        group: 'Supabase',
        name: 'Связь по IPv6',
        status: s6.ok === s6.n ? 'ok' : 'warn',
        detail: fmt(s6),
        advice:
          s6.ok < s6.n
            ? 'У Supabase есть IPv6-адрес, а у сервера связи по IPv6 нет. n8n (Node.js) часть запросов шлёт по IPv6 и висит до таймаута — отсюда «база иногда недоступна» и зависшие запуски. Лечение: запускать n8n с переменной NODE_OPTIONS=--dns-result-order=ipv4first или отключить IPv6 на сетевом адаптере Windows. Админка сама уже ходит сначала по IPv4.'
            : undefined,
      })
  }

  // ── n8n ──
  const n8n = (env.N8N_URL || 'http://localhost:5678').replace(/\/+$/, '')
  const h = await probe(`${n8n}/healthz`, 0, {}, 5000)
  add({
    group: 'n8n',
    name: `Доступность ${n8n}`,
    status: h.ok && h.code === 200 ? 'ok' : 'fail',
    detail: h.ok ? `ответ ${h.code}, ${h.ms} мс` : `нет связи: ${h.error}`,
    advice: h.ok ? undefined : 'Админка не достучалась до n8n по N8N_URL — проверьте, что n8n запущен и адрес в .env.local верный.',
  })
  const mode = env.VITE_N8N_MODE === 'test' ? 'test' : 'prod'
  add({ group: 'n8n', name: 'Режим вебхуков', status: 'info', detail: `${mode} → ${mode === 'test' ? '/webhook-test/<id>' : '/webhook/<id>'}` })
  if (h.ok) {
    for (const [envName, label] of [
      ['VITE_N8N_IMAGE_WEBHOOK', 'Кадр шота'],
      ['VITE_N8N_SCRIPT_WEBHOOK', 'Сценарий серии'],
      ['VITE_N8N_AUDIO_WEBHOOK', 'Озвучка шота'],
      ['VITE_N8N_VIDEO_WEBHOOK', 'Видео шота'],
      ['VITE_N8N_MUSIC_WEBHOOK', 'Музыка локации'],
      ['VITE_N8N_MONTAGE_WEBHOOK', 'Монтаж серии'],
    ] as const) {
      const id = env[envName]?.trim()
      if (!id) {
        add({ group: 'n8n', name: `Вебхук: ${label}`, status: 'info', detail: `не подключён (${envName})` })
        continue
      }
      if (/^(https?:|\/)/.test(id)) {
        add({ group: 'n8n', name: `Вебхук: ${label}`, status: 'warn', detail: 'в .env.local полный адрес, а не id', advice: `Оставьте в ${envName} только id — режим test/prod задаёт VITE_N8N_MODE.` })
        continue
      }
      // Безопасный GET: процесс не запускается, n8n только говорит, слушает ли вебхук POST
      const r = await new Promise<{ code?: number; body: string }>((resolve) => {
        const req = httpRequest(new URL(`${n8n}/${mode === 'test' ? 'webhook-test' : 'webhook'}/${id}`), { method: 'GET', timeout: 5000 }, (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => resolve({ code: res.statusCode, body }))
        })
        req.on('timeout', () => req.destroy(new Error('таймаут')))
        req.on('error', (e) => resolve({ body: e.message }))
        req.end()
      })
      const listening = /not registered for GET|Did you mean to make a POST/i.test(r.body)
      add({
        group: 'n8n',
        name: `Вебхук: ${label}`,
        status: listening ? 'ok' : mode === 'test' ? 'info' : 'fail',
        detail: listening ? 'слушает POST' : `не слушает (${r.code ?? '—'})`,
        advice: listening
          ? undefined
          : mode === 'prod'
            ? 'Процесс n8n не опубликован (не активен) или id вебхука другой. Включите процесс в n8n и сверьте id.'
            : 'В тестовом режиме вебхук слушает только после «Listen for test event» в n8n — это нормально между тестами.',
      })
    }
  }

  // ── ComfyUI ──
  const comfies = (env.COMPUTE_SERVERS ?? '')
    .split(';')
    .map((s) => s.split('|'))
    .filter((p) => p[1]?.trim())
    .map((p) => ({ name: p[0].trim(), url: p[1].trim() }))
  if (!comfies.length && env.VITE_COMFY_URL) comfies.push({ name: 'ComfyUI', url: env.VITE_COMFY_URL })
  for (const c of comfies) {
    const r = await probe(`${c.url.replace(/\/+$/, '')}/system_stats`, 0, {}, 5000)
    add({ group: 'ComfyUI', name: c.name, status: r.ok && r.code === 200 ? 'ok' : 'fail', detail: r.ok ? `ответ ${r.code}, ${r.ms} мс` : `нет связи: ${r.error}` })
  }

  // ── OpenAI (ассистент) ──
  if (env.OPENAI_API_KEY) {
    const s = await series('https://api.openai.com/v1/models', 0, 3, { Authorization: `Bearer ${env.OPENAI_API_KEY}` })
    add({ group: 'Ассистент', name: 'OpenAI', status: s.ok === s.n ? 'ok' : s.ok ? 'warn' : 'fail', detail: fmt(s) })
  }

  return { host: hostname(), checks }
}
