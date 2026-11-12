// Процессы ComfyUI в проекте: папка workflows/ (API-формат). Отдаём странице «Процессы» и n8n.
// Только чтение: добавить/обновить процесс — положить файл в папку (и закоммитить).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const WORKFLOWS_DIR = resolve('workflows')
const SAFE = /^[\w.-]+\.json$/

export function listWorkflows() {
  let names: string[] = []
  try {
    names = readdirSync(WORKFLOWS_DIR).filter((n) => SAFE.test(n))
  } catch {
    return []
  }
  return names.sort().map((name) => {
    const file = join(WORKFLOWS_DIR, name)
    const st = statSync(file)
    try {
      return { name, size: st.size, mtime: st.mtimeMs, json: JSON.parse(readFileSync(file, 'utf8')) }
    } catch (e) {
      return { name, size: st.size, mtime: st.mtimeMs, json: null, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

/** Сырой файл процесса для n8n; null — нет такого. */
export function readWorkflow(name: string): string | null {
  if (!SAFE.test(name)) return null
  try {
    return readFileSync(join(WORKFLOWS_DIR, name), 'utf8')
  } catch {
    return null
  }
}
