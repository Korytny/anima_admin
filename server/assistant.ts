// Ассистент админки: сервер только передаёт запрос в OpenAI (ключ OPENAI_API_KEY в .env.local, без VITE_).
// Системный промпт и модель — из таблицы agents (агент «Ассистент админки»), их присылает браузер.
// Данные читает и пишет браузер под входом пользователя (RLS) — здесь их нет.
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY = 4 * 1024 * 1024

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) reject(new Error('Слишком большой запрос'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function assistantHandler(opts: { openaiKey?: string; supabaseUrl?: string; anonKey?: string }) {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  // Запрос к модели тратит деньги — только для вошедших в админку
  const authorized = async (auth: string | undefined) => {
    if (!auth?.startsWith('Bearer ') || !opts.supabaseUrl || !opts.anonKey) return false
    const r = await fetch(`${opts.supabaseUrl}/auth/v1/user`, { headers: { apikey: opts.anonKey, Authorization: auth }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    return !!r?.ok
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = (req.url ?? '/').split('?')[0]
      if (req.method !== 'POST' || url !== '/chat') return send(res, 404, { error: 'Not found' })
      if (!opts.openaiKey) return send(res, 503, { error: 'Не задан OPENAI_API_KEY в .env.local' })
      if (!(await authorized(req.headers.authorization))) return send(res, 401, { error: 'Нужно войти в админку' })
      // Responses API: модели с рассуждением работают с инструментами только здесь.
      // Состояние разговора хранит OpenAI (previous_response_id), браузер шлёт только новые элементы.
      const { model, instructions, input, tools, previous_response_id } = JSON.parse(await readBody(req)) as {
        model?: string
        instructions?: string
        input?: unknown[]
        tools?: unknown[]
        previous_response_id?: string
      }
      if (!model) return send(res, 400, { error: 'Не задана модель — укажите её в карточке агента «Ассистент админки»' })
      if (!Array.isArray(input) || !input.length) return send(res, 400, { error: 'Пустой запрос' })
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.openaiKey}` },
        body: JSON.stringify({ model, instructions, input, ...(tools?.length ? { tools } : {}), ...(previous_response_id ? { previous_response_id } : {}) }),
        signal: AbortSignal.timeout(300_000), // правка длинного промпта бывает долгой
      })
      const j = (await r.json().catch(() => null)) as { id?: string; output?: unknown[]; usage?: unknown; error?: { message: string } } | null
      if (!r.ok || !j?.id) return send(res, 502, { error: j?.error?.message || `OpenAI ответил ${r.status}` })
      send(res, 200, { id: j.id, output: j.output ?? [], usage: j.usage ?? null })
    } catch (e) {
      send(res, 502, { error: e instanceof Error ? e.message : String(e) })
    }
  }
}
