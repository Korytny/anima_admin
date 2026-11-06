import type { UserRole } from '@/types'

export interface StatusMeta {
  label: string
  color: string
  pulse?: boolean
}

// Статусы в БД — свободный text. Известные значения раскрашиваем,
// неизвестные показываем как есть серым (см. statusMeta).
export const TOPIC_STATUS: Record<string, StatusMeta> = {
  draft: { label: 'Черновик', color: '#71717A' },
  pending: { label: 'В работе', color: '#8B5CF6', pulse: true },
  done: { label: 'Готов', color: '#10B981' },
  published: { label: 'Опубликован', color: '#3B82F6' },
  Unpublished: { label: 'Снят с публикации', color: '#F59E0B' },
}

export const SCENE_STATUS: Record<string, StatusMeta> = {
  draft: { label: 'Черновик', color: '#71717A' },
  generating: { label: 'Генерация', color: '#8B5CF6', pulse: true },
  ready: { label: 'Готова', color: '#3B82F6' },
  approved: { label: 'Одобрена', color: '#10B981' },
  error: { label: 'Ошибка', color: '#EF4444' },
}

const UNKNOWN = '#52525B'

export function statusMeta(map: Record<string, StatusMeta>, value: string | null | undefined): StatusMeta | undefined {
  if (value == null || value === '') return undefined
  return map[value] ?? { label: value, color: UNKNOWN }
}

/** Опции для фильтра/селекта: известные статусы + реально встречающиеся в данных. */
export function statusOptions(map: Record<string, StatusMeta>, values: (string | null)[] = []) {
  const keys = [...new Set([...Object.keys(map), ...values.filter((v): v is string => !!v)])]
  return keys.map((value) => ({ value, label: statusMeta(map, value)!.label }))
}

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  admin: { label: 'Админ', description: 'Полный доступ, включая настройки и ключи' },
  editor: { label: 'Редактор', description: 'Ролики, сцены, агенты' },
  viewer: { label: 'Наблюдатель', description: 'Только просмотр' },
}

export const toOptions = (rec: Record<string, { label: string }>) => Object.entries(rec).map(([value, m]) => ({ value, label: m.label }))
