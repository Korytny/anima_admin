// Доступ Claude Code к базе: service_role-ключ из .env.local (SUPABASE_SERVICE_ROLE_KEY, без VITE_).
// Ключ только для этого скрипта на машине разработчика: во фронтенд, бандл и git не попадает. Перегенерировать — Supabase → Settings → API.
//
//   node --env-file=.env.local scripts/db.mts check              — войти и проверить доступ
//   node --env-file=.env.local scripts/db.mts agents             — список агентов (id, имя, модель, длина промпта)
//   node --env-file=.env.local scripts/db.mts show <id>          — вывести промпт агента
//   node --env-file=.env.local scripts/db.mts versions <id>      — история промпта агента
//   node --env-file=.env.local scripts/db.mts create <файл> <имя> [модель] — новый агент + первая версия
//   node --env-file=.env.local scripts/db.mts push <файл> <id> [заметка]  — записать промпт из файла: новая версия + agents.prompt
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
if (!url) throw new Error('Нет VITE_SUPABASE_URL в .env.local')
if (!key) throw new Error('Нет SUPABASE_SERVICE_ROLE_KEY в .env.local')

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'check') {
  const { error } = await db.from('agents').select('id').limit(1)
  if (error) throw new Error(`Чтение agents не прошло: ${error.message}`)
  console.log('OK: доступ к базе есть, чтение agents работает')
} else if (cmd === 'agents') {
  const { data, error } = await db.from('agents').select('id, name, model, is_active, prompt').order('id')
  if (error) throw error
  for (const a of data ?? []) console.log(`${a.id}\t${a.is_active ? '●' : '○'} ${a.name}\t${a.model ?? '—'}\t${(a.prompt ?? '').length} симв.`)
} else if (cmd === 'show') {
  const { data, error } = await db.from('agents').select('prompt').eq('id', +args[0]).single()
  if (error) throw error
  process.stdout.write(data.prompt ?? '')
} else if (cmd === 'versions') {
  const { data, error } = await db.from('agent_prompt_versions').select('id, created_at, source, note, prompt').eq('agent_id', +args[0]).order('id', { ascending: false })
  if (error) throw error
  for (const v of data ?? []) console.log(`${v.id}\t${v.created_at.slice(0, 16).replace('T', ' ')}\t${v.source}\t${v.prompt.length} симв.\t${v.note ?? ''}`)
} else if (cmd === 'create') {
  const [file, name, model] = args
  if (!file || !name) throw new Error('create <файл> <имя> [модель]')
  const prompt = readFileSync(file, 'utf8')
  const { data: exists } = await db.from('agents').select('id').eq('name', name).maybeSingle()
  if (exists) throw new Error(`Агент «${name}» уже есть (id ${exists.id}) — используйте push`)
  const { data: a, error } = await db.from('agents').insert({ name, prompt, model: model ?? null, is_active: true }).select('id').single()
  if (error) throw error
  const { error: e2 } = await db.from('agent_prompt_versions').insert({ agent_id: a.id, prompt, model: model ?? null, source: `file:${basename(file)}`, note: 'создан' })
  if (e2) throw e2
  console.log(`OK: создан агент «${name}» (${a.id}) ← ${file}`)
} else if (cmd === 'push') {
  const [file, id, note] = args
  if (!file || !id) throw new Error('push <файл> <id агента> [заметка]')
  const prompt = readFileSync(file, 'utf8')
  const { data: agent, error: e1 } = await db.from('agents').select('id, name, model, prompt').eq('id', +id).single()
  if (e1) throw new Error(`Агент ${id}: ${e1.message}`)
  if ((agent.prompt ?? '').trim() === prompt.trim()) {
    console.log(`Без изменений: «${agent.name}» (${id}) уже совпадает с ${file}`)
  } else {
    // Сначала версия, потом agents.prompt — если версия не записалась, промпт не трогаем
    const { data: ver, error: e2 } = await db
      .from('agent_prompt_versions')
      .insert({ agent_id: +id, prompt, model: agent.model, source: `file:${basename(file)}`, note: note ?? null })
      .select('id')
      .single()
    if (e2) throw new Error(`Версия не записана (выполнен supabase/agent_prompt_versions.sql?): ${e2.message}`)
    const { error: e3 } = await db.from('agents').update({ prompt }).eq('id', +id)
    if (e3) throw e3
    console.log(`OK: «${agent.name}» (${id}) ← ${file}, ${prompt.length} симв., версия ${ver.id}${note ? ` — ${note}` : ''}`)
  }
} else {
  console.log('Команды: check | agents | show <id> | versions <id> | create <файл> <имя> [модель] | push <файл> <id> [заметка]')
}
