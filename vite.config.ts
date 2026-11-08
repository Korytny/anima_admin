import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), mediaDir(env.MEDIA_DIR)],
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
