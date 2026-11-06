// Демо in-memory данные для сущностей, у которых пока нет таблиц в БД:
// агенты, пользователи/роли, интеграции, системные настройки.
// Живут до перезагрузки страницы.
import type { Agent, Integration, SystemSettings, User } from '@/types'
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

const AGENT_DEFS: [string, string, string][] = [
  ['Шоураннер', 'Определяет концепцию ролика и ведёт пайплайн', 'extended_description,all'],
  ['Сценарист', 'Пишет сценарий и разбивку по сценам', 'script_scenas'],
  ['Зритель', 'Оценивает сценарий глазами целевой аудитории', 'extended_description'],
  ['Редактор', 'Правит тексты и диалоги', 'dialogue_text,dialogue_direction'],
  ['Постановщик', 'Описывает действия и мизансцену', 'action,action_prompt,event_prompt'],
  ['Звукорежиссер', 'Подбирает голоса, шумы и музыку', 'speaking_character_voice,music,noice,speaker_voice_profile'],
  ['Оператор', 'Формирует визуальные промпты и планы', 'visual_prompt,shot_type,environment'],
  ['Монтажер', 'Собирает итоговый ролик и субтитры', 'url_final,video_sub'],
]

const db = {
  agents: AGENT_DEFS.map(([name, description, fields], i): Agent => ({
    id: `a_${i + 1}`,
    name,
    role: name,
    description,
    provider: i % 3 === 0 ? 'anthropic' : i % 3 === 1 ? 'openai' : 'google',
    model: i % 3 === 0 ? 'claude-sonnet-5-5' : i % 3 === 1 ? 'gpt-4.1' : 'gemini-2.5-pro',
    temperature: 0.7,
    max_tokens: 4096,
    system_prompt: `Ты — ${name.toLowerCase()} в студии анимационных роликов.\n${description}.\n\nВходные данные: {{extended_description}}\nОтвечай строго в формате JSON.`,
    related_fields: fields.split(','),
    enabled: true,
    updated_at: iso((i + 1) * DAY),
  })),
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
  | 'listAgents' | 'createAgent' | 'updateAgent' | 'deleteAgents'
  | 'listUsers' | 'inviteUser' | 'updateUser' | 'deleteUser'
  | 'listIntegrations' | 'updateIntegration' | 'testIntegration'
  | 'getSystemSettings' | 'updateSystemSettings'
>

export const demoApi: DemoApi = {
  async listAgents() {
    await delay()
    return clone(db.agents)
  },
  async createAgent(data = {}) {
    await delay()
    const a: Agent = {
      id: `a_${Date.now().toString(36)}`, name: 'Новый агент', role: 'Без роли', description: '', provider: 'anthropic',
      model: 'claude-sonnet-5-5', temperature: 0.7, max_tokens: 4096, system_prompt: '', related_fields: [], enabled: false,
      ...data, updated_at: now(),
    }
    db.agents.push(a)
    return clone(a)
  },
  async updateAgent(id, patch) {
    await delay()
    const a = db.agents.find((x) => x.id === id) ?? notFound('Агент')
    Object.assign(a, patch, { updated_at: now() })
    return clone(a)
  },
  async deleteAgents(ids) {
    await delay()
    db.agents = db.agents.filter((a) => !ids.includes(a.id))
  },

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
