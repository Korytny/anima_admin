import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { parseServers, serverStats } from './server/comfy'
import { listWorkflows, readWorkflow } from './server/workflows'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.vtt': 'text/vtt', '.srt': 'text/plain',
}

/** dev: отдаёт файлы из MEDIA_DIR (ComfyUI/output) по /media/*. В проде то же делает nginx. */
function mediaDir(dir: string | undefined): Plugin {
  return {
    name: 'media-dir',
    configureServer(server) {
      if (!dir) {
        server.config.logger.warn('[media] MEDIA_DIR не задан в .env.local — /media/* отдаваться не будет')
        return
      }
      if (/^[a-z]:[\\/]/i.test(dir) && process.platform !== 'win32') {
        server.config.logger.error(`[media] MEDIA_DIR=${dir} — это путь Windows, а dev-сервер запущен на ${process.platform}. Этот диск отсюда не виден — запускайте админку на машине с ComfyUI.`)
        return
      }
      const root = resolve(dir)
      server.config.logger.info(`[media] /media/* → ${root} (папка ${existsSync(root) ? 'есть' : 'НЕ НАЙДЕНА'})`)
      const miss = (res: ServerResponse, url: string, file: string, why: string) => {
        server.config.logger.warn(`[media] 404 ${url} → ${file} (${why})`)
        res.statusCode = 404
        res.end(`not found: ${file}`)
      }
      server.middlewares.use('/media', (req, res, next) => {
        const file = resolve(root, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]))
        if (!file.startsWith(root + sep)) return miss(res, req.url ?? '', file, 'вне MEDIA_DIR')
        let size: number
        try {
          const st = statSync(file)
          if (!st.isFile()) return miss(res, req.url ?? '', file, 'не файл')
          size = st.size
        } catch {
          return miss(res, req.url ?? '', file, 'файла нет')
        }
        res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'no-cache')
        // Range — чтобы видео перематывалось
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (m) {
          const start = m[1] ? +m[1] : 0
          const end = m[2] ? Math.min(+m[2], size - 1) : size - 1
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', end - start + 1)
          createReadStream(file, { start, end }).pipe(res)
        } else {
          res.setHeader('Content-Length', size)
          createReadStream(file).pipe(res)
        }
      })
    },
  }
}

/** Вычисления: свой мини-API к RunPod GraphQL в процессе dev-сервера (как /media). Ключ RUNPOD_API_KEY — только здесь,
 *  в браузер не попадает. Пускаем только вошедших в админку: Bearer-токен Supabase проверяется через /auth/v1/user.
 *  GET  /compute/servers              → свои серверы (COMPUTE_SERVERS), GET /compute/servers/:id/stats → статус и статистика ComfyUI
 *  GET  /compute/pods                 → { pods, balance, spendPerHr }
 *  POST /compute/pods/:id/start|stop  → { ok }                                                                  */
