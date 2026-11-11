// Демо in-memory данные для сущностей, у которых пока нет таблиц в БД:
// пользователи/роли, интеграции, системные настройки.
// Живут до перезагрузки страницы.
import type { Integration, SystemSettings, User } from '@/types'
import type { Api } from './types'

const HOUR = 3600_000
const DAY = 24 * HOUR
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const now = () => new Date().toISOString()
const clone = <T,>(v: T): T => structuredClone(v)
const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms))
function notFound(what: string): never {
  throw new Error(`${what} не найден`)
}

const db = {
  users: [
    { id: 'u_1', name: 'Админ', email: 'admin@studio.io', role: 'admin', last_seen_at: iso(5 * 60_000) },
  ] as User[],
  integrations: [
    { id: 'runpod', title: 'Runpod', kind: 'compute', key_hint: null, config: { endpoint: '' }, status: 'not_configured', checked_at: null },
    { id: 'anthropic', title: 'Anthropic', kind: 'llm', key_hint: null, config: {}, status: 'not_configured', checked_at: null },
    { id: 'openai', title: 'OpenAI', kind: 'llm', key_hint: null, config: {}, status: 'not_configured', checked_at: null },
    { id: 'google', title: 'Google Gemini', kind: 'llm', key_hint: null, config: {}, status: 'not_configured', checked_at: null },
    { id: 's3', title: 'S3 хранилище', kind: 'storage', key_hint: null, config: { bucket: '', region: '' }, status: 'not_configured', checked_at: null },
  ] as Integration[],
  system: { timezone: 'Europe/Moscow', date_format: 'dd.MM.yyyy HH:mm', media_base_url: '' } as SystemSettings,
}

type DemoApi = Pick<
  Api,
  | 'listUsers' | 'inviteUser' | 'updateUser' | 'deleteUser'
  | 'listIntegrations' | 'updateIntegration' | 'testIntegration'
  | 'getSystemSettings' | 'updateSystemSettings'
>

export const demoApi: DemoApi = {
  async listUsers() {
    await delay()
    return clone(db.users)
  },
  async inviteUser(email, role) {
    await delay()
    const u: User = { id: `u_${Date.now().toString(36)}`, name: email.split('@')[0], email, role, last_seen_at: null }
    db.users.push(u)
    return clone(u)
  },
  async updateUser(id, patch) {
    await delay()
    const u = db.users.find((x) => x.id === id) ?? notFound('Пользователь')
    Object.assign(u, patch)
    return clone(u)
  },
  async deleteUser(id) {
    await delay()
    db.users = db.users.filter((u) => u.id !== id)
  },

  async listIntegrations() {
    await delay()
    return clone(db.integrations)
  },
  async updateIntegration(id, { config, secret }) {
    await delay()
    const it = db.integrations.find((x) => x.id === id) ?? notFound('Интеграция')
    if (config) it.config = { ...it.config, ...config }
    if (secret) {
      it.key_hint = `…${secret.slice(-4)}`
      it.status = 'connected'
    }
    return clone(it)
  },
  async testIntegration(id) {
    await delay(500)
    const it = db.integrations.find((x) => x.id === id) ?? notFound('Интеграция')
    it.status = it.key_hint ? 'connected' : 'not_configured'
    it.checked_at = now()
    return clone(it)
  },

  async getSystemSettings() {
    await delay()
    return clone(db.system)
  },
  async updateSystemSettings(patch) {
    await delay()
    Object.assign(db.system, patch)
    return clone(db.system)
  },
}