function runpodApi(key: string | undefined, supabaseUrl: string | undefined, anonKey: string | undefined, servers: ReturnType<typeof parseServers>): Plugin {
  const gql = async (query: string) => {
    const r = await fetch('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000), // сеть до RunPod бывает медленной — не висим бесконечно
    })
    const j = (await r.json().catch(() => null)) as { data?: any; errors?: { message: string }[] } | null
    if (!r.ok || !j || j.errors?.length) throw new Error(j?.errors?.[0]?.message || `RunPod ответил ${r.status}`)
    return j.data
  }
  const authorized = async (auth: string | undefined) => {
    if (!auth?.startsWith('Bearer ') || !supabaseUrl || !anonKey) return false
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    return !!r?.ok
  }
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const podId = (id: string) => (/^[a-z0-9]+$/i.test(id) ? id : null)

  const handler = async (req: import('node:http').IncomingMessage, res: ServerResponse) => {
    try {
      const url = (req.url ?? '/').split('?')[0]
      // Процессы ComfyUI из папки workflows/ — для страницы «Процессы» и для n8n (только чтение)
      if (req.method === 'GET' && url === '/workflows') return send(res, 200, listWorkflows())
      const wm = /^\/workflows\/([^/]+)$/.exec(url)
      if (req.method === 'GET' && wm) {
        const raw = readWorkflow(decodeURIComponent(wm[1]))
        if (raw == null) return send(res, 404, { error: 'Нет такого процесса' })
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return res.end(raw)
      }
      // Свои серверы с ComfyUI (COMPUTE_SERVERS) — только чтение, без проверки входа: ComfyUI и так открыт в локальной сети
      if (req.method === 'GET' && url === '/servers') return send(res, 200, servers)
      const sm = /^\/servers\/([^/]+)\/stats$/.exec(url)
      if (req.method === 'GET' && sm) {
        const srv = servers.find((x) => x.id === sm[1])
        return srv ? send(res, 200, await serverStats(srv)) : send(res, 404, { error: 'Сервер не найден' })
      }
      // RunPod. Чтение (поды, баланс) — без проверки входа; запуск/остановка тратят деньги — только для вошедших
      if (!key) return send(res, 503, { error: 'Не задан RUNPOD_API_KEY в .env.local' })
      if (req.method === 'GET' && url === '/pods') {
        const data = await gql('{ myself { pods { id name desiredStatus gpuCount costPerHr uptimeSeconds machine { gpuDisplayName location } } } }')
        let balance: number | null = null
        let spendPerHr: number | null = null
        try {
          const b = await gql('{ myself { clientBalance currentSpendPerHr } }')
          balance = b?.myself?.clientBalance ?? null
          spendPerHr = b?.myself?.currentSpendPerHr ?? null
        } catch {
          /* баланс — необязательный */
        }
        const pods = (data?.myself?.pods ?? []).map((p: any) => ({
          id: p.id,
          name: p.name || 'без имени',
          gpuType: p.machine?.gpuDisplayName || '—',
          gpuCount: p.gpuCount || 1,
          status: p.desiredStatus || 'UNKNOWN',
          costPerHr: p.costPerHr || 0,
          country: p.machine?.location || '—',
          uptimeSeconds: p.uptimeSeconds || 0,
        }))
        // Работающий под — статистика его ComfyUI через прокси RunPod, как у своих серверов
        const live = pods.find((p: { status: string; uptimeSeconds: number }) => p.status === 'RUNNING' && p.uptimeSeconds > 0)
        const comfy = live ? await serverStats({ id: 'runpod', name: live.name, url: `https://${live.id}-8188.proxy.runpod.net`, role: '', costPerHr: live.costPerHr }) : null
        return send(res, 200, { pods, balance, spendPerHr, comfy })
      }
      const m = /^\/pods\/([^/]+)\/(start|stop)$/.exec(url)
      if (req.method === 'POST' && m && podId(m[1])) {
        if (!(await authorized(req.headers.authorization))) return send(res, 401, { error: 'Нужно войти в админку' })
        const id = podId(m[1])!
        if (m[2] === 'stop') await gql(`mutation { podStop(input: { podId: "${id}" }) { id desiredStatus } }`)
        else {
          const p = await gql(`{ pod(input: { podId: "${id}" }) { gpuCount } }`)
          await gql(`mutation { podResume(input: { podId: "${id}", gpuCount: ${p?.pod?.gpuCount || 1} }) { id desiredStatus } }`)
        }
        return send(res, 200, { ok: true })
      }
      send(res, 404, { error: 'Not found' })
    } catch (e) {
      send(res, 502, { error: e instanceof Error ? e.message : String(e) })
    }
  }
  return {
    name: 'runpod-api',
    configureServer(server) {
      if (!key) server.config.logger.warn('[compute] RUNPOD_API_KEY не задан в .env.local — страница «Вычисления» работать не будет')
      server.middlewares.use('/compute', (req, res) => void handler(req, res))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/compute', (req, res) => void handler(req, res))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), mediaDir(env.MEDIA_DIR), runpodApi(env.RUNPOD_API_KEY, env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, parseServers(env.COMPUTE_SERVERS, env.VITE_COMFY_URL))],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // абсолютный путь к ComfyUI/output на сервере; по умолчанию = MEDIA_DIR
      'import.meta.env.VITE_MEDIA_ROOT': JSON.stringify(env.VITE_MEDIA_ROOT || env.MEDIA_DIR || ''),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Вебхуки n8n через тот же origin — без CORS
      proxy: { '/n8n': { target: env.N8N_URL || 'http://localhost:5678', changeOrigin: true, rewrite: (p) => p.replace(/^\/n8n/, '') } },
    },
  }
})
